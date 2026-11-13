// ==== Everything X-specific about the region lookup ====
// X has no public API for "About this account → Account based in". The web
// app reads it through an internal GraphQL query, and this module asks the
// same query from the x.com tab, with the user's own session: their cookies,
// the web client's public bearer token and the ct0 CSRF cookie as header.
// None of this is documented and all of it is UNVERIFIED: the operation name,
// variables, headers and JSON path are best guesses until someone checks them
// in a logged-in browser (docs/x-api-notes.md lists what to check). When X
// changes something, this is the only file to fix.
import type { FetchResult } from "./queue.ts";

// ---- constants ----

export const OPERATION = "AboutAccountQuery";
// Query ids change with X's deploys; this is only used when discovery fails.
export const FALLBACK_QUERY_ID = "XRqGa7EeokUU5kppkh13EA";
// The bearer token every x.com web visitor's browser sends; public, not a secret of the user's.
export const WEB_BEARER = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

// ---- query id discovery ----

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Finds the query id for `op` in a piece of X's JavaScript or in a request URL.
 * X's bundles hold entries like {queryId:"abc",operationName:"AboutAccountQuery",…};
 * the text is only searched, never run.
 */
export function extractQueryId(text: string, op = OPERATION): string | null {
  const o = esc(op);
  const patterns = [
    new RegExp(`queryId\\s*:\\s*["']([\\w-]{8,})["']\\s*,\\s*operationName\\s*:\\s*["']${o}["']`),
    new RegExp(`operationName\\s*:\\s*["']${o}["'][^{}]{0,400}?queryId\\s*:\\s*["']([\\w-]{8,})["']`),
    new RegExp(`graphql/([\\w-]{8,})/${o}\\b`),
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return m[1];
  }
  return null;
}

/** X's own script files: the ones on the page and any loaded later (lazy chunks). */
export function scriptUrls(doc: Document, entries: { name: string; initiatorType?: string }[]): string[] {
  const urls = new Set<string>();
  for (const s of Array.from(doc.scripts)) if (s.src) urls.add(s.src);
  for (const e of entries) if (e.initiatorType === "script" || /\.js(\?|$)/.test(e.name)) urls.add(e.name);
  // only X's web client bundles; main.* first, it usually holds the query table
  return [...urls]
    .filter((u) => /^https:\/\/abs\.twimg\.com\/responsive-web\/client-web[^/]*\/.+\.js$/.test(u))
    .sort((a, b) => Number(/\/main\./.test(b)) - Number(/\/main\./.test(a)))
    .slice(0, 40);
}

/**
 * 1. a request the page already made (if the user opened an About page), 2. X's
 * script files, which the browser already has cached. null: nothing found.
 */
export async function discoverQueryId(doc: Document, getText: (url: string) => Promise<string>): Promise<string | null> {
  const entries = (globalThis.performance?.getEntriesByType?.("resource") ?? []) as PerformanceResourceTiming[];
  for (const e of entries) {
    const id = extractQueryId(e.name);
    if (id) return id;
  }
  for (const url of scriptUrls(doc, entries)) {
    try {
      const id = extractQueryId(await getText(url));
      if (id) return id;
    } catch {
      // a file we can't read: try the next one
    }
  }
  return null;
}

/** The id to try: the discovered one, then the fallback constant, each only until X rejects it. */
export function nextQueryId(found: string | null, failed: ReadonlySet<string>): string | null {
  for (const id of [found, FALLBACK_QUERY_ID]) if (id && !failed.has(id)) return id;
  return null;
}

// ---- the request ----

export function csrfFrom(cookie: string): string | null {
  const m = /(?:^|;\s*)ct0=([^;]+)/.exec(cookie);
  return m ? decodeURIComponent(m[1]) : null;
}

export function buildRequest(origin: string, queryId: string, handle: string, csrf: string): { url: string; init: RequestInit } {
  const variables = encodeURIComponent(JSON.stringify({ screenName: handle }));
  return {
    url: `${origin}/i/api/graphql/${queryId}/${OPERATION}?variables=${variables}`,
    init: {
      method: "GET",
      credentials: "include",
      headers: {
        authorization: `Bearer ${WEB_BEARER}`,
        "x-csrf-token": csrf,
        "x-twitter-auth-type": "OAuth2Session",
        "x-twitter-active-user": "yes",
        "content-type": "application/json",
      },
    },
  };
}

// ---- the response ----

// Likely names of the field; the first one is what we expect.
const FIELD_KEYS = ["account_based_in", "accountBasedIn", "based_in", "basedIn"];
// Inside an "about" object a plain country key is also accepted.
const ABOUT_KEYS = ["about_profile", "aboutProfile", "about_account", "aboutAccount", "about"];
const ABOUT_FIELD_KEYS = [...FIELD_KEYS, "country", "location_country"];

