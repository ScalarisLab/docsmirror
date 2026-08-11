/**
 * A memoized async build: computed on first use, shared until invalidated.
 *
 * Everything this server derives from the docs root follows the same
 * lifecycle, built lazily because a request may never need it, cached because
 * it costs a pass over every document, and discarded on write because a write
 * is the only thing that can make it wrong. One helper, so the caches that
 * share the lifecycle cannot drift apart in how they implement it.
 */
export interface Lazy<T> {
  get(): Promise<T>;
  invalidate(): void;
}

export function lazy<T>(build: () => Promise<T>): Lazy<T> {
  let value: Promise<T> | undefined;
  return {
    get: () => (value ??= build()),
    invalidate: () => {
      value = undefined;
    },
  };
}
