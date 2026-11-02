// End-to-end (D1 shim): the server decides the price per roast, and code CAFE takes 100 THB/kg off.
// Production data: products.price = 650, CAFE row = percent 15.38462 (ignored for the amount, see shared/pricing.js).
import test from "node:test";
import assert from "node:assert/strict";
import { makeD1, seedLegacy } from "./d1-shim.mjs";
import { _test, ensureSchema } from "../shared/schema.js";
import * as checkout from "../functions/api/checkout.js";

const ORIGIN = "https://t.example";
let ipn = 0;
const req = (path, method, body) => new Request(ORIGIN + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": "8.8.8." + (++ipn) }, body: body ? JSON.stringify(body) : undefined });
const good = (o = {}) => ({ product_id: "p650", name: "สมชาย ใจดี", phone: "081 234 5678", email: "", address: "99/1 ถนนเชียงใหม่-ฝาง ตำบลเวียง อำเภอฝาง เชียงใหม่", postal_code: "50110", quantity_kg: 1, roast: "medium", grind: "whole_bean", consent: true, request_id: crypto.randomUUID(), ...o });

async function fresh() {
  _test.reset();
  const DB = makeD1(); seedLegacy(DB);
  DB.raw.exec("INSERT INTO products (id,name,price,currency,status) VALUES ('p650','TATO Coffee',650,'THB','active')");
  await ensureSchema(DB);
  DB.raw.exec("INSERT INTO discount_codes (code,type,value,min_kg,active,created_at) VALUES ('CAFE','percent',15.38462,0,1,datetime('now'))");
  return { DB, env: { DB, ADMIN_PASSWORD: "x" } };
}
const quote = async (env, qs) => (await checkout.onRequestGet({ request: req("/api/checkout?action=quote&product_id=p650&" + qs, "GET"), env })).json();
const post = async (env, body) => { const r = await checkout.onRequestPost({ request: req("/api/checkout", "POST", body), env }); return { status: r.status, body: await r.json() }; };

test("quote: retail price per roast", async () => {
  const { env } = await fresh();
  assert.equal((await quote(env, "kg=1&roast=light")).unit_price, 690);
  assert.equal((await quote(env, "kg=1&roast=medium")).unit_price, 650);
  assert.equal((await quote(env, "kg=1&roast=dark")).unit_price, 650);
  assert.equal((await quote(env, "kg=1")).unit_price, 650); // no roast = medium price
});

test("quote: code CAFE gives 590 / 550 / 550 per kg", async () => {
  const { env } = await fresh();
  for (const [roast, perKg] of [["light", 590], ["medium", 550], ["dark", 550]]) {
    const q = await quote(env, `kg=2&roast=${roast}&code=CAFE`);
    assert.equal(q.subtotal - q.discount, perKg * 2, roast);
    assert.equal(q.code.valid, true);
  }
});

test("quote: an unknown roast is refused", async () => {
  const { env } = await fresh();
  const r = await checkout.onRequestGet({ request: req("/api/checkout?action=quote&product_id=p650&kg=1&roast=burnt", "GET"), env });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).status, "INVALID_ROAST");
});

test("order: light roast retail is charged 690/kg, stored with the roast", async () => {
  const { env, DB } = await fresh();
  const r = await post(env, good({ roast: "light", quantity_kg: 1, expected_total: 690 + 67 }));
  assert.equal(r.status, 201);
  assert.equal(r.body.order.subtotal, 690);
  assert.equal(r.body.order.amount, 757);
  const d = await DB.prepare("SELECT roast FROM order_details").first();
  assert.equal(d.roast, "light");
});

test("order: the page total must match the roast price (stale 650 for light is refused)", async () => {
  const { env } = await fresh();
  const r = await post(env, good({ roast: "light", quantity_kg: 1, expected_total: 650 + 67 }));
  assert.equal(r.status, 409);
  assert.equal(r.body.status, "PRICE_MISMATCH");
});

test("order: café light roast with code CAFE is 590/kg, dark is 550/kg", async () => {
  const { env } = await fresh();
  const a = await post(env, good({ roast: "light", quantity_kg: 2, discount_code: "CAFE" }));
  assert.equal(a.status, 201);
  assert.equal(a.body.order.subtotal, 1380);
  assert.equal(a.body.order.discount, 200);
  assert.equal(a.body.order.subtotal - a.body.order.discount, 590 * 2);
  const b = await post(env, good({ roast: "dark", quantity_kg: 2, discount_code: "CAFE" }));
  assert.equal(b.body.order.subtotal - b.body.order.discount, 550 * 2);
});

test("order: an invalid roast is refused and nothing is saved", async () => {
  const { env, DB } = await fresh();
  const r = await post(env, good({ roast: "burnt" }));
  assert.equal(r.status, 400);
  assert.equal(r.body.status, "INVALID_ROAST");
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM orders").first()).n, 0);
});
