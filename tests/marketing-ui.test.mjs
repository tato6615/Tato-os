import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let JSDOM = null;
try { ({ JSDOM } = await import("jsdom")); } catch { /* jsdom missing: skip */ }

const html = readFileSync(new URL("../public/system/marketing/index.html", import.meta.url), "utf8");
const tick = () => new Promise((r) => setTimeout(r, 60));

test("marketing page renders data and escapes attacker-controlled channel names", { skip: !JSDOM && "jsdom not installed" }, async () => {
  const evil = '<img src=x onerror="window.__xss=1">';
  const brain = { success: true, period: {}, warnings: ["ยังไม่ได้บันทึกค่าโฆษณา"], totals: { sessions: 60, paid_orders: 5, revenue: 3000, gross_profit: 1050, spend: 400, net_profit: 650, leads: 1 },
    pace: { kg_month_to_date: 5, target_kg: 500, pct_of_target: 1, projected_kg: 15, remaining_kg: 495, needed_kg_per_week: 100, capacity_kg_month: 515, capacity_ok: true },
    settings: { values: { cost_per_kg: 390, min_sessions: 50 }, custom: {} }, actions: [{ channel: evil, status: "SCALE", text: evil }],
    channels: [{ channel: evil, status: "SCALE", action: evil, sessions: 60, paid_orders: 5, revenue: 3000, spend: 400, cac: 80, profit_roas: 2.63, leads: 0, is_paid: true, confidence: "ok" }] };
  const calls = [];
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://t.example/system/marketing/", beforeParse(w) {
    w.fetch = async (u, o) => { calls.push({ u: String(u), o }); const body = String(u).startsWith("/api/marketing-brain") ? brain : { success: true, rows: [{ id: "spend_x", spend_date: "2026-10-03", channel: evil, amount: 100 }] }; return { ok: true, status: 200, json: async () => body }; };
    w.confirm = () => true;
  } });
  await tick();
  const d = dom.window.document;
  assert.equal(dom.window.__xss, undefined, "injected markup must not execute");
  assert.equal(d.querySelectorAll("#rows img, #actions img, #spendrows img").length, 0, "no injected elements");
  assert.ok(d.getElementById("rows").textContent.includes("<img"), "shown as text");
  assert.ok(d.getElementById("kpis").textContent.includes("3,000"));
  assert.ok(d.getElementById("warnbox").style.display !== "none");
  assert.ok(calls.some((c) => c.u.startsWith("/api/marketing-brain?from=")));
  // spend form posts with the HQ header
  d.getElementById("sc").value = "facebook"; d.getElementById("sa").value = "250";
  d.getElementById("spendf").dispatchEvent(new dom.window.Event("submit", { cancelable: true, bubbles: true }));
  await tick();
  const post = calls.find((c) => c.o && c.o.method === "POST");
  assert.ok(post && post.o.headers["x-requested-with"] === "tato-hq" && JSON.parse(post.o.body).amount === "250");
  dom.window.close();
});
