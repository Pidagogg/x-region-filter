// ==== Settings and the counter, safe to change from several pages ====
// The popup and every x.com tab change the same settings and counter in
// storage.local, which has no transactions. So a change is never "write my
// copy back": it re-reads storage right before writing and applies only
// itself (one handle added or removed, one key toggled), and the changes of
// one page go out one after another. Two pages writing in the very same
// moment can still collide, but a stale copy can no longer undo a change.
// Pure (takes the KV), so the tests can run it without a browser.
import type { KV } from "./kv.ts";
import { normalizeSettings, type Settings } from "./settings.ts";

export type SettingsChange = Partial<Settings> | ((current: Settings) => Partial<Settings>);

export function createStore(kv: KV) {
  // this page's writes, in order
  let chain: Promise<unknown> = Promise.resolve();
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = chain.then(fn);
    chain = p.catch(() => {});
    return p;
  }

  const getSettings = async (): Promise<Settings> => normalizeSettings((await kv.get("settings")).settings);

  const updateSettings = (change: SettingsChange): Promise<Settings> =>
    serial(async () => {
      const current = await getSettings();
      const next = normalizeSettings({ ...current, ...(typeof change === "function" ? change(current) : change) });
      await kv.set({ settings: next });
      return next;
    });

  // the counter: increments add up here and go out in one write
  let unsaved = 0;
  let flushing: Promise<void> | null = null;
  const getHidden = async (): Promise<number> => {
    const v = (await kv.get("hiddenCount")).hiddenCount;
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };

  return {
    getSettings,
    updateSettings,
    allowHandle: (handle: string) => updateSettings((cur) => ({ allow: [...new Set([...cur.allow, handle.toLowerCase()])] })),
    disallowHandle: (handle: string) => updateSettings((cur) => ({ allow: cur.allow.filter((h) => h !== handle.toLowerCase()) })),
    getHidden,
    addHidden(n: number): Promise<void> {
      unsaved += n;
      flushing ??= serial(async () => {
        flushing = null;
        const add = unsaved;
        unsaved = 0;
        if (add) await kv.set({ hiddenCount: (await getHidden()) + add });
      });
      return flushing;
    },
  };
}
