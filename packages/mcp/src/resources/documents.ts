/**
 * Documents as MCP resources.
 *
 * A resource is what a client can attach to a conversation on its own
 * initiative, so every document gets a stable `docs://<path>` URI, stable
 * because the path is the same one a `@docs` pointer carries, and it does not
 * move when the file is edited.
 */

import { ToolFailure } from '../errors';
import type { ProjectSnapshot } from '../project/ProjectSnapshot';
import { requireNode } from '../tools/lookup';

export const RESOURCE_SCHEME = 'docs://';

export const MARKDOWN_MIME_TYPE = 'text/markdown';

export interface DocumentResource {
  readonly uri: string;
  readonly name: string;
  readonly title: string;
  readonly description: string | undefined;
  readonly mimeType: string;
}

/** The URI of a docs-root-relative path, each segment escaped. */
export function resourceUri(path: string): string {
  return `${RESOURCE_SCHEME}${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** The path a `docs://` URI names, or `undefined` for any other scheme. */
export function pathOfUri(uri: string): string | undefined {
  if (!uri.startsWith(RESOURCE_SCHEME)) {
    return undefined;
  }
  return uri
    .slice(RESOURCE_SCHEME.length)
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/');
}

export function documentResources(snapshot: ProjectSnapshot): DocumentResource[] {
  return snapshot.manifest.nodes.map((node) => ({
    uri: resourceUri(node.path),
    name: node.title,
    title: node.title,
    description: node.summary,
    mimeType: MARKDOWN_MIME_TYPE,
  }));
}

/** The markdown behind a resource URI. */
export async function readResource(snapshot: ProjectSnapshot, uri: string): Promise<string> {
  const path = pathOfUri(uri);
  if (path === undefined) {
    throw new ToolFailure(
      `\`${uri}\` is not a DocsMirror resource. Documentation resources are named ` +
        `\`${RESOURCE_SCHEME}<path>\`, for example \`${resourceUri('index.md')}\`.`,
    );
  }
  const node = requireNode(snapshot, path);
  const file = await snapshot.read(node.path);
  if (file === undefined) {
    throw new ToolFailure(`\`${node.path}\` could not be read from disk; it was probably moved or deleted.`);
  }
  return file.content;
}
