// Storage and runtime through webextension-polyfill, so Chrome and Firefox
// share one code path.
import browser from "webextension-polyfill";
import type { KV } from "./kv.ts";

export const kv: KV = {
  get: (keys) => browser.storage.local.get(keys),
  set: (items) => browser.storage.local.set(items),
  remove: (keys) => browser.storage.local.remove(keys),
  onChanged: (cb) =>
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === "local") cb(changes);
    }),
};

export const isFirefox = () => browser.runtime.getURL("").startsWith("moz-extension:");
