// ==== Lookup guard, shared by every x.com tab ====
// Each tab has its own queue, but X counts requests per account, and a broken
// endpoint is broken in every tab. So the limits live in storage.local, where
// all tabs and the next page load see them:
// - circuit breaker: after 3 failures in a row (not 429s, which the queue backs
//   off on) all lookups pause for 30 minutes. Posts stay visible meanwhile.
// - X's own hint: when x-rate-limit-remaining runs low, wait for the reset.
// - a budget of 300 lookups per rolling hour across all tabs.
// It also keeps two flags for the popup's status line (status.ts): the last
// lookup found the user logged out, and X rejected every query id we know.
// Tabs read and write the state without a lock; two tabs racing can overshoot
// the budget by a lookup or two, which is fine for a courtesy limit.
import type { KV } from "./kv.ts";
import type { FetchResult, Gate } from "./queue.ts";

// ---- limits ----

export const HOUR = 60 * 60 * 1000;
export const BREAKER_FAILURES = 3;
export const BREAKER_PAUSE_MS = 30 * 60 * 1000;
export const HOURLY_BUDGET = 300;

export const GUARD_KEY = "lookupGuard";

export interface GuardState {
  /** consecutive failures, across tabs */
  streak: number;
  pausedUntil: number;
  /** from X's rate-limit headers */
  waitUntil: number;
  /** start times of the lookups in the last hour, oldest first */
  recent: number[];
  /** the last lookup sent nothing: no X session in the tab */
  loggedOut: boolean;
  /** X rejected every query id; cleared by the next lookup that works */
  stale: boolean;
}

export function normalizeGuard(v: unknown): GuardState {
  const s = (v && typeof v === "object" ? v : {}) as Partial<GuardState>;
  const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : 0);
  return {
    streak: num(s.streak),
    pausedUntil: num(s.pausedUntil),
    waitUntil: num(s.waitUntil),
    recent: Array.isArray(s.recent) ? s.recent.filter((t): t is number => typeof t === "number").sort((a, b) => a - b) : [],
    loggedOut: s.loggedOut === true,
    stale: s.stale === true,
  };
}

// ---- the gate ----

export function createGuard(kv: Pick<KV, "get" | "set">, now: () => number = Date.now): Gate {
  const load = async () => normalizeGuard((await kv.get(GUARD_KEY))[GUARD_KEY]);
  const save = (s: GuardState) => kv.set({ [GUARD_KEY]: s });

  return {
    async check() {
      const s = await load();
      const t = now();
      if (s.pausedUntil > t) return "paused";
      if (s.waitUntil > t) return s.waitUntil - t;
      s.recent = s.recent.filter((r) => r > t - HOUR && r <= t);
      if (s.recent.length >= HOURLY_BUDGET) return s.recent[0] + HOUR - t;
      // the slot is taken now, so other tabs count it before the request returns
      s.recent.push(t);
      await save(s);
      return 0;
    },

    async record(res: FetchResult) {
      const s = await load();
      const t = now();
      if (res.waitMs && res.waitMs > 0) s.waitUntil = Math.max(s.waitUntil, t + res.waitMs);
      // nothing was sent (logged out): give the slot back, or an hour of logged-out
      // browsing would leave no budget for the moment the user logs in
      if (!res.ok && res.skipped) s.recent.pop();
      s.loggedOut = !res.ok && !!res.skipped;
      if (res.ok) s.stale = false;
      else if (res.stale) s.stale = true;
      if (res.ok) s.streak = 0;
      else if (res.status !== 429 && !res.skipped && ++s.streak >= BREAKER_FAILURES) {
        s.pausedUntil = t + BREAKER_PAUSE_MS;
        s.streak = 0;
      }
      await save(s);
    },
  };
}
