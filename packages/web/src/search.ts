import type { DocSection } from '@docsmirror/core';
import type { CorpusDocument, DocsProject } from './project';

/** What the query matched, which is what a reader needs to judge a hit. */
export type SearchMatch = 'document' | 'heading' | 'prose';

export interface SearchResult {
  readonly path: string;
  readonly anchor: string | undefined;
  /** The heading a hit lands on, or the document's title when it has none. */
  readonly title: string;
  /** Title of the document the hit is in, so a section result names its home. */
  readonly document: string;
  readonly excerpt: string;
  readonly match: SearchMatch;
}

interface ScoredResult extends SearchResult {
  readonly score: number;
}

const MAX_RESULTS = 60;
const EXCERPT_RADIUS = 70;

/** Query terms, lowercased. An empty query has no terms and matches nothing. */
function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

function containsAll(haystack: string, terms: readonly string[]): boolean {
  const lowered = haystack.toLowerCase();
  return terms.every((term) => lowered.includes(term));
}

/** Index of the earliest term occurrence, or -1 when none of them appear. */
function firstHit(haystack: string, terms: readonly string[]): number {
  const lowered = haystack.toLowerCase();
  let best = -1;
  for (const term of terms) {
    const index = lowered.indexOf(term);
    if (index >= 0 && (best < 0 || index < best)) {
      best = index;
    }
  }
  return best;
}

