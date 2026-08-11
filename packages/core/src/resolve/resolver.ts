import { documentTitle, findSection, parseSections, sectionMarkdown, type DocSection } from '../markdown/sections';
import type { DocsPointer } from '../pointer/types';
import type { DocFile, DocsRoot } from '../root/DocsRoot';
import { computeStaleness, DEFAULT_STALENESS_OPTIONS, type Staleness, type StalenessOptions } from '../staleness';

/**
 * Sections parsed from a file's content, keyed by the `DocFile` object itself
 * rather than its path: a root that caches unchanged content, `LocalDocsRoot`
 * does, hands back the exact same object until the file changes, so this
 * needs no invalidation of its own. A root that does not gets a cache that
 * simply never hits, never a stale one.
 */
const sectionsCache = new WeakMap<DocFile, readonly DocSection[]>();

function sectionsOf(file: DocFile): readonly DocSection[] {
  const cached = sectionsCache.get(file);
  if (cached !== undefined) {
    return cached;
  }
  const sections = parseSections(file.content);
  sectionsCache.set(file, sections);
  return sections;
}

/** A pointer that resolved to a document, and to a section when it carried an anchor. */
export interface ResolvedPointer {
  readonly status: 'resolved';
  readonly pointer: DocsPointer;
  readonly file: DocFile;
  /** The targeted section, or `undefined` when the pointer targets the whole file. */
  readonly section: DocSection | undefined;
  /** Title of the section, falling back to the document title, then the path. */
  readonly title: string;
  /** Markdown of the section, or of the whole document for a bare pointer. */
  readonly markdown: string;
  readonly staleness: Staleness;
}

export interface UnresolvedFile {
  readonly status: 'file-not-found';
  readonly pointer: DocsPointer;
}

export interface UnresolvedAnchor {
  readonly status: 'anchor-not-found';
  readonly pointer: DocsPointer;
  readonly file: DocFile;
  /** Slugs the document does define, so callers can suggest a correction. */
  readonly available: readonly string[];
}

export type PointerResolution = ResolvedPointer | UnresolvedFile | UnresolvedAnchor;

export interface DocsResolverOptions {
  readonly staleness?: StalenessOptions;
  /** Fixed clock, used by tests and by reproducible CLI runs. */
  readonly now?: () => Date;
}

/** Resolves pointers against a docs root. Every surface reads documents through this. */
export class DocsResolver {
  private readonly stalenessOptions: StalenessOptions;
  private readonly now: () => Date;

  constructor(
    readonly root: DocsRoot,
    options: DocsResolverOptions = {},
  ) {
    this.stalenessOptions = options.staleness ?? DEFAULT_STALENESS_OPTIONS;
    this.now = options.now ?? ((): Date => new Date());
  }

  async resolve(pointer: DocsPointer): Promise<PointerResolution> {
    const file = await this.root.read(pointer.path);
    if (file === undefined) {
      return { status: 'file-not-found', pointer };
    }

    const sections = sectionsOf(file);
    const staleness = computeStaleness(file.lastModified, this.stalenessOptions, this.now());

    if (pointer.anchor === undefined) {
      return {
        status: 'resolved',
        pointer,
        file,
        section: undefined,
        title: documentTitle(sections) ?? file.path,
        markdown: file.content.replace(/\s+$/, ''),
        staleness,
      };
    }

    const section = findSection(sections, pointer.anchor);
    if (section === undefined) {
      return {
        status: 'anchor-not-found',
        pointer,
        file,
        available: sections.map((candidate) => candidate.slug),
      };
    }

    return {
      status: 'resolved',
      pointer,
      file,
      section,
      title: section.title,
      markdown: sectionMarkdown(file.content, section),
      staleness,
    };
  }

  /** Resolves many pointers, sharing the root's cache across the batch. */
  async resolveAll(pointers: readonly DocsPointer[]): Promise<PointerResolution[]> {
    const resolutions: PointerResolution[] = [];
    for (const pointer of pointers) {
      resolutions.push(await this.resolve(pointer));
    }
    return resolutions;
  }
}
