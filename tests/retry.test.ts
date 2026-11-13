// Retry policy for failed lookups: a handle whose lookup failed is asked again
// after a cooldown, or sooner once lookups work again, a few times at most.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRetryPolicy, MAX_RETRIES, RETRY_COOLDOWN_MS, RETRY_MIN_GAP_MS } from "../src/retry.ts";

test("a handle never asked, or asked successfully, may be asked", () => {
  const p = createRetryPolicy(() => 0);
  assert.equal(p.canAsk("a"), true);
  p.succeeded("a");
  assert.equal(p.canAsk("a"), true);
});

test("after a failure the handle waits for the cooldown", () => {
  let now = 1_000;
  const p = createRetryPolicy(() => now);
  p.failed("a");
  assert.equal(p.canAsk("a"), false);
  assert.equal(p.nextAt(), 1_000 + RETRY_COOLDOWN_MS);
  now += RETRY_COOLDOWN_MS - 1;
  assert.equal(p.canAsk("a"), false);
  now += 1;
  assert.equal(p.canAsk("a"), true);
  assert.deepEqual(p.due(), ["a"]);
});

test("once another lookup works again, a failed handle is retried after a short gap", () => {
  let now = 0;
  const p = createRetryPolicy(() => now);
  p.failed("a");
  now += 1_000;
  p.succeeded("b");
  assert.equal(p.canAsk("a"), false, "not at once: the failure may be about this handle");
  now = RETRY_MIN_GAP_MS;
  assert.equal(p.canAsk("a"), true);
});

test("a success before the failure does not count as healthy again", () => {
  let now = 0;
  const p = createRetryPolicy(() => now);
  p.succeeded("b");
  now = 10;
  p.failed("a");
  now = 10 + RETRY_MIN_GAP_MS;
  assert.equal(p.canAsk("a"), false);
});

test(`at most ${MAX_RETRIES} retries per handle per page`, () => {
  let now = 0;
  const p = createRetryPolicy(() => now);
  p.failed("a");
  for (let i = 0; i < MAX_RETRIES; i++) {
    now += RETRY_COOLDOWN_MS;
    assert.equal(p.canAsk("a"), true, `retry ${i + 1}`);
    p.failed("a");
  }
  now += RETRY_COOLDOWN_MS * 10;
  assert.equal(p.canAsk("a"), false, "given up for this page");
  assert.equal(p.nextAt(), null);
  assert.deepEqual(p.due(), []);
});

test("nextAt is the earliest handle still waiting; due handles are not counted", () => {
  let now = 0;
  const p = createRetryPolicy(() => now);
  p.failed("a");
  now = 5_000;
  p.failed("b");
  assert.equal(p.nextAt(), RETRY_COOLDOWN_MS);
  now = RETRY_COOLDOWN_MS;
  assert.equal(p.nextAt(), 5_000 + RETRY_COOLDOWN_MS);
});

test("memory is capped", () => {
  const p = createRetryPolicy(() => 0, 3);
  for (const h of ["a", "b", "c", "d"]) p.failed(h);
  assert.equal(p.canAsk("a"), true, "the oldest failure is forgotten");
  assert.equal(p.canAsk("d"), false);
});
