// The popup's status line: why posts are (not) being filtered right now,
// derived from the settings and the shared lookup state alone.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BREAKER_PAUSE_MS, HOUR, HOURLY_BUDGET, normalizeGuard } from "../src/guard.ts";
import { DEFAULTS } from "../src/settings.ts";
import { deriveStatus } from "../src/status.ts";

const NOW = 100 * HOUR;
const on = { ...DEFAULTS, selected: ["c:DE"] };
const guard = (g: Record<string, unknown> = {}) => normalizeGuard(g);

test("filter switched off wins over everything", () => {
  assert.deepEqual(deriveStatus({ ...on, enabled: false }, guard({ loggedOut: true, pausedUntil: NOW + 1 }), NOW), { kind: "off" });
});

test("no stored state yet: active", () => {
  assert.deepEqual(deriveStatus(on, guard(), NOW), { kind: "active" });
  assert.deepEqual(deriveStatus(on, normalizeGuard(undefined), NOW), { kind: "active" });
});

test("logged out", () => {
  assert.deepEqual(deriveStatus(on, guard({ loggedOut: true }), NOW), { kind: "loggedOut" });
});

test("every query id rejected: X changed something, even while the breaker pauses", () => {
  assert.deepEqual(deriveStatus(on, guard({ stale: true, pausedUntil: NOW + BREAKER_PAUSE_MS }), NOW), { kind: "broken" });
});

test("paused until the later of the breaker and X's own hint", () => {
  assert.deepEqual(deriveStatus(on, guard({ pausedUntil: NOW + 1_000, waitUntil: NOW + 5_000 }), NOW), { kind: "paused", until: NOW + 5_000 });
  assert.deepEqual(deriveStatus(on, guard({ pausedUntil: NOW - 1 }), NOW), { kind: "active" }, "an old pause is over");
});

test("hourly budget used up: resumes when the oldest lookup is an hour old", () => {
  const recent = Array.from({ length: HOURLY_BUDGET }, (_, i) => NOW - HOUR + 10 + i);
  assert.deepEqual(deriveStatus(on, guard({ recent }), NOW), { kind: "hourly", until: NOW + 10 });
  assert.deepEqual(deriveStatus(on, guard({ recent: recent.slice(1) }), NOW), { kind: "active" });
  assert.deepEqual(deriveStatus(on, guard({ recent }), NOW + 10), { kind: "active" }, "the oldest has aged out");
});
