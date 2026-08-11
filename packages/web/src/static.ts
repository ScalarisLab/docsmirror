import { promises as fs } from 'node:fs';
import * as nodePath from 'node:path';

/** The folder holding the front end, a sibling of the compiled `dist`. */
const PUBLIC_DIRECTORY = nodePath.resolve(__dirname, '..', 'public');

const CONTENT_TYPES = new Map<string, string>([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
  ['.ico', 'image/x-icon'],
]);

/** Extensions the docs root will serve as an inline asset. */
export const ASSET_TYPES = new Map<string, string>(
  [...CONTENT_TYPES].filter(([extension]) => extension !== '.html' && extension !== '.js' && extension !== '.css'),
);

function contentTypeOf(path: string): string {
  return CONTENT_TYPES.get(nodePath.extname(path).toLowerCase()) ?? 'application/octet-stream';
}

export interface StaticFile {
  readonly contentType: string;
  readonly body: Buffer;
}

/**
 * Reads a file from the front-end folder. Only files that exist there are
 * served; there is no directory listing and no path can leave the folder.
 */
export async function readPublicFile(urlPath: string): Promise<StaticFile | undefined> {
  let relative: string;
  try {
    relative = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  } catch {
    // Malformed percent-encoding names nothing on disk: a 404, not a crash.
    return undefined;
  }
  if (relative.includes('\0')) {
    return undefined;
  }
  const absolute = nodePath.resolve(PUBLIC_DIRECTORY, relative);
  const inside = nodePath.relative(PUBLIC_DIRECTORY, absolute);
  if (inside.startsWith('..') || nodePath.isAbsolute(inside)) {
    return undefined;
  }
  try {
    const stats = await fs.stat(absolute);
    if (!stats.isFile()) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return { contentType: contentTypeOf(absolute), body: await fs.readFile(absolute) };
}
