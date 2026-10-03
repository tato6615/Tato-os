import test from "node:test";
import assert from "node:assert/strict";
import { makeD1, seedLegacy } from "./d1-shim.mjs";
import { _test, ensureSchema } from "../shared/schema.js";
import { DEFAULTS, analyzeChannels, decide, normChannel, parseSettings, validateSetting, pace, bangkokMonth } from "../shared/marketing.js";
import * as brain from "../functions/api/marketing-brain.js";
import * as spend from "../functions/api/ad-spend.js";

const ORIGIN = "https://t.example";
const S = { ...DEFAULTS };
const H = { "x-requested-with": "tato-hq", "content-type": "application/json" };

// ---------- pure rules ----------
test("channel names are normalised and aliased", () => {
  assert.equal(normChannel(" FB "), "facebook"); assert.equal(normChannel("Facebook"), "facebook");
  assert.equal(normChannel(""), "(direct)"); assert.equal(normChannel(null), "(direct)"); assert.equal(normChannel("line"), "line");
});
test("settings: defaults, overrides, validation", () => {
  const p = parseSettings([{ key: "mb_cost_per_kg", value: "420" }, { key: "mb_min_sessions", value: "abc" }, { key: "evil", value: "1" }]);
  assert.equal(p.values.cost_per_kg, 420); assert.equal(p.values.min_sessions, 50); assert.ok(p.custom.cost_per_kg); assert.ok(!p.custom.min_sessions);
  assert.equal(validateSetting("roast_days_per_week", 8).ok, false); assert.equal(validateSetting("roast_days_per_week", 4.5).ok, false);
  assert.equal(validateSetting("scale_roas", 2).ok, true); assert.equal(validateSetting("nope", 1).error, "SETTING_NOT_ALLOWED");
  assert.deepEqual(validateSetting("cost_per_kg", ""), { ok: true, value: null });
});
test("no verdict on thin data: under min_sessions is INSUFFICIENT_DATA even with a great ROAS", () => {
  const r = analyzeChannels({ sessions: [{ channel: "facebook", n: 20 }], orders: [{ channel: "facebook", orders: 3, paid_orders: 3, revenue: 3000, kg: 3 }], spend: [{ channel: "facebook", amount: 100 }] }, S);
  assert.equal(r[0].status, "INSUFFICIENT_DATA");
});
test("paid channel: SCALE / KEEP / REDUCE / FIX / STOP follow the rules", () => {
  const run = (o) => analyzeChannels({ sessions: [{ channel: "facebook", n: 80 }], orders: [{ channel: "facebook", ...o.orders }], spend: [{ channel: "facebook", amount: o.spend }] }, S)[0];
  // 5 orders x 1kg, revenue 3000, cost 5*390=1950, gross 1050
  assert.equal(run({ orders: { orders: 5, paid_orders: 5, revenue: 3000, kg: 5 }, spend: 400 }).status, "SCALE");      // 1050/400=2.6
  assert.equal(run({ orders: { orders: 5, paid_orders: 5, revenue: 3000, kg: 5 }, spend: 900 }).status, "KEEP");       // 1.17
  assert.equal(run({ orders: { orders: 5, paid_orders: 5, revenue: 3000, kg: 5 }, spend: 2000 }).status, "REDUCE");    // 0.52
  assert.equal(run({ orders: { orders: 1, paid_orders: 1, revenue: 600, kg: 1 }, spend: 50 }).status, "KEEP");         // good ROAS but only 1 order: never SCALE
  assert.equal(run({ orders: { orders: 0, paid_orders: 0, revenue: 0, kg: 0 }, spend: 500 }).status, "FIX");
  assert.equal(run({ orders: { orders: 0, paid_orders: 0, revenue: 0, kg: 0 }, spend: 1500 }).status, "STOP");
});
test("STOP money guardrail applies even with few sessions", () => {
  const r = analyzeChannels({ sessions: [{ channel: "google", n: 3 }], orders: [], spend: [{ channel: "google", amount: 2000 }] }, S);
  assert.equal(r[0].status, "STOP");
});
test("organic and direct channels are never given a budget verdict", () => {
  const r = analyzeChannels({ sessions: [{ channel: "line", n: 60 }, { channel: "(direct)", n: 90 }], orders: [{ channel: "line", orders: 2, paid_orders: 2, revenue: 1200, kg: 2 }] }, S);
  assert.equal(r.find((x) => x.channel === "line").status, "WORKING");
  assert.equal(r.find((x) => x.channel === "(direct)").status, "NOT_ACTIONABLE");
  assert.equal(decide({ channel: "line", is_paid: false, sessions: 60, paid_orders: 0 }, S).status, "NO_SALES_YET");
});
test("profit math: cost per kg + other cost per order, CAC, ROAS", () => {
  const s2 = { ...S, other_cost_per_order: 50 };
  const r = analyzeChannels({ sessions: [{ channel: "facebook", n: 100 }], orders: [{ channel: "facebook", orders: 2, paid_orders: 2, revenue: 1400, kg: 2 }], spend: [{ channel: "fb", amount: 200 }] }, s2)[0];
  assert.equal(r.gross_profit, 1400 - 2 * 390 - 2 * 50); // 520
  assert.equal(r.cac, 100); assert.equal(r.roas, 7); assert.equal(r.profit_roas, 2.6); assert.equal(r.net_profit, 320);
});
test("month pace uses the Bangkok month and flags a target above roasting capacity", () => {
  const now = new Date("2026-10-15T05:00:00Z"); // 12:00 in Bangkok, day 15.5
  const m = bangkokMonth(now); assert.equal(m.startUtc.toISOString(), "2026-09-30T17:00:00.000Z"); assert.equal(m.daysInMonth, 31);
  const p = pace({ kgMonthToDate: 155, target: 500, rate: { roast_kg_per_day: 30, roast_days_per_week: 4 }, now });
  assert.equal(p.projected_kg, 310); assert.equal(p.capacity_ok, true);
  assert.equal(pace({ kgMonthToDate: 0, target: 900, rate: { roast_kg_per_day: 30, roast_days_per_week: 4 }, now }).capacity_ok, false);
});

