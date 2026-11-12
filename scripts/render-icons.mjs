// Renders scripts/icon.svg to static/icons/<size>.png with headless Chrome,
// in a throwaway profile. Run it only when the icon changes: npm run icons
// (CHROME=<path to chrome.exe> if Chrome is somewhere else).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const chrome = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const svg = fs.readFileSync("scripts/icon.svg", "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xrf-icons-"));
fs.mkdirSync("static/icons", { recursive: true });
try {
  for (const size of [16, 32, 48, 128]) {
    const html = path.join(tmp, `${size}.html`);
    fs.writeFileSync(html, `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    const out = path.resolve("static/icons", `${size}.png`);
    execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${path.join(tmp, "profile")}`, "--default-background-color=00000000", `--window-size=${size},${size}`, `--screenshot=${out}`, pathToFileURL(html).href], { stdio: "ignore" });
    console.log("wrote", out);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
