import { splitLines } from '@docsmirror/core';
import { lazy } from './lazy';
import type { DocsProject } from './project';

/**
 * Which term a document leans on unusually hard, measured against the rest of
 * the corpus.
 *
 * The term is never named in this file, and no vocabulary is configured
 * anywhere: it falls out of a rate comparison. A word that appears everywhere
 * carries no information about *this* page and is excluded by its own document
 * frequency; a word that appears only here has nowhere to send the reader and
 * is excluded too. What survives is a term this page uses far more densely
 * than the corpus does, and which at least two other pages also use, which is
 * exactly the condition under which "where else is this dense" is a useful
 * question.
 * @docs web.md#contextual-widgets
 */

/** A term must be this long to count. Shorter runs are almost never the subject. */
const MIN_TERM_LENGTH = 4;

/** Occurrences needed here before a term can be said to be leaned on. */
const MIN_OCCURRENCES = 4;

/**
 * A term has to appear in at least this many documents, so there are at least
 * two other places to send the reader, and in no more than this fraction of
 * them, so a corpus-wide word can never win.
 */
const MIN_DOCUMENT_FREQUENCY = 3;
const MAX_DOCUMENT_FRACTION = 0.5;

/** How much denser than the corpus average the term has to be here. */
const MIN_LIFT = 2.5;

/** Occurrences another document needs before it is worth linking to. */
const MIN_ELSEWHERE_OCCURRENCES = 2;

/**
 * Destinations the widget must be able to offer. The widget's whole claim is
 * "here is where else this is dense"; a term with nowhere to send the reader
 * has nothing to say, however distinctive it is, so this is a selection
 * condition rather than a rendering one.
 */
const MIN_ELSEWHERE = 2;

const MAX_ELSEWHERE = 5;

/** Occurrences a section needs before the widget is pinned to it. */
const MIN_SECTION_OCCURRENCES = 2;

