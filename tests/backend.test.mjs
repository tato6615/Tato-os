import test from "node:test";
import assert from "node:assert/strict";
import { makeD1, seedLegacy } from "./d1-shim.mjs";
import { _test } from "../shared/schema.js";
import * as checkout from "../functions/api/checkout.js";
import * as status from "../functions/api/order-status.js";
import * as admin from "../functions/api/admin-orders.js";
import * as cfg from "../functions/api/admin-config.js";
import * as report from "../functions/api/sales-report.js";
import { calcShipping, quote } from "../shared/shipping.js";
import { isValidThaiPhone, normalizePhone } from "../shared/validate.js";

const ORIGIN = "https://t.example";
function fresh(env = {}) {
  _test.reset();
  const DB = makeD1(); seedLegacy(DB);
  return { DB, env: { DB, ADMIN_PASSWORD: "x", ...env } };
}
let ipn = 0;
const req = (path, method, body, ip) => new Request(ORIGIN + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": ip || "9.9.9." + (++ipn) }, body: body ? JSON.stringify(body) : undefined });
const good = (o = {}) => ({ product_id: "p1", name: "สมชาย ใจดี", phone: "081 234 5678", email: "", address: "99/1 ถนนเชียงใหม่-ฝาง ตำบลเวียง อำเภอฝาง เชียงใหม่", postal_code: "50110", quantity_kg: 1, roast: "medium", grind: "whole_bean", consent: true, request_id: crypto.randomUUID(), ...o });
const post = (env, body, ip) => checkout.onRequestPost({ request: req("/api/checkout", "POST", body, ip), env });
const j = (r) => r.json();

test("shipping formula is single-sourced", () => {
  assert.equal(calcShipping(0.5), 67); assert.equal(calcShipping(1), 67); assert.equal(calcShipping(1.5), 82); assert.equal(calcShipping(2), 97); assert.equal(calcShipping(10), 260); assert.equal(calcShipping(20), 445); assert.equal(calcShipping(0), 0);
  assert.deepEqual(quote({ kg: 0.5, unitPrice: 550 }), { subtotal: 275, discount: 0, shipping: 67, total: 342 });
  assert.deepEqual(quote({ kg: 1, unitPrice: 550 }), { subtotal: 550, discount: 0, shipping: 67, total: 617 });
});

test("phone rules", () => {
  assert.ok(isValidThaiPhone("081 234 5678")); assert.ok(isValidThaiPhone("+66812345678"));
  assert.ok(!isValidThaiPhone("000000000000")); assert.ok(!isValidThaiPhone("1234567890123")); assert.ok(!isValidThaiPhone("0812345")); assert.ok(!isValidThaiPhone("0800000000"));
  assert.equal(normalizePhone("081-234-5678"), "0812345678");
});

test("rejects the junk seen in the earlier test orders", async () => {
  const { env } = fresh();
  for (const bad of [
    good({ name: "3333" }), good({ phone: "000000000000" }), good({ phone: "1234567890123" }),
    good({ address: "" }), good({ postal_code: "" }), good({ postal_code: "1234" }), good({ consent: false }),
  ]) {
    const r = await post(env, bad); const b = await j(r);
    assert.equal(r.status, 400); assert.equal(b.status, "CHECKOUT_VALIDATION");
  }
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM orders").first()).n, 0);
});

test("valid order: legacy table is upgraded, price + token + details stored", async () => {
  const { env, DB } = fresh();
  const r = await post(env, good({ quantity_kg: 0.5 })); const b = await j(r);
  assert.equal(r.status, 201); assert.equal(b.order.amount, 342); assert.equal(b.order.shipping, 67);
  assert.match(b.status_url, /\/order\/\?id=order_.+&t=[0-9a-f]{32}$/);
  const o = await DB.prepare("SELECT * FROM orders").first();
  assert.equal(o.amount, 342); assert.equal(o.shipping_fee, 67); assert.equal(o.subtotal, 275);
  const d = await DB.prepare("SELECT * FROM order_details").first();
  assert.equal(d.postal_code, "50110"); assert.equal(d.phone, "0812345678"); assert.ok(d.consent_at);
  const r2 = await post(env, good({ quantity_kg: 2 })); assert.equal((await j(r2)).order.shipping, 97);
});

test("double submit with the same request_id gives one order (sequential and concurrent)", async () => {
  const { env, DB } = fresh();
  const body = good();
  const a = await j(await post(env, body)); const b = await j(await post(env, body));
  assert.equal(a.order.id, b.order.id); assert.equal(b.idempotent, true);
  const c = good(); const [x, y] = await Promise.all([post(env, c), post(env, c)]);
  assert.equal((await j(x)).order.id, (await j(y)).order.id);
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM orders").first()).n, 2);
});

test("rate limit per IP, honeypot, turnstile", async () => {
  const { env } = fresh();
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await post(env, good(), "1.1.1.1")).status);
  assert.deepEqual(codes.slice(0, 5), [201, 201, 201, 201, 201]); assert.equal(codes[5], 429);
  assert.equal((await post(env, good({ website: "http://spam" }))).status, 400);
  const t = fresh({ TURNSTILE_SECRET: "s" });
  assert.equal((await post(t.env, good())).status, 403);
});

