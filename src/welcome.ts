// ==== Welcome page ====
// Opened once, right after install (background.ts), so the extension doesn't
// sit there doing nothing until the user finds the popup: three short steps,
// one-click picks for whole regions, and the W flow card. Picks are saved the
// same way as in the popup.
import { lang, promoUrl, regionName, t } from "./i18n.ts";
import { REGIONS, regionState, toggleRegion } from "./regions.ts";
import type { Settings } from "./settings.ts";
import { getSettings, updateSettings, watchSettings } from "./store.ts";

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const app = document.getElementById("app")!;
let s: Settings;

function step(n: number, title: string, text: string, ...extra: HTMLElement[]) {
  const card = el("section", "rf-card");
  card.append(el("span", "rf-step-n", String(n)), el("b", undefined, title), el("p", undefined, text), ...extra);
  return card;
}

function render() {
  const selected = new Set(s.selected);
  const chips = el("div", "rf-chips");
  for (const r of REGIONS) {
    const state = regionState(r, selected);
    const b = el("button", "rf-chip", regionName(r.id));
    b.type = "button";
    b.setAttribute("aria-pressed", state === "all" ? "true" : state === "some" ? "mixed" : "false");
    b.addEventListener("click", async () => {
      s = await updateSettings((cur) => ({ selected: toggleRegion(r, cur.selected, regionState(r, new Set(cur.selected)) !== "all") }));
      render();
    });
    chips.append(b);
  }
  const picked = el("p", "rf-hint", s.selected.length ? t.selected(s.selected.length) : t.selectedNone);

  const openX = el("a", "rf-cta", t.openX);
  openX.href = "https://x.com/home";
  openX.target = "_blank";
  openX.rel = "noopener";

  const promo = el("div", "rf-promo");
  const link = el("a");
  link.href = promoUrl("welcome");
  link.target = "_blank";
  link.rel = "noopener";
  link.append(el("b", undefined, t.promoTitle), el("br"), t.promo);
  promo.append(link);

  app.replaceChildren(
    el("h1", undefined, t.welcomeTitle),
    el("p", "rf-lead", t.welcomeLead),
    step(1, t.step1Title, t.step1, chips, picked),
    step(2, t.step2Title, t.step2, openX),
    step(3, t.step3Title, t.step3),
    promo,
    el("p", "rf-note", t.privacy)
  );
}

(async () => {
  document.documentElement.lang = lang;
  document.title = t.welcomeTitle;
  s = await getSettings();
  // the popup may be open at the same time
  watchSettings((next) => {
    s = next;
    render();
  });
  render();
})();
