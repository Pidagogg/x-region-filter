// The size cap for the content script's per-page maps.
import assert from "node:assert/strict";
import { test } from "node:test";
import { trimOldest } from "../src/bounded.ts";

test("trimOldest drops the oldest entries of a Map or Set beyond the cap", () => {
  const m = new Map([["a", 1], ["b", 2], ["c", 3]]);
  trimOldest(m, 2);
  assert.deepEqual([...m.keys()], ["b", "c"]);
  const s = new Set(["a", "b", "c", "d"]);
  trimOldest(s, 1);
  assert.deepEqual([...s], ["d"]);
  trimOldest(s, 5);
  assert.deepEqual([...s], ["d"]);
});
