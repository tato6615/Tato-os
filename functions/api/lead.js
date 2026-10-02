// TATO-OS
// Lead capture for /cafe/ (new cafe / small shop owners)
// Route: /api/lead
//   POST  public   -> stores a lead, notifies the owner (LINE/Telegram if configured)
//   GET   admin    -> latest leads (behind Basic Auth; only "POST /api/lead" is public)

import { isValidName, isValidThaiPhone, normalizePhone } from "../../shared/validate.js";
import { ensureSchema } from "../../shared/schema.js";
import { notifyOwner } from "../../shared/notify.js";
import { ipHash, rateLimitOk, turnstileOk, CONSENT_VERSION } from "../../shared/orders.js";

const LAYER = "LEAD_V1";
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

    const isTest = (b.is_test === true || b.is_test === 1 || b.is_test === "1") ? 1 : 0;
    const id = "lead_" + crypto.randomUUID();
    const now = new Date().toISOString();
    const row = {
      shop: clip(b.shop_name, 120), menu: clip(b.menu, 200), machine: clip(b.machine, 120),
      kg: clip(b.kg_week, 60), note: clip(b.note, 500), src: clip(b.src, 60),
      us: clip(b.utm_source, 60), um: clip(b.utm_medium, 60), uc: clip(b.utm_campaign, 60),
    };
    await db.prepare("INSERT INTO leads (id,name,phone,shop_name,stage,menu,machine,kg_week,note,src,utm_source,utm_medium,utm_campaign,is_test,status,consent_at,consent_version,ip_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, clip(name, 120), phone, row.shop, stage, row.menu, row.machine, row.kg, row.note, row.src, row.us, row.um, row.uc, isTest, "new", now, CONSENT_VERSION, ih, now).run();

    const msg = (isTest ? "[ทดสอบ] " : "") + "☕ ลูกค้าร้านใหม่ขอคุย\n" + clip(name, 120) + " โทร " + phone +
      "\nร้าน: " + (row.shop || "-") + "\nสถานะ: " + STAGE_TH[stage] +
      "\nเมนูหลัก: " + (row.menu || "-") + "\nเครื่อง: " + (row.machine || "-") + "\nปริมาณ/สัปดาห์: " + (row.kg || "-") +
      (row.note ? "\nหมายเหตุ: " + row.note : "") + "\nช่องทาง: " + (row.src || row.us || "ไม่ระบุ");
    const job = notifyOwner(env, msg).catch(() => {});
    if (context.waitUntil) context.waitUntil(job); else await job;

    return json({ success: true, layer: LAYER, status: "LEAD_SAVED", id });
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
    const r = await db.prepare("SELECT id,name,phone,shop_name,stage,menu,machine,kg_week,note,src,utm_source,status,is_test,created_at FROM leads" + real + " ORDER BY created_at DESC LIMIT 100").all();
    return json({ success: true, layer: LAYER, leads: r.results || [] });
  } catch (e) {
    return json({ success: false, layer: LAYER, status: "LEAD_ERROR", error: String(e && e.message || e) }, 500);
  }
}
