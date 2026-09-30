// Loads public/admin/index.html in jsdom, wires fetch() to the real /api handlers on an in-memory D1,
// and drives the tracking / cancel / report / config flows through the actual DOM.
// Needs jsdom (not a project dependency): run with  NODE_PATH=/path/to/node_modules node --test tests/admin-ui.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { makeD1, seedLegacy } from "./d1-shim.mjs";
import { _test } from "../shared/schema.js";
import * as checkout from "../functions/api/checkout.js";
import * as admin from "../functions/api/admin-orders.js";
import * as cfg from "../functions/api/admin-config.js";
import * as report from "../functions/api/sales-report.js";

let JSDOM;
try { JSDOM = createRequire(import.meta.url)("jsdom").JSDOM; } catch { JSDOM = null; }
const skip = !JSDOM && "jsdom not installed";

test("admin page drives real handlers", { skip }, async () => {
  _test.reset();
  const DB = makeD1(); seedLegacy(DB);
  const env = { DB, ADMIN_PASSWORD: "x", SLIPOK_API_KEY: "k", SLIPOK_BRANCH_ID: "b" };
  const O = "https://t.example";
  const mk = (b, i) => checkout.onRequestPost({ request: new Request(O + "/api/checkout", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "5.5.5." + i }, body: JSON.stringify(b) }), env });
  const base = { product_id: "p1", name: "สมชาย ใจดี", phone: "0812345678", address: "99/1 ถนนเชียงใหม่ ตำบลเวียง อำเภอฝาง เชียงใหม่", postal_code: "50110", quantity_kg: 1, consent: true, utm_source: "facebook" };
  const o1 = (await (await mk({ ...base, request_id: "r1" }, 1)).json()).order;
  await mk({ ...base, request_id: "r2", is_test: true }, 2);
  await DB.prepare("UPDATE orders SET status='paid' WHERE id=?").bind(o1.id).run();

  const dom = new JSDOM(fs.readFileSync(new URL("../public/admin/index.html", import.meta.url), "utf8"), { runScripts: "outside-only", url: O + "/admin/", pretendToBeVisual: true });
  const w = dom.window; const errors = [];
  w.addEventListener("error", (e) => errors.push(e.message));
  w.confirm = () => true; w.alert = (m) => errors.push("ALERT:" + m);
  w.setInterval = () => 0;
  w.fetch = async (u, opt = {}) => {
    const url = new URL(u, O); const method = (opt.method || "GET").toUpperCase();
    const request = new Request(url, { method, headers: opt.headers, body: opt.body });
    const map = { "/api/admin-orders": admin, "/api/admin-config": cfg, "/api/sales-report": report };
    const mod = map[url.pathname]; assert.ok(mod, "unexpected " + url.pathname);
    return method === "GET" ? mod.onRequestGet({ request, env }) : mod.onRequestPost({ request, env });
  };
  w.eval(dom.window.document.querySelector("script").textContent);
  const tick = () => new Promise((r) => setTimeout(r, 60));
  await tick();
  const doc = w.document, txt = () => doc.body.textContent;

  doc.querySelector('[data-f="paid"]').click(); await tick();
  assert.match(txt(), /เลขพัสดุ/); assert.match(txt(), /รอส่ง 1/);
  const inp = doc.querySelector("#list input[placeholder='เลขพัสดุ']"); inp.value = "TH1234567890";
  [...doc.querySelectorAll("#list button")].find((b) => b.textContent === "บันทึกเลขพัสดุ").click(); await tick();
  assert.match(txt(), /จัดส่งแล้ว/); assert.match(txt(), /TH1234567890/);

  doc.querySelector('[data-f="all"]').click(); await tick();
  assert.match(txt(), /ทดสอบ/);
  doc.querySelector('[data-f="pending"]').click(); await tick();
  [...doc.querySelectorAll("#list button")].find((b) => b.textContent === "ยกเลิกออเดอร์").click(); await tick();
  doc.querySelector('[data-f="all"]').click(); await tick();
  assert.match(txt(), /ยกเลิกโดยร้าน/); assert.match(txt(), /เปิดออเดอร์กลับ/);

  doc.querySelector('[data-f="report"]').click(); await tick(); await tick();
  assert.match(txt(), /facebook/); assert.match(txt(), /ไม่รวมทดสอบ/);

  doc.querySelector('[data-f="config"]').click(); await tick(); await tick();
  const ins = [...doc.querySelectorAll("#list input")];
  ins.find((i) => i.placeholder.startsWith("รหัส")).value = "WELCOME10";
  ins.find((i) => i.placeholder === "มูลค่า").value = "10";
  [...doc.querySelectorAll("#list button")].find((b) => b.textContent.startsWith("สร้าง")).click(); await tick(); await tick();
  assert.match(txt(), /WELCOME10/);
  assert.deepEqual(errors, []);
});