/** Markdown that only marks up the start of a line, and reads as noise in an excerpt. */
const LINE_MARKUP = /^\s*(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/;

/** A single line of readable context around a match, ellipsised at both ends. */
function excerptAround(text: string, index: number): string {
  const stripped = text.replace(LINE_MARKUP, '');
  const flattened = stripped.replace(/\s+/g, ' ').trim();
  if (flattened.length <= EXCERPT_RADIUS * 2) {
    return flattened;
  }
  // The match index is a position in the raw text, but the excerpt is cut from
  // the flattened one, so the offset is re-measured by flattening the prefix
  // the same way, otherwise every collapsed run of whitespace before the
  // match would shift the window off it.
  const raw = Math.max(0, index - (text.length - stripped.length));
  const at = stripped.slice(0, raw).replace(/\s+/g, ' ').trimStart().length;
  const start = Math.max(0, at - EXCERPT_RADIUS);
  const end = Math.min(flattened.length, at + EXCERPT_RADIUS);
  const head = start > 0 ? '…' : '';
  const tail = end < flattened.length ? '…' : '';
  return `${head}${flattened.slice(start, end).trim()}${tail}`;
}

/**
 * The innermost section a line belongs to. Sections nest, a document's level-1
 * heading spans the whole file, so the last match, not the first, is the one
 * that actually names where the reader lands.
 */
function sectionAtLine(sections: readonly DocSection[], line: number): DocSection | undefined {
  let found: DocSection | undefined;
  for (const section of sections) {
    if (line >= section.headingLine && line < section.endLine) {
      found = section;
    }
  }
  return found;
}

/** How many of the terms a line carries, used to pick the excerpt for a spread match. */
function termsPresent(haystack: string, terms: readonly string[]): number {
  const lowered = haystack.toLowerCase();
  return terms.filter((term) => lowered.includes(term)).length;
}

/**
 * Sections where the terms all appear, but spread over several lines.
 *
 * Requiring every term on one line is right for excerpting and wrong for
 * searching: "staleness thresholds" would find nothing in a section titled
 * "How staleness is computed" that explains its thresholds a paragraph later.
 * These rank below a single-line match, and their excerpt is the line carrying
 * the most terms, so the reader still sees why the result is on the list.
 */
function sectionMatches(
  path: string,
  documentTitle: string,
  lines: readonly string[],
  sections: readonly DocSection[],
  terms: readonly string[],
): ScoredResult[] {
  if (terms.length < 2) {
    return [];
  }
  const results: ScoredResult[] = [];
  for (const section of sections) {
    const body = lines.slice(section.headingLine, section.endLine);
    if (!containsAll(`${section.title} ${body.join(' ')}`, terms)) {
      continue;
    }

    let bestLine = '';
    let bestCount = 0;
    for (const line of body) {
      if (line.trim().length === 0 || line.trim().startsWith('#')) {
        continue;
      }
      const count = termsPresent(line, terms);
      if (count > bestCount) {
        bestCount = count;
        bestLine = line;
      }
    }
    if (bestCount === 0) {
      continue;
    }

    results.push({
      path,
      anchor: section.slug,
      title: section.title,
      document: documentTitle,
      excerpt: excerptAround(bestLine, Math.max(0, firstHit(bestLine, terms))),
      match: 'prose',
      score: 20,
    });
  }
  return results;
}

/**
 * The query logic itself, with no dependency on the project or the
 * filesystem: given the corpus and a query, it is pure. `SearchIndex` calls
 * it against documents read from disk; a static export bundles this function
 * for the browser and calls it against a corpus baked in at export time, the
 * same algorithm either way.
 * @docs web.md#static-export
 */
export function searchIndexed(documents: readonly CorpusDocument[], query: string): SearchResult[] {
  const terms = queryTerms(query);
  if (terms.length === 0) {
    return [];
  }

  const best = new Map<string, ScoredResult>();

  const offer = (result: ScoredResult): void => {
    const key = `${result.path}#${result.anchor ?? ''}`;
    const existing = best.get(key);
    if (existing === undefined || result.score > existing.score) {
      best.set(key, result);
    }
  };

  for (const { node, content, lines, sections } of documents) {
    if (containsAll(`${node.title} ${node.path}`, terms)) {
      offer({
        path: node.path,
        anchor: undefined,
        title: node.title,
        document: node.title,
        // Only the opening of the document can end up in the excerpt, so only
        // the opening is flattened, never the whole body.
        excerpt: node.summary ?? excerptAround(content.slice(0, EXCERPT_RADIUS * 4), 0),
        match: 'document',
        score: node.title.toLowerCase().startsWith(terms[0] ?? '') ? 120 : 100,
      });
    }

    for (const anchor of node.anchors) {
      if (containsAll(anchor.title, terms)) {
        offer({
          path: node.path,
          anchor: anchor.slug,
          title: anchor.title,
          document: node.title,
          excerpt: anchor.summary ?? node.title,
          match: 'heading',
          score: 70,
        });
      }
    }

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      if (line.trim().length === 0 || !containsAll(line, terms)) {
        continue;
      }
      const section = sectionAtLine(sections, index);
      const hit = firstHit(line, terms);
      offer({
        path: node.path,
        anchor: section?.slug,
        title: section?.title ?? node.title,
        document: node.title,
        excerpt: excerptAround(line, hit < 0 ? 0 : hit),
        match: 'prose',
        score: 30,
      });
    }

    for (const result of sectionMatches(node.path, node.title, lines, sections, terms)) {
      offer(result);
    }
  }

  return [...best.values()]
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, MAX_RESULTS)
    .map(({ score: _score, ...result }) => result);
}

/**
 * Ranks documents and sections against a query. Titles outrank headings,
 * headings outrank prose, and every result carries the text that matched so
 * the reader can tell why it is on the list.
 *
 * The corpus comes through the project's shared per-document cache, reading
 * and sectioning every file is the expensive part of a search, a reader
 * narrows a query one keystroke at a time, and `CorpusTerms` wants the same
 * files at the same moments.
 * @docs web.md#search
 */
export class SearchIndex {
  constructor(private readonly project: DocsProject) {}

  async search(query: string): Promise<SearchResult[]> {
    // Empty query never has to read the corpus, no cost paid until the
    // reader actually types something.
    if (queryTerms(query).length === 0) {
      return [];
    }
    return searchIndexed(await this.project.documentsNow(), query);
  }
}
