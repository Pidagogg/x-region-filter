// Region and country mapping, broad areas, the whole-region switch, and the hide rule.
import assert from "node:assert/strict";
import { test } from "node:test";
import { areaKey, countryKey, keyFor, normalize, REGIONS, regionState, toggleKey, toggleRegion } from "../src/regions.ts";
import { decide, DEFAULTS, normalizeSettings, type Settings } from "../src/settings.ts";

const europe = REGIONS.find((r) => r.id === "europe")!;
const asia = REGIONS.find((r) => r.id === "asia")!;
const settings = (p: Partial<Settings>): Settings => ({ ...DEFAULTS, ...p });
const known = (region: string) => ({ status: "known" as const, region });

test("X values map to country or broad-area keys, tolerant of spelling", () => {
  assert.equal(keyFor("Germany"), "c:DE");
  assert.equal(keyFor("  united states of america "), "c:US");
  assert.equal(keyFor("Bosnia & Herzegovina"), "c:BA");
  assert.equal(keyFor("Türkiye"), "c:TR");
  assert.equal(keyFor("Cote d’Ivoire"), "c:CI");
  assert.equal(keyFor("The Bahamas"), "c:BS");
  assert.equal(keyFor("Western Europe"), "a:western europe");
  assert.equal(keyFor("East Asia"), "a:east asia");
  assert.equal(keyFor("Narnia"), null);
  assert.equal(normalize("Latin America & the Caribbean"), normalize("Latin America and the Caribbean"));
});

test("no key belongs to two regions", () => {
  const seen = new Set<string>();
  for (const r of REGIONS)
    for (const k of [...r.countries.map((c) => countryKey(c.code)), ...r.areas.map(areaKey)]) {
      assert.ok(!seen.has(k), k);
      seen.add(k);
    }
});

test("the whole-region switch picks every country and broad area, and clears only its own", () => {
  let sel = toggleRegion(europe, ["c:JP"], true);
  assert.equal(regionState(europe, new Set(sel)), "all");
  assert.ok(sel.includes("c:FR") && sel.includes("a:western europe") && sel.includes("c:JP"));
  // picking Europe hides an account X only shows as a broad area
  assert.deepEqual(decide("a", known("Western Europe"), settings({ selected: sel })), { hide: true, region: "Western Europe" });
  sel = toggleKey(sel, "c:FR", false);
  assert.equal(regionState(europe, new Set(sel)), "some");
  sel = toggleRegion(europe, sel, false);
  assert.deepEqual(sel, ["c:JP"]);
  assert.equal(regionState(asia, new Set(sel)), "some");
});

test("one country picked does not hide its broad area, and vice versa", () => {
  const s = settings({ selected: ["c:DE"] });
  assert.equal(decide("a", known("Germany"), s).hide, true);
  assert.equal(decide("a", known("Western Europe"), s).hide, false);
  assert.equal(decide("a", known("Germany"), settings({ selected: ["a:western europe"] })).hide, false);
});

test("rule: off, exceptions, pending, errors and unknown regions", () => {
  const s = settings({ selected: ["c:DE"] });
  assert.equal(decide("a", known("Germany"), { ...s, enabled: false }).hide, false);
  assert.equal(decide("Alice", known("Germany"), { ...s, allow: ["alice"] }).hide, false);
  assert.equal(decide("a", undefined, s).hide, false);
  assert.equal(decide("a", { status: "error" }, { ...s, hideUnknown: true }).hide, false, "fail open");
  assert.equal(decide("a", { status: "unknown" }, s).hide, false);
  assert.deepEqual(decide("a", { status: "unknown" }, { ...s, hideUnknown: true }), { hide: true, region: null });
  assert.equal(decide("a", known("France"), s).hide, false);
  assert.equal(decide("a", known("Narnia"), s).hide, false);
});

test("settings from storage are cleaned up, nothing is picked by default", () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULTS);
  assert.deepEqual(DEFAULTS.selected, []);
  assert.equal(DEFAULTS.hideUnknown, false);
  assert.deepEqual(normalizeSettings({ mode: "nuke", selected: ["c:DE", 3], allow: ["Bob"], enabled: "yes" }), { ...DEFAULTS, selected: ["c:DE"], allow: ["bob"] });
});

test("picker search keeps non-Latin letters so Russian queries filter", () => {
  const hit = (name: string, query: string) => normalize(name).includes(normalize(query));
  assert.equal(normalize("нов"), "нов");
  assert.ok(hit("Новая Зеландия", "нов"));
  assert.ok(!hit("Германия", "нов"));
  assert.ok(hit("New Zealand", "new"));
  assert.ok(!hit("Germany", "new"));
  assert.equal(normalize("Ёлка"), "елка");
  assert.equal(normalize("Türkiye"), "turkiye");
  assert.equal(normalize(""), "");
  assert.ok(hit("Germany", ""));
});
