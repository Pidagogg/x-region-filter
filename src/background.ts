// ==== Background ====
// Only opens the welcome page once, on a fresh install (not on updates or
// browser restarts). It reads and sends nothing.
import browser from "webextension-polyfill";

browser.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") void browser.tabs.create({ url: browser.runtime.getURL("welcome.html") });
});
