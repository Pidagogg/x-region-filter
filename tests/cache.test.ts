// Region cache: TTLs, pruning, the cap and the memory layer in front of storage.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DAY, isFresh, prune, RegionCache, type CacheMap } from "../src/cache.ts";

test("known regions live 30 days, unknown ones a day", () => {
  const now = 100 * DAY;
  assert.ok(isFresh({ region: "Germany", fetchedAt: now - 29 * DAY }, now));
  assert.ok(!isFresh({ region: "Germany", fetchedAt: now - 31 * DAY }, now));
  assert.ok(isFresh({ region: null, fetchedAt: now - DAY / 2 }, now));
  assert.ok(!isFresh({ region: null, fetchedAt: now - 2 * DAY }, now));
  assert.ok(!isFresh({ region: "Germany", fetchedAt: now + DAY }, now), "a clock that went back counts as stale");
});

test("prune drops stale entries and keeps the newest up to the cap", () => {
  const now = 100 * DAY;
  const map: CacheMap = { old: { region: "x", fetchedAt: now - 40 * DAY }, a: { region: "x", fetchedAt: now - 3 }, b: { region: "x", fetchedAt: now - 2 }, c: { region: null, fetchedAt: now - 1 } };
  assert.deepEqual(Object.keys(prune(map, now, 2)).sort(), ["b", "c"]);
});

test("RegionCache answers from memory, ignores case and writes once in a batch", async () => {
  let now = 50 * DAY;
  const saves: CacheMap[] = [];
  const store = { load: async () => ({ alice: { region: "France", fetchedAt: now - DAY } }), save: async (m: CacheMap) => void saves.push(structuredClone(m)) };
  const cache = new RegionCache(store, () => now, 10_000);
  assert.equal((await cache.get("Alice"))?.region, "France");
  await cache.set("Bob", null);
  await cache.set("carol", "Japan");
  assert.equal((await cache.get("bob"))?.region, null);
  now += 2 * DAY; // bob's "unknown" has expired, carol's region has not
  assert.equal(await cache.get("bob"), undefined);
  await cache.flush();
  assert.equal(saves.length, 1);
  assert.deepEqual(Object.keys(saves[0]).sort(), ["alice", "carol"]);
});

test("flush merges with what other tabs saved, the newer entry wins", async () => {
  let now = 50 * DAY;
  let stored: CacheMap = {};
  const store = { load: async () => structuredClone(stored), save: async (m: CacheMap) => void (stored = structuredClone(m)) };
  const tabA = new RegionCache(store, () => now, 10_000);
  const tabB = new RegionCache(store, () => now, 10_000);
  await tabA.set("alice", "France");
  await tabA.set("dave", null);
  now += 1000;
  await tabB.set("bob", "Japan");
  await tabB.set("dave", "Chile");
  await tabB.flush();
  await tabA.flush();
  assert.deepEqual(Object.fromEntries(Object.entries(stored).map(([k, e]) => [k, e.region])), { alice: "France", bob: "Japan", dave: "Chile" });
  assert.equal((await tabA.get("bob"))?.region, "Japan", "the merged map is also what this tab now knows");
});
