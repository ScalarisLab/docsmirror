/**
 * The docs root abstraction.
 *
 * Pointer paths are root-relative rather than filesystem-relative precisely so
 * the root can be something other than a folder. `LocalDocsRoot` is the only
 * implementation shipped today; a hosted documentation service is a second
 * implementation of this interface and nothing above it changes.
 * @docs architecture.md#pluggable-docs-root
 */

/** A document fetched from a docs root. */
export interface DocFile {
  /** Docs-root-relative path, normalised, the path a pointer would carry. */
  readonly path: string;
  readonly content: string;
  /** When the document last changed, when the root can tell. */
  readonly lastModified?: Date;
  /** A URI an editor can open, when the root can produce one. */
  readonly uri?: string;
}

export interface DocsRoot {
  /** Human-readable identity of the root, shown in diagnostics and hovers. */
  readonly id: string;
  /** Reads a document, or resolves `undefined` when the root has no such path. */
  read(path: string): Promise<DocFile | undefined>;
  /** Every document path the root holds, used by orphan detection. */
  list(): Promise<readonly string[]>;
  /**
   * Writes a document, creating it and any parent directories it needs.
   * Optional: a root has to support reading to be a docs root at all, but not
   * every one can be written to, a hosted, read-only service is still a
   * legitimate `DocsRoot`. `@docsmirror/web`'s editor is the one surface that
   * calls this; every other surface only ever reads.
   */
  write?(path: string, content: string): Promise<void>;
  /** Drops cached state for one path, or for the whole root when omitted. */
  invalidate(path?: string): void;
}
