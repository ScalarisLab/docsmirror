/**
 * Language-agnostic comment scanning.
 *
 * DocsMirror deliberately does not parse an AST: a pointer must be readable in
 * any file of any language, including ones no parser here knows about. The
 * scanner is line-oriented and tracks block-comment state; it does not model
 * string literals, so a comment marker inside a string opens a comment as far
 * as this scanner is concerned. The worst case is an unclosed block opener in
 * a string, `const s = "a /* b";`, which leaves the scanner inside a comment
 * for the rest of the file, so every later line reads as comment text and a
 * `@docs`-shaped string below it would be reported as a pointer. Excluding
 * such a file, or closing the sequence inside the string, is the way out.
 * @docs convention.md#comment-scanning
 */

interface BlockDelimiter {
  readonly open: string;
  readonly close: string;
}

/** Block comment delimiters, longest opener first so `<!--` wins over `<`. */
const BLOCK_DELIMITERS: readonly BlockDelimiter[] = [
  { open: '<!--', close: '-->' },
  { open: '=begin', close: '=end' },
  { open: '"""', close: '"""' },
  { open: "'''", close: "'''" },
  { open: '/*', close: '*/' },
  { open: '(*', close: '*)' },
  { open: '{-', close: '-}' },
];

/** Single-line comment markers, longest first. */
const LINE_MARKERS: readonly string[] = ['//', '--', '#', ';', '%'];

/** Trailing sequences that terminate a comment and must not be read as pointer text. */
export const COMMENT_CLOSERS: readonly string[] = BLOCK_DELIMITERS.map((d) => d.close);

/** A line that belongs to a comment, and the column its comment text starts at. */
export interface CommentLine {
  readonly line: number;
  /** 0-based column of the first character that is comment text. */
  readonly textStart: number;
}

/** A contiguous run of comment lines. */
export interface CommentBlock {
  readonly startLine: number;
  readonly endLine: number;
  readonly lines: readonly CommentLine[];
}

interface Opener {
  readonly index: number;
  readonly delimiter: BlockDelimiter | undefined;
  readonly markerLength: number;
}

/** Finds the earliest comment opener on a line, or `undefined` if there is none. */
function findOpener(line: string, from: number): Opener | undefined {
  let best: Opener | undefined;
  for (const delimiter of BLOCK_DELIMITERS) {
    const index = line.indexOf(delimiter.open, from);
    if (index !== -1 && (best === undefined || index < best.index)) {
      best = { index, delimiter, markerLength: delimiter.open.length };
    }
  }
  for (const marker of LINE_MARKERS) {
    const index = line.indexOf(marker, from);
    if (index !== -1 && (best === undefined || index < best.index)) {
      best = { index, delimiter: undefined, markerLength: marker.length };
    }
  }
  return best;
}

/**
 * Groups the lines of `text` into comment blocks. Consecutive comment lines
 * form one block, which is what callers fold, decorate or attribute a pointer to.
 */
export function scanComments(lines: readonly string[]): CommentBlock[] {
  const blocks: CommentBlock[] = [];
  let current: CommentLine[] = [];
  let openBlock: BlockDelimiter | undefined;

  const flush = (): void => {
    const first = current[0];
    const last = current[current.length - 1];
    if (first !== undefined && last !== undefined) {
      blocks.push({ startLine: first.line, endLine: last.line, lines: current });
    }
    current = [];
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';
    let cursor = 0;
    let textStart: number | undefined;

    while (cursor <= line.length) {
      if (openBlock !== undefined) {
        if (textStart === undefined) {
          textStart = cursor;
        }
        const closeIndex = line.indexOf(openBlock.close, cursor);
        if (closeIndex === -1) {
          cursor = line.length + 1;
          break;
        }
        cursor = closeIndex + openBlock.close.length;
        openBlock = undefined;
        continue;
      }

      const opener = findOpener(line, cursor);
      if (opener === undefined) {
        break;
      }
      const contentStart = opener.index + opener.markerLength;
      if (textStart === undefined) {
        textStart = contentStart;
      }
      if (opener.delimiter === undefined) {
        cursor = line.length + 1;
        break;
      }
      openBlock = opener.delimiter;
      cursor = contentStart;
    }

    if (textStart === undefined) {
      flush();
    } else {
      current.push({ line: lineIndex, textStart });
    }
  }

  flush();
  return blocks;
}
