import { linkedDocuments } from '../markdown/links';
import { parseSource, type MalformedPointer, type MalformedReason } from '../pointer/parse';
import type { DocsPointer } from '../pointer/types';
import type { DocsResolver, PointerResolution } from '../resolve/resolver';
import type { DocsRoot } from '../root/DocsRoot';
import { closestMatch } from '../util/closest';

export type IssueKind =
  | 'malformed-pointer'
  | 'file-not-found'
  | 'anchor-not-found'
  | 'orphan-doc'
  /** The committed manifest no longer describes the documentation on disk. */
  | 'manifest-stale';
export type IssueSeverity = 'error' | 'warning';

/** Where an issue sits in a source file. All indices are 0-based. */
export interface IssueRange {
  readonly line: number;
  readonly column: number;
  readonly endColumn: number;
}

export interface ValidationIssue {
  readonly kind: IssueKind;
  readonly severity: IssueSeverity;
  /** Source file carrying the pointer, or the orphaned document's root-relative path. */
  readonly file: string;
  /**
   * Docs-root-relative document the issue is about, when there is one: the
   * pointer's target, or the orphan itself. A malformed pointer never named a
   * document, so it has none.
   *
   * The message says the same thing in prose, and reading it back out of there
   * would make every consumer depend on the wording. A surface that wants to
   * show "something is wrong with the page you are reading" needs the path as
   * data.
   */
  readonly target: string | undefined;
  readonly range: IssueRange | undefined;
  readonly message: string;
  /** A correction worth offering, when one is obvious. */
  readonly suggestion: string | undefined;
}

/** A source file to scan, with the path callers want reported back. */
export interface SourceDocument {
  readonly path: string;
  readonly text: string;
}

export interface ValidationReport {
  readonly issues: readonly ValidationIssue[];
  readonly scannedFiles: number;
  readonly pointerCount: number;
  readonly resolvedCount: number;
  /** Docs-root-relative paths reached by at least one pointer. */
  readonly referencedDocuments: ReadonlySet<string>;
}

const MALFORMED_MESSAGES: Record<MalformedReason, string> = {
  'missing-path': '@docs needs a docs-root-relative path, for example `@docs decisions/retry-policy.md#idempotency`.',
  'markdown-link': '@docs takes a bare docs-root-relative path, not a markdown link.',
  'path-outside-root': '@docs paths are relative to the docs root; absolute paths and `..` are not allowed.',
};

function rangeOf(pointer: Pick<DocsPointer, 'line' | 'column' | 'endColumn'>): IssueRange {
  return { line: pointer.line, column: pointer.column, endColumn: pointer.endColumn };
}

/** One source file, already parsed and with every pointer already resolved. */
export interface ResolvedSource {
  readonly source: SourceDocument;
  readonly pointers: readonly DocsPointer[];
  readonly malformed: readonly MalformedPointer[];
  readonly resolutions: readonly PointerResolution[];
}

/**
 * Parses a source and resolves everything it points at, once. Validation and
 * the manifest both need exactly this, and resolving twice would mean asking
 * the docs root the same question twice for every pointer in the project.
 */
export async function resolveSource(source: SourceDocument, resolver: DocsResolver): Promise<ResolvedSource> {
  const { pointers, malformed } = parseSource(source.text);
  const resolutions = await resolver.resolveAll(pointers);
  return { source, pointers, malformed, resolutions };
}

/** `resolveSource`, for every source in a project. */
export async function resolveSources(
  sources: readonly SourceDocument[],
  resolver: DocsResolver,
): Promise<readonly ResolvedSource[]> {
  const resolved: ResolvedSource[] = [];
  for (const source of sources) {
    resolved.push(await resolveSource(source, resolver));
  }
  return resolved;
}

/** The issues one already-resolved source raises, and what it reached. */
function issuesFor(
  resolved: ResolvedSource,
  rootId: string,
): { issues: ValidationIssue[]; resolvedCount: number; referenced: string[] } {
  const { source, malformed, resolutions } = resolved;
  const issues: ValidationIssue[] = malformed.map((entry) => ({
    kind: 'malformed-pointer' as const,
    severity: 'error' as const,
    file: source.path,
    target: undefined,
    range: rangeOf(entry),
    message: MALFORMED_MESSAGES[entry.reason],
    suggestion: undefined,
  }));

  const referenced: string[] = [];
  let resolvedCount = 0;

  for (const resolution of resolutions) {
    if (resolution.status === 'resolved') {
      resolvedCount += 1;
      referenced.push(resolution.file.path);
      continue;
    }
    if (resolution.status === 'file-not-found') {
      issues.push({
        kind: 'file-not-found',
        severity: 'error',
        file: source.path,
        target: resolution.pointer.path,
        range: rangeOf(resolution.pointer),
        message: `No document at \`${resolution.pointer.path}\` in the docs root (${rootId}).`,
        suggestion: undefined,
      });
      continue;
    }
    referenced.push(resolution.file.path);
    // An anchor-not-found resolution always carries an anchor, a bare pointer
    // to an existing file resolves. The `??` only narrows the union type.
    const anchor = resolution.pointer.anchor ?? '';
    const nearest = closestMatch(anchor, resolution.available);
    issues.push({
      kind: 'anchor-not-found',
      severity: 'error',
      file: source.path,
      target: resolution.file.path,
      range: rangeOf(resolution.pointer),
      message: `\`${resolution.pointer.path}\` has no heading anchored at \`#${anchor}\`.`,
      suggestion: nearest === undefined ? undefined : `#${nearest}`,
    });
  }

  return { issues, resolvedCount, referenced };
}

