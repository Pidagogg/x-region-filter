// Everything the extension keeps, all in storage.local on this device:
// - settings: the user's choices (settings.ts)
// - regions: the region cache (cache.ts)
// - hiddenCount: how many posts were hidden, shown in the popup
// - promoHidden: the W flow card was closed
// - lookupGuard: lookup times of the last hour, the pause state and whether
//   lookups work, for the popup's status line (guard.ts)
// How changes from several pages are kept from undoing each other: store-core.ts.
import { kv } from "./platform.ts";
import { createGuard, GUARD_KEY, normalizeGuard, type GuardState } from "./guard.ts";
import { normalizeSettings, type Settings } from "./settings.ts";
import { createStore } from "./store-core.ts";
import type { CacheMap, CacheStore } from "./cache.ts";

export const { getSettings, updateSettings, allowHandle, disallowHandle, addHidden, getHidden } = createStore(kv);

export function watchSettings(cb: (s: Settings) => void) {
  kv.onChanged((c) => {
    if ("settings" in c) cb(normalizeSettings(c.settings.newValue));
  });
}

export const cacheStore: CacheStore = {
  load: async () => ((await kv.get("regions")).regions as CacheMap | undefined) || {},
  save: (map) => kv.set({ regions: map }),
};

export const lookupGuard = createGuard(kv);

export const getLookupState = async (): Promise<GuardState> => normalizeGuard((await kv.get(GUARD_KEY))[GUARD_KEY]);

export function watchLookupState(cb: (g: GuardState) => void) {
  kv.onChanged((c) => {
    if (GUARD_KEY in c) cb(normalizeGuard(c[GUARD_KEY].newValue));
  });
}

export function watchHidden(cb: (n: number) => void) {
  kv.onChanged((c) => {
    if ("hiddenCount" in c) cb((c.hiddenCount.newValue as number | undefined) || 0);
  });
}