const FENCED_CODE = /^ {0,3}(`{3,}|~{3,})[^\n]*$/;
const FRONT_MATTER_FENCE = /^---\s*$/;

/**
 * Word-shaped runs. Hyphens and underscores stay inside a token on purpose:
 * `half-open` and `PROCESS_DEATH_WINDOW_MS` are single subjects in technical
 * prose, and splitting them would turn the most distinctive terms a repository
 * has into the least.
 */
const TERM = /\p{L}[\p{L}\p{Nd}_-]*[\p{L}\p{Nd}]/gu;

/**
 * Blanks fenced code blocks and front matter, a fence is prose the author did
 * not write, and a long one would decide the result on its own. Blanked, not
 * dropped: every line keeps its original index, so section ranges measured on
 * the raw document still land on the right lines here.
 */
function proseLines(markdown: string): string[] {
  const lines = [...splitLines(markdown)];
  if (FRONT_MATTER_FENCE.test(lines[0] ?? '')) {
    const close = lines.findIndex((line, index) => index > 0 && FRONT_MATTER_FENCE.test(line));
    for (let index = 0; index <= close; index += 1) {
      lines[index] = '';
    }
  }
  let fence: string | undefined;
  return lines.map((line) => {
    const match = FENCED_CODE.exec(line);
    if (fence !== undefined) {
      if (match !== null && match[1]?.startsWith(fence[0] ?? '') === true && match[1].length >= fence.length) {
        fence = undefined;
      }
      return '';
    }
    if (match !== null) {
      fence = match[1];
      return '';
    }
    return line;
  });
}

function proseOf(markdown: string): string {
  return proseLines(markdown).join('\n');
}

function countTerms(text: string): { counts: Map<string, number>; total: number } {
  const counts = new Map<string, number>();
  let total = 0;
  for (const [term] of text.toLowerCase().matchAll(TERM)) {
    if (term.length < MIN_TERM_LENGTH) {
      continue;
    }
    total += 1;
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return { counts, total };
}

interface DocumentTerms {
  readonly path: string;
  readonly counts: Map<string, number>;
  readonly total: number;
}

interface CorpusIndex {
  readonly documents: readonly DocumentTerms[];
  readonly byPath: Map<string, DocumentTerms>;
  /** How many documents carry each term. */
  readonly documentFrequency: Map<string, number>;
  /** Total occurrences of each term across the corpus. */
  readonly corpusCount: Map<string, number>;
  readonly corpusTotal: number;
}

/** One other document where the same term is dense. */
export interface EmphasisElsewhere {
  readonly path: string;
  readonly title: string;
  readonly count: number;
  /** Occurrences per thousand words, so documents of different lengths compare. */
  readonly rate: number;
}

export interface Emphasis {
  readonly term: string;
  readonly count: number;
  readonly rate: number;
  readonly corpusRate: number;
  /** How many times denser this document is than the corpus average. */
  readonly lift: number;
  /** The section carrying the most occurrences, when one clearly does. */
  readonly anchor: string | undefined;
  readonly elsewhere: readonly EmphasisElsewhere[];
}

const PER = 1000;

function rateOf(count: number, total: number): number {
  return total === 0 ? 0 : (count / total) * PER;
}

async function buildIndex(project: DocsProject): Promise<CorpusIndex> {
  const documents: DocumentTerms[] = [];
  const byPath = new Map<string, DocumentTerms>();
  const documentFrequency = new Map<string, number>();
  const corpusCount = new Map<string, number>();
  let corpusTotal = 0;

  for (const { node, content } of await project.documentsNow()) {
    const { counts, total } = countTerms(proseOf(content));
    const entry: DocumentTerms = { path: node.path, counts, total };
    documents.push(entry);
    byPath.set(node.path, entry);
    corpusTotal += total;
    for (const [term, count] of counts) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
      corpusCount.set(term, (corpusCount.get(term) ?? 0) + count);
    }
  }

  return { documents, byPath, documentFrequency, corpusCount, corpusTotal };
}

/** Terms this document leans on, hardest first. */
function rankTerms(index: CorpusIndex, here: DocumentTerms): string[] {
  const maxDocuments = Math.max(MIN_DOCUMENT_FREQUENCY, index.documents.length * MAX_DOCUMENT_FRACTION);
  const scored: { term: string; score: number }[] = [];

  for (const [term, count] of here.counts) {
    if (count < MIN_OCCURRENCES) {
      continue;
    }
    const frequency = index.documentFrequency.get(term) ?? 0;
    if (frequency < MIN_DOCUMENT_FREQUENCY || frequency > maxDocuments) {
      continue;
    }
    const corpusRate = rateOf(index.corpusCount.get(term) ?? 0, index.corpusTotal);
    const lift = corpusRate === 0 ? 0 : rateOf(count, here.total) / corpusRate;
    if (lift < MIN_LIFT) {
      continue;
    }
    scored.push({ term, score: count * Math.log2(lift) });
  }

  return scored.sort((left, right) => right.score - left.score).map((entry) => entry.term);
}

/** Other documents where the same term is dense, densest first. */
function elsewhereFor(
  index: CorpusIndex,
  titleOf: Map<string, string>,
  path: string,
  term: string,
): EmphasisElsewhere[] {
  return index.documents
    .filter((entry) => entry.path !== path && (entry.counts.get(term) ?? 0) >= MIN_ELSEWHERE_OCCURRENCES)
    .map((entry) => ({
      path: entry.path,
      title: titleOf.get(entry.path) ?? entry.path,
      count: entry.counts.get(term) ?? 0,
      rate: rateOf(entry.counts.get(term) ?? 0, entry.total),
    }))
    .sort((left, right) => right.rate - left.rate)
    .slice(0, MAX_ELSEWHERE);
}

/**
 * The section carrying the most occurrences of the term, when one clearly
 * does. A document's level-1 heading spans the whole file, so it would always
 * win and would pin the widget to nothing in particular.
 */
async function densestSection(project: DocsProject, path: string, term: string): Promise<string | undefined> {
  const document = (await project.documentsNow()).find((entry) => entry.node.path === path);
  if (document === undefined) {
    return undefined;
  }
  const lines = proseLines(document.content);
  let best: string | undefined;
  let bestCount = MIN_SECTION_OCCURRENCES - 1;

  for (const section of document.sections.filter((entry) => entry.level >= 2)) {
    const body = lines.slice(section.headingLine, section.endLine).join('\n').toLowerCase();
    let count = 0;
    for (const [found] of body.matchAll(TERM)) {
      if (found === term) {
        count += 1;
      }
    }
    if (count > bestCount) {
      bestCount = count;
      best = section.slug;
    }
  }
  return best;
}

/**
 * Reads the corpus once and answers "what does this document lean on" from it.
 * The term index is as expensive as one pass over every document, so it is
 * built lazily and thrown away whenever a write invalidates the manifest; the
 * documents themselves come through the project's shared cache.
 */
export class CorpusTerms {
  private readonly index = lazy(() => buildIndex(this.project));

  constructor(private readonly project: DocsProject) {}

  invalidate(): void {
    this.index.invalidate();
  }

  async emphasisOf(path: string): Promise<Emphasis | undefined> {
    const index = await this.index.get();
    const here = index.byPath.get(path);
    if (here === undefined) {
      return undefined;
    }
    const manifest = await this.project.manifestNow();
    const titleOf = new Map(manifest.nodes.map((node) => [node.path, node.title]));

    for (const term of rankTerms(index, here)) {
      const elsewhere = elsewhereFor(index, titleOf, path, term);
      if (elsewhere.length < MIN_ELSEWHERE) {
        continue;
      }
      const count = here.counts.get(term) ?? 0;
      const corpusRate = rateOf(index.corpusCount.get(term) ?? 0, index.corpusTotal);
      return {
        term,
        count,
        rate: rateOf(count, here.total),
        corpusRate,
        lift: corpusRate === 0 ? 0 : rateOf(count, here.total) / corpusRate,
        anchor: await densestSection(this.project, path, term),
        elsewhere,
      };
    }
    return undefined;
  }
}