/**
 * Validates one source file. The language server calls this per keystroke and
 * the CLI calls it per file, so both report a problem identically.
 * @docs cli.md#what-check-verifies
 */
export async function validateSource(
  source: SourceDocument,
  resolver: DocsResolver,
): Promise<{ issues: ValidationIssue[]; pointerCount: number; resolvedCount: number; referenced: string[] }> {
  const resolved = await resolveSource(source, resolver);
  return { ...issuesFor(resolved, resolver.root.id), pointerCount: resolved.pointers.length };
}

/** A `ValidationReport` from sources already parsed and resolved, no second pass. */
export function reportFor(resolved: readonly ResolvedSource[], rootId: string): ValidationReport {
  const issues: ValidationIssue[] = [];
  const referencedDocuments = new Set<string>();
  let pointerCount = 0;
  let resolvedCount = 0;

  for (const entry of resolved) {
    const result = issuesFor(entry, rootId);
    issues.push(...result.issues);
    pointerCount += entry.pointers.length;
    resolvedCount += result.resolvedCount;
    for (const path of result.referenced) {
      referencedDocuments.add(path);
    }
  }

  return { issues, scannedFiles: resolved.length, pointerCount, resolvedCount, referencedDocuments };
}

/** Validates a whole project's sources against the docs root. */
export async function validateProject(
  sources: readonly SourceDocument[],
  resolver: DocsResolver,
): Promise<ValidationReport> {
  return reportFor(await resolveSources(sources, resolver), resolver.root.id);
}

/** Every path in `all`, listed under each key `keysOf` derives from it. */
function indexBy(
  all: readonly string[],
  keysOf: (path: string) => readonly string[],
): ReadonlyMap<string, readonly string[]> {
  const index = new Map<string, string[]>();
  for (const path of all) {
    for (const key of keysOf(path)) {
      const bucket = index.get(key);
      if (bucket === undefined) {
        index.set(key, [path]);
      } else {
        bucket.push(path);
      }
    }
  }
  return index;
}

/** Every path in `all`, keyed by its final path segment, `guide/setup.md` under `setup.md`. */
function byBasename(all: readonly string[]): ReadonlyMap<string, readonly string[]> {
  return indexBy(all, (path) => {
    const slash = path.lastIndexOf('/');
    return [slash === -1 ? path : path.slice(slash + 1)];
  });
}

/**
 * Every path in `all`, keyed by each prefix a link with no extension could
 * name, `guide/setup.md` under `guide/setup` and, since a filename may carry
 * more than one dot, any other prefix ending right before one, so `notes.v2.md`
 * is reachable as either `notes` or `notes.v2`.
 */
function byExtensionlessPrefix(all: readonly string[]): ReadonlyMap<string, readonly string[]> {
  return indexBy(all, (path) => {
    const slash = path.lastIndexOf('/');
    const segment = slash === -1 ? path : path.slice(slash + 1);
    const prefixes: string[] = [];
    for (let dot = segment.indexOf('.'); dot !== -1; dot = segment.indexOf('.', dot + 1)) {
      prefixes.push(path.slice(0, slash + 1 + dot));
    }
    return prefixes;
  });
}

/**
 * Documents that no pointer reaches and no index links to, directly or
 * transitively. Reachability follows relative markdown links, so a document
 * linked from an index counts as reachable.
 * @docs cli.md#orphan-detection
 */
export async function findOrphanDocuments(
  root: DocsRoot,
  referencedDocuments: ReadonlySet<string>,
  indexes: readonly string[],
): Promise<ValidationIssue[]> {
  const all = await root.list();
  const known = new Set(all);
  const reachable = new Set<string>();
  const queue: string[] = [];
  const names = byBasename(all);
  const prefixes = byExtensionlessPrefix(all);

  const seed = (path: string): void => {
    if (known.has(path) && !reachable.has(path)) {
      reachable.add(path);
      queue.push(path);
    }
  };

  for (const path of referencedDocuments) {
    seed(path);
  }
  for (const index of indexes) {
    for (const path of names.get(index) ?? []) {
      seed(path);
    }
  }

  // `for...of` visits entries `seed` appends during the walk, so the queue
  // needs no explicit cursor and no shift.
  for (const current of queue) {
    const file = await root.read(current);
    if (file === undefined) {
      continue;
    }
    for (const target of linkedDocuments(current, file.content)) {
      seed(target);
      for (const path of prefixes.get(target) ?? []) {
        seed(path);
      }
    }
  }

  return all
    .filter((path) => !reachable.has(path))
    .map((path) => ({
      kind: 'orphan-doc' as const,
      severity: 'warning' as const,
      file: path,
      target: path,
      range: undefined,
      message: 'No @docs pointer and no index reaches this document.',
      suggestion: undefined,
    }));
}
