/**
 * One consistent view of a project: its configuration, its docs root, and the
 * manifest built from both. Every tool answers from a snapshot, so a single
 * call never mixes two states of the filesystem.
 * @docs manifest.md#the-format
 */

import {
  normalizeDocsPath,
  type DocFile,
  type DocsManifest,
  type DocsMirrorConfig,
  type LocalDocsRoot,
  type ManifestAnchor,
  type ManifestNode,
} from '@docsmirror/core';

export class ProjectSnapshot {
  private readonly byPath: ReadonlyMap<string, ManifestNode>;

  constructor(
    readonly projectRoot: string,
    readonly config: DocsMirrorConfig,
    readonly root: LocalDocsRoot,
    readonly manifest: DocsManifest,
    /** Signature the snapshot was built from; a different one means rebuild. */
    readonly fingerprint: string,
  ) {
    // Case-insensitive on purpose, so an agent on any OS can address a path
    // it read elsewhere; two documents differing only by case would collide
    // here, but such a tree is pathological (it cannot even be checked out on
    // Windows or macOS).
    this.byPath = new Map(manifest.nodes.map((node) => [node.path.toLowerCase(), node]));
  }

  /** Every documentation path the project holds, in manifest order. */
  get paths(): string[] {
    return this.manifest.nodes.map((node) => node.path);
  }

  /**
   * The document a caller named. Matching tolerates back slashes, a leading
   * `./` and a different case, because those are the three ways an agent
   * writes a path it read somewhere else.
   */
  node(path: string): ManifestNode | undefined {
    return this.byPath.get(normalizeDocsPath(path.trim()).toLowerCase());
  }

  /** The anchor of a document, matched case-insensitively like a pointer's. */
  anchor(node: ManifestNode, slug: string): ManifestAnchor | undefined {
    const wanted = slug.trim().replace(/^#/, '').toLowerCase();
    return node.anchors.find((candidate) => candidate.slug.toLowerCase() === wanted);
  }

  /** Reads a document's markdown from the docs root, cached by the root itself. */
  read(path: string): Promise<DocFile | undefined> {
    return this.root.read(path);
  }
}