// ---------- endpoints ----------
async function fresh(prodEvents = true) {
  _test.reset(); const DB = makeD1(); seedLegacy(DB);
  if (prodEvents) DB.raw.exec("DROP TABLE behavior_events; CREATE TABLE behavior_events (id TEXT PRIMARY KEY, customer_id TEXT, session_id TEXT, event_type TEXT, page TEXT, product_id TEXT, metadata TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));");
  await ensureSchema(DB);
  return { DB, env: { DB, ADMIN_PASSWORD: "x" } };
}
const now = () => new Date().toISOString();
let eid = 0;
const ev = (DB, type, sid, meta, prod = true) => prod
  ? DB.raw.prepare("INSERT INTO behavior_events (id,session_id,event_type,metadata) VALUES (?,?,?,?)").run("e" + (++eid), sid, type, typeof meta === "string" ? meta : JSON.stringify(meta))
  : DB.raw.prepare("INSERT INTO behavior_events (anonymous_id,event_name,metadata) VALUES (?,?,?)").run(sid, type, JSON.stringify(meta));
const order = (DB, o) => DB.raw.prepare("INSERT INTO orders (id,customer_id,total_amount,amount,total_kg,status,created_at,utm_source,is_test,shipping_fee) VALUES (?,?,?,?,?,?,?,?,?,?)")
  .run("o" + (++eid), "c1", o.amount, o.amount, o.kg, o.status || "paid", now(), o.utm ?? null, o.is_test || 0, 0);
const get = async (env, q = "") => (await brain.onRequestGet({ request: new Request(ORIGIN + "/api/marketing-brain" + q), env })).json();

for (const prod of [true, false]) {
  test("brain endpoint attributes sessions (utm_source, else ?src=), excludes tests, malformed metadata and cancelled orders [" + (prod ? "prod" : "legacy") + " columns]", async () => {
    const { DB, env } = await fresh(prod);
    for (let i = 0; i < 4; i++) ev(DB, "content_view", "fb" + i, { utm_source: "Facebook", src: "facebook" }, prod);
    ev(DB, "content_view", "fb0", { utm_source: "facebook" }, prod);                 // same session twice -> counted once
    for (let i = 0; i < 3; i++) ev(DB, "content_view", "ln" + i, { src: "line" }, prod); // ?src= only (old events)
    ev(DB, "content_view", "t1", { utm_source: "facebook", is_test: true }, prod);    // test -> excluded
    ev(DB, "content_view", "t2", { src: "line", is_test: "1" }, prod);                // test -> excluded
    ev(DB, "content_view", "d1", {}, prod);                                           // direct
    DB.raw.prepare(prod ? "INSERT INTO behavior_events (id,session_id,event_type,metadata) VALUES ('bad','bs','content_view','not json')" : "INSERT INTO behavior_events (anonymous_id,event_name,metadata) VALUES ('bs','content_view','not json')").run(); // must not crash
    order(DB, { amount: 600, kg: 1, utm: "facebook" }); order(DB, { amount: 600, kg: 1, utm: "facebook", status: "cancelled" });
    order(DB, { amount: 600, kg: 1, utm: "facebook", is_test: 1 }); order(DB, { amount: 300, kg: 0.5, status: "pending", utm: "line" });
    const d = await get(env);
    assert.equal(d.success, true);
    const ch = Object.fromEntries(d.channels.map((c) => [c.channel, c]));
    assert.equal(ch.facebook.sessions, 4); assert.equal(ch.line.sessions, 3); assert.equal(ch["(direct)"].sessions, 2); // d1 + malformed
    assert.equal(ch.facebook.orders, 1); assert.equal(ch.facebook.paid_orders, 1); assert.equal(ch.facebook.revenue, 600);
    assert.equal(ch.line.orders, 1); assert.equal(ch.line.paid_orders, 0); assert.equal(ch.line.pending_amount, 300);
    assert.equal(d.totals.sessions, 9);
  });
}

