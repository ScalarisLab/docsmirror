import { COMMENT_CLOSERS, scanComments } from './comments';
import type { DocsPointer } from './types';

/** A `@docs` marker that is not a usable pointer. */
export interface MalformedPointer {
  readonly line: number;
  readonly column: number;
  readonly endColumn: number;
  readonly raw: string;
  readonly reason: MalformedReason;
}

export type MalformedReason =
  /** `@docs` with nothing after it. */
  | 'missing-path'
  /** The target was written as a markdown link instead of a bare path. */
  | 'markdown-link'
  /** An absolute path, or one escaping the docs root with `..`. */
  | 'path-outside-root';

export interface ParseResult {
  readonly pointers: readonly DocsPointer[];
  readonly malformed: readonly MalformedPointer[];
}

const MARKER = '@docs';
/**
 * The marker must be followed by whitespace or the end of the line, so prose
 * that merely mentions `@docs`, as this very comment does, is not read as a
 * pointer.
 */
const POINTER_PATTERN = /@docs(?=[ \t]|$)[ \t]*(\S*)/g;
/**
 * Characters allowed between the start of a comment's text and the marker.
 * A pointer occupies its own comment line, so only the decoration a block
 * comment adds to its continuation lines may precede it.
 */
const LINE_DECORATION = /^[\s*]*$/;
const TRAILING_PUNCTUATION = /[.,;:'"`]+$/;
/** Quotes wrapping a pointer are never part of the path. */
const LEADING_QUOTES = /^['"`]+/;

/** Splits text into lines, tolerating CRLF and lone CR. */
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\n|\r/);
}

/** Removes a comment closer and trailing punctuation glued to the end of a pointer. */
function trimTarget(target: string): string {
  let result = target.replace(LEADING_QUOTES, '');
  let changed = true;
  while (changed) {
    changed = false;
    for (const closer of COMMENT_CLOSERS) {
      if (result.length > closer.length && result.endsWith(closer)) {
        result = result.slice(0, -closer.length);
        changed = true;
      }
    }
    const trimmed = result.replace(TRAILING_PUNCTUATION, '');
    if (trimmed !== result && trimmed.length > 0) {
      result = trimmed;
      changed = true;
    }
  }
  return result;
}

/** Normalises a docs-root-relative path: forward slashes, no `./`, no trailing slash. */
export function normalizeDocsPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function escapesRoot(path: string): boolean {
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) {
    return true;
  }
  let depth = 0;
  for (const segment of path.split('/')) {
    if (segment === '..') {
      depth -= 1;
      if (depth < 0) {
        return true;
      }
    } else if (segment !== '.' && segment !== '') {
      depth += 1;
    }
  }
  return false;
}

/**
 * Finds every `@docs` pointer inside the comments of a source file.
 *
 * The scan is language-agnostic and only considers text that sits inside a
 * comment, so a pointer written in code or in prose is ignored.
 * @docs convention.md#the-pointer
 */
export function parseSource(text: string): ParseResult {
  const lines = splitLines(text);
  const pointers: DocsPointer[] = [];
  const malformed: MalformedPointer[] = [];

  for (const block of scanComments(lines)) {
    for (const commentLine of block.lines) {
      const line = lines[commentLine.line] ?? '';
      POINTER_PATTERN.lastIndex = 0;
      let match = POINTER_PATTERN.exec(line);
      while (match !== null) {
        const column = match.index;
        if (column < commentLine.textStart || !LINE_DECORATION.test(line.slice(commentLine.textStart, column))) {
          match = POINTER_PATTERN.exec(line);
          continue;
        }
        const target = trimTarget(match[1] ?? '');
        const raw = target.length > 0 ? `${MARKER} ${target}` : MARKER;
        // The target is searched for past the marker, not from the marker: a
        // target like `docs` also occurs inside `@docs` itself, and matching
        // there would end the range before the target even starts.
        const endColumn =
          target.length > 0 ? line.indexOf(target, column + MARKER.length) + target.length : column + MARKER.length;
        const base = { line: commentLine.line, column, endColumn, raw };

        if (target.length === 0) {
          malformed.push({ ...base, reason: 'missing-path' });
        } else if (/^[[(]/.test(target) || target.includes('](')) {
          malformed.push({ ...base, reason: 'markdown-link' });
        } else {
          const hashIndex = target.indexOf('#');
          const rawPath = hashIndex === -1 ? target : target.slice(0, hashIndex);
          const rawAnchor = hashIndex === -1 ? '' : target.slice(hashIndex + 1);
          const path = normalizeDocsPath(rawPath);
          if (path.length === 0 || escapesRoot(path)) {
            malformed.push({ ...base, reason: 'path-outside-root' });
          } else {
            pointers.push({
              raw,
              path,
              anchor: rawAnchor.length > 0 ? rawAnchor.toLowerCase() : undefined,
              line: commentLine.line,
              column,
              endColumn,
              comment: { startLine: block.startLine, endLine: block.endLine },
            });
          }
        }
        match = POINTER_PATTERN.exec(line);
      }
    }
  }

  return { pointers, malformed };
}
