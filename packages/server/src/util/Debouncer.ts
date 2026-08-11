/**
 * Per-document debouncing. Validation is cheap but not free, and a burst of
 * keystrokes should cost one run, not one per character.
 * @docs server.md#diagnostics
 */

export class Debouncer {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly delayMs: number) {}

  /** Runs `task` once the key has been quiet for the configured delay. */
  schedule(key: string, task: () => void): void {
    this.cancel(key);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        task();
      }, this.delayMs),
    );
  }

  cancel(key: string): void {
    const timer = this.timers.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
