// ==== Why posts are (not) being filtered right now ====
// The popup's status line. Derived from the settings and the lookup state the
// x.com tabs share (guard.ts), which holds no handles and nothing about the user.
import { HOUR, HOURLY_BUDGET, type GuardState } from "./guard.ts";
import type { Settings } from "./settings.ts";

export type Status =
  | { kind: "off" }
  | { kind: "loggedOut" }
  | { kind: "broken" }
  | { kind: "paused"; until: number }
  | { kind: "hourly"; until: number }
  | { kind: "active" };

export function deriveStatus(s: Settings, g: GuardState, now: number): Status {
  if (!s.enabled) return { kind: "off" };
  if (g.loggedOut) return { kind: "loggedOut" };
  // the breaker pauses too when every id fails; the cause is the more useful message
  if (g.stale) return { kind: "broken" };
  const until = Math.max(g.pausedUntil, g.waitUntil);
  if (until > now) return { kind: "paused", until };
  const recent = g.recent.filter((r) => r > now - HOUR && r <= now);
  if (recent.length >= HOURLY_BUDGET) return { kind: "hourly", until: recent[0] + HOUR };
  return { kind: "active" };
}
