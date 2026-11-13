// ==== Content script on x.com ====
// Finds posts as X renders them, looks up where each author is based (only
// for posts near the screen, through the queue and the cache), and collapses
// or removes the ones the user's picks match. X's markup is not an API either:
// the selectors are kept together in the "X markup" section below.
import { trimOldest } from "./bounded.ts";
import { RegionCache } from "./cache.ts";
import { placeName, t } from "./i18n.ts";
import { createQueue } from "./queue.ts";
import { decide, type Decision, type Lookup, type Settings } from "./settings.ts";
import { createRetryPolicy } from "./retry.ts";
import { addHidden, allowHandle, cacheStore, getSettings, lookupGuard, watchSettings } from "./store.ts";
import { themeFromBackground, type Theme } from "./theme.ts";
import { createLookup } from "./x-api.ts";

// ---- X markup ----

const POST = 'article[data-testid="tweet"]';
const AUTHOR = '[data-testid="User-Name"]';
const CELL = '[data-testid="cellInnerDiv"]';
const HANDLE_HREF = /^\/([A-Za-z0-9_]{1,15})\/?$/;
// the post's own link is the one around its time stamp
const STATUS_LINK = 'a[href*="/status/"]';
const STATUS_HREF = /^\/[A-Za-z0-9_]{1,15}\/status\/(\d+)/;

function handleIn(nameBox: Element): string | null {
  for (const a of Array.from(nameBox.querySelectorAll("a[href]"))) {
    const m = HANDLE_HREF.exec(a.getAttribute("href") || "");
    if (m) return m[1].toLowerCase();
  }
  return null;
}

interface Target {
  el: HTMLElement;
  handle: string;
}

/** The post's author, and the quoted post's author when there is one. */
function targets(post: HTMLElement): { main: Target | null; quoted: Target | null } {
  const boxes = Array.from(post.querySelectorAll(AUTHOR)).filter((b) => b.closest(POST) === post);
  const mainHandle = boxes[0] ? handleIn(boxes[0]) : null;
  let quoted: Target | null = null;
  // a quoted post sits in a role=link block of its own inside the post
  const qBox = boxes.slice(1).find((b) => b.closest('div[role="link"]'));
  const qEl = qBox?.closest<HTMLElement>('div[role="link"]');
  const qHandle = qBox && handleIn(qBox);
  if (qEl && qHandle && post.contains(qEl) && !qEl.contains(boxes[0])) quoted = { el: qEl, handle: qHandle };
  return { main: mainHandle ? { el: post, handle: mainHandle } : null, quoted };
}

/** The status id of a post or quoted post, if X links it; the first time stamp is its own. */
function statusId(el: HTMLElement): string | null {
  for (const a of Array.from(el.querySelectorAll(STATUS_LINK))) {
    if (!a.querySelector("time")) continue;
    const m = STATUS_HREF.exec(a.getAttribute("href") || "");
    if (m) return m[1];
  }
  return null;
}

// ---- state ----

// a tab can stay open for days; per-page memory is capped
const MAX_REMEMBERED = 5000;

let settings: Settings | null = null;
const results = new Map<string, Lookup>();
const cache = new RegionCache(cacheStore);
// Firefox: content.fetch sends the request as the page does (same origin, cookies)
const pageFetch: typeof fetch = (globalThis as { content?: { fetch?: typeof fetch } }).content?.fetch?.bind((globalThis as { content?: unknown }).content) ?? fetch.bind(globalThis);
const queue = createQueue({ fetchRegion: createLookup(pageFetch), gate: lookupGuard });
const revealed = new WeakSet<HTMLElement>();
// a post counts once however often X re-renders it; posts without a status link fall back to the element
const counted = new Set<string>();
const countedEls = new WeakSet<HTMLElement>();
// what apply() last did to an element, so unchanged ones aren't rebuilt on every DOM change
const applied = new WeakMap<HTMLElement, string>();
const tracked = new Map<HTMLElement, { main: Target | null; quoted: Target | null }>();
let newlyHidden = 0;
let countTimer: ReturnType<typeof setTimeout> | null = null;

// ---- lookups ----

// handles asked, or being asked; a failed one leaves it and waits for the retry policy
const asked = new Set<string>();
const retry = createRetryPolicy();

