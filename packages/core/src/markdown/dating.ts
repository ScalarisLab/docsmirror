/**
 * Dated content inside documentation prose.
 *
 * A section can say more than one thing was true at different times without
 * turning into git archaeology. `<!-- @as-of 2026-01-15 -->`, alone on its own
 * line, the same rule a `@docs` pointer follows, marks everything below it,
 * up to the next marker or the end of the section, as written as of that date.
 *
 * The marker is an HTML comment on purpose: a document with no DocsMirror
 * rendering it degrades to exactly what it was before, since a comment never
 * renders. Every surface that shows prose reads it through this module, same
 * as every surface reads a pointer through the parser, so the marker means the
 * same thing in a hover, an inline section and the web reader.
 * @docs convention.md#dated-content
 */

import { splitLines } from '../pointer/parse';

const MARKER = /^\s*<!--\s*@as-of\s+(\d{4}-\d{2}-\d{2})\s*-->\s*$/;

/**
 * Whether a `\d{4}-\d{2}-\d{2}` capture names a real calendar day. The marker
 * already guarantees the shape, so only the round trip through `Date`, which
 * silently rolls February 30th into March, can reject it. The `NaN` defaults
 * exist for the unchecked-index rule and never compare equal.
 */
function isValidCalendarDate(value: string): boolean {
  const [year = NaN, month = NaN, day = NaN] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export interface DatedBlock {
  /** `undefined` for the prose written before the first marker, if any. */
  readonly date: string | undefined;
  readonly markdown: string;
}

/**
 * Splits markdown on `@as-of` markers, each one starting a new block that
 * runs to the next marker or the end of the text. A date that fails to parse
 * as a real calendar day is left as ordinary text rather than silently
 * swallowing the content that follows it.
 */
export function splitDatedBlocks(markdown: string): DatedBlock[] {
  const lines = splitLines(markdown);
  const blocks: DatedBlock[] = [];
  let date: string | undefined;
  let start = 0;

  // An empty block never carries anything worth showing, whether it is the
  // preamble before a marker that opens the document or the gap between two
  // markers written back to back, so it is dropped rather than kept.
  const flush = (end: number): void => {
    const body = lines.slice(start, end).join('\n').trim();
    if (body.length > 0) {
      blocks.push({ date, markdown: body });
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const candidate = MARKER.exec(lines[index] ?? '')?.[1];
    if (candidate === undefined || !isValidCalendarDate(candidate)) {
      continue;
    }
    flush(index);
    date = candidate;
    start = index + 1;
  }
  flush(lines.length);

  // A document with no meaningful content still reports as one undated block,
  // so a caller never has to special-case "no blocks" separately from "one
  // block nobody dated".
  return blocks.length > 0 ? blocks : [{ date: undefined, markdown: markdown.trim() }];
}

/** Whether a document uses the `@as-of` convention at all. */
export function hasDatedContent(markdown: string): boolean {
  return splitLines(markdown).some((line) => {
    const candidate = MARKER.exec(line)?.[1];
    return candidate !== undefined && isValidCalendarDate(candidate);
  });
}

/**
 * Renders dated blocks back into a single markdown string, each dated block
 * introduced by a visible label in place of the marker it replaces, plain
 * markdown, so it needs nothing special from whatever renders it next. A
 * document with no markers passes through unchanged.
 */
export function renderDatedSections(markdown: string): string {
  const blocks = splitDatedBlocks(markdown).filter((block) => block.markdown.length > 0);
  if (blocks.length === 0 || (blocks.length === 1 && blocks[0]?.date === undefined)) {
    return markdown;
  }
  return blocks
    .map((block, index) => {
      const rule = index === 0 ? '' : '---\n\n';
      const label = block.date === undefined ? '' : `**As of ${block.date}**\n\n`;
      return `${rule}${label}${block.markdown}`;
    })
    .join('\n\n');
}
