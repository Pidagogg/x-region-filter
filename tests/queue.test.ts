// Lookup queue: one request per handle, one at a time, pauses, 429 backoff.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createQueue, type FetchResult } from "../src/queue.ts";

function harness(answers: Record<string, FetchResult[]>) {
  const calls: string[] = [];
  const sleeps: number[] = [];
  let active = 0;
  let maxActive = 0;
  const q = createQueue({
    fetchRegion: async (h) => {
      calls.push(h);
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active--;
      return answers[h].shift() ?? { ok: false };
    },
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 0.5,
    backoff: [1000, 3000],
  });
  return { q, calls, sleeps, maxActive: () => maxActive };
}

test("each handle is asked once, callers share the answer, one request at a time", async () => {
  const h = harness({ alice: [{ ok: true, region: "Germany" }], bob: [{ ok: true, region: null }] });
  const [a1, a2, b, a3] = await Promise.all([h.q.lookup("alice"), h.q.lookup("Alice"), h.q.lookup("bob"), h.q.lookup("ALICE")]);
  assert.deepEqual(a1, { status: "known", region: "Germany" });
  assert.equal(a1, a2);
  assert.equal(a1, a3);
  assert.deepEqual(b, { status: "unknown" });
  assert.deepEqual(h.calls, ["alice", "bob"]);
  assert.equal(h.maxActive(), 1);
  assert.deepEqual(h.sleeps, [600], "the random gap between two requests");
});

test("429 pauses the queue with a growing backoff, then retries the same handle", async () => {
  const h = harness({ alice: [{ ok: false, status: 429 }, { ok: false, status: 429 }, { ok: true, region: "Japan" }] });
  assert.deepEqual(await h.q.lookup("alice"), { status: "known", region: "Japan" });
  assert.deepEqual(h.calls, ["alice", "alice", "alice"]);
  assert.deepEqual(h.sleeps.filter((ms) => ms >= 1000), [1000, 2000]);
});

test("the backoff is capped, honours X's reset time, and gives up after the retries", async () => {
  const h = harness({ alice: [{ ok: false, status: 429, retryAfterMs: 42_000 }, { ok: false, status: 429 }, { ok: false, status: 429 }, { ok: false, status: 429 }] });
  assert.deepEqual(await h.q.lookup("alice"), { status: "error" });
  assert.deepEqual(h.sleeps.filter((ms) => ms >= 1000), [42_000, 2000, 3000]);
});

test("other failures and thrown errors resolve as error without retry", async () => {
  const q = createQueue({ fetchRegion: async (h) => (h === "boom" ? Promise.reject(new Error("net")) : { ok: false, status: 403 }), sleep: async () => {} });
  assert.deepEqual(await q.lookup("boom"), { status: "error" });
  assert.deepEqual(await q.lookup("nope"), { status: "error" });
});

test("while the guard says paused, lookups resolve as error at once and nothing is sent", async () => {
  const calls: string[] = [];
  const q = createQueue({ fetchRegion: async (h) => (calls.push(h), { ok: true, region: "x" }), sleep: async () => {}, gate: { check: async () => "paused", record: async () => {} } });
  assert.deepEqual(await Promise.all([q.lookup("a"), q.lookup("b")]), [{ status: "error" }, { status: "error" }]);
  assert.deepEqual(calls, []);
});

test("the guard's wait is slept before the request, and every result is reported to it", async () => {
  const sleeps: number[] = [];
  const recorded: FetchResult[] = [];
  const waits: Array<number | "paused"> = [5000, 0];
  const q = createQueue({
    fetchRegion: async () => ({ ok: true, region: "Japan" }),
    sleep: async (ms) => void sleeps.push(ms),
    gate: { check: async () => waits.shift() ?? 0, record: async (r) => void recorded.push(r) },
  });
  assert.deepEqual(await q.lookup("a"), { status: "known", region: "Japan" });
  assert.ok(sleeps.includes(5000));
  assert.deepEqual(recorded, [{ ok: true, region: "Japan" }]);
});

test("X's rate-limit hint on a response pauses the queue before the next request", async () => {
  const sleeps: number[] = [];
  const q = createQueue({ fetchRegion: async () => ({ ok: true, region: null, waitMs: 90_000 }), sleep: async (ms) => void sleeps.push(ms), random: () => 0 });
  await Promise.all([q.lookup("a"), q.lookup("b")]);
  assert.ok(sleeps.includes(90_000));
});
