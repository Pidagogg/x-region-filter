// ==== Toolbar popup ====
// On/off, how matching posts are hidden, the region picker, the always-shown
// accounts, a status line, a local counter and one dismissible W flow card.
// Every change is saved at once as a change to what is stored now (store-core.ts),
// so it can't undo a change an x.com tab made meanwhile; the tabs pick it up
// through storage.onChanged.
import browser from "webextension-polyfill";
import type { GuardState } from "./guard.ts";
import { areaName, clock, countryName, promoUrl, regionName, t } from "./i18n.ts";
import { isFirefox } from "./platform.ts";
import { areaKey, countryKey, normalize, REGIONS, regionState, toggleKey, toggleRegion, type Region } from "./regions.ts";
import type { Settings } from "./settings.ts";
import { deriveStatus, type Status } from "./status.ts";
import type { SettingsChange } from "./store-core.ts";
import { disallowHandle, getHidden, getLookupState, getSettings, updateSettings, watchHidden, watchLookupState, watchSettings } from "./store.ts";

const HOSTS = { origins: ["https://x.com/*", "https://twitter.com/*"] };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function checkbox(label: string, checked: boolean, onChange: (on: boolean) => void, cls = "rf-check") {
  const row = el("label", cls);
  const box = el("input");
  box.type = "checkbox";
  box.checked = checked;
  box.addEventListener("change", () => onChange(box.checked));
  row.append(box, el("span", undefined, label));
  return { row, box };
}

const app = document.getElementById("app")!;
let s: Settings;
const open = new Set<string>();
let query = "";

async function save(change: SettingsChange) {
  s = await updateSettings(change);
  render();
}

// ---- picker ----

function regionBlock(r: Region, selected: Set<string>) {
  const box = el("div", "rf-region");
  const head = el("div", "rf-region-head");
  const state = regionState(r, selected);
  const whole = checkbox(regionName(r.id), state === "all", (on) => save((cur) => ({ selected: toggleRegion(r, cur.selected, on) })), "rf-check rf-region-name");
  whole.box.indeterminate = state === "some";
  whole.box.title = t.wholeRegion;
  const n = [...r.countries.map((c) => countryKey(c.code)), ...r.areas.map(areaKey)].filter((k) => selected.has(k)).length;
  const more = el("button", "rf-expand", open.has(r.id) ? "▾" : "▸");
  more.type = "button";
  more.addEventListener("click", () => {
    if (open.has(r.id)) open.delete(r.id);
    else open.add(r.id);
    render();
  });
  head.append(whole.row, el("span", "rf-count", n ? String(n) : ""), more);
  box.append(head);
  if (open.has(r.id)) {
    const body = el("div", "rf-region-body");
    body.append(el("p", "rf-sub", t.areas));
    for (const a of r.areas) body.append(checkbox(areaName(a), selected.has(areaKey(a)), (on) => save((cur) => ({ selected: toggleKey(cur.selected, areaKey(a), on) }))).row);
    body.append(el("p", "rf-sub", t.countries));
    const sorted = [...r.countries].sort((a, b) => countryName(a).localeCompare(countryName(b)));
    for (const c of sorted) body.append(checkbox(countryName(c), selected.has(countryKey(c.code)), (on) => save((cur) => ({ selected: toggleKey(cur.selected, countryKey(c.code), on) }))).row);
    box.append(body);
  }
  return box;
}

function searchResults(selected: Set<string>) {
  const q = normalize(query);
  const list = el("div", "rf-region-body");
  for (const r of REGIONS) {
    for (const a of r.areas)
      if (normalize(a).includes(q) || normalize(areaName(a)).includes(q)) list.append(checkbox(areaName(a), selected.has(areaKey(a)), (on) => save((cur) => ({ selected: toggleKey(cur.selected, areaKey(a), on) }))).row);
    for (const c of r.countries)
      if ([c.name, ...c.aliases, countryName(c)].some((n) => normalize(n).includes(q)))
        list.append(checkbox(`${countryName(c)} · ${regionName(r.id)}`, selected.has(countryKey(c.code)), (on) => save((cur) => ({ selected: toggleKey(cur.selected, countryKey(c.code), on) }))).row);
  }
  if (!list.children.length) list.append(el("p", "rf-hint", t.noMatch));
  return list;
}

const pickerBox = el("div", "rf-picker");

function renderPicker() {
  const selected = new Set(s.selected);
  pickerBox.replaceChildren(...(query.trim() ? [searchResults(selected)] : REGIONS.map((r) => regionBlock(r, selected))));
}

// ---- the whole popup ----

const searchInput = el("input");
searchInput.type = "search";
searchInput.placeholder = t.search;
searchInput.addEventListener("input", () => {
  query = searchInput.value;
  renderPicker();
});

const counter = el("p", "rf-hint");

// ---- status line ----

const statusLine = el("p", "rf-status");
statusLine.setAttribute("role", "status");
let guard: GuardState | null = null;

