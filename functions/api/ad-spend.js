// TATO-OS: ad spend log for the marketing brain. Route: /api/ad-spend (admin auth via _middleware.js)
//   GET    ?from=YYYY-MM-DD&to=YYYY-MM-DD  -> {rows:[...]} (latest 200)
//   POST   {spend_date, channel, campaign?, amount, note?}  -> add one entry (header x-requested-with: tato-hq)
//   DELETE ?id=spend_...                    -> delete one entry (same header)
// "channel" must match the utm_source / src you put on that ad's link (facebook, google, tiktok, ...).
import { ensureSchema } from "../../shared/schema.js";
import { normChannel } from "../../shared/marketing.js";

function json(d, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" } });
}
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T00:00:00Z").getTime());
const writeOk = (request) => request.headers.get("x-requested-with") === "tato-hq";
const validId = (v) => typeof v === "string" && /^spend_[0-9a-f-]{36}$/i.test(v);

export async function onRequestGet(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return json({ success: false, status: "DB_BINDING_NOT_FOUND" }, 500);
    await ensureSchema(db);
    const u = new URL(context.request.url), from = u.searchParams.get("from"), to = u.searchParams.get("to");
    const where = [], binds = [];
    if (isDate(from)) { where.push("spend_date >= ?"); binds.push(from); }
    if (isDate(to)) { where.push("spend_date <= ?"); binds.push(to); }
    const r = await db.prepare("SELECT id,spend_date,channel,campaign,amount,note,created_at FROM ad_spend" + (where.length ? " WHERE " + where.join(" AND ") : "") + " ORDER BY spend_date DESC, created_at DESC LIMIT 200").bind(...binds).all();
    return json({ success: true, rows: r.results || [] });
  } catch (e) { return json({ success: false, status: "ERROR", error: String(e && e.message || e) }, 500); }
}

export async function onRequestPost(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return json({ success: false, status: "DB_BINDING_NOT_FOUND" }, 500);
    if (!writeOk(context.request)) return json({ success: false, status: "FORBIDDEN" }, 403);
    await ensureSchema(db);
    const b = await context.request.json().catch(() => ({}));
    const channel = normChannel(b.channel), amount = Number(b.amount);
    const fields = {};
    if (!isDate(b.spend_date)) fields.spend_date = "วันที่ไม่ถูกต้อง (YYYY-MM-DD)";
    if (channel === "(direct)" || !/^[a-z0-9_.-]{1,40}$/.test(channel)) fields.channel = "ช่องทางใช้ได้เฉพาะ a-z 0-9 _ - . (เช่น facebook, google, tiktok)";
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) fields.amount = "จำนวนเงินต้องมากกว่า 0";
    if (Object.keys(fields).length) return json({ success: false, status: "VALIDATION", fields }, 400);
    const id = "spend_" + crypto.randomUUID();
    await db.prepare("INSERT INTO ad_spend (id,spend_date,channel,campaign,amount,note,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(id, b.spend_date, channel, String(b.campaign || "").trim().slice(0, 80) || null, Math.round(amount * 100) / 100, String(b.note || "").trim().slice(0, 200) || null, new Date().toISOString()).run();
    return json({ success: true, status: "SPEND_SAVED", id });
  } catch (e) { return json({ success: false, status: "ERROR", error: String(e && e.message || e) }, 500); }
}

export async function onRequestDelete(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return json({ success: false, status: "DB_BINDING_NOT_FOUND" }, 500);
    if (!writeOk(context.request)) return json({ success: false, status: "FORBIDDEN" }, 403);
    await ensureSchema(db);
    const id = new URL(context.request.url).searchParams.get("id");
    if (!validId(id)) return json({ success: false, status: "BAD_REQUEST" }, 400);
    const r = await db.prepare("DELETE FROM ad_spend WHERE id=?").bind(id).run();
    if (!(r && r.meta && Number(r.meta.changes))) return json({ success: false, status: "NOT_FOUND" }, 404);
    return json({ success: true, status: "SPEND_DELETED", id });
  } catch (e) { return json({ success: false, status: "ERROR", error: String(e && e.message || e) }, 500); }
}
