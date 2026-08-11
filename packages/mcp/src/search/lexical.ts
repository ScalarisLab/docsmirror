/**
 * Lexical ranking over the documentation surface.
 *
 * This is word matching, not meaning: a query term is scored where it is
 * found, headings above prose and whole words above fragments. Nothing here
 * infers a synonym, and callers are told as much, because a search that
 * silently fails to be semantic is worse than one that never claimed to be.
 */

/** Runs of letters and digits, in any script, the unit a query is split into. */
const TERM_PATTERN = /[\p{L}\p{N}]+/gu;

/** What a hit in a given field is worth, whole word then fragment. */
const WEIGHTS = {
  heading: { whole: 12, partial: 6 },
  context: { whole: 4, partial: 2 },
  path: { whole: 6, partial: 3 },
  summary: { whole: 4, partial: 2 },
  body: { whole: 1, partial: 0.4 },
} as const;

/** Body repetition stops paying after this many occurrences of one term. */
const BODY_OCCURRENCE_CAP = 4;

const EXCERPT_LENGTH = 200;

/** One searchable unit: a whole document, or one section of one. */
export interface SearchTarget {
  readonly path: string;
  /** Title of the document the unit belongs to. */
  readonly documentTitle: string;
  /** Anchor slug, or `undefined` when the unit is the document's opening. */
  readonly anchor: string | undefined;
  /** The unit's own heading: the anchor's title, or the document's. */
  readonly heading: string;
  readonly summary: string | undefined;
  /** The unit's own markdown, subsections excluded so no text is scored twice. */
  readonly body: string;
  readonly staleness: string;
  /** How many code sites point at this unit. */
  readonly references: number;
}

export interface SearchHit {
  readonly target: SearchTarget;
  readonly score: number;
  /** How many of the query's terms this unit matched at all. */
  readonly matchedTerms: number;
  readonly excerpt: string;
}

interface Occurrences {
  readonly whole: number;
  readonly partial: number;
  /** Index of the first occurrence, used to place an excerpt. */
  readonly first: number;
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{N}]/u.test(character);
}

/** Splits a query into the terms that are matched independently. */
export function queryTerms(query: string): string[] {
  return query.toLowerCase().match(TERM_PATTERN) ?? [];
}

function countOccurrences(haystack: string, term: string): Occurrences {
  let whole = 0;
  let partial = 0;
  let first = -1;
  let index = haystack.indexOf(term);
  while (index !== -1) {
    if (first === -1) {
      first = index;
    }
    const before = haystack[index - 1];
    const after = haystack[index + term.length];
    if (isWordCharacter(before) || isWordCharacter(after)) {
      partial += 1;
    } else {
      whole += 1;
    }
    index = haystack.indexOf(term, index + term.length);
  }
  return { whole, partial, first };
}

function fieldScore(occurrences: Occurrences, weight: { whole: number; partial: number }, cap: number): number {
  return Math.min(occurrences.whole, cap) * weight.whole + Math.min(occurrences.partial, cap) * weight.partial;
}

/** Collapses markdown whitespace so an excerpt reads as one line. */
function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function excerptAround(body: string, index: number, summary: string | undefined): string {
  if (index < 0) {
    const fallback = summary ?? body;
    const flat = flatten(fallback);
    return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH)}…` : flat;
  }
  const start = Math.max(0, index - EXCERPT_LENGTH / 4);
  const end = Math.min(body.length, index + (EXCERPT_LENGTH * 3) / 4);
  const flat = flatten(body.slice(start, end));
  return `${start > 0 ? '…' : ''}${flat}${end < body.length ? '…' : ''}`;
}

/** Ranks targets against a query, best first. Targets matching no term are dropped. */
export function rankTargets(
  targets: readonly SearchTarget[],
  query: string,
  limit: number,
): SearchHit[] {
  const terms = queryTerms(query);
  if (terms.length === 0) {
    return [];
  }

  const hits: SearchHit[] = [];
  for (const target of targets) {
    const heading = target.heading.toLowerCase();
    const context = target.documentTitle.toLowerCase();
    const path = target.path.toLowerCase();
    const summary = (target.summary ?? '').toLowerCase();
    const body = target.body.toLowerCase();

    let score = 0;
    let matchedTerms = 0;
    let excerptIndex = -1;

    for (const term of terms) {
      const inBody = countOccurrences(body, term);
      const termScore =
        fieldScore(countOccurrences(heading, term), WEIGHTS.heading, 1) +
        fieldScore(countOccurrences(context, term), WEIGHTS.context, 1) +
        fieldScore(countOccurrences(path, term), WEIGHTS.path, 1) +
        fieldScore(countOccurrences(summary, term), WEIGHTS.summary, 1) +
        fieldScore(inBody, WEIGHTS.body, BODY_OCCURRENCE_CAP);
      if (termScore > 0) {
        matchedTerms += 1;
        score += termScore;
      }
      if (excerptIndex === -1 && inBody.first !== -1) {
        excerptIndex = inBody.first;
      }
    }

    if (matchedTerms > 0) {
      hits.push({
        target,
        score: Math.round(score * 100) / 100,
        matchedTerms,
        excerpt: excerptAround(target.body, excerptIndex, target.summary),
      });
    }
  }

  hits.sort((a, b) => {
    if (a.matchedTerms !== b.matchedTerms) {
      return b.matchedTerms - a.matchedTerms;
    }
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    return a.target.path.localeCompare(b.target.path);
  });

  return hits.slice(0, limit);
}
