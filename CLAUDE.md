# Region Filter for X: working notes for Claude

Chrome + Firefox MV3 extension that hides x.com posts from accounts based in regions the user picks. Plain TypeScript, esbuild via `build.mjs` (same layout as City Compare). Read `README.md` and `PLAN.md` first.

## Commands
- `npm test`: unit tests (`node --experimental-strip-types --test tests/*.test.ts`). Modules under test must not import `webextension-polyfill`; keep the logic in `regions.ts`, `settings.ts`, `cache.ts`, `queue.ts`, `x-api.ts`. No TS parameter properties or enums (strip-only mode).
- `npm run build`: typecheck, then `dist/chrome` and `dist/firefox`. `npm run zip` also writes the store zips and the AMO source zip.
- `npx web-ext lint -s dist/firefox`: AMO's checks.

## Rules
- Privacy promise: nothing collected or tracked; the only network requests go to X. No analytics, remote config or remote code, and no new permissions or hosts without asking.
- Everything about X's endpoint goes in `src/x-api.ts`; markup selectors stay at the top of `src/content.ts`. Never `eval` or inject X's downloaded code.
- Fail open: a post is never hidden because of a failed lookup.
- Wording: "hide", never "ban"; no claims about bots or influence; "based on what X shows in About this account".
- UI text in English and Russian (`src/i18n.ts`, manifest strings in `build.mjs`).
- The W flow link keeps `utm_source=x-region-filter` (`src/links.ts`). The extension is not branded "by W flow".
- Don't commit, push or publish unless the user asks.