function remember(handle: string, res: Lookup) {
  results.delete(handle);
  results.set(handle, res);
  for (const h of results.keys()) {
    if (results.size <= MAX_REMEMBERED) break;
    results.delete(h);
    // forgotten answers may be asked again (usually a cache hit)
    asked.delete(h);
  }
}

async function request(handle: string) {
  if (asked.has(handle) || !retry.canAsk(handle)) return;
  asked.add(handle);
  trimOldest(asked, MAX_REMEMBERED);
  const hit = await cache.get(handle);
  let res: Lookup;
  if (hit) res = hit.region === null ? { status: "unknown" } : { status: "known", region: hit.region };
  else {
    res = await queue.lookup(handle);
    // failures are not stored: the post stays visible, and it is asked again later
    if (res.status === "error") {
      asked.delete(handle);
      retry.failed(handle);
      scheduleRetry();
    } else {
      retry.succeeded(handle);
      await cache.set(handle, res.status === "known" ? res.region : null);
      // X answers again: failed handles may be due sooner
      rearm();
    }
  }
  remember(handle, res);
  applyAll();
}

/** Watch posts with a due handle again: those near the screen are asked at once, the rest when they come near. */
function rearm() {
  if (!needsLookups()) return;
  const due = new Set(retry.due());
  if (!due.size) return;
  for (const [post, tg] of tracked)
    if ((tg.main && due.has(tg.main.handle)) || (tg.quoted && due.has(tg.quoted.handle))) {
      near.unobserve(post);
      near.observe(post);
    }
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRetry() {
  const at = retry.nextAt();
  if (at === null) return;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    rearm();
    scheduleRetry();
  }, Math.max(0, at - Date.now()) + 1000);
}

// ---- hiding ----

function countHidden(el: HTMLElement) {
  const id = statusId(el);
  if (id) {
    if (counted.has(id)) return;
    counted.add(id);
    trimOldest(counted, MAX_REMEMBERED);
  } else {
    if (countedEls.has(el)) return;
    countedEls.add(el);
  }
  newlyHidden++;
  countTimer ??= setTimeout(() => {
    countTimer = null;
    const n = newlyHidden;
    newlyHidden = 0;
    void addHidden(n);
  }, 3000);
}

// ---- X's theme ----

// X picks light, dim or lights out itself and paints it as the body background;
// the bars follow that, not the system setting. Read once, then only when X
// restyles the body, so making a bar costs no style lookup.
let theme: Theme | null = null;
const THEMES: Theme[] = ["light", "dim", "dark"];

function readTheme(): Theme {
  return themeFromBackground(document.body ? getComputedStyle(document.body).backgroundColor : "", matchMedia("(prefers-color-scheme: dark)").matches);
}

function paint(bar: Element, th: Theme) {
  for (const name of THEMES) bar.classList.toggle(`xrf-${name}`, name === th);
}

