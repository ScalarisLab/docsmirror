import { splitLines } from '../pointer/parse';
import { headingText, SlugRegistry } from './slug';
import { ATX_HEADING, maskFencedCode, SETEXT_UNDERLINE, skipFrontMatter } from './syntax';

/** A heading and everything under it, subsections included. */
export interface DocSection {
  /** GitHub-style slug, unique within the document. */
  readonly slug: string;
  /** Visible heading text, inline markdown stripped. */
  readonly title: string;
  /** Heading level, 1 for `#`. */
  readonly level: number;
  /** 0-based line of the heading itself. */
  readonly headingLine: number;
  /** 0-based line the body starts at, just past the heading. */
  readonly bodyLine: number;
  /** 0-based line just past the last line of the section. */
  readonly endLine: number;
}

interface RawHeading {
  readonly level: number;
  readonly raw: string;
  readonly headingLine: number;
  readonly bodyLine: number;
}

function collectHeadings(lines: readonly string[]): RawHeading[] {
  const headings: RawHeading[] = [];
  const visible = maskFencedCode(lines);

  for (let index = skipFrontMatter(visible); index < visible.length; index += 1) {
    const line = visible[index] ?? '';

    const atx = ATX_HEADING.exec(line);
    if (atx !== null) {
      headings.push({
        level: (atx[1] ?? '#').length,
        raw: atx[2] ?? '',
        headingLine: index,
        bodyLine: index + 1,
      });
      continue;
    }

    const underline = SETEXT_UNDERLINE.exec(visible[index + 1] ?? '');
    if (underline !== null && line.trim().length > 0) {
      headings.push({
        level: (underline[1] ?? '=').startsWith('=') ? 1 : 2,
        raw: line.trim(),
        headingLine: index,
        bodyLine: index + 2,
      });
      index += 1;
    }
  }

  return headings;
}

/** Parses every section of a markdown document, in document order. */
export function parseSections(markdown: string): DocSection[] {
  const lines = splitLines(markdown);
  const headings = collectHeadings(lines);
  const registry = new SlugRegistry();

  return headings.map((heading, position) => {
    let endLine = lines.length;
    for (let next = position + 1; next < headings.length; next += 1) {
      const candidate = headings[next];
      if (candidate !== undefined && candidate.level <= heading.level) {
        endLine = candidate.headingLine;
        break;
      }
    }
    return {
      slug: registry.next(heading.raw),
      title: headingText(heading.raw),
      level: heading.level,
      headingLine: heading.headingLine,
      bodyLine: heading.bodyLine,
      endLine,
    };
  });
}

/** Finds the section an anchor points at. Anchor matching is case-insensitive. */
export function findSection(sections: readonly DocSection[], anchor: string): DocSection | undefined {
  const wanted = anchor.toLowerCase();
  return sections.find((section) => section.slug === wanted);
}

/** Returns the markdown of a section, heading included. */
export function sectionMarkdown(markdown: string, section: DocSection): string {
  return splitLines(markdown)
    .slice(section.headingLine, section.endLine)
    .join('\n')
    .replace(/\s+$/, '');
}

/**
 * The document's title: its first level-1 heading, else its first heading.
 * Callers fall back to the file name when a document has no heading at all.
 */
export function documentTitle(sections: readonly DocSection[]): string | undefined {
  return (sections.find((section) => section.level === 1) ?? sections[0])?.title;
}
