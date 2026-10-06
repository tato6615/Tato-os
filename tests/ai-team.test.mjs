import test from "node:test";
import assert from "node:assert/strict";
import { makeD1, seedLegacy } from "./d1-shim.mjs";
import { _test } from "../shared/schema.js";
import * as lead from "../functions/api/lead.js";
import * as team from "../functions/api/ai-team.js";

const ORIGIN = "https://t.example";
let ipn = 0;
function fresh(extra = {}) { _test.reset(); const DB = makeD1(); seedLegacy(DB); return { DB, env: { DB, ADMIN_PASSWORD: "x", ...extra } }; }
const leadReq = (b) => new Request(ORIGIN + "/api/lead", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "8.8.8." + (++ipn) }, body: JSON.stringify(b) });
const hq = (b) => new Request(ORIGIN + "/api/ai-team", { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "tato-hq" }, body: JSON.stringify(b) });
const mkAI = (text = "ข้อเสนอ: ทัก L1 ก่อน") => { const calls = []; return { calls, run: async (model, input) => { calls.push({ model, input }); return { response: text }; } }; };

test("POST without the HQ header is refused", async () => {
  const { env } = fresh();
  const r = await team.onRequestPost({ request: new Request(ORIGIN + "/api/ai-team", { method: "POST", body: "{}" }), env });
  assert.equal(r.status, 403);
});

test("unknown agent -> 400", async () => {
  const { env } = fresh();
  const r = await team.onRequestPost({ request: hq({ agent: "nope" }), env });
  assert.equal(r.status, 400);
});

test("no real data: AI is NOT called (no guessing)", async () => {
  const AI = mkAI();
  const { env } = fresh({ AI });
  const r = await team.onRequestPost({ request: hq({ agent: "all" }), env });
  const j = await r.json();
  assert.equal(j.results.length, 8);
  assert.equal(j.results.find((x) => x.agent === "market").status, "NO_DATA");
  assert.equal(j.results.find((x) => x.agent === "data").status, "NO_DATA");
  // growth + research are allowed to run (they need no customer data)
  assert.ok(AI.calls.length <= 2);
});

test("without the AI binding every role still answers (RULES_ONLY)", async () => {
  const { env } = fresh();
  await lead.onRequestPost({ request: leadReq({ name: "สมชาย", phone: "0812345678", shop_name: "ร้านลับ", stage: "opening_soon", kg_week: "2", consent: true }), env });
  const r = await team.onRequestPost({ request: hq({ agent: "all" }), env });
  const j = await r.json();
  assert.equal(j.ai_bound, false);
  assert.equal(j.results.length, 8);
  for (const x of j.results) assert.ok(["RULES_ONLY", "NO_DATA"].includes(x.status), x.agent + " " + x.status);
  assert.ok(j.results.find((x) => x.agent === "automation").output.includes("lead"));
});

test("with AI bound: model sees refs only, never names or phones; refs are swapped back in the response", async () => {
  const AI = mkAI("แนะนำทัก L1 ก่อน");
  const { env } = fresh({ AI });
  await lead.onRequestPost({ request: leadReq({ name: "สมชาย ใจดี", phone: "0812345678", shop_name: "ร้านลับ", stage: "opening_soon", kg_week: "2", note: "โทรหาเมื่อไหร่ก็ได้", consent: true }), env });
  const r = await team.onRequestPost({ request: hq({ agent: "growth" }), env });
  const j = await r.json();
  const res = j.results[0];
  assert.equal(res.status, "AI_ANALYZED");
  assert.equal(AI.calls[0].model, "@cf/zai-org/glm-4.7-flash");
  const sent = JSON.stringify(AI.calls[0].input);
  assert.ok(!sent.includes("0812345678")); assert.ok(!sent.includes("สมชาย")); assert.ok(!sent.includes("ร้านลับ")); assert.ok(!sent.includes("โทรหา"));
  assert.ok(res.output.includes("ร้านลับ")); // swapped back for the admin only
});

test("AI failure falls back to the rule summary and is reported, not hidden", async () => {
  const AI = { run: async () => { throw new Error("boom"); } };
  const { env } = fresh({ AI });
  await lead.onRequestPost({ request: leadReq({ name: "สมหญิง ใจดี", phone: "0812345679", stage: "planning", consent: true }), env });
  const j = await (await team.onRequestPost({ request: hq({ agent: "market" }), env })).json();
  assert.equal(j.results[0].status, "AI_ERROR");
  assert.ok(j.results[0].output.length > 0);
});

test("cooldown returns the cached run instead of calling the AI again", async () => {
  const AI = mkAI();
  const { env } = fresh({ AI });
  await lead.onRequestPost({ request: leadReq({ name: "สมหญิง ใจดี", phone: "0812345670", stage: "planning", consent: true }), env });
  await team.onRequestPost({ request: hq({ agent: "market" }), env });
  const j = await (await team.onRequestPost({ request: hq({ agent: "market" }), env })).json();
  assert.equal(j.results[0].cached, true);
  assert.equal(AI.calls.length, 1);
});

test("GET lists all eight roles", async () => {
  const { env } = fresh();
  const j = await (await team.onRequestGet({ request: new Request(ORIGIN + "/api/ai-team"), env })).json();
  assert.equal(j.roles.length, 8);
});

test("cooldown cache is per language: switching th -> en re-runs and returns English", async () => {
  const AI = mkAI("- Insufficient data. Collect more leads and sessions before drawing conclusions.");
  const { env } = fresh({ AI });
  await lead.onRequestPost({ request: leadReq({ name: "สมหญิง ใจดี", phone: "0812345671", stage: "planning", consent: true }), env });
  await team.onRequestPost({ request: hq({ agent: "research", lang: "th" }), env });
  const j = await (await team.onRequestPost({ request: hq({ agent: "research", lang: "en" }), env })).json();
  assert.notEqual(j.results[0].cached, true);
  assert.ok(!/[\u0E00-\u0E7F]/.test(j.results[0].output), "English request returned Thai");
  const again = await (await team.onRequestPost({ request: hq({ agent: "research", lang: "en" }), env })).json();
  assert.equal(again.results[0].cached, true); // same language inside the cooldown is still cached
});

test("orders table with only `amount` (as in production) is still read", async () => {
  const { DB, env } = fresh();
  await DB.prepare("ALTER TABLE orders DROP COLUMN total_amount").run();
  await DB.prepare("INSERT INTO orders (id, amount, total_kg, status, is_test) VALUES ('o1', 550, 1, 'paid', 0)").run();
  const j = await (await team.onRequestPost({ request: hq({ agent: "data", lang: "th" }), env })).json();
  assert.deepEqual(j.warnings, []);
  assert.match(j.results[0].output, /ออเดอร์จ่ายแล้ว 1/);
});

test("unreadable orders table is reported, not silently treated as zero", async () => {
  const { DB, env } = fresh();
  await DB.prepare("DROP TABLE orders").run();
  const j = await (await team.onRequestPost({ request: hq({ agent: "data", lang: "th" }), env })).json();
  assert.deepEqual(j.warnings, ["orders_unreadable"]);
});
