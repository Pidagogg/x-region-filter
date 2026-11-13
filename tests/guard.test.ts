// Lookup guard: the circuit breaker, X's rate-limit hint and the hourly
// budget, all shared through one storage so every tab and reload honours them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BREAKER_PAUSE_MS, createGuard, HOUR, HOURLY_BUDGET } from "../src/guard.ts";

function memoryKV() {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: async (keys: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((k) => k in data).map((k) => [k, structuredClone(data[k])])),
    set: async (items: Record<string, unknown>) => void Object.assign(data, structuredClone(items)),
  };
}

test("three failures in a row pause every tab for 30 minutes, and reloads honour it", async () => {
  let now = 1_000_000;
  const kv = memoryKV();
  const tabA = createGuard(kv, () => now);
  const tabB = createGuard(kv, () => now);
  for (let i = 0; i < 2; i++) {
    assert.equal(await tabA.check(), 0);
    await tabA.record({ ok: false, status: 400 });
  }
  assert.equal(await tabB.check(), 0, "two failures are not enough");
  await tabB.record({ ok: false, status: 403 });
  assert.equal(await tabA.check(), "paused");
  assert.equal(await createGuard(kv, () => now).check(), "paused", "a fresh page load sees the pause");
  now += BREAKER_PAUSE_MS - 1;
  assert.equal(await tabB.check(), "paused");
  now += 1;
  assert.equal(await tabB.check(), 0);
});

test("successes reset the streak; 429 and lookups that sent nothing do not count", async () => {
  const kv = memoryKV();
  const g = createGuard(kv, () => 5_000);
  await g.record({ ok: false, status: 404 });
  await g.record({ ok: false });
  await g.record({ ok: true, region: null });
  await g.record({ ok: false, status: 500 });
  await g.record({ ok: false, status: 429 });
  await g.record({ ok: false, status: 401, skipped: true });
  await g.record({ ok: false, status: 400 });
  assert.equal(await g.check(), 0);
  await g.record({ ok: false, status: 400 });
  assert.equal(await g.check(), "paused");
});

test("X's rate-limit hint makes every tab wait until the reset", async () => {
  let now = 10_000;
  const kv = memoryKV();
  await createGuard(kv, () => now).record({ ok: true, region: "Germany", waitMs: 60_000 });
  const other = createGuard(kv, () => now);
  assert.equal(await other.check(), 60_000);
  now += 60_000;
  assert.equal(await other.check(), 0);
});

test("lookups that sent nothing (logged out) do not use up the hourly budget", async () => {
  const kv = memoryKV();
  const g = createGuard(kv, () => HOUR * 10);
  for (let i = 0; i < HOURLY_BUDGET + 5; i++) {
    assert.equal(await g.check(), 0);
    await g.record({ ok: false, status: 401, skipped: true });
  }
  assert.equal(await g.check(), 0, "logging in right after still gets lookups");
});

test("at most 300 lookups per rolling hour, counted across tabs", async () => {
  let now = HOUR * 10;
  const kv = memoryKV();
  const a = createGuard(kv, () => now);
  const b = createGuard(kv, () => now);
  const first = now;
  for (let i = 0; i < HOURLY_BUDGET; i++) {
    assert.equal(await (i % 2 ? a : b).check(), 0);
    now += 1000;
  }
  assert.equal(await a.check(), first + HOUR - now, "wait until the oldest lookup is an hour old");
  now = first + HOUR;
  assert.equal(await b.check(), 0);
});
