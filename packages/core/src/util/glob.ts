/**
 * A minimal glob matcher, enough for include/exclude lists and small enough to
 * keep the package dependency-free. Supports `*`, `**`, `?` and character
 * classes over `/`-separated paths.
 * @docs cli.md#include-and-exclude
 */

// `[` and `]` are included: an unmatched `[` falls through the character-class
// branch below and must land in the output as a literal, not a regex opener.
const SPECIAL = /[.+^${}()|[\]\\]/g;

function toRegExpSource(pattern: string): string {
  let source = '';
  let index = 0;
  while (index < pattern.length) {
    const char = pattern[index] ?? '';
    if (char === '*') {
      const isDoubleStar = pattern[index + 1] === '*';
      if (isDoubleStar) {
        const consumesSlash = pattern[index + 2] === '/';
        source += consumesSlash ? '(?:.*/)?' : '.*';
        index += consumesSlash ? 3 : 2;
      } else {
        source += '[^/]*';
        index += 1;
      }
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      index += 1;
      continue;
    }
    if (char === '[') {
      const end = pattern.indexOf(']', index + 1);
      if (end !== -1) {
        source += `[${pattern.slice(index + 1, end).replace(/^!/, '^')}]`;
        index = end + 1;
        continue;
      }
    }
    source += char.replace(SPECIAL, '\\$&');
    index += 1;
  }
  return source;
}

/** Compiles a glob into an anchored regular expression. */
export function globToRegExp(pattern: string): RegExp {
  return new RegExp(`^${toRegExpSource(pattern)}$`);
}

/** Tests a `/`-separated path against a set of globs. An empty set never matches. */
export function matchesAny(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(path));
}
