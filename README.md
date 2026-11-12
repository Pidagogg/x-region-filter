# Region Filter for X

A browser extension for Chrome and Firefox. It hides posts on x.com from accounts based in the regions you choose, based on what X shows in **About this account → Account based in**.

- Pick countries, broad areas (like "Western Europe") or whole regions. A whole region also covers the broad areas X shows for accounts that don't show their country.
- Matching posts collapse to a slim bar ("Hidden: account based in … · Show · Always show @handle"), or are removed completely. You choose.
- If the region can't be looked up, the post stays visible. An option also hides accounts whose region X doesn't show (off by default).
- Nothing is picked at first, and the extension does nothing until you pick something.

It says nothing about who is behind an account. It only uses the value X itself shows.

## How the lookup works, and its limits

X has no public API for this. The extension uses **X's internal endpoint** (the same GraphQL query X's web app uses for "About this account") from your x.com tab, **with your own X session**. So:

- It works only while you're logged in to X.
- **Your data never leaves your browser, except for requests to x.com itself**: one request per account, asking for that account's region. The extension also reads X's own script files (abs.twimg.com, already loaded by the X page) to find the current query id.
- **X may change this endpoint at any time, or rate-limit it.** The extension asks for one account at a time, with a pause between requests and a longer pause when X says "too many requests", and only for posts near the screen. Each answer is cached on your device for 30 days (1 day if X showed no region).
- Everything X-specific is in `src/x-api.ts`. What still has to be verified in a real browser is listed in `docs/x-api-notes.md`.

## Privacy

Nothing is collected or tracked. There are no analytics, no remote config and no remote code. The only network requests go to X. Your settings, the region cache (handle → region and date) and a local counter of hidden posts are stored in your browser and are never sent anywhere. Full text: `PRIVACY.md`.

## Build

```bash
npm install
npm test          # regions, the hide rule, cache, queue, response parsing, query-id discovery
npm run build     # → dist/chrome, dist/firefox
npm run zip       # also the store zips and x-region-filter-source-<v>.zip for AMO
npm run icons     # only when scripts/icon.svg changes (needs Chrome)
```

To load it unpacked:
- **Chrome:** `chrome://extensions` → Developer mode → Load unpacked → `dist/chrome`.
- **Firefox:** `about:debugging` → This Firefox → Load Temporary Add-on → `dist/firefox/manifest.json`.

## Code

- `src/content.ts`: finds posts on x.com, asks for regions, collapses or removes posts.
- `src/x-api.ts`: everything about X's endpoint (see above).
- `src/queue.ts`: one request at a time, dedupe, backoff on 429.
- `src/guard.ts`: limits shared by all tabs through storage: 300 lookups per hour, wait when X's rate limit runs low, 30-minute pause after 3 failures in a row.
- `src/cache.ts`: handle → region cache with TTLs and a cap.
- `src/regions.ts`: countries and broad areas grouped by region, and how X's strings are matched.
- `src/settings.ts`: the settings and the hide rule.
- `src/popup.ts`, `static/`: the popup. `src/i18n.ts`: English and Russian.

The popup has one small, dismissible link to W flow, a workflow automation tool by the same developer.
