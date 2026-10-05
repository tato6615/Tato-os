// TATO-OS: café reorder reminders + referral codes (admin only; not in the middleware PUBLIC list).
//   GET  /api/cafe-reorder                 café customers (matched to a real lead by phone) with a reorder estimate
//   POST /api/cafe-reorder {phone}         create a one-use referral discount code for that café (header x-requested-with: tato-hq)
// Nothing is sent automatically: the owner copies the suggested message and sends it on LINE.
import { ensureSchema } from "../../shared/schema.js";

const LAYER = "CAFE_REORDER_V1";
const DEFAULT_DAYS = 14;        // used only when we know nothing about the shop's usage
const SOON_DAYS = 3;
const DAY = 86400000;
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" } });
}
const adminWriteOk = (r) => r.headers.get("x-requested-with") === "tato-hq";

/** First number in text such as "2-3 กก." -> 2.5 (range midpoint), "5" -> 5. null if none. */
export function parseKgWeek(v) {
  const m = String(v || "").match(/(\d+(?:\.\d+)?)(?:\s*[-–~]\s*(\d+(?:\.\d+)?))?/);
  if (!m) return null;
  const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
  const mid = (a + b) / 2;
  return mid > 0 && mid <= 500 ? mid : null;
}

/** Pure estimate so it can be tested: orders sorted oldest -> newest [{kg, at}], kgWeek from the lead. */
export function estimateReorder(orders, kgWeek, nowMs = Date.now()) {
  const last = orders[orders.length - 1];
  let intervalDays = null, basis = "default";
  if (orders.length >= 2) {
    const gaps = [];
    for (let i = 1; i < orders.length; i++) gaps.push((orders[i].at - orders[i - 1].at) / DAY);
    intervalDays = gaps.reduce((a, b) => a + b, 0) / gaps.length; basis = "history";
  } else if (kgWeek) {
    intervalDays = (last.kg / kgWeek) * 7; basis = "lead_kg_week";
  }
  if (!(intervalDays > 0)) { intervalDays = DEFAULT_DAYS; basis = "default"; }
  intervalDays = Math.max(3, Math.round(intervalDays));
  const dueAt = last.at + intervalDays * DAY;
  const daysLeft = Math.ceil((dueAt - nowMs) / DAY);
  return { interval_days: intervalDays, basis, due_at: new Date(dueAt).toISOString(), days_left: daysLeft, state: daysLeft <= 0 ? "due" : daysLeft <= SOON_DAYS ? "soon" : "ok" };
}

export async function onRequestGet(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return json({ success: false, layer: LAYER, status: "DB_BINDING_NOT_FOUND" }, 500);
    await ensureSchema(db);
    const leads = (await db.prepare("SELECT name,phone,shop_name,kg_week FROM leads WHERE is_test=0 ORDER BY created_at DESC").all()).results || [];
    const byPhone = new Map();
    for (const l of leads) if (!byPhone.has(l.phone)) byPhone.set(l.phone, l);
    const rows = (await db.prepare(
      "SELECT o.id, o.total_kg AS kg, o.created_at AS at, d.phone AS phone, d.name AS name FROM orders o JOIN order_details d ON d.order_id=o.id " +
      "WHERE o.status='paid' AND COALESCE(o.is_test,0)=0 ORDER BY o.created_at ASC"
    ).all()).results || [];
    const groups = new Map();
    for (const r of rows) {
      if (!r.phone || !byPhone.has(r.phone)) continue;
      const t = Date.parse(r.at); if (!Number.isFinite(t)) continue;
      if (!groups.has(r.phone)) groups.set(r.phone, []);
      groups.get(r.phone).push({ kg: Number(r.kg) || 0, at: t });
    }
    const out = [];
    for (const [phone, orders] of groups) {
      const lead = byPhone.get(phone);
      const est = estimateReorder(orders, parseKgWeek(lead.kg_week));
      const shop = lead.shop_name || lead.name;
      out.push({
        phone, name: lead.name, shop, orders: orders.length,
        total_kg: Math.round(orders.reduce((a, o) => a + o.kg, 0) * 100) / 100,
        last_order_at: new Date(orders[orders.length - 1].at).toISOString(), last_kg: orders[orders.length - 1].kg,
        ...est,
        message: "สวัสดีครับ คุณ" + lead.name + " จาก" + shop + " กาแฟรอบที่แล้ว (" + orders[orders.length - 1].kg + " กก.) น่าจะใกล้หมดแล้วใช่ไหมครับ จะให้คั่วรอบใหม่เตรียมไว้ให้ไหมครับ บอกระดับคั่วและปริมาณได้เลย",
      });
    }
    const rank = { due: 0, soon: 1, ok: 2 };
    out.sort((a, b) => rank[a.state] - rank[b.state] || a.days_left - b.days_left);
    return json({ success: true, layer: LAYER, cafes: out, note: "ประมาณจากประวัติ/ปริมาณที่ร้านแจ้ง ไม่ใช่ข้อมูลการใช้จริง" });
  } catch (e) {
    return json({ success: false, layer: LAYER, status: "REORDER_ERROR", error: String(e && e.message || e) }, 500);
  }
}

function refCode() {
  const a = new Uint8Array(4); crypto.getRandomValues(a);
  return "REF-" + Array.from(a, (b) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[b % 31]).join("");
}

export async function onRequestPost(context) {
  try {
    const db = context.env && context.env.DB, env = context.env || {};
    if (!db) return json({ success: false, layer: LAYER, status: "DB_BINDING_NOT_FOUND" }, 500);
    if (!adminWriteOk(context.request)) return json({ success: false, layer: LAYER, status: "FORBIDDEN" }, 403);
    await ensureSchema(db);
    const b = await context.request.json().catch(() => ({}));
    const phone = String(b.phone || "").trim();
    const lead = phone && await db.prepare("SELECT name,shop_name FROM leads WHERE phone=? AND is_test=0 LIMIT 1").bind(phone).first();
    if (!lead) return json({ success: false, layer: LAYER, status: "NOT_FOUND" }, 404);
    const value = Number(env.REFERRAL_DISCOUNT) > 0 ? Math.round(Number(env.REFERRAL_DISCOUNT)) : 50;
    const code = refCode(), now = new Date();
    await db.prepare("INSERT INTO discount_codes (code,type,value,min_kg,max_uses,used_count,expires_at,active,created_at) VALUES (?,?,?,?,?,0,?,1,?)")
      .bind(code, "fixed", value, 1, 1, new Date(now.getTime() + 90 * DAY).toISOString(), now.toISOString()).run();
    return json({ success: true, layer: LAYER, status: "REFERRAL_CREATED", code, value, expires_days: 90,
      message: "ถ้ามีเพื่อนเจ้าของร้านอยากลองเมล็ดของเรา ส่งโค้ด " + code + " ให้ได้เลยครับ ลด " + value + " บาท สำหรับออเดอร์แรก (ขั้นต่ำ 1 กก. ใช้ได้ 1 ครั้ง ภายใน 90 วัน)" });
  } catch (e) {
    return json({ success: false, layer: LAYER, status: "REORDER_ERROR", error: String(e && e.message || e) }, 500);
  }
}
