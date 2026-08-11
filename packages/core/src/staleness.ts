/**
 * Staleness is derived from the document's last-modified date, the only
 * signal available without asking authors to maintain metadata by hand.
 * @docs staleness.md#how-staleness-is-computed
 */

export type Staleness = 'fresh' | 'aging' | 'stale' | 'unknown';

export interface StalenessOptions {
  /** Days after which a document is reported as `aging`. */
  readonly agingAfterDays: number;
  /** Days after which a document is reported as `stale`. */
  readonly staleAfterDays: number;
}

export const DEFAULT_STALENESS_OPTIONS: StalenessOptions = {
  agingAfterDays: 90,
  staleAfterDays: 180,
};

const MS_PER_DAY = 86_400_000;

/** Whole days between `lastModified` and `now`, or `undefined` when unknown. */
export function ageInDays(lastModified: Date | undefined, now: Date = new Date()): number | undefined {
  if (lastModified === undefined || Number.isNaN(lastModified.getTime())) {
    return undefined;
  }
  return Math.max(0, Math.floor((now.getTime() - lastModified.getTime()) / MS_PER_DAY));
}

export function computeStaleness(
  lastModified: Date | undefined,
  options: StalenessOptions = DEFAULT_STALENESS_OPTIONS,
  now: Date = new Date(),
): Staleness {
  const age = ageInDays(lastModified, now);
  if (age === undefined) {
    return 'unknown';
  }
  if (age >= options.staleAfterDays) {
    return 'stale';
  }
  if (age >= options.agingAfterDays) {
    return 'aging';
  }
  return 'fresh';
}

/** ISO calendar date, the compact form hints and hovers show. */
export function formatDate(date: Date | undefined): string | undefined {
  if (date === undefined || Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}
