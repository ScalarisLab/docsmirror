/**
 * The two custom requests, as one importable contract.
 *
 * `docsmirror/pointers` and `docsmirror/section` are not in the LSP, so their
 * names and result shapes are an agreement between this server and any client
 * that draws pointer lines itself. Declared twice, the two halves drift apart;
 * declared here once, both import the same words. The module carries types and
 * two string constants and nothing else, so a client that bundles, the VS
 * Code extension does, ships the contract, not the server behind it.
 * @docs server.md#custom-requests
 */

/** Structural twins of the LSP position and range, so importing the contract
 *  does not drag a protocol library into the client. */
export interface ProtocolPosition {
  readonly line: number;
  readonly character: number;
}

export interface ProtocolRange {
  readonly start: ProtocolPosition;
  readonly end: ProtocolPosition;
}

/** Method name of the pointer-markers request. */
export const POINTERS_REQUEST = 'docsmirror/pointers';

export interface PointerMarker {
  /** The whole pointer, `@docs` included. */
  readonly range: ProtocolRange;
  /** Just the `path#anchor` half: what a client hides when it collapses one. */
  readonly targetRange: ProtocolRange;
  readonly resolved: boolean;
  /** The section's title, or the pointer's own target when nothing resolved. */
  readonly label: string;
}

export interface PointerMarkersResult {
  /**
   * False when the project has no documentation folder at all. It is the one
   * fact a client needs beyond the markers themselves: an empty marker list
   * means "this file points at nothing", a missing docs root means "nothing in
   * this project can resolve", and only the server can tell the two apart.
   */
  readonly docsRootFound: boolean;
  readonly markers: readonly PointerMarker[];
}

/** Method name of the section-content request. */
export const SECTION_REQUEST = 'docsmirror/section';

export interface SectionContent {
  readonly title: string;
  /** Docs-root-relative path of the document the section lives in. */
  readonly path: string;
  /** `updated YYYY-MM-DD · Aging`, ready to print. */
  readonly freshness: string;
  /** The section's markdown, front matter gone and relative links made absolute. */
  readonly markdown: string;
}
