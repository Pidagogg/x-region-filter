// Which UI language a browser language gets.
import assert from "node:assert/strict";
import { test } from "node:test";
import { pickLang } from "../src/i18n.ts";

test("Russian only for Russian browsers", () => {
  for (const l of ["ru", "ru-RU", "RU-ru"]) assert.equal(pickLang(l), "ru", l);
});

test("Ukrainian, Belarusian, Kazakh and everything else get English", () => {
  for (const l of ["uk", "uk-UA", "be", "be-BY", "kk", "kk-KZ", "en-US", "de", "rue", "", undefined]) assert.equal(pickLang(l), "en", String(l));
});
