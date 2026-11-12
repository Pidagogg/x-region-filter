// ==== Lookup queue ====
// X rate-limits its API per account, and a blocked lookup would cost the user
// their own X session for a while. So: one request at a time, a random pause
// between requests, each handle asked once (callers share the promise), and
// on HTTP 429 the whole queue pauses with a growing backoff. Limits that must
// hold across tabs (circuit breaker, hourly budget) come from a Gate (guard.ts).
import type { Lookup } from "./settings.ts";

/**
 * waitMs: X says its rate limit is nearly used up; pause that long before the
 * next request. skipped: nothing was sent (not logged in), so it says nothing
 * about whether X works.
 */
export type FetchResult = { ok: true; region: string | null; waitMs?: number } | { ok: false; status?: number; retryAfterMs?: number; waitMs?: number; skipped?: boolean };

export interface Gate {
  /** before each request: "paused" = no lookups for now, a number = wait that long first, 0 = go */
  check(): Promise<"paused" | number>;
  /** after each request */
  record(res: FetchResult): Promise<void>;
}

export interface QueueOptions {
  fetchRegion: (handle: string) => Promise<FetchResult>;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** pause between two requests, ms */
  gap?: [number, number];
  /** first 429 pause and its cap, ms */
  backoff?: [number, number];
  /** how often one handle may hit a 429 before it counts as failed */
  maxRetries?: number;
  gate?: Gate;
}

export function createQueue(o: QueueOptions) {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = o.random ?? Math.random;
  const [gapMin, gapMax] = o.gap ?? [400, 800];
  const [backoffBase, backoffMax] = o.backoff ?? [60_000, 15 * 60_000];
  const maxRetries = o.maxRetries ?? 3;

  const pending = new Map<string, Promise<Lookup>>();
  const waiting: Array<{ handle: string; resolve: (l: Lookup) => void; retries: number }> = [];
  let running = false;
  let strikes = 0;

  async function run() {
    if (running) return;
    running = true;
    let first = true;
    while (waiting.length) {
      if (!first) await sleep(gapMin + random() * (gapMax - gapMin));
      first = false;
      if (o.gate) {
        // a broken storage must not stop lookups for good
        const go = await o.gate.check().catch(() => 0);
        if (go === "paused") {
          // fail open: everything waiting stays visible, and nothing is cached
          for (const job of waiting.splice(0)) {
            pending.delete(job.handle);
            job.resolve({ status: "error" });
          }
          continue;
        }
        if (go > 0) {
          await sleep(go);
          continue;
        }
      }
      const job = waiting.shift()!;
      let res: FetchResult;
      try {
        res = await o.fetchRegion(job.handle);
      } catch {
        res = { ok: false };
      }
      await o.gate?.record(res).catch(() => {});
      if (res.waitMs && res.waitMs > 0) await sleep(res.waitMs);
      if (res.ok) strikes = 0;
      if (!res.ok && res.status === 429 && job.retries < maxRetries) {
        // back to the front, still pending: callers keep waiting on the same promise
        const wait = res.retryAfterMs ?? Math.min(backoffBase * 2 ** strikes, backoffMax);
        strikes++;
        job.retries++;
        waiting.unshift(job);
        await sleep(wait);
        continue;
      }
      pending.delete(job.handle);
      job.resolve(!res.ok ? { status: "error" } : res.region === null ? { status: "unknown" } : { status: "known", region: res.region });
    }
    running = false;
  }

  return {
    lookup(handle: string): Promise<Lookup> {
      const h = handle.toLowerCase();
      const known = pending.get(h);
      if (known) return known;
      const p = new Promise<Lookup>((resolve) => waiting.push({ handle: h, resolve, retries: 0 }));
      pending.set(h, p);
      void run();
      return p;
    },
    get size() {
      return waiting.length;
    },
  };
}
