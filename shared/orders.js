// TATO-OS order helpers shared by the /api functions.
import { sendEmail, emailEnabled } from "./notify.js";

export const PENDING_EXPIRE_HOURS = 48;
export const PENDING_REMIND_HOURS = 24;
export const CONSENT_VERSION = "2026-09-30";

export function orderNo(id) {
  return "TATO-" + String(id).replace(/^order_/, "").slice(0, 8).toUpperCase();
}

export function statusUrl(origin, id, token) {
  return origin + "/order/?id=" + encodeURIComponent(id) + "&t=" + encodeURIComponent(token);
}

export function newToken() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEq(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function ipHash(request, env) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
  const data = new TextEncoder().encode(ip + "|" + String((env && (env.IP_HASH_SALT || env.ADMIN_PASSWORD)) || "tato"));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** Per-IP limit on checkout POSTs. Returns true when allowed. Counts every attempt. */
export async function rateLimitOk(db, hash, max = 5, windowMin = 10) {
  const since = new Date(Date.now() - windowMin * 60000).toISOString();
  const r = await db.prepare("SELECT COUNT(*) AS n FROM checkout_attempts WHERE ip_hash=? AND created_at>=?").bind(hash, since).first();
  await db.prepare("INSERT INTO checkout_attempts (ip_hash, created_at) VALUES (?,?)").bind(hash, new Date().toISOString()).run();
  // opportunistic cleanup of rows older than a day
  if (Math.random() < 0.05) await db.prepare("DELETE FROM checkout_attempts WHERE created_at<?").bind(new Date(Date.now() - 86400000).toISOString()).run();
  return Number((r && r.n) || 0) < max;
}

/** Cloudflare Turnstile. If TURNSTILE_SECRET is not set the check is skipped (returns true). */
export async function turnstileOk(env, token, request) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  try {
    const form = new FormData();
    form.append("secret", env.TURNSTILE_SECRET);
    form.append("response", String(token));
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) form.append("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const j = await r.json();
    return !!j.success;
  } catch (_) { return false; }
}

/** Look up and validate a discount code. Returns {ok, code?, error?}. Does not consume it. */
export async function findCode(db, raw, kg) {
  const c = String(raw || "").trim().toUpperCase();
  if (!c) return { ok: true, code: null };
  const row = await db.prepare("SELECT * FROM discount_codes WHERE code=?").bind(c).first();
  if (!row || !row.active) return { ok: false, error: "CODE_INVALID" };
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return { ok: false, error: "CODE_EXPIRED" };
  if (row.max_uses != null && Number(row.used_count) >= Number(row.max_uses)) return { ok: false, error: "CODE_USED_UP" };
  if (Number(row.min_kg) > 0 && Number(kg) < Number(row.min_kg)) return { ok: false, error: "CODE_MIN_KG", min_kg: row.min_kg };
  return { ok: true, code: row };
}

export async function getSetting(db, key, dflt = null) {
  const r = await db.prepare("SELECT value FROM settings WHERE key=?").bind(key).first();
  return r && r.value != null ? r.value : dflt;
}

/** Roast-capacity guard. Setting max_open_kg = max kg of unshipped, non-test orders (pending or paid). */
export async function capacity(db) {
  const raw = await getSetting(db, "max_open_kg", "");
  const max = raw === "" || raw == null ? null : Number(raw);
  if (max == null || !Number.isFinite(max) || max <= 0) return { limited: false, max: null, used: 0, left: null };
  const r = await db.prepare(
    "SELECT COALESCE(SUM(total_kg),0) AS kg FROM orders WHERE COALESCE(is_test,0)=0 AND status IN ('pending','paid') AND fulfillment_status IS NULL"
  ).first();
  const used = Number((r && r.kg) || 0);
  return { limited: true, max, used, left: Math.max(0, max - used) };
}

export function statusLabel(o) {
  const s = String(o.status || "pending").toLowerCase();
  if (s === "cancelled") return { code: "cancelled", th: "ยกเลิกแล้ว" };
  if (o.fulfillment_status === "shipped") return { code: "shipped", th: "จัดส่งแล้ว" };
  if (s === "paid") return { code: "paid", th: "ชำระแล้ว อยู่ในคิวคั่ว" };
  return { code: "pending", th: "รอชำระเงิน" };
}

/**
 * Lazy housekeeping (Pages Functions have no cron): cancel unpaid orders older than 48 h,
 * and email a reminder (if email is configured) between 24 h and 48 h. Runs whenever the
 * admin page or a checkout calls it. Returns {expired, reminded}.
 */
export async function expirePending(db, env, origin) {
  const cutoff = "-" + PENDING_EXPIRE_HOURS + " hours";
  const ex = await db.prepare(
    "UPDATE orders SET status='cancelled', cancel_reason='expired_unpaid', cancelled_at=? WHERE status='pending' AND julianday(created_at) < julianday('now', ?)"
  ).bind(new Date().toISOString(), cutoff).run();
  const expired = Number((ex.meta && ex.meta.changes) || 0);

  let reminded = 0;
  if (emailEnabled(env)) {
    const rows = await db.prepare(
      "SELECT o.id, o.amount, d.email AS d_email, c.email AS c_email, d.lookup_token AS tok " +
      "FROM orders o LEFT JOIN order_details d ON d.order_id=o.id LEFT JOIN customers c ON c.id=o.customer_id " +
      "WHERE o.status='pending' AND COALESCE(o.is_test,0)=0 AND d.reminder_sent_at IS NULL " +
      "AND julianday(o.created_at) < julianday('now', ?) LIMIT 5"
    ).bind("-" + PENDING_REMIND_HOURS + " hours").all();
    for (const r of rows.results || []) {
      const to = r.d_email || r.c_email;
      if (!to) continue;
      const link = r.tok && origin ? "\nดูสถานะ/วิธีชำระเงิน: " + statusUrl(origin, r.id, r.tok) : "";
      const ok = await sendEmail(env, {
        to,
        subject: "ออเดอร์ " + orderNo(r.id) + " ยังรอการชำระเงิน",
        text: "ออเดอร์ " + orderNo(r.id) + " ยอด " + r.amount + " บาท ยังไม่ได้รับการชำระเงิน จะถูกยกเลิกอัตโนมัติภายใน " + PENDING_EXPIRE_HOURS + " ชั่วโมงหลังสั่งซื้อ" + link,
      });
      if (ok) { await db.prepare("UPDATE order_details SET reminder_sent_at=? WHERE order_id=?").bind(new Date().toISOString(), r.id).run(); reminded++; }
    }
  }
  return { expired, reminded };
}
