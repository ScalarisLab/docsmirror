import { headingText } from '../markdown/slug';
import { ATX_HEADING, maskFencedCode, SETEXT_UNDERLINE, skipFrontMatter } from '../markdown/syntax';
import { splitLines } from '../pointer/parse';

/**
 * Summaries are derived, never hand-maintained, a field authors have to keep
 * in sync is a field that goes stale. A document may still state its own
 * summary in YAML front matter, because that lives with the prose and is
 * reviewed with it.
 * @docs manifest.md#summaries
 */

const FRONT_MATTER_SUMMARY = /^(?:summary|description)\s*:\s*(.+?)\s*$/i;
const TABLE_ROW = /^\s{0,3}\|/;
const BLOCK_MARKUP = /^\s{0,3}(?:[-*+>]\s|\d+[.)]\s|<|:{3}|\[[^\]]+\]:)/;
const QUOTES = /^["'`]|["'`]$/g;
const MAX_SUMMARY_LENGTH = 200;
/**
 * When truncating, prefer to break at a word boundary, unless the last space
 * sits so early that breaking there would discard most of the summary.
 */
const MIN_WORD_BOUNDARY_CUT = 40;

/** The value of a `summary:` or `description:` key in YAML front matter. */
export function frontMatterSummary(markdown: string): string | undefined {
  const lines = splitLines(markdown);
  const end = skipFrontMatter(lines);
  // The block spans lines 1 to end - 2: line 0 opens it, line end - 1 closes it.
  for (let index = 1; index < end - 1; index += 1) {
    const match = FRONT_MATTER_SUMMARY.exec(lines[index] ?? '');
    if (match !== null) {
      const value = (match[1] ?? '').replace(QUOTES, '').trim();
      return value.length > 0 ? value : undefined;
    }
  }
  return undefined;
}

/** Cuts a paragraph down to its first sentence, without breaking on `e.g.`. */
function firstSentence(paragraph: string): string {
  const match = /^(.*?[.!?])(?:\s|$)/.exec(paragraph);
  const candidate = match === null ? paragraph : (match[1] ?? paragraph);
  if (candidate.length <= MAX_SUMMARY_LENGTH) {
    return candidate;
  }
  const cut = candidate.slice(0, MAX_SUMMARY_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > MIN_WORD_BOUNDARY_CUT ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * The first line of real prose in a block of markdown: no headings, no lists,
 * no tables, no code. That sentence is what a document is about.
 */
export function proseSummary(lines: readonly string[]): string | undefined {
  const visible = maskFencedCode(lines);
  const paragraph: string[] = [];

  // Front matter is metadata, not prose, without this, a document that opens
  // with `---` but states no summary key would read its YAML back as one.
  for (let index = skipFrontMatter(visible); index < visible.length; index += 1) {
    const line = visible[index] ?? '';
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      if (paragraph.length > 0) {
        break;
      }
      continue;
    }
    if (
      ATX_HEADING.test(line) ||
      TABLE_ROW.test(line) ||
      BLOCK_MARKUP.test(line) ||
      (SETEXT_UNDERLINE.test(visible[index + 1] ?? '') && paragraph.length === 0)
    ) {
      if (paragraph.length > 0) {
        break;
      }
      // A setext heading occupies two lines; skip its underline too.
      if (SETEXT_UNDERLINE.test(visible[index + 1] ?? '')) {
        index += 1;
      }
      continue;
    }
    paragraph.push(trimmed);
  }

  if (paragraph.length === 0) {
    return undefined;
  }
  const text = headingText(paragraph.join(' ')).replace(/\s+/g, ' ').trim();
  return text.length > 0 ? firstSentence(text) : undefined;
}

/** Summary of a whole document: its front matter if it states one, else its opening prose. */
export function documentSummary(markdown: string): string | undefined {
  return frontMatterSummary(markdown) ?? proseSummary(splitLines(markdown));
}
