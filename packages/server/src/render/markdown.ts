/**
 * Markdown reshaping for the hover box.
 *
 * A section is written to be read on a documentation page, not inside a
 * tooltip: its own heading is a title bar, its links are relative to the
 * document, and an `#` heading renders as a banner in most clients. These
 * helpers adapt the text without changing what it says.
 * @docs server.md#hover
 */

import * as nodePath from 'node:path';
import { splitLines } from '@docsmirror/core';
import { pathToUri } from '../workspace/paths';

const FENCE = /^\s{0,3}(```+|~~~+)/;
const ATX_HEADING = /^(\s{0,3})(#{1,6})(\s+)(.*)$/;
const SETEXT_UNDERLINE = /^\s{0,3}(=+|-{2,})\s*$/;
const FRONT_MATTER_FENCE = /^---\s*$/;
const LINK_TARGET = /(!?\[[^\]]*\]\()([^)\s]+)/g;
const ABSOLUTE_TARGET = /^(?:[a-zA-Z][a-zA-Z\d+.-]*:|\/\/|\/|#)/;
const MAX_HEADING_LEVEL = 6;

interface HeadingLine {
  readonly index: number;
  readonly level: number;
  readonly text: string;
  /** Index of the underline to drop, for a setext heading. */
  readonly underline: number | undefined;
}

interface FenceStep {
  /** The fence still open after this line, if any. */
  readonly fence: string | undefined;
  /** True when the line is a fence delimiter or code, and must be left alone. */
  readonly literal: boolean;
}

/** Advances the fenced-code-block state by one line. */
function stepFence(line: string, open: string | undefined): FenceStep {
  const match = FENCE.exec(line);
  if (open !== undefined) {
    const closes = match !== null && (match[1] ?? '').startsWith(open[0] ?? '');
    return { fence: closes ? undefined : open, literal: true };
  }
  if (match !== null) {
    return { fence: match[1], literal: true };
  }
  return { fence: undefined, literal: false };
}

function collectHeadings(lines: readonly string[]): HeadingLine[] {
  const headings: HeadingLine[] = [];
  let fence: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const step = stepFence(line, fence);
    fence = step.fence;
    if (step.literal) {
      continue;
    }

    const atx = ATX_HEADING.exec(line);
    if (atx !== null) {
      headings.push({
        index,
        level: (atx[2] ?? '#').length,
        text: (atx[4] ?? '').replace(/\s*#*\s*$/, ''),
        underline: undefined,
      });
      continue;
    }

    const next = lines[index + 1] ?? '';
    if (line.trim().length > 0 && SETEXT_UNDERLINE.test(next)) {
      headings.push({
        index,
        level: next.trim().startsWith('=') ? 1 : 2,
        text: line.trim(),
        underline: index + 1,
      });
      index += 1;
    }
  }

  return headings;
}

/** Drops a YAML front-matter block: metadata is noise in a hover. */
export function stripFrontMatter(markdown: string): string {
  const lines = splitLines(markdown);
  if (!FRONT_MATTER_FENCE.test(lines[0] ?? '')) {
    return markdown;
  }
  for (let index = 1; index < lines.length; index += 1) {
    if (FRONT_MATTER_FENCE.test(lines[index] ?? '')) {
      return lines.slice(index + 1).join('\n');
    }
  }
  return markdown;
}

/**
 * Removes the leading heading when it only repeats `title`, which the hover
 * header already shows.
 */
export function stripLeadingHeading(markdown: string, title: string): string {
  const lines = splitLines(markdown);
  const first = collectHeadings(lines)[0];
  if (first === undefined || first.text.trim() !== title.trim()) {
    return markdown;
  }
  if (lines.slice(0, first.index).some((line) => line.trim().length > 0)) {
    return markdown;
  }
  return lines.slice((first.underline ?? first.index) + 1).join('\n').replace(/^\s*\n/, '');
}

/**
 * Rewrites every heading so the shallowest one sits at `baseLevel`, keeping the
 * relative depth of the rest. A hover box is not a page: `#` in it reads as a
 * banner covering the text it was supposed to introduce.
 */
export function demoteHeadings(markdown: string, baseLevel: number): string {
  const lines = splitLines(markdown);
  const headings = collectHeadings(lines);
  if (headings.length === 0) {
    return markdown;
  }

  const shallowest = headings.reduce((min, heading) => Math.min(min, heading.level), MAX_HEADING_LEVEL);
  const shift = Math.max(0, baseLevel - shallowest);
  const dropped = new Set<number>();
  const rewritten = [...lines];

  for (const heading of headings) {
    const level = Math.min(MAX_HEADING_LEVEL, heading.level + shift);
    rewritten[heading.index] = `${'#'.repeat(level)} ${heading.text}`;
    if (heading.underline !== undefined) {
      dropped.add(heading.underline);
    }
  }

  return rewritten.filter((_line, index) => !dropped.has(index)).join('\n');
}

/**
 * Turns document-relative link and image targets into absolute `file:` URIs.
 * A relative target means nothing once the text has left its document; an
 * absolute one at least points somewhere, wherever the client renders it.
 */
export function absolutizeTargets(markdown: string, documentPath: string): string {
  const directory = nodePath.dirname(documentPath);
  const lines = splitLines(markdown);
  let fence: string | undefined;

  return lines
    .map((line) => {
      const step = stepFence(line, fence);
      fence = step.fence;
      if (step.literal) {
        return line;
      }
      return line.replace(LINK_TARGET, (match, prefix: string, target: string) => {
        if (ABSOLUTE_TARGET.test(target)) {
          return match;
        }
        const hash = target.indexOf('#');
        const filePart = hash === -1 ? target : target.slice(0, hash);
        const fragment = hash === -1 ? '' : target.slice(hash);
        if (filePart.length === 0) {
          return match;
        }
        return `${prefix}${pathToUri(nodePath.resolve(directory, decodePath(filePart)))}${fragment}`;
      });
    })
    .join('\n');
}

/** Percent-decodes a link target, tolerating targets that are not encoded. */
function decodePath(target: string): string {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}
