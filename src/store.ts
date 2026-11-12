// Everything the extension keeps, all in storage.local on this device:
// - settings: the user's choices (settings.ts)
// - regions: the region cache (cache.ts)
// - hiddenCount: how many posts were hidden, shown in the popup
// - promoHidden: the W flow card was closed
// - lookupGuard: lookup times of the last hour and the pause state (guard.ts)
import { kv } from "./platform.ts";
import { createGuard } from "./guard.ts";
import { normalizeSettings, type Settings } from "./settings.ts";
import type { CacheMap, CacheStore } from "./cache.ts";

export async function getSettings(): Promise<Settings> {
  return normalizeSettings((await kv.get("settings")).settings);
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await kv.set({ settings: next });
  return next;
}

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

export async function addHidden(n: number) {
  const { hiddenCount = 0 } = (await kv.get("hiddenCount")) as { hiddenCount?: number };
  await kv.set({ hiddenCount: hiddenCount + n });
}

export async function getHidden(): Promise<number> {
  return ((await kv.get("hiddenCount")).hiddenCount as number | undefined) || 0;
}

export function watchHidden(cb: (n: number) => void) {
  kv.onChanged((c) => {
    if ("hiddenCount" in c) cb((c.hiddenCount.newValue as number | undefined) || 0);
  });
}
