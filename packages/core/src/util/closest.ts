/** Levenshtein distance, used only to suggest a near-miss anchor. */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_unused, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  // `previous` always holds b.length + 1 entries, so the index never misses;
  // the fallback exists only for the unchecked-index rule.
  return previous[b.length] ?? Math.max(a.length, b.length);
}

/**
 * The candidate closest to `value`, when one is close enough to be worth
 * suggesting, beyond a third of the length the suggestion is noise.
 */
export function closestMatch(value: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const candidateDistance = distance(value, candidate);
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      best = candidate;
    }
  }
  const limit = Math.max(2, Math.floor(value.length / 3));
  return best !== undefined && bestDistance <= limit ? best : undefined;
}
