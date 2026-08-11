/**
 * The manifest: a machine-readable description of a repository's whole
 * documentation surface, so an agent can discover what exists before reading
 * anything.
 * @docs manifest.md#the-format
 */

/** Format version of the manifest document itself, not of the tooling. */
export const MANIFEST_FORMAT_VERSION = '1.0';

/** Default file name, written at the project root beside `docsmirror.config.json`. */
export const MANIFEST_FILE_NAME = 'docsmirror.json';

/** A heading inside a document, addressable by a pointer. */
export interface ManifestAnchor {
  /** GitHub-style slug, the `#anchor` part of a pointer. */
  readonly slug: string;
  readonly title: string;
  readonly level: number;
  /** One line describing what the section covers, derived from its first prose. */
  readonly summary: string | undefined;
  /** Code sites pointing specifically at this anchor. */
  readonly referencedBy: readonly ManifestReference[];
}

/** A `@docs` pointer, seen from the documentation's side. */
export interface ManifestReference {
  /** Project-relative path of the source file carrying the pointer. */
  readonly file: string;
  /** 1-based line, the form editors and humans use. */
  readonly line: number;
  /** Best-effort name of the code the comment documents, when one is recognisable. */
  readonly symbol: string | undefined;
  /** The anchor the pointer named, or `undefined` when it targets the whole document. */
  readonly anchor: string | undefined;
}

/** One documentation file. */
export interface ManifestNode {
  /** Docs-root-relative path, exactly what a pointer would carry. */
  readonly path: string;
  readonly title: string;
  /** One line stating what the document covers. */
  readonly summary: string | undefined;
  readonly anchors: readonly ManifestAnchor[];
  /** Every code site pointing at this document, at any anchor. */
  readonly referencedBy: readonly ManifestReference[];
  /** Other documents this one links to, docs-root-relative. */
  readonly links: readonly string[];
  /**
   * ISO date of the last change, when the docs root can tell. Derived from
   * file modification times, which git does not preserve, so this field and
   * `staleness` are excluded when comparing two manifests for equality.
   */
  readonly lastModified: string | undefined;
  readonly staleness: string;
  readonly words: number;
}

export interface ManifestStats {
  readonly documents: number;
  readonly anchors: number;
  readonly references: number;
  /** Documents no pointer and no index reaches. */
  readonly orphans: number;
  /** Documents that at least one pointer targets. */
  readonly referencedDocuments: number;
}

export interface DocsManifest {
  /** Format version of this document. */
  readonly docsmirror: string;
  /** ISO timestamp. Excluded when comparing two manifests for equality. */
  readonly generatedAt: string;
  /** Docs root, project-relative, as configured. */
  readonly docsRoot: string;
  readonly nodes: readonly ManifestNode[];
  readonly stats: ManifestStats;
}
