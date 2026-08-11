import {
  buildManifest,
  documentTitle,
  findOrphanDocuments,
  openProject,
  parseSections,
  renderDatedSections,
  scanOptionsFrom,
  scanSources,
  splitLines,
  validateProject,
  type DocSection,
  type DocsManifest,
  type DocsMirrorConfig,
  type DocsResolver,
  type LocalDocsRoot,
  type ManifestNode,
  type OpenedProject,
  type SourceDocument,
  type ValidationIssue,
} from '@docsmirror/core';
import { CorpusTerms, type Emphasis } from './corpus';
import { lazy } from './lazy';
import { renderMarkdown } from './markdown';
import { SearchIndex, type SearchResult } from './search';

export interface DocumentPayload {
  readonly path: string;
  readonly title: string;
  readonly markdown: string;
  readonly html: string;
  readonly lastModified: string | undefined;
  /**
   * Section boundaries, so the app can cut one section out of `markdown`
   * without re-implementing heading parsing in the browser.
   */
  readonly sections: readonly DocSection[];
}

/**
 * A document read and pre-parsed once, shared by every consumer that needs the
 * whole corpus in memory. `SearchIndex` and `CorpusTerms` used to read every
 * file for themselves, the same I/O twice, invalidated at the same moment,
 * so the cache lives on the project and both read through it.
 */
export interface CorpusDocument {
  readonly node: ManifestNode;
  readonly content: string;
  readonly lines: readonly string[];
  readonly sections: readonly DocSection[];
}

/** What `docsmirror check` reports, answered over HTTP for the app to draw. */
export interface HealthReport {
  readonly scannedFiles: number;
  readonly pointerCount: number;
  readonly resolvedCount: number;
  readonly issues: readonly ValidationIssue[];
}

/**
 * The project the server is serving: its configuration, its docs root, and the
 * manifest built from both. The manifest is cached and rebuilt on demand,
 * because scanning every source file for pointers is the expensive part and
 * only a write can invalidate it.
 */
export class DocsProject {
  readonly projectRoot: string;
  readonly config: DocsMirrorConfig;
  readonly root: LocalDocsRoot;

  private readonly resolver: DocsResolver;
  private readonly terms: CorpusTerms;
  private readonly index: SearchIndex;
  private readonly manifest = lazy(() => this.build());
  private readonly health = lazy(() => this.validate());
  /** Sources are scanned once and shared by the manifest and the health report. */
  private readonly sources = lazy<readonly SourceDocument[]>(() =>
    scanSources(this.projectRoot, scanOptionsFrom(this.config)),
  );
  private readonly documents = lazy(() => this.readCorpus());

  private constructor(opened: OpenedProject) {
    this.projectRoot = opened.projectRoot;
    this.config = opened.config;
    this.root = opened.root;
    this.resolver = opened.resolver;
    this.terms = new CorpusTerms(this);
    this.index = new SearchIndex(this);
  }

  static async open(projectRoot: string): Promise<DocsProject> {
    return new DocsProject(await openProject(projectRoot));
  }

  /** Docs root, project-relative with forward slashes, the form git wants. */
  get docsRootPrefix(): string {
    return this.config.docsRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  }

  /** Repository-relative path of a document, for the history package. */
  repositoryPathOf(path: string): string {
    const prefix = this.docsRootPrefix;
    return prefix.length > 0 ? `${prefix}/${path}` : path;
  }

  manifestNow(): Promise<DocsManifest> {
    return this.manifest.get();
  }

  /**
   * The same verdict `docsmirror check` reaches, so the app can show what is
   * broken instead of leaving it to CI.
   * @docs web.md#http-api
   */
  healthNow(): Promise<HealthReport> {
    return this.health.get();
  }

  /** The whole corpus, read once and kept until a write invalidates it. */
  documentsNow(): Promise<readonly CorpusDocument[]> {
    return this.documents.get();
  }

  /**
   * The term this document leans on unusually hard, and where else it is
   * dense, measured against the whole corpus rather than looked up in a list.
   * @docs web.md#contextual-widgets
   */
  emphasisOf(path: string): Promise<Emphasis | undefined> {
    return this.terms.emphasisOf(path);
  }

  /** @docs web.md#search */
  search(query: string): Promise<SearchResult[]> {
    return this.index.search(query);
  }

  async nodeOf(path: string): Promise<ManifestNode | undefined> {
    const manifest = await this.manifestNow();
    return manifest.nodes.find((node) => node.path === path);
  }

  async readDocument(path: string, options?: { assetUrl?: (path: string) => string }): Promise<DocumentPayload | undefined> {
    const file = await this.root.read(path);
    if (file === undefined) {
      return undefined;
    }
    const sections = parseSections(file.content);
    return {
      path: file.path,
      title: documentTitle(sections) ?? file.path,
      // The raw source, untouched: this is what the editor writes back to disk.
      markdown: file.content,
      // The dated view, applied only to what is displayed: a marker rendered
      // into a visible label must never round-trip into the file it labels.
      html: renderMarkdown(renderDatedSections(file.content), file.path, options?.assetUrl),
      lastModified: file.lastModified?.toISOString(),
      sections,
    };
  }

  /**
   * Writes a document and rebuilds everything that described it, so the next
   * read reflects the file on disk rather than the state before the write.
   */
  async writeDocument(path: string, markdown: string): Promise<ManifestNode | undefined> {
    if (this.root.absolutePathOf(path) === undefined) {
      return undefined;
    }
    // Through the `DocsRoot` interface rather than the filesystem directly:
    // the one write this app ever does is the one place a hosted root would
    // have to differ from `LocalDocsRoot`, so it is the one place that must
    // not assume a folder on disk.
    await this.root.write(path, markdown);
    this.manifest.invalidate();
    this.health.invalidate();
    this.documents.invalidate();
    this.terms.invalidate();
    return this.nodeOf(path);
  }

  private async readCorpus(): Promise<readonly CorpusDocument[]> {
    const manifest = await this.manifest.get();
    const documents: CorpusDocument[] = [];
    for (const node of manifest.nodes) {
      const file = await this.root.read(node.path);
      if (file === undefined) {
        continue;
      }
      documents.push({
        node,
        content: file.content,
        lines: splitLines(file.content),
        sections: parseSections(file.content),
      });
    }
    return documents;
  }

  private async build(): Promise<DocsManifest> {
    return buildManifest({
      sources: await this.sources.get(),
      resolver: this.resolver,
      root: this.root,
      docsRoot: this.config.docsRoot,
      indexes: this.config.indexes,
      staleness: this.config.staleness,
    });
  }

  private async validate(): Promise<HealthReport> {
    const report = await validateProject(await this.sources.get(), this.resolver);
    const orphans = await findOrphanDocuments(this.root, report.referencedDocuments, this.config.indexes);
    return {
      scannedFiles: report.scannedFiles,
      pointerCount: report.pointerCount,
      resolvedCount: report.resolvedCount,
      issues: [...report.issues, ...orphans],
    };
  }
}
