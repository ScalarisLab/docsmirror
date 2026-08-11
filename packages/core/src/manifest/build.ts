import { linkedDocuments } from '../markdown/links';
import { documentTitle, parseSections } from '../markdown/sections';
import { splitLines } from '../pointer/parse';
import type { DocsResolver } from '../resolve/resolver';
import type { DocsRoot } from '../root/DocsRoot';
import { computeStaleness, DEFAULT_STALENESS_OPTIONS, formatDate, type StalenessOptions } from '../staleness';
import {
  findOrphanDocuments,
  resolveSources,
  type ResolvedSource,
  type SourceDocument,
  type ValidationIssue,
} from '../validate/validate';
import { documentSummary, proseSummary } from './summary';
import { symbolAfterComment } from './symbols';
import {
  MANIFEST_FORMAT_VERSION,
  type DocsManifest,
  type ManifestAnchor,
  type ManifestNode,
  type ManifestReference,
} from './types';

export interface BuildManifestOptions {
  /** Source files to collect pointers from. */
  readonly sources: readonly SourceDocument[];
  readonly resolver: DocsResolver;
  readonly root: DocsRoot;
  /** Docs root as configured, project-relative, recorded in the manifest. */
  readonly docsRoot: string;
  /** Documents treated as entry points when counting orphans. */
  readonly indexes: readonly string[];
  readonly staleness?: StalenessOptions;
  readonly now?: () => Date;
  /**
   * `sources`, already parsed and resolved by a caller that did so already:
   * `docsmirror check` validates every pointer before it ever asks for a
   * manifest to compare against, and resolving the same pointers a second
   * time here would cost a second pass over the whole project for nothing.
   * Computed from `sources`/`resolver` when omitted.
   */
  readonly resolvedSources?: readonly ResolvedSource[];
  /**
   * Orphan documents, when a caller already found them. Only the count ends
   * up in the manifest, so recomputing the full list here just to discard
   * everything but its length would be the same waste as `resolvedSources`.
   */
  readonly orphans?: readonly ValidationIssue[];
}

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

function countWords(markdown: string): number {
  return markdown.match(WORD)?.length ?? 0;
}

/** Reading order: the file a reference lives in, then where in that file. */
function byFileThenLine(left: ManifestReference, right: ManifestReference): number {
  return left.file.localeCompare(right.file) || left.line - right.line;
}

/**
 * Every pointer of every source, already resolved, grouped by the document it
 * reaches. A pointer whose anchor did not resolve still counts: the document
 * is genuinely referenced, just at a heading that no longer exists.
 *
 * Sorted once here rather than left in scan order: `scanSources` walks the
 * filesystem, and directory read order is not the same on every platform, so
 * an unsorted list would make the manifest depend on which OS built it.
 */
function collectReferences(resolvedSources: readonly ResolvedSource[]): Map<string, ManifestReference[]> {
  const byDocument = new Map<string, ManifestReference[]>();

  for (const { source, resolutions } of resolvedSources) {
    if (resolutions.length === 0) {
      continue;
    }
    const lines = splitLines(source.text);
    for (const resolution of resolutions) {
      if (resolution.status === 'file-not-found') {
        continue;
      }
      const { pointer } = resolution;
      const reference: ManifestReference = {
        file: source.path,
        line: pointer.line + 1,
        symbol: symbolAfterComment(lines, pointer.comment.endLine),
        anchor: pointer.anchor,
      };
      const existing = byDocument.get(resolution.file.path);
      if (existing === undefined) {
        byDocument.set(resolution.file.path, [reference]);
      } else {
        existing.push(reference);
      }
    }
  }

  for (const references of byDocument.values()) {
    references.sort(byFileThenLine);
  }

  return byDocument;
}

/**
 * Describes the whole documentation surface: what exists, what each part
 * covers, and which code depends on it.
 * @docs manifest.md#the-format
 */
export async function buildManifest(options: BuildManifestOptions): Promise<DocsManifest> {
  // One clock reading for the whole build, so per-document staleness and
  // `generatedAt` cannot straddle a tick.
  const at = options.now?.() ?? new Date();
  const stalenessOptions = options.staleness ?? DEFAULT_STALENESS_OPTIONS;
  const resolvedSources = options.resolvedSources ?? (await resolveSources(options.sources, options.resolver));
  const references = collectReferences(resolvedSources);
  const paths = [...(await options.root.list())].sort();
  const nodes: ManifestNode[] = [];

  for (const path of paths) {
    const file = await options.root.read(path);
    if (file === undefined) {
      continue;
    }
    const lines = splitLines(file.content);
    const sections = parseSections(file.content);
    const documentReferences = references.get(path) ?? [];

    const anchors: ManifestAnchor[] = sections.map((section) => ({
      slug: section.slug,
      title: section.title,
      level: section.level,
      summary: proseSummary(lines.slice(section.bodyLine, section.endLine)),
      referencedBy: documentReferences.filter((reference) => reference.anchor === section.slug),
    }));

    nodes.push({
      path,
      title: documentTitle(sections) ?? path,
      summary: documentSummary(file.content),
      anchors,
      referencedBy: documentReferences,
      links: linkedDocuments(path, file.content).sort(),
      lastModified: formatDate(file.lastModified),
      staleness: computeStaleness(file.lastModified, stalenessOptions, at),
      words: countWords(file.content),
    });
  }

  const referencedDocuments = new Set(references.keys());
  const orphans = options.orphans ?? (await findOrphanDocuments(options.root, referencedDocuments, options.indexes));

  return {
    docsmirror: MANIFEST_FORMAT_VERSION,
    generatedAt: at.toISOString(),
    docsRoot: options.docsRoot,
    nodes,
    stats: {
      documents: nodes.length,
      anchors: nodes.reduce((total, node) => total + node.anchors.length, 0),
      references: nodes.reduce((total, node) => total + node.referencedBy.length, 0),
      orphans: orphans.length,
      referencedDocuments: referencedDocuments.size,
    },
  };
}