function findString(node: unknown, keys: string[], depth = 0): string | null {
  if (!node || typeof node !== "object" || depth > 12) return null;
  const obj = node as Record<string, unknown>;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    // some fields come wrapped, e.g. { name: "Germany" }
    if (v && typeof v === "object") {
      const inner = (v as Record<string, unknown>).name ?? (v as Record<string, unknown>).value;
      if (typeof inner === "string" && inner.trim()) return inner.trim();
    }
  }
  for (const v of Object.values(obj)) {
    const found = findString(v, keys, depth + 1);
    if (found) return found;
  }
  return null;
}

function findObject(node: unknown, keys: string[], depth = 0): unknown {
  if (!node || typeof node !== "object" || depth > 12) return undefined;
  const obj = node as Record<string, unknown>;
  for (const k of keys) if (obj[k] && typeof obj[k] === "object") return obj[k];
  for (const v of Object.values(obj)) {
    const found = findObject(v, keys, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/**
 * The region from a response body. Expected shape (unverified):
 * data.user_result_by_screen_name.result.about_profile.account_based_in = "Germany".
 * Only an about object without a region field means "X shows none" (region
 * null). No data, `errors`, or no about object at all is an error: the post
 * stays visible and nothing is cached.
 */
export function parseRegion(json: unknown): FetchResult {
  if (!json || typeof json !== "object" || !("data" in json) || !(json as { data: unknown }).data) return { ok: false };
  const errors = (json as { errors?: unknown }).errors;
  if (errors && (!Array.isArray(errors) || errors.length)) return { ok: false };
  const about = findObject(json, ABOUT_KEYS);
  const region = (about ? findString(about, ABOUT_FIELD_KEYS) : null) || findString(json, FIELD_KEYS);
  if (region) return { ok: true, region };
  return about ? { ok: true, region: null } : { ok: false };
}

/**
 * On every response: when X says fewer than 10 requests are left in its
 * window, wait until the window resets. Capped at an hour in case of an odd header.
 */
export function rateWaitMs(headers: Headers, now = Date.now()): number | undefined {
  const remaining = headers.get("x-rate-limit-remaining");
  const reset = Number(headers.get("x-rate-limit-reset"));
  if (remaining === null || !(Number(remaining) < 10) || !(reset > 0)) return undefined;
  const ms = Math.min(reset * 1000 - now, 60 * 60 * 1000);
  return ms > 0 ? ms : undefined;
}

/**
 * x-rate-limit-reset is a Unix time in seconds; Retry-After is seconds. Capped
 * at an hour like rateWaitMs: an odd header must not stall the queue for days.
 */
export function retryAfterMs(headers: Headers, now = Date.now()): number | undefined {
  const cap = 60 * 60 * 1000;
  const reset = Number(headers.get("x-rate-limit-reset"));
  if (reset > 0) return Math.min(Math.max(5_000, reset * 1000 - now), cap);
  const after = Number(headers.get("retry-after"));
  return after > 0 ? Math.min(after * 1000, cap) : undefined;
}

// ---- putting it together, in the x.com tab ----

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

// a hung request would hold up the whole queue
export const TIMEOUT_MS = 15_000;

/**
 * The lookup the queue calls. `pageFetch` must send the request as the x.com
 * page would (same origin, the user's cookies): plain fetch in Chrome's
 * content scripts, content.fetch in Firefox's.
 */
export function createLookup(pageFetch: Fetch, doc: Document = document, origin: () => string = () => location.origin) {
  // Discovery runs once per page load, and "nothing found" is kept too:
  // rescanning X's bundles after every rejected request was an endless loop.
  let found: Promise<string | null> | null = null;
  const failed = new Set<string>();
  const getText = async (url: string) => (await pageFetch(url, { credentials: "omit", cache: "force-cache", signal: AbortSignal.timeout(TIMEOUT_MS) })).text();

  return async function fetchRegion(handle: string): Promise<FetchResult> {
    const csrf = csrfFrom(doc.cookie);
    if (!csrf) return { ok: false, status: 401, skipped: true }; // not logged in
    found ??= discoverQueryId(doc, getText).catch(() => null);
    let last: FetchResult = { ok: false };
    // a stale query id (400/404): try the next one; once all have failed, nothing more is sent
    for (let qid = nextQueryId(await found, failed); qid; qid = nextQueryId(await found, failed)) {
      const { url, init } = buildRequest(origin(), qid, handle, csrf);
      const res = await pageFetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
      const waitMs = rateWaitMs(res.headers);
      const hint = waitMs ? { waitMs } : {};
      if (res.status === 429) return { ok: false, status: 429, retryAfterMs: retryAfterMs(res.headers) };
      if (res.status === 400 || res.status === 404) {
        failed.add(qid);
        last = { ok: false, status: res.status, ...hint };
        continue;
      }
      if (!res.ok) return { ok: false, status: res.status, ...hint };
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        return { ok: false, status: res.status, ...hint }; // e.g. a login page instead of JSON
      }
      return { ...parseRegion(json), ...hint };
    }
    return last;
  };
}
