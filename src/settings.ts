// ==== Settings and the hide rule ====
// What the user chose in the popup, and the one function that decides whether
// a post is hidden. Pure, so the tests can cover every case.
import { keyFor } from "./regions.ts";

export type Mode = "collapse" | "remove";

export interface Settings {
  enabled: boolean;
  mode: Mode;
  /** pick keys from regions.ts ("c:DE", "a:western europe"); nothing is picked at first */
  selected: string[];
  /** also hide accounts X shows no region for; off at first */
  hideUnknown: boolean;
  /** lowercase handles the user chose to always show */
  allow: string[];
}

export const DEFAULTS: Settings = { enabled: true, mode: "collapse", selected: [], hideUnknown: false, allow: [] };

/** Whatever is in storage (old, partial or broken) becomes a valid Settings. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULTS.enabled,
    mode: r.mode === "remove" ? "remove" : "collapse",
    selected: strings(r.selected),
    hideUnknown: r.hideUnknown === true,
    allow: strings(r.allow).map((h) => h.toLowerCase()),
  };
}

/**
 * What is known about an account's region:
 * - undefined: not looked up yet
 * - { status: "known", region }: X showed a value
 * - { status: "unknown" }: X answered but showed none
 * - { status: "error" }: the lookup failed (rate limit, logged out, X changed)
 */
export type Lookup = { status: "known"; region: string } | { status: "unknown" } | { status: "error" };

export type Decision = { hide: false } | { hide: true; region: string | null };

export function decide(handle: string, lookup: Lookup | undefined, s: Settings): Decision {
  if (!s.enabled || s.allow.includes(handle.toLowerCase())) return { hide: false };
  // fail open: a post is never hidden because of something we don't know
  if (!lookup || lookup.status === "error") return { hide: false };
  if (lookup.status === "unknown") return s.hideUnknown ? { hide: true, region: null } : { hide: false };
  const key = keyFor(lookup.region);
  return key && s.selected.includes(key) ? { hide: true, region: lookup.region } : { hide: false };
}