function watchTheme() {
  const update = () => {
    const next = readTheme();
    if (next === theme) return;
    theme = next;
    for (const bar of Array.from(document.querySelectorAll(".xrf-bar"))) paint(bar, next);
  };
  if (document.body) new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ["style", "class"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", update);
}

function makeBar(target: Target, d: Extract<Decision, { hide: true }>): HTMLElement {
  const bar = document.createElement("div");
  // xrf-glass carries the shared tokens (tokens.css)
  bar.className = "xrf-bar xrf-glass";
  paint(bar, (theme ??= readTheme()));
  const text = document.createElement("span");
  text.textContent = d.region ? t.barHidden(placeName(d.region)) : t.barUnknown;
  const button = (label: string, onClick: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", (e) => {
      // the post itself is a link; a click on the bar must not open it
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  };
  bar.append(
    text,
    button(t.show, () => {
      revealed.add(target.el);
      apply(target, { hide: false });
    }),
    button(t.alwaysShow(target.handle), () => {
      void allowHandle(target.handle);
    })
  );
  // clicks anywhere on the bar stay on the bar
  bar.addEventListener("click", (e) => e.stopPropagation());
  return bar;
}

const ownBar = (el: HTMLElement) => Array.from(el.children).find((c) => c.classList.contains("xrf-bar"));

/** Is the element still as apply() left it? X may have re-rendered it or reused its cell. */
function inPlace(el: HTMLElement, cell: HTMLElement | null, kind: string): boolean {
  const bar = !!ownBar(el);
  const collapsed = el.classList.contains("xrf-collapsed");
  const removed = (cell || el).classList.contains("xrf-removed");
  if (kind === "show") return !bar && !collapsed && !removed;
  if (kind === "remove") return removed && !bar && !collapsed;
  return bar && collapsed && !removed;
}

function apply(target: Target, d: Decision) {
  const el = target.el;
  const isPost = el.matches(POST);
  const cell = isPost ? el.closest<HTMLElement>(CELL) : null;
  const kind = !d.hide || revealed.has(el) || !settings ? "show" : settings.mode === "remove" && isPost ? "remove" : "bar";
  const sig = kind === "show" ? kind : `${kind}|${target.handle}|${d.hide ? d.region : ""}`;
  if (applied.get(el) === sig && inPlace(el, cell, kind)) return;
  applied.set(el, sig);
  ownBar(el)?.remove();
  el.classList.remove("xrf-collapsed", "xrf-removed");
  cell?.classList.remove("xrf-removed");
  if (!d.hide || revealed.has(el) || !settings) return;
  countHidden(el);
  // a quoted post is never removed silently: it always gets the bar
  if (settings.mode === "remove" && isPost) {
    (cell || el).classList.add("xrf-removed");
    return;
  }
  el.classList.add("xrf-collapsed");
  el.append(makeBar(target, d));
}

function applyPost(post: HTMLElement) {
  const tg = tracked.get(post);
  if (!tg || !settings) return;
  const mainDecision: Decision = tg.main ? decide(tg.main.handle, results.get(tg.main.handle), settings) : { hide: false };
  if (tg.main) apply(tg.main, mainDecision);
  // when the whole post is hidden, its quote goes with it
  if (tg.quoted) apply(tg.quoted, mainDecision.hide ? { hide: false } : decide(tg.quoted.handle, results.get(tg.quoted.handle), settings));
}

function applyAll() {
  for (const [post] of tracked) {
    if (!post.isConnected) tracked.delete(post);
    else applyPost(post);
  }
}

// ---- finding posts ----

// with nothing picked no post can match, so no request is spent on X's rate limit
const needsLookups = () => !!settings?.enabled && (settings.selected.length > 0 || settings.hideUnknown);
const wanted = (h: string) => !settings?.allow.includes(h);

const near = new IntersectionObserver(
  (entries) => {
    if (!needsLookups()) return;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const tg = tracked.get(e.target as HTMLElement);
      if (tg?.main && wanted(tg.main.handle)) void request(tg.main.handle);
      if (tg?.quoted && wanted(tg.quoted.handle)) void request(tg.quoted.handle);
      near.unobserve(e.target);
    }
  },
  // a screen or so ahead, so a post is usually decided before it scrolls in
  { rootMargin: "1200px 0px" }
);

function scan() {
  if (!settings?.enabled) return;
  for (const post of Array.from(document.querySelectorAll<HTMLElement>(POST))) {
    const tg = targets(post);
    const old = tracked.get(post);
    // X may reuse an element for another post: compare who it is now
    if (old && old.main?.handle === tg.main?.handle && old.quoted?.handle === tg.quoted?.handle) continue;
    tracked.set(post, tg);
    if (old) revealed.delete(post);
    near.observe(post);
    applyPost(post);
  }
  // a reused cell may still carry our class without one of our hidden posts in it
  for (const cell of Array.from(document.querySelectorAll<HTMLElement>(`${CELL}.xrf-removed`))) {
    const post = cell.querySelector<HTMLElement>(POST);
    if (!post || !tracked.has(post)) cell.classList.remove("xrf-removed");
  }
}

let scheduled = false;
const schedule = () => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    scan();
  });
};

(async () => {
  settings = await getSettings();
  watchSettings((s) => {
    settings = s;
    if (s.enabled) schedule();
    applyAll();
    // posts seen while nothing was picked get their lookups now (observe again fires at once)
    if (needsLookups())
      for (const [post] of tracked) {
        near.unobserve(post);
        near.observe(post);
      }
  });
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
  watchTheme();
  addEventListener("pagehide", () => void cache.flush());
})();
