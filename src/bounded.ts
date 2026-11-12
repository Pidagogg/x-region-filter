// ==== Size caps for long-lived tabs ====
// An x.com tab can stay open for days of scrolling; the per-page maps in the
// content script would otherwise grow without end. Maps and Sets keep
// insertion order, so the first keys are the oldest.

export function trimOldest(c: Map<unknown, unknown> | Set<unknown>, max: number) {
  for (const k of c.keys()) {
    if (c.size <= max) return;
    c.delete(k);
  }
}
