import * as nodePath from 'node:path';
import { normalizeDocsPath, type LocalDocsRoot } from '@docsmirror/core';

/** Extensions the app is willing to read or write. Anything else is refused. */
const WRITABLE_EXTENSIONS = ['.md', '.markdown'] as const;

/**
 * Turns an untrusted request parameter into a docs-root-relative path, or
 * `undefined` when it does not name a place inside the docs root.
 *
 * Three checks stack on purpose: the syntactic rejections below catch the
 * obvious attempts, and `absolutePathOf` is the authority on containment
 * because it is the same code the rest of DocsMirror resolves pointers with.
 * @docs web.md#writing-safely
 */
export function docPathOf(root: LocalDocsRoot, raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 1024) {
    return undefined;
  }
  if (raw.includes('\0')) {
    return undefined;
  }
  const normalized = normalizeDocsPath(raw);
  if (normalized.length === 0 || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return undefined;
  }
  if (normalized.split('/').some((segment) => segment === '..')) {
    return undefined;
  }
  if (root.absolutePathOf(normalized) === undefined) {
    return undefined;
  }
  return normalized;
}

/**
 * Whether a contained path names a markdown document. `/api/doc` serves and
 * writes markdown and nothing else, anything else a document embeds is an
 * asset and goes through `/asset` with its own allowlist.
 */
export function isWritableDocPath(path: string): boolean {
  return (WRITABLE_EXTENSIONS as readonly string[]).includes(nodePath.posix.extname(path));
}
