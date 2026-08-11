import { normalizeDocsPath, splitLines } from '../pointer/parse';
import { maskFencedCode } from './syntax';

const INLINE_TARGET = /\[[^\]]*\]\(\s*<?([^)\s>]+)>?[^)]*\)/g;
const REFERENCE_DEFINITION = /^\s{0,3}\[[^\]]+\]:\s*<?([^\s>]+)>?/gm;
const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i;

/** Joins a docs-root-relative directory and a link target into a root-relative path. */
function resolveAgainst(fromPath: string, target: string): string | undefined {
  const segments = normalizeDocsPath(fromPath).split('/').slice(0, -1);
  for (const segment of normalizeDocsPath(target).split('/')) {
    if (segment === '..') {
      if (segments.pop() === undefined) {
        return undefined;
      }
    } else if (segment !== '.' && segment !== '') {
      segments.push(segment);
    }
  }
  return segments.length > 0 ? segments.join('/') : undefined;
}

/**
 * Docs-root-relative paths linked from a document. External URLs, in-page
 * anchors and absolute paths are ignored, only links that keep the reader
 * inside the docs root make a document reachable. Links inside fenced code
 * are examples, not navigation, so they are masked out first, the same rule
 * the section and summary scanners follow.
 * @docs cli.md#orphan-detection
 */
export function linkedDocuments(fromPath: string, markdown: string): string[] {
  const text = maskFencedCode(splitLines(markdown)).join('\n');
  const found = new Set<string>();
  for (const pattern of [INLINE_TARGET, REFERENCE_DEFINITION]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match !== null) {
      const target = (match[1] ?? '').split('#')[0] ?? '';
      if (target.length > 0 && !ABSOLUTE.test(target)) {
        const resolved = resolveAgainst(fromPath, target);
        if (resolved !== undefined) {
          found.add(resolved);
        }
      }
      match = pattern.exec(text);
    }
  }
  return [...found];
}
