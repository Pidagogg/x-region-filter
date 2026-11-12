# X lookup: what is unverified and how to check it

Everything X-specific lives in `src/x-api.ts` (the request, query-id discovery and parsing) and in the "X markup" section at the top of `src/content.ts` (the selectors). **None of it has been tested against the real x.com.** It was written without a logged-in X account, from what is publicly known about X's web client. Check the items below before publishing.

## How to look

1. Log in to x.com in Chrome and open DevTools → Network, filter `graphql`.
2. Open any profile, click the join date (or the "…" menu) → **About this account**.
3. Find the request whose URL contains `/i/api/graphql/<id>/AboutAccountQuery` (or whatever it is really called).

## Checklist

| # | What | Expected in the code | Where |
|---|---|---|---|
| 1 | Operation name | `AboutAccountQuery` | `OPERATION` |
| 2 | URL form | `https://x.com/i/api/graphql/<queryId>/AboutAccountQuery?variables=…`, GET | `buildRequest` |
| 3 | Variables | `{"screenName":"<handle>"}` only. If X also sends `features` or `fieldToggles`, copy them into `buildRequest` | `buildRequest` |
| 4 | Headers | `authorization: Bearer <public web token>`, `x-csrf-token` = the `ct0` cookie, `x-twitter-auth-type: OAuth2Session`, `x-twitter-active-user: yes`. Compare the bearer token with the one in the real request | `WEB_BEARER`, `buildRequest` |
| 5 | Current query id | Compare with `FALLBACK_QUERY_ID`; update it if different | `FALLBACK_QUERY_ID` |
| 6 | Query-id discovery | In DevTools → Sources, search X's JS for `AboutAccountQuery`. Is it in `abs.twimg.com/responsive-web/client-web/main.*.js` or a lazy chunk, and does the text look like `queryId:"…",operationName:"AboutAccountQuery"`? | `extractQueryId`, `scriptUrls` |
| 7 | Can a content script read those files? | The script files are fetched from `abs.twimg.com` with the page's CORS. In the console of the x.com tab: `fetch(document.querySelector('script[src*="main."]').src).then(r => r.status)`. If CORS blocks it, discovery falls back to request URLs already in `performance` and then to the constant | `discoverQueryId` |
| 8 | Response path | Expected `data.user_result_by_screen_name.result.about_profile.account_based_in` = `"Germany"`. Copy a real response (anonymised) into `tests/x-api.test.ts` | `parseRegion` |
| 9 | Value strings | What X shows for countries and for accounts that only show a broad area. Are the broad areas really "Western Europe", "East Asia", "South Asia", …? Add the real strings to `src/regions.ts` | `REGIONS` |
| 10 | An account with no region | Does the field go missing, become `null` or an empty string? All three count as unknown | `parseRegion` |
| 11 | Rate limit | Status code (429?) and headers (`x-rate-limit-limit`, `x-rate-limit-remaining`, `x-rate-limit-reset`) of this endpoint. How many lookups per 15 min? When `remaining` drops under 10 every tab waits for the reset; on top of that there is a budget of 300 lookups per rolling hour and a 30-minute pause after 3 failures in a row (`src/guard.ts`). Adjust those and `gap`/`backoff` in `src/queue.ts` if the real limit is lower | `rateWaitMs`, `retryAfterMs`, `queue.ts`, `guard.ts` |
| 12 | Same-origin fetch from the content script | Chrome: plain `fetch` from the content script should go out with the x.com cookies. Firefox: the code uses `content.fetch`. Check both in the Network tab (the request should look like X's own) | `content.ts` (`pageFetch`) |
| 13 | twitter.com | Does twitter.com still redirect to x.com? The API URL uses the tab's own origin | `buildRequest` |
| 14 | Markup | `article[data-testid="tweet"]`, `[data-testid="User-Name"]` with an `a[href="/handle"]`, quoted posts in a `div[role="link"]`, rows in `[data-testid="cellInnerDiv"]` | `content.ts` |

## Things that may become required

- **`x-client-transaction-id` header.** X's web client sends this header, generated in its own JavaScript, on many API requests. Today the lookup works without it. If X starts to require it, the symptom is 400/403/404 on every lookup: the extension then pauses lookups for 30 minutes after 3 failures and leaves all posts visible. Do not generate this header: that would mean reproducing or running X's code, which the extension doesn't do. Treat it as "X closed the door" and update the store texts instead.

## Hand test

1. Load `dist/chrome` unpacked, log in to X, open the popup and pick one country you see often in your feed.
2. Scroll the home timeline. Matching posts should turn into "Hidden: account based in …" bars within a few seconds. Network should show at most one `AboutAccountQuery` request per new account, roughly every half second.
3. Click **Show** (one post opens), then **Always show @handle** (all that account's posts open, and it appears under "Always shown" in the popup).
4. Switch to **Remove completely**: the bars disappear with their posts. Switch the filter off: everything comes back.
5. Reload: posts from accounts seen before are hidden at once without new requests (the cache).
6. Log out: nothing is hidden and no lookups are sent (no `ct0` cookie).
