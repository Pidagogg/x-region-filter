// ==== Region cache ====
// handle → { region, fetchedAt }, kept in memory and in storage.local so each
// account is looked up about once a month, not on every page load. That is the
// only thing stored about other accounts. Known regions live 30 days, "X shows
// none" only a day (the account may add one), and the list is capped.

export const DAY = 24 * 60 * 60 * 1000;
export const TTL_KNOWN = 30 * DAY;
export const TTL_UNKNOWN = DAY;
export const MAX_ENTRIES = 5000;

export interface Entry {
  /** null: X showed no region */
  region: string | null;
  fetchedAt: number;
}

export type CacheMap = Record<string, Entry>;

export function isFresh(e: Entry, now: number): boolean {
  const age = now - e.fetchedAt;
  return age >= 0 && age < (e.region === null ? TTL_UNKNOWN : TTL_KNOWN);
}

/** Drops stale entries, then the oldest ones beyond the cap. */
export function prune(map: CacheMap, now: number, max = MAX_ENTRIES): CacheMap {
  const fresh = Object.entries(map).filter(([, e]) => e && typeof e.fetchedAt === "number" && isFresh(e, now));
  fresh.sort((a, b) => b[1].fetchedAt - a[1].fetchedAt);
  return Object.fromEntries(fresh.slice(0, max));
}

/** The newer of two entries for a handle wins. */
export function merge(a: CacheMap, b: CacheMap): CacheMap {
  const out: CacheMap = { ...a };
  for (const [k, e] of Object.entries(b)) if (!out[k] || !(out[k].fetchedAt >= e.fetchedAt)) out[k] = e;
  return out;
}

export interface CacheStore {
  load(): Promise<CacheMap>;
  save(map: CacheMap): Promise<void>;
}

/** Memory in front of storage; writes are batched because a timeline brings many new handles at once. */
export class RegionCache {
  private map: CacheMap = {};
  private ready: Promise<void>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private store: CacheStore;
  private now: () => number;
  private flushMs: number;

  constructor(store: CacheStore, now: () => number = Date.now, flushMs = 2000) {
    this.store = store;
    this.now = now;
    this.flushMs = flushMs;
    this.ready = store.load().then(
      (m) => void (this.map = prune(m || {}, this.now())),
      () => {}
    );
  }

  async get(handle: string): Promise<Entry | undefined> {
    await this.ready;
    const e = this.map[handle.toLowerCase()];
    return e && isFresh(e, this.now()) ? e : undefined;
  }

  async set(handle: string, region: string | null) {
    await this.ready;
    this.map[handle.toLowerCase()] = { region, fetchedAt: this.now() };
    if (!this.timer) this.timer = setTimeout(() => void this.flush(), this.flushMs);
  }

  /** Other tabs write the same key, so their entries are merged in, not overwritten. */
  async flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const stored = await this.store.load().catch(() => ({}) as CacheMap);
    this.map = prune(merge(stored || {}, this.map), this.now());
    await this.store.save(this.map);
  }
}
