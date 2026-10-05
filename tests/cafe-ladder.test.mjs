import test from "node:test";
import assert from "node:assert/strict";
import { makeD1, seedLegacy } from "./d1-shim.mjs";
import { _test } from "../shared/schema.js";
import * as lead from "../functions/api/lead.js";
import * as leadAdmin from "../functions/api/lead-admin.js";
import * as reorder from "../functions/api/cafe-reorder.js";

const ORIGIN = "https://t.example";
let ipn = 0;
function fresh(extra = {}) { _test.reset(); const DB = makeD1(); seedLegacy(DB); return { DB, env: { DB, ADMIN_PASSWORD: "x", ...extra } }; }
const req = (body) => new Request(ORIGIN + "/api/lead", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "9.9.9." + (++ipn) }, body: JSON.stringify(body) });
const base = (o = {}) => ({ name: "สมหญิง ใจดี", phone: "081 234 5678", stage: "opening_soon", consent: true, ...o });
const withSample = (o = {}) => base({ shop_name: "ร้านทดสอบ", kg_week: "2 กก.", sample: true, sample_address: "99/9 ถนนนิมมาน ต.สุเทพ อ.เมือง เชียงใหม่", sample_postal: "50200", ...o });
const post = (env, b) => lead.onRequestPost({ request: req(b), env });
const adm = (method, path, body) => new Request(ORIGIN + path, { method, headers: { "content-type": "application/json", "x-requested-with": "tato-hq" }, body: body ? JSON.stringify(body) : undefined });

test("checklist lead is stored with kind and calculator numbers (whitelisted)", async () => {
  const { DB, env } = fresh();
  const r = await post(env, base({ kind: "checklist", calc: { price: 60, grams: 18, cost_cup: 12.3, profit_month: 25000, evil: "x" } }));
  assert.equal(r.status, 200);
  const row = DB.raw.prepare("SELECT kind,sample_requested,calc_json FROM leads").get();
  assert.equal(row.kind, "checklist"); assert.equal(row.sample_requested, 0);
  assert.deepEqual(JSON.parse(row.calc_json), { price: 60, grams: 18, cost_cup: 12.3, profit_month: 25000 });
});

test("sample request needs shop name, usage, address and postal code", async () => {
  const { DB, env } = fresh();
  const r = await post(env, base({ sample: true }));
  assert.equal(r.status, 400);
  const f = (await r.json()).fields;
  for (const k of ["shop_name", "kg", "sample_address", "sample_postal"]) assert.ok(f[k], k);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM leads").get().n, 0);
});

test("valid sample request is queued with default 100 g and address stored", async () => {
  const { DB, env } = fresh();
  const d = await (await post(env, withSample())).json();
  assert.equal(d.sample, "queued"); assert.equal(d.sample_grams, 100);
  const row = DB.raw.prepare("SELECT sample_requested,sample_grams,sample_status,sample_postal FROM leads").get();
  assert.deepEqual({ ...row }, { sample_requested: 1, sample_grams: 100, sample_status: "to_send", sample_postal: "50200" });
});

test("same phone cannot get a second sample; lead is still saved", async () => {
  const { DB, env } = fresh();
  await post(env, withSample());
  const d = await (await post(env, withSample())).json();
  assert.equal(d.sample, "already");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM leads").get().n, 2);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM leads WHERE sample_requested=1").get().n, 1);
});

test("weekly sample quota (SAMPLE_WEEKLY_LIMIT) turns extra requests into plain leads", async () => {
  const { DB, env } = fresh({ SAMPLE_WEEKLY_LIMIT: "2", SAMPLE_GRAMS: "250" });
  const out = [];
  for (let i = 0; i < 3; i++) out.push(await (await post(env, withSample({ phone: "08123456" + (10 + i) }))).json());
  assert.deepEqual(out.map((x) => x.sample), ["queued", "queued", "full"]);
  assert.equal(out[0].sample_grams, 250);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM leads").get().n, 3);
});

test("test leads do not consume the sample quota", async () => {
  const { env } = fresh({ SAMPLE_WEEKLY_LIMIT: "1" });
  await post(env, withSample({ is_test: true }));
  assert.equal((await (await post(env, withSample({ phone: "0899345671" }))).json()).sample, "queued");
});

