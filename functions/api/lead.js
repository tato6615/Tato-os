// TATO-OS
// Lead capture for /cafe/ (new cafe / small shop owners)
// Route: /api/lead
//   POST  public   -> stores a lead, notifies the owner (LINE/Telegram if configured)
//   GET   admin    -> latest leads (behind Basic Auth; only "POST /api/lead" is public)

import { isValidName, isValidThaiPhone, isValidPostal, isValidAddress, normalizePhone } from "../../shared/validate.js";
import { ensureSchema } from "../../shared/schema.js";
import { notifyOwner } from "../../shared/notify.js";
import { ipHash, rateLimitOk, turnstileOk, CONSENT_VERSION } from "../../shared/orders.js";

const LAYER = "LEAD_V1";
const KINDS = ["contact", "checklist"];
const CALC_KEYS = ["price", "grams", "bean_kg", "other_cost", "cups_day", "days", "cost_cup", "profit_cup", "profit_month"];
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; };
function calcJson(c) {
  if (!c || typeof c !== "object") return null;
  const o = {};
  for (const k of CALC_KEYS) { const n = num(c[k]); if (n != null && Math.abs(n) < 1e9) o[k] = n; }
  return Object.keys(o).length ? JSON.stringify(o) : null;
}
// Sample program knobs (set in Cloudflare Pages variables; defaults are conservative).
const sampleGrams = (env) => { const n = Number(env.SAMPLE_GRAMS); return n > 0 && n <= 500 ? Math.round(n) : 100; };
const sampleLimit = (env) => { const n = Number(env.SAMPLE_WEEKLY_LIMIT); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 5; };
const STAGES = ["planning", "opening_soon", "open_switching"];
const STAGE_TH = { planning: "กำลังวางแผนเปิดร้าน", opening_soon: "จะเปิดร้านเร็ว ๆ นี้", open_switching: "เปิดร้านแล้ว อยากเปลี่ยน/เพิ่มเจ้าเมล็ด" };

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" } });
}
const text = (v) => (v == null ? "" : String(v).trim());
const clip = (v, n) => text(v).slice(0, n);

