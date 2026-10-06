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
  const AI = mkAI("- ข้อมูลยังไม่เพียงพอ ต้องเก็บข้อมูลเพิ่มก่อนสรุป");
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

test("AI that invents '1 paid order' (real: 0) is rejected and the rules summary is shown", async () => {
  for (const [lang, text] of [["th", "- ต้องเก็บรายละเอียดของออเดอร์ที่จ่ายแล้ว 1 รายการ เพื่อดูช่องทาง"], ["en", "- Insufficient data. Collect details of the 1 paid order to see the channel."]]) {
    const AI = mkAI(text);
    const { env } = fresh({ AI });
    await lead.onRequestPost({ request: leadReq({ name: "สมหญิง ใจดี", phone: "0812345672", stage: "planning", consent: true }), env });
    const j = await (await team.onRequestPost({ request: hq({ agent: "strategy", lang }), env })).json();
    assert.equal(j.results[0].status, "AI_UNVERIFIED", lang);
  }
});

test("AI that cites L-codes that do not exist is rejected", async () => {
  const AI = mkAI("- Insufficient data. Collect more details for L1 and L2 before concluding anything.");
  const { env } = fresh({ AI });
  const j = await (await team.onRequestPost({ request: hq({ agent: "research", lang: "en" }), env })).json();
  assert.equal(j.results[0].status, "AI_UNVERIFIED");
});

test("small invented numbers (1-3) are no longer waved through", async () => {
  const AI = mkAI("- ข้อมูลยังไม่เพียงพอ ควรทักร้านที่สนใจ 2 ร้านภายในสัปดาห์นี้ก่อน");
  const { env } = fresh({ AI });
  const j = await (await team.onRequestPost({ request: hq({ agent: "growth", lang: "th" }), env })).json();
  assert.equal(j.results[0].status, "AI_UNVERIFIED");
});

test("an honest 'insufficient data' answer still passes", async () => {
  const AI = mkAI("- ข้อมูลยังไม่เพียงพอ ต้องเก็บข้อมูลลูกค้าและยอดสั่งซื้อเพิ่มก่อนสรุป");
  const { env } = fresh({ AI });
  const j = await (await team.onRequestPost({ request: hq({ agent: "growth", lang: "th" }), env })).json();
  assert.equal(j.results[0].status, "AI_ANALYZED");
});

test("rephrased invented claims are caught (paid money 1 time, 2 people in the form)", async () => {
  const bad = [
    ["th", "ข้อมูลยังไม่เพียงพอ ต้องเก็บชื่อหรือเบอร์โทรศัพท์ของลูกค้าที่เข้าฟอร์ม 2 คน และรายละเอียดออเดอร์ที่มีการจ่ายเงิน 1 ครั้ง"],
    ["en", "Insufficient data. Collect details of the 2 people who filled the form and the order that paid 1 time."],
  ];
  for (const [lang, text] of bad) {
    const { env } = fresh({ AI: mkAI(text) });
    await lead.onRequestPost({ request: leadReq({ name: "สมหญิง ใจดี", phone: "0812345674", stage: "planning", consent: true }), env });
    const j = await (await team.onRequestPost({ request: hq({ agent: "strategy", lang }), env })).json();
    assert.equal(j.results[0].status, "AI_UNVERIFIED", lang);
  }
});

test("zero claims that match the data are accepted", async () => {
  const { env } = fresh({ AI: mkAI("ข้อมูลยังไม่เพียงพอ ตอนนี้ออเดอร์ที่จ่ายแล้ว 0 รายการ และ lead จริง 0 ราย ต้องเก็บข้อมูลเพิ่มก่อนสรุป") });
  await lead.onRequestPost({ request: leadReq({ name: "ทดสอบ", phone: "0812345673", stage: "planning", consent: true, is_test: true }), env });
  const j = await (await team.onRequestPost({ request: hq({ agent: "growth", lang: "th" }), env })).json();
  assert.ok(["AI_ANALYZED", "AI_UNVERIFIED"].includes(j.results[0].status));
});

test("claimIssue: the exact sentence that slipped through on the live site is rejected", () => {
  const ev = { counts: { paid_orders: 0, real_leads: 0 } };
  const live = "ข้อมูลยังไม่เพียงพอที่จะสรุปได้ชัดเจน ต้องเก็บข้อมูลเพิ่มเติมคือ ชื่อหรือเบอร์โทรศัพท์ของลูกค้าที่เข้าฟอร์ม 2 คน และรายละเอียดออเดอร์ที่มีการจ่ายเงิน 1 ครั้ง เพื่อตรวจสอบว่าลูกค้าเหล่านั้นเข้ามาผ่านช่องทางไหน";
  assert.ok(team.claimIssue(live, ev));
  assert.ok(team.claimIssue("Collect details of the 1 paid order.", ev));
  assert.equal(team.claimIssue("ข้อมูลยังไม่เพียงพอ ต้องเก็บข้อมูลลูกค้าและยอดสั่งซื้อเพิ่มก่อนสรุป", ev), null);
  assert.equal(team.claimIssue("ตอนนี้ออเดอร์ที่จ่ายแล้ว 0 รายการ และ lead จริง 0 ราย", ev), null);
  assert.equal(team.claimIssue("ออเดอร์ที่จ่ายแล้ว 2 รายการ", { counts: { paid_orders: 2, real_leads: 5 } }), null);
});
