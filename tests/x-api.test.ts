// The X-specific parts that can be tested without X: query-id discovery from
// fake bundle text, response parsing, the request and the rate-limit headers.
// These are fakes shaped like what we expect; the real X is unverified.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRequest, createLookup, csrfFrom, extractQueryId, FALLBACK_QUERY_ID, nextQueryId, parseRegion, rateWaitMs, retryAfterMs, scriptUrls } from "../src/x-api.ts";

test("finds the query id in bundle text in either order and in a request URL", () => {
  const bundle = `e.exports={queryId:"Ab12Cd34Ef56Gh78",operationName:"UserByScreenName",operationType:"query"},n.exports={queryId:"XRqGa7EeokUU5kppkh13EA",operationName:"AboutAccountQuery",operationType:"query",metadata:{featureSwitches:[]}}`;
  assert.equal(extractQueryId(bundle), "XRqGa7EeokUU5kppkh13EA");
  assert.equal(extractQueryId(`{operationName:'AboutAccountQuery',operationType:"query",queryId:'zz_99-yyXXwwVV'}`), "zz_99-yyXXwwVV");
  assert.equal(extractQueryId("https://x.com/i/api/graphql/Qq1Ww2Ee3Rr4/AboutAccountQuery?variables=%7B%7D"), "Qq1Ww2Ee3Rr4");
  assert.equal(extractQueryId(`{queryId:"abcdefghij",operationName:"AboutAccountQueryV2"}`), null);
  assert.equal(extractQueryId("nothing here"), null);
});

test("only X's own client bundles are read, main first", () => {
  const doc = { scripts: [{ src: "https://abs.twimg.com/responsive-web/client-web/vendor.1.js" }, { src: "https://evil.example/main.js" }, { src: "" }] } as unknown as Document;
  const urls = scriptUrls(doc, [
    { name: "https://abs.twimg.com/responsive-web/client-web/main.abc.js", initiatorType: "script" },
    { name: "https://x.com/i/api/graphql/x/y", initiatorType: "fetch" },
  ]);
  assert.deepEqual(urls, ["https://abs.twimg.com/responsive-web/client-web/main.abc.js", "https://abs.twimg.com/responsive-web/client-web/vendor.1.js"]);
});

test("parses the expected shape and tolerant variants", () => {
  const expected = { data: { user_result_by_screen_name: { result: { about_profile: { account_based_in: "Germany", source: "Germany App Store" } } } } };
  assert.deepEqual(parseRegion(expected), { ok: true, region: "Germany" });
  assert.deepEqual(parseRegion({ data: { user: { result: { aboutProfile: { accountBasedIn: { name: "Japan" } } } } } }), { ok: true, region: "Japan" });
  assert.deepEqual(parseRegion({ data: { x: { about_profile: { country: "Brazil" } } } }), { ok: true, region: "Brazil" });
  assert.deepEqual(parseRegion({ data: { deep: [{ account_based_in: " Western Europe " }] } }), { ok: true, region: "Western Europe" });
  // a "country" outside the about object is not trusted
  assert.deepEqual(parseRegion({ data: { user: { legacy: { country: "France" }, about_profile: { username_changes: { count: "0" } } } } }), { ok: true, region: null });
  assert.deepEqual(parseRegion({ errors: [{ message: "Rate limit" }] }), { ok: false });
  assert.deepEqual(parseRegion(null), { ok: false });
});

test("only an about object without a region means 'X shows none'; anything else is an error", () => {
  // no user result, no about object: we don't know, so never cached and never hidden
  assert.deepEqual(parseRegion({ data: { user_result_by_screen_name: {} } }), { ok: false });
  assert.deepEqual(parseRegion({ data: { user_result_by_screen_name: { result: { __typename: "User" } } } }), { ok: false });
  // errors next to data: not trusted either
  assert.deepEqual(parseRegion({ data: { user_result_by_screen_name: { result: { about_profile: {} } } }, errors: [{ message: "Timeout" }] }), { ok: false });
  assert.deepEqual(parseRegion({ data: { user_result_by_screen_name: { result: { about_profile: { source: "x" } } } } }), { ok: true, region: null });
});

test("the request carries the session headers and only the handle", () => {
  const { url, init } = buildRequest("https://x.com", "QID123456", "alice", "tok");
  assert.equal(url, "https://x.com/i/api/graphql/QID123456/AboutAccountQuery?variables=%7B%22screenName%22%3A%22alice%22%7D");
  const h = init.headers as Record<string, string>;
  assert.equal(h["x-csrf-token"], "tok");
  assert.match(h.authorization, /^Bearer /);
  assert.equal(init.credentials, "include");
  assert.equal(csrfFrom("guest_id=1; ct0=abc%3D; lang=en"), "abc=");
  assert.equal(csrfFrom("guest_id=1"), null);
});

test("rate-limit headers become a pause", () => {
  const now = 1_000_000_000_000;
  assert.equal(retryAfterMs(new Headers({ "x-rate-limit-reset": String(now / 1000 + 120) }), now), 120_000);
  assert.equal(retryAfterMs(new Headers({ "retry-after": "30" }), now), 30_000);
  assert.equal(retryAfterMs(new Headers(), now), undefined);
});