test("HQ can mark a sample as sent; non-sample leads are not touched", async () => {
  const { DB, env } = fresh();
  await post(env, withSample()); await post(env, base({ phone: "0822345678" }));
  const sid = DB.raw.prepare("SELECT id FROM leads WHERE sample_requested=1").get().id;
  const pid = DB.raw.prepare("SELECT id FROM leads WHERE sample_requested=0").get().id;
  assert.equal((await leadAdmin.onRequestPatch({ request: adm("PATCH", "/api/lead-admin", { id: sid, sample_status: "sent" }), env })).status, 200);
  assert.equal(DB.raw.prepare("SELECT sample_status s FROM leads WHERE id=?").get(sid).s, "sent");
  assert.equal((await leadAdmin.onRequestPatch({ request: adm("PATCH", "/api/lead-admin", { id: pid, sample_status: "sent" }), env })).status, 404);
});

test("parseKgWeek reads numbers and ranges", () => {
  assert.equal(reorder.parseKgWeek("2-3 กก."), 2.5); assert.equal(reorder.parseKgWeek("5"), 5); assert.equal(reorder.parseKgWeek("ไม่แน่ใจ"), null);
});

test("estimateReorder: history beats lead guess; lead guess beats default", () => {
  const D = 86400000, t0 = Date.parse("2026-09-01T00:00:00Z");
  const h = reorder.estimateReorder([{ kg: 5, at: t0 }, { kg: 5, at: t0 + 10 * D }], 1, t0 + 12 * D);
  assert.equal(h.basis, "history"); assert.equal(h.interval_days, 10); assert.equal(h.state, "ok");
  const l = reorder.estimateReorder([{ kg: 4, at: t0 }], 2, t0 + 15 * D);
  assert.equal(l.basis, "lead_kg_week"); assert.equal(l.interval_days, 14); assert.equal(l.state, "due");
  const d = reorder.estimateReorder([{ kg: 4, at: t0 }], null, t0 + 12 * D);
  assert.equal(d.basis, "default"); assert.equal(d.state, "soon");
});

test("GET /api/cafe-reorder lists only paid, real orders from phones that are real leads", async () => {
  const { DB, env } = fresh();
  await post(env, withSample({ kg_week: "2 กก." }));
  const old = new Date(Date.now() - 20 * 86400000).toISOString();
  const mk = (id, status, test, phone) => {
    DB.raw.prepare("INSERT INTO orders (id,customer_id,total_kg,status,created_at,is_test) VALUES (?,?,?,?,?,?)").run(id, "c1", 4, status, old, test);
    DB.raw.prepare("INSERT INTO order_details (order_id,name,phone,created_at) VALUES (?,?,?,?)").run(id, "สมหญิง", phone, old);
  };
  mk("o1", "paid", 0, "0812345678"); mk("o2", "pending", 0, "0812345678"); mk("o3", "paid", 1, "0812345678"); mk("o4", "paid", 0, "0877345678");
  const d = await (await reorder.onRequestGet({ request: new Request(ORIGIN + "/api/cafe-reorder"), env })).json();
  assert.equal(d.cafes.length, 1);
  assert.equal(d.cafes[0].orders, 1); assert.equal(d.cafes[0].state, "due"); assert.equal(d.cafes[0].basis, "lead_kg_week");
  assert.match(d.cafes[0].message, /ร้านทดสอบ/);
});

test("referral code: admin header required, creates a one-use fixed code, unknown phone 404", async () => {
  const { DB, env } = fresh({ REFERRAL_DISCOUNT: "80" });
  await post(env, base());
  const noHdr = new Request(ORIGIN + "/api/cafe-reorder", { method: "POST", body: JSON.stringify({ phone: "0812345678" }) });
  assert.equal((await reorder.onRequestPost({ request: noHdr, env })).status, 403);
  assert.equal((await reorder.onRequestPost({ request: adm("POST", "/api/cafe-reorder", { phone: "0800345001" }), env })).status, 404);
  const r = await reorder.onRequestPost({ request: adm("POST", "/api/cafe-reorder", { phone: "0812345678" }), env });
  assert.equal(r.status, 200);
  const d = await r.json();
  const row = DB.raw.prepare("SELECT * FROM discount_codes WHERE code=?").get(d.code);
  assert.equal(row.type, "fixed"); assert.equal(row.value, 80); assert.equal(row.max_uses, 1); assert.equal(row.min_kg, 1);
  assert.match(d.code, /^REF-[A-Z0-9]{4}$/);
});
