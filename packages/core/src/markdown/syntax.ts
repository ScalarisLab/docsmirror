/**
 * The few markdown line shapes more than one scanner needs to recognise.
 * Sections, summaries and links each walk a document their own way, but they
 * must agree on what a heading, a fence or front matter looks like, one
 * divergent regex and a line is a heading to one scanner and prose to another.
 */

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const FRONT_MATTER_FENCE = /^---\s*$/;

/** An ATX heading; captures the `#` run and the visible text. */
export const ATX_HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;

/** A setext underline; captures it so callers can tell `=` (h1) from `-` (h2). */
export const SETEXT_UNDERLINE = /^\s{0,3}(=+|-{2,})\s*$/;

/** Index of the first line past a YAML front-matter block, or 0 when there is none. */
export function skipFrontMatter(lines: readonly string[]): number {
  if (lines.length === 0 || !FRONT_MATTER_FENCE.test(lines[0] ?? '')) {
    return 0;
  }
  for (let index = 1; index < lines.length; index += 1) {
    if (FRONT_MATTER_FENCE.test(lines[index] ?? '')) {
      return index + 1;
    }
  }
  return 0;
}

/**
 * Blanks every line belonging to a fenced code block, the fences included, so
 * scanners can walk the result without each tracking fence state. Line count
 * is preserved: whatever a scanner finds in the masked copy sits at the same
 * index in the original. An unclosed fence masks everything to the end.
 */
export function maskFencedCode(lines: readonly string[]): string[] {
  let fenceChar: string | undefined;
  return lines.map((line) => {
    const opener = FENCE.exec(line)?.[1];
    if (fenceChar !== undefined) {
      if (opener !== undefined && opener.startsWith(fenceChar)) {
        fenceChar = undefined;
      }
      return '';
    }
    if (opener !== undefined) {
      fenceChar = opener.slice(0, 1);
      return '';
    }
    return line;
  });
}
