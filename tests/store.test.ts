// Settings and the counter are shared by the popup and every x.com tab. Each
// change re-reads storage right before writing and applies only itself, so
// one context's stale copy can't undo another's change.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Changes, KV } from "../src/kv.ts";
import { createStore } from "../src/store-core.ts";

// storage.local stand-in: async, with a tick between read and write like the real one
function memoryKV() {
  const data: Record<string, unknown> = {};
  let writes = 0;
  const tick = () => new Promise<void>((r) => setTimeout(r, 1));
  const kv: KV = {
    get: async (keys) => {
      await tick();
      return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
    },
    set: async (items) => {
      await tick();
      writes++;
      Object.assign(data, structuredClone(items));
    },
    remove: async () => {},
    onChanged: (_cb: (c: Changes) => void) => {},
  };
  return { kv, data, writes: () => writes };
}

test("a stale popup removing one handle keeps the handle a tab just added", async () => {
  const m = memoryKV();
  const popup = createStore(m.kv);
  const tab = createStore(m.kv);
  await popup.allowHandle("old");
  const stale = await popup.getSettings();
  await tab.allowHandle("New");
  await popup.disallowHandle("old");
  assert.deepEqual((await popup.getSettings()).allow, ["new"]);
  assert.deepEqual(stale.allow, ["old"]);
});

test("quick changes in one page are applied in order and none is lost", async () => {
  const m = memoryKV();
  const s = createStore(m.kv);
  await Promise.all([
    s.updateSettings((cur) => ({ selected: [...cur.selected, "c:DE"] })),
    s.updateSettings((cur) => ({ selected: [...cur.selected, "c:FR"] })),
    s.allowHandle("a"),
    s.allowHandle("b"),
    s.updateSettings({ mode: "remove" }),
  ]);
  const got = await s.getSettings();
  assert.deepEqual(got.selected, ["c:DE", "c:FR"]);
  assert.deepEqual(got.allow, ["a", "b"]);
  assert.equal(got.mode, "remove");
});

test("adding a handle twice keeps one", async () => {
  const s = createStore(memoryKV().kv);
  await s.allowHandle("a");
  await s.allowHandle("A");
  assert.deepEqual((await s.getSettings()).allow, ["a"]);
});

test("counter increments are batched and none is lost", async () => {
  const m = memoryKV();
  const a = createStore(m.kv);
  const b = createStore(m.kv);
  await Promise.all(Array.from({ length: 10 }, () => a.addHidden(1)));
  assert.equal(await a.getHidden(), 10);
  assert.ok(m.writes() < 10, `batched: ${m.writes()} writes for 10 increments`);
  await b.addHidden(5);
  await a.addHidden(2);
  assert.equal(await b.getHidden(), 17);
});
