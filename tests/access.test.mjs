import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { _test } from "../shared/access.js";
import { onRequest } from "../functions/_middleware.js";
import * as publicConfig from "../functions/api/public-config.js";

const TEAM = "myteam.cloudflareaccess.com", AUD = "aud123", KID = "k1";
const b64u = (b) => Buffer.from(b).toString("base64url");
const kp = await webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await webcrypto.subtle.exportKey("jwk", kp.publicKey)), kid: KID, alg: "RS256", use: "sig" };
async function sign(payload, { kid = KID, key = kp.privateKey } = {}) {
  const h = b64u(JSON.stringify({ alg: "RS256", kid })), p = b64u(JSON.stringify(payload));
  const sig = await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(h + "." + p));
  return h + "." + p + "." + b64u(Buffer.from(sig));
}
const now = () => Math.floor(Date.now() / 1000);
const good = (o = {}) => ({ iss: "https://" + TEAM, aud: [AUD], exp: now() + 600, email: "owner@example.com", sub: "u1", ...o });
const realFetch = globalThis.fetch;
function mockCerts() { globalThis.fetch = async (u) => { assert.equal(String(u), "https://" + TEAM + "/cdn-cgi/access/certs"); return new Response(JSON.stringify({ keys: [jwk] })); }; }
const ctx = (path, { method = "GET", headers = {}, env = {} } = {}) => ({ request: new Request("https://t.example" + path, { method, headers }), env, next: async () => new Response("NEXT") });
const basic = (pw) => ({ authorization: "Basic " + Buffer.from("admin:" + pw).toString("base64") });
const ENV = { ADMIN_PASSWORD: "pw", ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };

test.beforeEach(() => { _test.reset(); mockCerts(); });
test.after(() => { globalThis.fetch = realFetch; });

test("valid Access token (header) passes", async () => {
  const r = await onRequest(ctx("/api/lead", { env: ENV, headers: { "cf-access-jwt-assertion": await sign(good()) } }));
  assert.equal(await r.text(), "NEXT");
});
test("valid Access token (CF_Authorization cookie) passes", async () => {
  const r = await onRequest(ctx("/api/lead", { env: ENV, headers: { cookie: "a=b; CF_Authorization=" + await sign(good()) } }));
  assert.equal(await r.text(), "NEXT");
});
test("expired, wrong audience, wrong issuer, wrong key, unknown kid are all rejected", async () => {
  const other = await webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const bad = [
    await sign(good({ exp: now() - 5 })),
    await sign(good({ aud: ["other"] })),
    await sign(good({ iss: "https://evil.example" })),
    await sign(good(), { key: other.privateKey }),
    await sign(good(), { kid: "nope" }),
    "not.a.jwt", ""
  ];
  for (const t of bad) {
    const r = await onRequest(ctx("/api/lead", { env: ENV, headers: { "cf-access-jwt-assertion": t } }));
    assert.equal(r.status, 401, "should reject: " + t.slice(0, 20));
  }
});
test("Basic password still works as fallback while Access is on", async () => {
  assert.equal(await (await onRequest(ctx("/api/lead", { env: ENV, headers: basic("pw") }))).text(), "NEXT");
  assert.equal((await onRequest(ctx("/api/lead", { env: ENV, headers: basic("wrong") }))).status, 401);
});
test("ADMIN_BASIC_DISABLED=1 turns the password off once Access is configured", async () => {
  const env = { ...ENV, ADMIN_BASIC_DISABLED: "1" };
  assert.equal((await onRequest(ctx("/api/lead", { env, headers: basic("pw") }))).status, 403);
  assert.equal(await (await onRequest(ctx("/api/lead", { env, headers: { "cf-access-jwt-assertion": await sign(good()) } }))).text(), "NEXT");
});
test("ADMIN_BASIC_DISABLED alone (Access not configured) does NOT lock the owner out", async () => {
  const env = { ADMIN_PASSWORD: "pw", ADMIN_BASIC_DISABLED: "1" };
  assert.equal(await (await onRequest(ctx("/api/lead", { env, headers: basic("pw") }))).text(), "NEXT");
});
test("without any Access env, behaviour is unchanged (Basic only; 503 if no password)", async () => {
  assert.equal(await (await onRequest(ctx("/api/lead", { env: { ADMIN_PASSWORD: "pw" }, headers: basic("pw") }))).text(), "NEXT");
  assert.equal((await onRequest(ctx("/api/lead", { env: { ADMIN_PASSWORD: "pw" } }))).status, 401);
  assert.equal((await onRequest(ctx("/api/lead", { env: {} }))).status, 503);
});
test("public routes stay public; admin-only methods stay protected", async () => {
  assert.equal(await (await onRequest(ctx("/api/lead", { method: "POST", env: ENV }))).text(), "NEXT");
  assert.equal(await (await onRequest(ctx("/api/public-config", { env: ENV }))).text(), "NEXT");
  for (const m of ["GET", "DELETE", "PATCH"]) assert.equal((await onRequest(ctx("/api/lead", { method: m, env: ENV }))).status, 401);
});
test("public-config exposes the Turnstile site key only when both keys are set, never the secret", async () => {
  const a = await (await publicConfig.onRequestGet({ env: { TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET: "sec" } })).text();
  assert.deepEqual(JSON.parse(a), { turnstile_site_key: "site", line_oa: "" }); assert.ok(!a.includes("sec\""));
  assert.deepEqual(JSON.parse(await (await publicConfig.onRequestGet({ env: { TURNSTILE_SITE_KEY: "site" } })).text()), { turnstile_site_key: "", line_oa: "" });
});
test("public-config exposes a well-formed LINE OA id and drops anything else", async () => {
  const get = async (v) => JSON.parse(await (await publicConfig.onRequestGet({ env: { PAYMENT_LINE_OA: v } })).text()).line_oa;
  assert.equal(await get("@abc123xy"), "@abc123xy");
  assert.equal(await get("  @abc123xy "), "@abc123xy");
  assert.equal(await get("bad value<script>"), "");
  assert.equal(await get(undefined), "");
});