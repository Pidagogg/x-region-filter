// Build Region Filter for X for Chrome and Firefox from one code base.
//   node build.mjs          → dist/chrome, dist/firefox
//   node build.mjs --watch  → rebuild on change
//   node build.mjs --zip    → also x-region-filter-<browser>-<version>.zip for the stores
//                             and x-region-filter-source-<version>.zip for AMO's reviewers
// The bundles are not minified, so reviewers can read them and rebuild them
// exactly from the source zip.
import { build, context } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const watch = process.argv.includes("--watch");
const zip = process.argv.includes("--zip");

// X only. The extension needs no other site, not even for its own UI.
const SITES = ["https://x.com/*", "https://twitter.com/*"];

function manifest(target) {
  const m = {
    manifest_version: 3,
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",
    default_locale: "en",
    version: pkg.version,
    icons: { 16: "icons/16.png", 32: "icons/32.png", 48: "icons/48.png", 128: "icons/128.png" },
    action: { default_popup: "popup.html", default_icon: { 16: "icons/16.png", 32: "icons/32.png", 48: "icons/48.png" } },
    permissions: ["storage"],
    host_permissions: SITES,
    content_scripts: [{ matches: SITES, js: ["content.js"], css: ["tokens.css", "content.css"], run_at: "document_idle" }],
  };
  // the background only opens the welcome page after install: a service worker
  // in Chrome, an event page in Firefox (which has no MV3 service workers)
  m.background = target === "chrome" ? { service_worker: "background.js" } : { scripts: ["background.js"] };
  // the styles use CSS light-dark(), which Chrome has from 123 (Firefox's minimum below is already past it)
  if (target === "chrome") m.minimum_chrome_version = "123";
  if (target === "firefox") {
    m.browser_specific_settings = {
      gecko: { id: "x-region-filter@w-flow.tech", strict_min_version: "140.0", data_collection_permissions: { required: ["none"] } },
      gecko_android: { strict_min_version: "142.0" },
    };
  }
  return m;
}

const LOCALES = {
  en: { extName: "Region Filter for X", extDescription: "Hide posts on X from accounts based in the regions you choose, using what X shows in About this account." },
  ru: { extName: "Region Filter for X", extDescription: "Скрывайте посты в X от аккаунтов из выбранных регионов — по данным X в разделе «Об этом аккаунте»." },
};

function writeStatic(out, target) {
  fs.mkdirSync(out, { recursive: true });
  fs.cpSync("static", out, { recursive: true });
  for (const [lang, msgs] of Object.entries(LOCALES)) {
    fs.mkdirSync(path.join(out, "_locales", lang), { recursive: true });
    fs.writeFileSync(path.join(out, "_locales", lang, "messages.json"), JSON.stringify(Object.fromEntries(Object.entries(msgs).map(([k, v]) => [k, { message: v }])), null, 2));
  }
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest(target), null, 2));
}

const BROWSER_TARGETS = { chrome: "chrome110", firefox: "firefox115" };
for (const target of ["chrome", "firefox"]) {
  const out = path.join("dist", target);
  fs.rmSync(out, { recursive: true, force: true });
  writeStatic(out, target);
  const options = {
    entryPoints: { content: "src/content.ts", popup: "src/popup.ts", welcome: "src/welcome.ts", background: "src/background.ts" },
    outdir: out,
    bundle: true,
    format: "iife",
    target: BROWSER_TARGETS[target],
    minify: false,
    sourcemap: false,
    logLevel: "warning",
  };
  if (watch) await (await context(options)).watch();
  else await build(options);
}

// not Compress-Archive: Windows PowerShell writes "icons\128.png", which
// addons.mozilla.org rejects; the bundled bsdtar writes "icons/128.png"
// (Git Bash's own tar is GNU tar and can't write zips)
function zipDir(file, dir, entries) {
  fs.rmSync(file, { force: true });
  if (process.platform === "win32") execFileSync(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe"), ["-a", "-cf", file, "-C", dir, ...entries]);
  else execFileSync("zip", ["-qr", file, ...entries], { cwd: dir });
  console.log("wrote", path.basename(file));
}

if (zip && !watch) {
  for (const target of ["chrome", "firefox"]) {
    const dir = path.resolve("dist", target);
    zipDir(path.resolve(`x-region-filter-${target}-${pkg.version}.zip`), dir, fs.readdirSync(dir));
  }
  const source = ["src", "static", "scripts", "tests", "docs", "build.mjs", "package.json", "package-lock.json", "tsconfig.json", "README.md", "LICENSE"].filter((f) => fs.existsSync(f));
  zipDir(path.resolve(`x-region-filter-source-${pkg.version}.zip`), path.resolve("."), source);
}
console.log(watch ? "watching…" : "built dist/chrome and dist/firefox");