function statusText(st: Status): string {
  switch (st.kind) {
    case "off": return t.statusOff;
    case "loggedOut": return t.statusLoggedOut;
    case "broken": return t.statusBroken;
    case "paused": return t.statusPaused(clock(st.until));
    case "hourly": return t.statusHourly(clock(st.until));
    case "active": return t.statusActive;
  }
}

function paintStatus() {
  if (!guard) return;
  const st = deriveStatus(s, guard, Date.now());
  statusLine.dataset.kind = st.kind;
  statusLine.textContent = statusText(st);
}
const grantBox = el("div");

function render() {
  const head = el("div", "rf-head");
  head.append(el("h1", undefined, t.name), checkbox(t.enabled, s.enabled, (on) => save({ enabled: on }), "rf-switch").row);

  const mode = el("div", "rf-card");
  mode.setAttribute("role", "radiogroup");
  mode.append(el("b", undefined, t.modeTitle));
  for (const [value, label] of [["collapse", t.modeCollapse], ["remove", t.modeRemove]] as const) {
    const row = el("label", "rf-check");
    const r = el("input");
    r.type = "radio";
    r.name = "mode";
    r.checked = s.mode === value;
    r.addEventListener("change", () => save({ mode: value }));
    row.append(r, el("span", undefined, label));
    mode.append(row);
  }
  mode.append(checkbox(t.hideUnknown, s.hideUnknown, (on) => save({ hideUnknown: on })).row);

  const pick = el("div", "rf-card");
  const pickHead = el("div", "rf-pick-head");
  pickHead.append(el("b", undefined, t.pickTitle));
  if (s.selected.length) {
    const clear = el("button", "rf-link", t.clear);
    clear.type = "button";
    clear.addEventListener("click", () => save({ selected: [] }));
    pickHead.append(el("span", "rf-count", t.selected(s.selected.length)), clear);
  }
  pick.append(pickHead, searchInput, pickerBox);
  if (!s.selected.length) pick.append(el("p", "rf-hint", t.selectedNone));
  renderPicker();

  paintStatus();
  const parts: HTMLElement[] = [head, statusLine, el("p", "rf-hint", t.tagline), grantBox, mode, pick];
  if (s.allow.length) {
    const allow = el("div", "rf-card");
    allow.append(el("b", undefined, t.allowTitle));
    const ul = el("ul", "rf-allow");
    for (const h of s.allow) {
      const li = el("li");
      const x = el("button", undefined, "×");
      x.type = "button";
      x.title = t.remove;
      x.addEventListener("click", async () => {
        s = await disallowHandle(h);
        render();
      });
      li.append(el("span", undefined, `@${h}`), x);
      ul.append(li);
    }
    allow.append(ul);
    parts.push(allow);
  }
  parts.push(counter, el("p", "rf-note", t.note));
  if (promo) parts.push(promo);
  // a tick in the list must not jump the list back to the top
  const focused = document.activeElement === searchInput;
  const listTop = pickerBox.scrollTop;
  const pageTop = document.scrollingElement?.scrollTop ?? 0;
  app.replaceChildren(...parts);
  pickerBox.scrollTop = listTop;
  if (document.scrollingElement) document.scrollingElement.scrollTop = pageTop;
  if (focused) searchInput.focus();
}

// one small, dismissible card, at the bottom, never in the way
let promo: HTMLElement | null = null;
function makePromo() {
  const card = el("div", "rf-promo");
  const link = el("a");
  link.href = promoUrl("popup");
  link.target = "_blank";
  link.rel = "noopener";
  link.append(el("b", undefined, t.promoTitle), el("br"), t.promo);
  const x = el("button", undefined, "×");
  x.type = "button";
  x.title = t.remove;
  x.addEventListener("click", () => {
    void browser.storage.local.set({ promoHidden: true });
    promo = null;
    card.remove();
  });
  card.append(link, x);
  return card;
}

// Firefox before 127 does not grant MV3 host permissions at install
async function checkGrant() {
  if (!isFirefox() || (await browser.permissions.contains(HOSTS))) return grantBox.replaceChildren();
  const b = el("button", "rf-button", t.grant);
  b.type = "button";
  b.addEventListener("click", async () => {
    if (await browser.permissions.request(HOSTS)) grantBox.replaceChildren();
  });
  grantBox.className = "rf-card";
  grantBox.replaceChildren(el("b", undefined, t.grantTitle), el("br"), b);
}

(async () => {
  s = await getSettings();
  const { promoHidden } = await browser.storage.local.get("promoHidden");
  if (!promoHidden) promo = makePromo();
  counter.textContent = t.hiddenCount(await getHidden());
  watchHidden((n) => (counter.textContent = t.hiddenCount(n)));
  guard = await getLookupState();
  watchLookupState((g) => {
    guard = g;
    paintStatus();
  });
  // a pause ends with time alone, without a storage change
  setInterval(paintStatus, 20_000);
  // an x.com tab may change the settings ("Always show") while the popup is open
  watchSettings((next) => {
    s = next;
    render();
  });
  render();
  await checkGrant();
})();
