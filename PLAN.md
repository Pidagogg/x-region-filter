# Region Filter for X: plan

Written 2026-11-12. Status: 0.1.0 built and unit-tested; the X lookup is unverified (needs a logged-in browser, see `docs/x-api-notes.md`). Nothing published.

## What it is
A Chrome and Firefox extension that hides posts on x.com from accounts whose "About this account → Account based in" is in regions the user picked. A free side project; its popup links to W flow (`utm_source=x-region-filter`). Not branded "by W flow".

## Decisions (2026-11-12)
- **x.com and twitter.com only.** Permissions: `storage` and those two hosts. No analytics, remote config or remote code. Firefox: `data_collection_permissions: none`.
- **Blocklist only.** Countries grouped under regions, plus X's broad areas ("Western Europe", "East Asia"…). A whole-region switch picks all its countries and areas. Nothing pre-ticked. Search box.
- **Action:** collapse to a bar (default) or remove completely. Quoted posts from a matching account always get the bar.
- **Fail open:** unknown or failed lookups leave the post visible. "Also hide accounts with unknown region" is optional, off by default. Lookup failures never hide anything, even with that option on.
- **Exceptions:** "Always show @handle" from the bar; listed and removable in the popup.
- **Lookup:** X's internal GraphQL query with the user's session, all in `src/x-api.ts`. The query id is discovered from X's own JS (read, never run) with a fallback constant.
- **Rate:** one lookup per handle, one at a time, 400–800 ms apart, exponential backoff on 429 (honours `x-rate-limit-reset`), only posts within about a screen of the viewport, and none at all while nothing is picked.
- **Cache:** storage.local, handle → {region, fetchedAt}; 30 days known, 1 day unknown, capped at 5000; memory layer in front.
- **Wording:** "hide", never "ban". No claims about bots or influence; always "based on what X shows in About this account".

## Next
1. Verify the X lookup in a logged-in browser (`docs/x-api-notes.md`), fix `src/x-api.ts`, add a real (anonymised) response as a test fixture.
2. Hand test on the home timeline, a profile, a post with replies, and quoted posts.
3. Screenshots and store listings (drafts in `progs/marketing/x-region-filter/`), then submit to the Chrome Web Store and AMO.

## Risks
- X changes the endpoint, the query id or the markup. Everything X-specific is in two places (`src/x-api.ts`, the top of `src/content.ts`).
- X rate-limits the user's account. The queue is slow on purpose; if X's limit is low, slow it further.
- Store review: the Chrome Web Store may ask about using X's internal API. The listing says plainly what it does.