test("discount code, price mismatch guard, code limits", async () => {
  const { env } = fresh();
  const save = (o) => cfg.onRequestPost({ request: req("/api/admin-config", "POST", { action: "save_code", ...o }), env });
  assert.equal((await save({ code: "hello10", type: "percent", value: 10, min_kg: 1, max_uses: 1 })).status, 200);
  const q = await j(await checkout.onRequestGet({ request: req("/api/checkout?product_id=p1&action=quote&kg=1&code=hello10&postal=50110", "GET"), env }));
  assert.equal(q.subtotal, 550); assert.equal(q.discount, 55); assert.equal(q.total, 550 - 55 + 67); assert.equal(q.code.valid, true);
  const mis = await post(env, good({ quantity_kg: 1, discount_code: "HELLO10", expected_total: 600 }));
  assert.equal(mis.status, 409); assert.equal((await j(mis)).status, "PRICE_MISMATCH");
  const ok = await post(env, good({ quantity_kg: 1, discount_code: "hello10", expected_total: 562 }));
  assert.equal(ok.status, 201); assert.equal((await j(ok)).order.amount, 562);
  const used = await post(env, good({ quantity_kg: 1, discount_code: "HELLO10" }));
  assert.equal(used.status, 400); assert.equal((await j(used)).status, "CODE_USED_UP");
  assert.equal((await post(env, good({ discount_code: "NOPE" }))).status, 400);
});

test("roast capacity limit ignores test orders", async () => {
  const { env } = fresh();
  await cfg.onRequestPost({ request: req("/api/admin-config", "POST", { action: "set_setting", key: "max_open_kg", value: 3 }), env });
  assert.equal((await post(env, good({ quantity_kg: 2 }))).status, 201);
  const full = await post(env, good({ quantity_kg: 2 })); assert.equal(full.status, 409); assert.equal((await j(full)).status, "CAPACITY_FULL");
  assert.equal((await post(env, good({ quantity_kg: 1 }))).status, 201);
  assert.equal((await post(env, good({ quantity_kg: 2, is_test: true }))).status, 201);
});

test("customer status page needs the token; tracking flow; expiry + reopen", async () => {
  const { env, DB } = fresh();
  const b = await j(await post(env, good({ utm_source: "facebook" }))); const id = b.order.id, tok = new URL(b.status_url).searchParams.get("t");
  const get = (t) => status.onRequestGet({ request: req("/api/order-status?id=" + id + "&t=" + t, "GET"), env });
  assert.equal((await get("bad")).status, 404);
  const s1 = await j(await get(tok)); assert.equal(s1.order.status, "pending"); assert.ok(s1.payment); assert.ok(!JSON.stringify(s1).includes("081"));
  const adm = (body) => admin.onRequestPost({ request: req("/api/admin-orders", "POST", body), env });
  assert.equal((await adm({ action: "set_tracking", order_id: id, tracking_no: "TH1234567890", courier: "kerry" })).status, 409);
  await DB.prepare("UPDATE orders SET status='paid' WHERE id=?").bind(id).run();
  assert.equal((await adm({ action: "set_tracking", order_id: id, tracking_no: "12", courier: "kerry" })).status, 400);
  assert.equal((await adm({ action: "set_tracking", order_id: id, tracking_no: "TH1234567890", courier: "kerry" })).status, 200);
  const s2 = await j(await get(tok)); assert.equal(s2.order.status, "shipped"); assert.equal(s2.tracking.tracking_no, "TH1234567890"); assert.match(s2.tracking.url, /kerryexpress/);

  // expiry: 3-day-old pending is cancelled by the admin list call, then can be reopened and stays open
  await DB.prepare("INSERT INTO orders (id,total_amount,amount,total_kg,status,created_at,is_test) VALUES ('order_old',600,600,1,'pending',?,0)").bind(new Date(Date.now() - 72 * 3600e3).toISOString()).run();
  const list = await j(await admin.onRequestGet({ request: req("/api/admin-orders", "GET"), env }));
  assert.equal(list.housekeeping.expired, 1); assert.equal(list.orders.find((o) => o.id === "order_old").status, "cancelled");
  assert.equal((await adm({ action: "reopen", order_id: "order_old" })).status, 200);
  const list2 = await j(await admin.onRequestGet({ request: req("/api/admin-orders", "GET"), env }));
  assert.equal(list2.orders.find((o) => o.id === "order_old").status, "pending");
  // paid orders can't be cancelled from admin
  assert.equal((await adm({ action: "cancel", order_id: id })).status, 409);
});

test("sales report: real orders only, grouped by utm, cancelled excluded", async () => {
  const { env, DB } = fresh();
  const a = await j(await post(env, good({ utm_source: "facebook", utm_medium: "cpc", quantity_kg: 1 })));
  await post(env, good({ utm_source: "facebook", utm_medium: "cpc", quantity_kg: 2 }));
  await post(env, good({ utm_source: "line", quantity_kg: 1 }));
  await post(env, good({ utm_source: "facebook", utm_medium: "cpc", is_test: true }));
  await DB.prepare("UPDATE orders SET status='paid' WHERE id=?").bind(a.order.id).run();
  await DB.prepare("UPDATE orders SET status='cancelled' WHERE utm_source='line'").run();
  const r = await j(await report.onRequestGet({ request: req("/api/sales-report", "GET"), env }));
  assert.equal(r.rows.length, 1); const f = r.rows[0];
  assert.equal(f.source, "facebook"); assert.equal(f.orders, 2); assert.equal(f.paid_orders, 1); assert.equal(f.revenue, 617); assert.equal(f.paid_rate_pct, 50);
});
