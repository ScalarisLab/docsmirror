/**
 * URI and path helpers. The server keeps filesystem paths internally and only
 * converts at the protocol boundary, so Windows drive letters and percent
 * escapes are handled in exactly one place.
 * @docs server.md#workspaces
 */

import * as nodePath from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Filesystem path behind a `file:` URI, or `undefined` for any other scheme. */
export function uriToPath(uri: string): string | undefined {
  if (!uri.startsWith('file:')) {
    return undefined;
  }
  try {
    return fileURLToPath(uri);
  } catch {
    return undefined;
  }
}

export function pathToUri(path: string): string {
  return pathToFileURL(path).toString();
}

/**
 * `to` expressed relative to `from` with forward slashes, or `undefined` when
 * `to` sits outside `from`. This is the form include/exclude globs match.
 */
export function relativePosix(from: string, to: string): string | undefined {
  const relative = nodePath.relative(from, to);
  if (relative.length === 0 || relative.startsWith('..') || nodePath.isAbsolute(relative)) {
    return undefined;
  }
  return relative.split(nodePath.sep).join('/');
}

/** True when `child` is inside `parent`, or is `parent` itself. */
export function contains(parent: string, child: string): boolean {
  return nodePath.resolve(parent) === nodePath.resolve(child) || relativePosix(parent, child) !== undefined;
}
