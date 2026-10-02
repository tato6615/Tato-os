import test from "node:test";
import assert from "node:assert/strict";
import { makeD1, seedLegacy } from "./d1-shim.mjs";
import { _test } from "../shared/schema.js";
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