test("x-rate-limit-remaining under 10 means wait until x-rate-limit-reset", () => {
  const now = 1_000_000_000_000;
  const reset = String(now / 1000 + 300);
  assert.equal(rateWaitMs(new Headers({ "x-rate-limit-remaining": "9", "x-rate-limit-reset": reset }), now), 300_000);
  assert.equal(rateWaitMs(new Headers({ "x-rate-limit-remaining": "0", "x-rate-limit-reset": reset }), now), 300_000);
  assert.equal(rateWaitMs(new Headers({ "x-rate-limit-remaining": "10", "x-rate-limit-reset": reset }), now), undefined);
  assert.equal(rateWaitMs(new Headers({ "x-rate-limit-reset": reset }), now), undefined);
  assert.equal(rateWaitMs(new Headers({ "x-rate-limit-remaining": "3", "x-rate-limit-reset": String(now / 1000 - 5) }), now), undefined, "a reset in the past");
});

test("the fallback id is not offered once it has failed", () => {
  assert.equal(nextQueryId("found123", new Set()), "found123");
  assert.equal(nextQueryId("found123", new Set(["found123"])), FALLBACK_QUERY_ID);
  assert.equal(nextQueryId(null, new Set()), FALLBACK_QUERY_ID);
  assert.equal(nextQueryId(null, new Set([FALLBACK_QUERY_ID])), null);
  assert.equal(nextQueryId("found123", new Set(["found123", FALLBACK_QUERY_ID])), null);
});

// ---- the lookup against a fake X ----

const BUNDLE = "https://abs.twimg.com/responsive-web/client-web/main.abc.js";

function fakeX(answer: (url: string) => Response, bundleText = `{queryId:"Disc0vered1d",operationName:"AboutAccountQuery"}`) {
  const graphql: string[] = [];
  let bundles = 0;
  const inits: RequestInit[] = [];
  const pageFetch = async (url: string, init?: RequestInit) => {
    inits.push(init ?? {});
    if (url === BUNDLE) {
      bundles++;
      return new Response(bundleText);
    }
    graphql.push(url);
    return answer(url);
  };
  const doc = { scripts: [{ src: BUNDLE }], cookie: "ct0=tok" } as unknown as Document;
  const lookup = createLookup(pageFetch, doc, () => "https://x.com");
  return { lookup, graphql, inits, bundles: () => bundles };
}

const ok = (body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status: 200, headers });
const GOOD = { data: { user_result_by_screen_name: { result: { about_profile: { account_based_in: "Germany" } } } } };

test("when X rejects the query, discovery runs once and the dead ids are not asked again", async () => {
  const x = fakeX(() => new Response("bad", { status: 400 }));
  for (const h of ["a", "b", "c", "d", "e"]) assert.equal((await x.lookup(h)).ok, false);
  assert.equal(x.bundles(), 1, "X's bundles are scanned once per page load");
  assert.deepEqual(x.graphql.map((u) => u.split("/")[6]), ["Disc0vered1d", FALLBACK_QUERY_ID], "each id fails once, then nothing is sent");
});

test("'nothing found' is remembered too, and a dead fallback is not retried", async () => {
  const x = fakeX(() => new Response("gone", { status: 404 }), "no query ids in here");
  for (const h of ["a", "b", "c"]) assert.equal((await x.lookup(h)).ok, false);
  assert.equal(x.bundles(), 1);
  assert.equal(x.graphql.length, 1);
});

test("a stale discovered id falls back to the constant once, then keeps using what works", async () => {
  const x = fakeX((url) => (url.includes("Disc0vered1d") ? new Response("", { status: 400 }) : ok(GOOD)));
  assert.deepEqual(await x.lookup("a"), { ok: true, region: "Germany" });
  assert.deepEqual(await x.lookup("b"), { ok: true, region: "Germany" });
  assert.equal(x.graphql.length, 3);
});

test("401, 403 and a non-JSON body are failures without rediscovery", async () => {
  for (const res of [() => new Response("", { status: 401 }), () => new Response("", { status: 403 }), () => new Response("<html>login</html>", { status: 200 })]) {
    const x = fakeX(res);
    assert.equal((await x.lookup("a")).ok, false);
    assert.equal((await x.lookup("b")).ok, false);
    assert.equal(x.bundles(), 1);
    assert.equal(x.graphql.length, 2, "one request per lookup, no second id");
  }
});

test("every response passes X's rate-limit hint on, and both fetches time out", async () => {
  const reset = String(Math.floor(Date.now() / 1000) + 600);
  const x = fakeX(() => ok(GOOD, { "x-rate-limit-remaining": "4", "x-rate-limit-reset": reset }));
  const res = await x.lookup("a");
  assert.equal(res.ok, true);
  assert.ok(res.waitMs! > 590_000 && res.waitMs! <= 600_000);
  assert.equal(x.inits.length, 2);
  for (const init of x.inits) assert.ok(init.signal instanceof AbortSignal, "a hung request can't stall the queue");
});

test("not logged in: no request, and it does not count as X failing", async () => {
  let sent = 0;
  const doc = { scripts: [], cookie: "guest_id=1" } as unknown as Document;
  const lookup = createLookup(async () => (sent++, ok(GOOD)), doc, () => "https://x.com");
  assert.deepEqual(await lookup("a"), { ok: false, status: 401, skipped: true });
  assert.equal(sent, 0);
});
