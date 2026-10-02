import test from "node:test";
import assert from "node:assert/strict";
import { makeD1, seedLegacy } from "./d1-shim.mjs";
import { _test } from "../shared/schema.js";
import * as leadAdmin from "../functions/api/lead-admin.js";
import * as lead from "../functions/api/lead.js";

const ORIGIN = "https://t.example";
let ipn = 0;
function fresh() { _test.reset(); const DB = makeD1(); seedLegacy(DB); return { DB, env: { DB, ADMIN_PASSWORD: "x" } }; }
const req = (method, body, ip) => new Request(ORIGIN + "/api/lead", { method, headers: { "content-type": "application/json", "cf-connecting-ip": ip || "7.7.7." + (++ipn) }, body: body ? JSON.stringify(body) : undefined });
const good = (o = {}) => ({ name: "สมหญิง ใจดี", phone: "081 234 5678", stage: "opening_soon", shop_name: "ร้านทดสอบ", menu: "ลาเต้", machine: "2 หัวกรุ๊ป", kg_week: "2 กก.", consent: true, src: "walkin", ...o });
const post = (env, body, ip) => lead.onRequestPost({ request: req("POST", body, ip), env });

test("valid lead is stored with consent, source and normalized phone", async () => {
  const { DB, env } = fresh();
  const r = await post(env, good());
  assert.equal(r.status, 200);
  const row = DB.raw.prepare("SELECT * FROM leads").get();
  assert.equal(row.phone, "0812345678"); assert.equal(row.src, "walkin"); assert.equal(row.stage, "opening_soon");
  assert.equal(row.is_test, 0); assert.ok(row.consent_at); assert.ok(row.ip_hash);
});

test("invalid phone, stage or missing consent are rejected with field messages", async () => {
  const { DB, env } = fresh();
  for (const bad of [{ phone: "123" }, { stage: "x" }, { consent: false }, { name: "" }]) {
    const r = await post(env, good(bad)); assert.equal(r.status, 400);
    assert.ok(Object.keys((await r.json()).fields).length >= 1);
  }
  assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM leads").get().n, 0);
});

test("honeypot is rejected and nothing is stored", async () => {
  const { DB, env } = fresh();
  assert.equal((await post(env, good({ website: "http://spam" }))).status, 400);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM leads").get().n, 0);
});

test("per-IP rate limit kicks in on the 6th attempt", async () => {
  const { env } = fresh(); const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await post(env, good(), "5.5.5.5")).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
});

test("GET hides test leads by default and lists real ones", async () => {
  const { env } = fresh();
  await post(env, good({ name: "ลูกค้า จริง" })); await post(env, good({ name: "ทดสอบ ระบบ", is_test: true }));
  const g = await lead.onRequestGet({ request: new Request(ORIGIN + "/api/lead"), env });
  const d = await g.json(); assert.equal(d.leads.length, 1); assert.equal(d.leads[0].name, "ลูกค้า จริง");
});

// ---- admin: mark as test / delete (HQ buttons) ----
const adm = (method, path, body, hdr = { "x-requested-with": "tato-hq" }) => new Request(ORIGIN + path, { method, headers: { "content-type": "application/json", ...hdr }, body: body ? JSON.stringify(body) : undefined });
async function oneLead(env) { await post(env, good()); return env.DB.raw.prepare("SELECT id FROM leads").get().id; }

test("PATCH marks a lead as test (hidden from default list) and can unmark it", async () => {
  const { env } = fresh(); const id = await oneLead(env);
  assert.equal((await leadAdmin.onRequestPatch({ request: adm("PATCH", "/api/lead", { id, is_test: true }), env })).status, 200);
  assert.equal((await (await lead.onRequestGet({ request: new Request(ORIGIN + "/api/lead"), env })).json()).leads.length, 0);
  assert.equal((await (await lead.onRequestGet({ request: new Request(ORIGIN + "/api/lead?include_test=1"), env })).json()).leads.length, 1);
  assert.equal((await leadAdmin.onRequestPatch({ request: adm("PATCH", "/api/lead", { id, is_test: false }), env })).status, 200);
  assert.equal((await (await lead.onRequestGet({ request: new Request(ORIGIN + "/api/lead"), env })).json()).leads.length, 1);
});
test("DELETE removes exactly one lead; others stay", async () => {
  const { DB, env } = fresh(); await post(env, good({ name: "คนที่หนึ่ง" })); await post(env, good({ name: "คนที่สอง" }));
  const id = DB.raw.prepare("SELECT id FROM leads WHERE name='คนที่หนึ่ง'").get().id;
  const r = await leadAdmin.onRequestDelete({ request: adm("DELETE", "/api/lead?id=" + id), env });
  assert.equal(r.status, 200);
  assert.deepEqual(DB.raw.prepare("SELECT name FROM leads").all().map((x) => x.name), ["คนที่สอง"]);
  assert.equal((await leadAdmin.onRequestDelete({ request: adm("DELETE", "/api/lead?id=" + id), env })).status, 404);
});
test("DELETE/PATCH need the HQ header and a well-formed id (no wildcard deletes)", async () => {
  const { DB, env } = fresh(); const id = await oneLead(env);
  assert.equal((await leadAdmin.onRequestDelete({ request: adm("DELETE", "/api/lead?id=" + id, null, {}), env })).status, 403);
  assert.equal((await leadAdmin.onRequestPatch({ request: adm("PATCH", "/api/lead", { id, is_test: true }, {}), env })).status, 403);
  for (const bad of ["", "%", "lead_%", "x' OR '1'='1", "lead_zzzz"]) assert.equal((await leadAdmin.onRequestDelete({ request: adm("DELETE", "/api/lead?id=" + encodeURIComponent(bad)), env })).status, 400);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM leads").get().n, 1);
});
test("new lead still triggers owner notification (LINE) with the lead's details", async () => {
  const { env } = fresh(); const sent = []; const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o) => { sent.push({ u: String(u), body: o && o.body }); return new Response("{}"); };
  try {
    const jobs = []; const r = await lead.onRequestPost({ request: req("POST", good({ name: "ร้านลาเต้" })), env: { ...env, LINE_CHANNEL_TOKEN: "t", LINE_OWNER_USER_ID: "U1" }, waitUntil: (p) => jobs.push(p) });
    await Promise.all(jobs); assert.equal(r.status, 200);
  } finally { globalThis.fetch = realFetch; }
  const line = sent.find((s) => s.u === "https://api.line.me/v2/bot/message/push");
  assert.ok(line, "LINE push was sent"); assert.match(line.body, /ร้านลาเต้/); assert.match(line.body, /0812345678/);
});