// ==== Retrying failed lookups ====
// A lookup that failed (X paused us, a hiccup, a timeout) used to be final for
// the rest of the page: the post stayed visible however long the tab was open.
// Now a failed handle may be asked again once the circuit breaker's pause is
// over (the cooldown), or a little sooner when other lookups work again, but
// only a few times per page, so a handle X always fails for costs little.
// Every retry still goes through the queue and the shared hourly budget.
import { trimOldest } from "./bounded.ts";

// the same as the breaker's pause (guard.ts): retrying sooner would only hit the pause
export const RETRY_COOLDOWN_MS = 30 * 60 * 1000;
// after X answers again, wait this long: the failure may have been about this handle
export const RETRY_MIN_GAP_MS = 2 * 60 * 1000;
export const MAX_RETRIES = 3;

export function createRetryPolicy(now: () => number = Date.now, max = 5000) {
  // handle → when it last failed and how often
  const failures = new Map<string, { at: number; count: number }>();
  let healthyAt = -Infinity;

  const exhausted = (f: { count: number }) => f.count > MAX_RETRIES;
  const dueAt = (f: { at: number }) => (healthyAt > f.at ? f.at + RETRY_MIN_GAP_MS : f.at + RETRY_COOLDOWN_MS);

  return {
    canAsk(handle: string): boolean {
      const f = failures.get(handle);
      return !f || (!exhausted(f) && now() >= dueAt(f));
    },
    failed(handle: string) {
      const f = failures.get(handle);
      failures.delete(handle);
      failures.set(handle, { at: now(), count: (f?.count ?? 0) + 1 });
      trimOldest(failures, max);
    },
    /** a lookup worked: X answers again */
    succeeded(handle: string) {
      failures.delete(handle);
      healthyAt = now();
    },
    /** failed handles that may be asked again now */
    due(): string[] {
      const t = now();
      return [...failures].filter(([, f]) => !exhausted(f) && t >= dueAt(f)).map(([h]) => h);
    },
    /** when the next failed handle becomes due; null: none is waiting */
    nextAt(): number | null {
      const t = now();
      let next: number | null = null;
      for (const f of failures.values()) {
        if (exhausted(f)) continue;
        const at = dueAt(f);
        if (at > t && (next === null || at < next)) next = at;
      }
      return next;
    },
  };
}
