// Which of X's three themes the page is in, read from its background colour.
import assert from "node:assert/strict";
import { test } from "node:test";
import { themeFromBackground } from "../src/theme.ts";

test("X's light, dim and lights-out backgrounds map to the three bar themes", () => {
  assert.equal(themeFromBackground("rgb(255, 255, 255)"), "light");
  assert.equal(themeFromBackground("rgb(21, 32, 43)"), "dim");
  assert.equal(themeFromBackground("rgb(0, 0, 0)"), "dark");
  assert.equal(themeFromBackground("rgba(247, 249, 249, 1)"), "light");
});

test("a background that says nothing falls back to the system preference", () => {
  assert.equal(themeFromBackground("rgba(0, 0, 0, 0)", true), "dark");
  assert.equal(themeFromBackground("transparent", false), "light");
  assert.equal(themeFromBackground("", true), "dark");
});