export async function onRequestPost(context) {
  try {
    const db = context.env && context.env.DB, env = context.env || {};
    if (!db) return json({ success: false, layer: LAYER, status: "DB_BINDING_NOT_FOUND" }, 500);
    await ensureSchema(db);
    const b = await context.request.json().catch(() => ({}));

    if (text(b.website)) return json({ success: false, layer: LAYER, status: "REJECTED" }, 400); // honeypot
    const ih = await ipHash(context.request, env);
    if (!await rateLimitOk(db, ih)) return json({ success: false, layer: LAYER, status: "RATE_LIMITED", error: "ส่งบ่อยเกินไป กรุณารอสักครู่" }, 429);
    if (!await turnstileOk(env, b.turnstile_token, context.request)) return json({ success: false, layer: LAYER, status: "TURNSTILE_FAILED" }, 403);

    const name = text(b.name), phone = normalizePhone(b.phone), stage = text(b.stage);
    const fields = {};
    if (!isValidName(name)) fields.name = "กรุณาระบุชื่อ";
    if (!isValidThaiPhone(phone)) fields.phone = "กรุณาระบุเบอร์มือถือไทย 10 หลัก";
    if (!STAGES.includes(stage)) fields.stage = "กรุณาเลือกสถานะของร้าน";
    if (b.consent !== true) fields.consent = "กรุณายอมรับนโยบายความเป็นส่วนตัว";
    if (Object.keys(fields).length) return json({ success: false, layer: LAYER, status: "LEAD_VALIDATION", fields }, 400);

    const kind = KINDS.includes(text(b.kind)) ? text(b.kind) : "contact";
    const wantSample = b.sample === true && kind === "contact";
    const shopName = clip(b.shop_name, 120), kgWeek = clip(b.kg_week, 60);
    const addr = text(b.sample_address), postal = text(b.sample_postal);
    if (wantSample) {
      // A sample costs real money: only for shops that gave real details and a place to ship to.
      if (shopName.length < 2) fields.shop_name = "กรุณาระบุชื่อร้านเพื่อขอตัวอย่าง";
      if (!kgWeek) fields.kg = "กรุณาระบุปริมาณที่คาดว่าใช้ต่อสัปดาห์";
      if (!isValidAddress(addr)) fields.sample_address = "กรุณาระบุที่อยู่จัดส่งตัวอย่างให้ครบ";
      if (!isValidPostal(postal)) fields.sample_postal = "รหัสไปรษณีย์ 5 หลัก";
      if (Object.keys(fields).length) return json({ success: false, layer: LAYER, status: "LEAD_VALIDATION", fields }, 400);
    }

    const isTest = (b.is_test === true || b.is_test === 1 || b.is_test === "1") ? 1 : 0;
    let sample = "none", grams = null;
    if (wantSample) {
      const dup = await db.prepare("SELECT id FROM leads WHERE phone=? AND sample_requested=1 AND is_test=0 LIMIT 1").bind(phone).first();
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const used = await db.prepare("SELECT COUNT(*) AS n FROM leads WHERE sample_requested=1 AND is_test=0 AND created_at>=?").bind(since).first();
      if (dup && !isTest) sample = "already";
      else if (!isTest && Number((used && used.n) || 0) >= sampleLimit(env)) sample = "full";
      else { sample = "queued"; grams = sampleGrams(env); }
    }

    const id = "lead_" + crypto.randomUUID();
    const now = new Date().toISOString();
    const row = {
      shop: shopName, menu: clip(b.menu, 200), machine: clip(b.machine, 120),
      kg: kgWeek, note: clip(b.note, 500), src: clip(b.src, 60),
      us: clip(b.utm_source, 60), um: clip(b.utm_medium, 60), uc: clip(b.utm_campaign, 60),
    };
    const sampleOn = sample === "queued";
    await db.prepare("INSERT INTO leads (id,name,phone,shop_name,stage,menu,machine,kg_week,note,src,utm_source,utm_medium,utm_campaign,is_test,status,consent_at,consent_version,ip_hash,created_at,kind,sample_requested,sample_grams,sample_address,sample_postal,sample_status,calc_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, clip(name, 120), phone, row.shop, stage, row.menu, row.machine, row.kg, row.note, row.src, row.us, row.um, row.uc, isTest, "new", now, CONSENT_VERSION, ih, now,
        kind, sampleOn ? 1 : 0, grams, sampleOn ? clip(addr, 500) : null, sampleOn ? postal : null, sampleOn ? "to_send" : null, calcJson(b.calc)).run();

    const head = kind === "checklist" ? "📋 ขอเช็กลิสต์เปิดร้าน" : sampleOn ? "🎁 ร้านขอตัวอย่างเมล็ด " + grams + " กรัม" : "☕ ลูกค้าร้านใหม่ขอคุย";
    const calc = calcJson(b.calc);
    let msg = (isTest ? "[ทดสอบ] " : "") + head + "\n" + clip(name, 120) + " โทร " + phone +
      "\nร้าน: " + (row.shop || "-") + "\nสถานะ: " + STAGE_TH[stage] +
      "\nเมนูหลัก: " + (row.menu || "-") + "\nเครื่อง: " + (row.machine || "-") + "\nปริมาณ/สัปดาห์: " + (row.kg || "-") +
      (row.note ? "\nหมายเหตุ: " + row.note : "") + "\nช่องทาง: " + (row.src || row.us || "ไม่ระบุ");
    if (calc) { const c = JSON.parse(calc); msg += "\nเครื่องคำนวณ: ต้นทุน/แก้ว " + (c.cost_cup ?? "-") + " กำไร/เดือน " + (c.profit_month ?? "-"); }
    if (sampleOn) msg += "\nส่งตัวอย่างที่: " + clip(addr, 300) + " " + postal;
    else if (sample === "full") msg += "\n⚠️ ขอตัวอย่าง แต่โควตาสัปดาห์นี้เต็ม ติดต่อกลับเอง";
    else if (sample === "already") msg += "\n⚠️ เบอร์นี้เคยได้ตัวอย่างแล้ว";
    const job = notifyOwner(env, msg).catch(() => {});
    if (context.waitUntil) context.waitUntil(job); else await job;

    return json({ success: true, layer: LAYER, status: "LEAD_SAVED", id, sample, sample_grams: grams });
  } catch (e) {
    return json({ success: false, layer: LAYER, status: "LEAD_ERROR", error: String(e && e.message || e) }, 500);
  }
}

export async function onRequestGet(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return json({ success: false, layer: LAYER, status: "DB_BINDING_NOT_FOUND" }, 500);
    await ensureSchema(db);
    const u = new URL(context.request.url);
    const real = u.searchParams.get("include_test") === "1" ? "" : " WHERE is_test=0";
    const r = await db.prepare("SELECT id,name,phone,shop_name,stage,menu,machine,kg_week,note,src,utm_source,status,is_test,created_at,kind,sample_requested,sample_grams,sample_status,sample_address,sample_postal,calc_json FROM leads" + real + " ORDER BY created_at DESC LIMIT 100").all();
    return json({ success: true, layer: LAYER, leads: r.results || [] });
  } catch (e) {
    return json({ success: false, layer: LAYER, status: "LEAD_ERROR", error: String(e && e.message || e) }, 500);
  }
}
