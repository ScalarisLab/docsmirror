/**
 * GitHub-style heading slugs. This is the single source of truth for the
 * anchor half of the convention: every surface, the CLI, the language server,
 * the MCP server, the manifest, slugs headings here and nowhere else.
 * @docs convention.md#anchors
 */

const INLINE_IMAGE = /!\[([^\]]*)\]\([^)]*\)/g;
const INLINE_LINK = /\[([^\]]*)\]\([^)]*\)/g;
const REFERENCE_LINK = /\[([^\]]*)\]\[[^\]]*\]/g;

/**
 * Emphasis characters that are never part of a heading's readable text.
 *
 * `_` is deliberately absent. It is a valid emphasis marker in markdown, but
 * treating it as one mangles the identifiers documentation is most often
 * written about, `PROCESS_DEATH_WINDOW_MS`, `CITY_UNRESOLVED`, a SQL column.
 * GitHub keeps underscores in its anchors, so keeping them is both more useful
 * and more correct; a literal `_italic_` heading keeps its markers, which is a
 * far smaller price.
 */
const DECORATION = /[*~`]+/g;

/**
 * Characters a slug may contain: letters of any script, decimal digits,
 * combining marks, `_`, `-`, and whitespace, which step 4 turns into hyphens.
 *
 * `\p{Nd}` rather than `\p{N}` on purpose: `\p{N}` also matches superscripts
 * and other numeric symbols, so `m²` would keep its `²` where GitHub drops it.
 * A digit means a digit.
 */
const NOT_SLUG_SAFE = /[^\p{L}\p{Nd}\p{M}\s_-]/gu;

/**
 * Reduces the inline markdown of a heading to the text a reader sees.
 *
 * Angle-bracketed text is deliberately left alone. Treating `<lastmod>` or
 * `<status>` as an HTML tag to be stripped deletes the very element name the
 * heading is about, and technical documentation names elements far more often
 * than it embeds real HTML in a heading. The brackets themselves disappear at
 * step 2 of the slug rule, which is all GitHub does with them.
 */
function unwrapMarkdown(raw: string): string {
  return raw.replace(INLINE_IMAGE, '$1').replace(INLINE_LINK, '$1').replace(REFERENCE_LINK, '$1');
}

/** Strips the inline markdown a heading may carry, keeping its visible text. */
export function headingText(raw: string): string {
  return unwrapMarkdown(raw).replace(DECORATION, '').trim();
}

/**
 * Converts heading text to a GitHub-compatible slug.
 *
 * The rule, in order, and it is worth resisting every temptation to "improve"
 * any step, each one has drawn blood:
 *
 * 1. lowercase;
 * 2. remove every character that is not a letter, a digit, `_`, `-`, or
 *    whitespace, note that letters means any script, so accents survive;
 * 3. trim;
 * 4. replace **each** whitespace character with `-`, never collapsing runs, so
 *    a heading whose em dash was removed in step 2 keeps both of its spaces
 *    and therefore yields two hyphens.
 */
export function slugify(raw: string): string {
  return unwrapMarkdown(raw)
    .toLowerCase()
    .replace(NOT_SLUG_SAFE, '')
    .trim()
    .replace(/\s/g, '-');
}

/**
 * Tracks slugs already emitted in a document so repeats get GitHub's `-1`,
 * `-2` … suffixes.
 */
export class SlugRegistry {
  private readonly counts = new Map<string, number>();

  /** Returns the unique slug for `raw` in this document. */
  next(raw: string): string {
    const base = slugify(raw);
    const seen = this.counts.get(base) ?? 0;
    this.counts.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen}`;
  }
}
