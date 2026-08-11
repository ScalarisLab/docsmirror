/**
 * A pointer found in a source file.
 *
 * `path` is always relative to the configured docs root, never to the source
 * file that carries the pointer.
 * @docs convention.md#the-pointer
 */
export interface DocsPointer {
  /** The pointer as written, starting at `@docs`. */
  readonly raw: string;
  /** Docs-root-relative path to the target document. */
  readonly path: string;
  /** GitHub-style heading slug, or `undefined` when the pointer targets the whole file. */
  readonly anchor: string | undefined;
  /** 0-based line index of the line carrying the pointer. */
  readonly line: number;
  /** 0-based column of the `@` character. */
  readonly column: number;
  /** 0-based column just past the last character of `raw`. */
  readonly endColumn: number;
  /** The enclosing comment block, useful to fold or decorate the whole comment. */
  readonly comment: CommentRange;
}

/** The span of the comment that carries a pointer, both bounds inclusive and 0-based. */
export interface CommentRange {
  readonly startLine: number;
  readonly endLine: number;
}
