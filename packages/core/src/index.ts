/**
 * DocsMirror core, the single source of truth for the `@docs` convention.
 * Every other package (CLI, language server, editor clients) reads pointers
 * through this package and nowhere else.
 * @docs architecture.md#packages
 */

export { CONFIG_FILE_NAME, DEFAULT_CONFIG, loadConfig } from './config';
export type { DocsMirrorConfig, LoadedConfig, PartialConfig } from './config';

export { hasDatedContent, renderDatedSections, splitDatedBlocks } from './markdown/dating';
export type { DatedBlock } from './markdown/dating';
export { linkedDocuments } from './markdown/links';
export {
  documentTitle,
  findSection,
  parseSections,
  sectionMarkdown,
} from './markdown/sections';
export type { DocSection } from './markdown/sections';
export { headingText, slugify, SlugRegistry } from './markdown/slug';

export { buildManifest } from './manifest/build';
export type { BuildManifestOptions } from './manifest/build';
export { manifestsEqual, readManifest, serializeManifest, writeManifest } from './manifest/io';
export { documentSummary, proseSummary } from './manifest/summary';
export { symbolAfterComment } from './manifest/symbols';
export { MANIFEST_FILE_NAME, MANIFEST_FORMAT_VERSION } from './manifest/types';
export type {
  DocsManifest,
  ManifestAnchor,
  ManifestNode,
  ManifestReference,
  ManifestStats,
} from './manifest/types';

export { normalizeDocsPath, parseSource, splitLines } from './pointer/parse';
export type { MalformedPointer, MalformedReason, ParseResult } from './pointer/parse';
export type { CommentRange, DocsPointer } from './pointer/types';

export { openProject } from './project/open';
export type { OpenedProject, OpenProjectOverrides } from './project/open';
export { scanOptionsFrom, scanSources } from './project/scanSources';
export type { ScanOptions } from './project/scanSources';

export { DocsResolver } from './resolve/resolver';
export type {
  DocsResolverOptions,
  PointerResolution,
  ResolvedPointer,
  UnresolvedAnchor,
  UnresolvedFile,
} from './resolve/resolver';

export type { DocFile, DocsRoot } from './root/DocsRoot';
export { LocalDocsRoot } from './root/LocalDocsRoot';
export type { LocalDocsRootOptions } from './root/LocalDocsRoot';

export { computeStaleness, formatDate } from './staleness';
export type { Staleness, StalenessOptions } from './staleness';

export { closestMatch } from './util/closest';
export { matchesAny } from './util/glob';

export {
  findOrphanDocuments,
  reportFor,
  resolveSources,
  validateProject,
  validateSource,
} from './validate/validate';
export type {
  IssueKind,
  IssueRange,
  IssueSeverity,
  ResolvedSource,
  SourceDocument,
  ValidationIssue,
  ValidationReport,
} from './validate/validate';