test("ad spend feeds CAC / profit-ROAS and the verdict; add + delete need the HQ header", async () => {
  const { DB, env } = await fresh();
  for (let i = 0; i < 60; i++) ev(DB, "content_view", "s" + i, { utm_source: "facebook" });
  for (let i = 0; i < 5; i++) order(DB, { amount: 600, kg: 1, utm: "facebook" });   // gross = 5*(600-390) = 1050
  const add = (b, h = H) => spend.onRequestPost({ request: new Request(ORIGIN + "/api/ad-spend", { method: "POST", headers: h, body: JSON.stringify(b) }), env });
  const today = new Date().toISOString().slice(0, 10);
  assert.equal((await add({ spend_date: today, channel: "fb", amount: 400 }, {})).status, 403);
  assert.equal((await add({ spend_date: "bad", channel: "(direct)", amount: -1 })).status, 400);
  const ok = await add({ spend_date: today, channel: "FB", amount: 400, campaign: "launch" }); assert.equal(ok.status, 200);
  const d = await get(env); const f = d.channels.find((c) => c.channel === "facebook");
  assert.equal(f.spend, 400); assert.equal(f.cac, 80); assert.equal(f.profit_roas, 2.63); assert.equal(f.status, "SCALE");
  const id = (await ok.json()).id;
  const del = (i, h = H) => spend.onRequestDelete({ request: new Request(ORIGIN + "/api/ad-spend?id=" + encodeURIComponent(i), { method: "DELETE", headers: h }), env });
  assert.equal((await del(id, {})).status, 403); assert.equal((await del("x' OR 1=1")).status, 400);
  assert.equal((await del(id)).status, 200); assert.equal((await del(id)).status, 404);
  assert.equal((await get(env)).channels.find((c) => c.channel === "facebook").spend, 0);
});

test("settings endpoint: allowlist, validation, reset to default, and effect on profit", async () => {
  const { DB, env } = await fresh();
  const set = (b, h = H) => brain.onRequestPost({ request: new Request(ORIGIN + "/api/marketing-brain", { method: "POST", headers: h, body: JSON.stringify(b) }), env });
  assert.equal((await set({ action: "set_setting", key: "cost_per_kg", value: 420 }, {})).status, 403);
  assert.equal((await set({ action: "set_setting", key: "ADMIN_PASSWORD", value: 1 })).status, 400);
  assert.equal((await set({ action: "set_setting", key: "cost_per_kg", value: -5 })).status, 400);
  order(DB, { amount: 600, kg: 1, utm: "line" });
  assert.equal((await set({ action: "set_setting", key: "cost_per_kg", value: 450 })).status, 200);
  let d = await get(env); assert.equal(d.settings.values.cost_per_kg, 450); assert.equal(d.channels[0].gross_profit, 150);
  assert.ok(!d.warnings.some((w) => w.includes("ค่าเริ่มต้น")));
  assert.equal((await set({ action: "set_setting", key: "cost_per_kg", value: "" })).status, 200);
  d = await get(env); assert.equal(d.settings.values.cost_per_kg, 390); assert.ok(d.warnings.some((w) => w.includes("ค่าเริ่มต้น")));
  assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM settings WHERE key='max_open_kg'").get().n, 0); // never touches other settings
});

test("empty database: no crash, honest warnings, no invented numbers", async () => {
  const { env } = await fresh(); const d = await get(env);
  assert.equal(d.success, true); assert.deepEqual(d.channels, []); assert.equal(d.totals.revenue, 0);
  assert.ok(d.warnings.length >= 2); assert.equal(d.actions.length, 0);
});
