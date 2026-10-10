// TATO-OS admin orders. Route: /api/admin-orders  (protected by _middleware.js Basic auth)
//   GET  -> list of orders (also expires unpaid orders older than 48 h)
//   POST -> {action:"set_tracking"|"cancel"|"reopen"|"mark_reminded", order_id, ...}

import { ensureSchema } from "../../shared/schema.js";
import { orderNo, statusUrl, statusLabel, expirePending, PENDING_EXPIRE_HOURS } from "../../shared/orders.js";
import { sendEmail } from "../../shared/notify.js";

function json(d, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" } });
}
const COURIERS = ["thaipost", "self", "kerry", "flash", "jt", "other"];

export async function onRequestGet(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return json({ success: false, status: "DB_BINDING_NOT_FOUND" }, 500);
    await ensureSchema(db);
    const origin = new URL(context.request.url).origin;
    const hk = await expirePending(db, context.env || {}, origin).catch(() => ({ expired: 0, reminded: 0 }));
    const r = await db.prepare(
      "SELECT o.*, c.name AS c_name, c.phone AS c_phone, c.email AS c_email, d.name AS d_name, d.phone AS d_phone, d.email AS d_email, d.address AS d_address, d.postal_code AS d_postal, d.roast AS d_roast, d.grind AS d_grind, d.note AS d_note, d.payment_method AS d_pm, d.slip_ref AS d_slip_ref, d.slip_result AS d_slip_result " +
      "FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN order_details d ON d.order_id=o.id ORDER BY o.created_at DESC LIMIT 200"
    ).all();
    const now = Date.now();
    const orders = (r.results || []).map(function (o) {
      const st = statusLabel(o);
      const ageH = (now - new Date(o.created_at).getTime()) / 3600000;
      return {
        id: o.id, number: orderNo(o.id), created_at: o.created_at,
        status: String(o.status || "pending").toLowerCase(), fulfillment: o.fulfillment_status || "", status_th: st.th,
        amount: Number(o.amount != null ? o.amount : (o.total_amount || 0)),
        subtotal: Number(o.subtotal != null ? o.subtotal : 0), discount: Number(o.discount_amount || 0), discount_code: o.discount_code || "",
        shipping: Number(o.shipping_fee || 0),
        kg: Number(o.total_kg != null ? o.total_kg : (o.quantity || 0)),
        name: o.d_name || o.c_name || "", phone: o.d_phone || o.c_phone || "", email: o.d_email || o.c_email || "",
        address: o.d_address || "", postal: o.d_postal || "",
        roast: o.d_roast || "", grind: o.d_grind || "", note: o.d_note || "",
        payment_method: o.d_pm || o.payment_method || "",
        is_test: Number(o.is_test || 0), utm_source: o.utm_source || "",
        tracking_no: o.tracking_no || "", courier: o.courier || "", shipped_at: o.shipped_at || "",
        cancel_reason: o.cancel_reason || "", slip_ref: o.d_slip_ref || "", slip_result: o.d_slip_result || "",
        age_hours: Math.round(ageH * 10) / 10,
        expires_in_hours: String(o.status).toLowerCase() === "pending" ? Math.max(0, Math.round((PENDING_EXPIRE_HOURS - ageH) * 10) / 10) : null,
      };
    });
    const env = context.env || {};
    const notify = {
      telegram: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
      line: !!(env.LINE_CHANNEL_TOKEN && env.LINE_OWNER_USER_ID),
      email: !!(env.RESEND_API_KEY && env.EMAIL_FROM),
      turnstile: !!(env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY),
      slip: !!(env.SLIPOK_API_KEY && env.SLIPOK_BRANCH_ID),
    };
    return json({ success: true, orders: orders, notify: notify, housekeeping: hk });
  } catch (e) {
    return json({ success: false, status: "ERROR", error: e && e.message ? e.message : String(e) }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return json({ success: false, status: "DB_BINDING_NOT_FOUND" }, 500);
    await ensureSchema(db);
    const env = context.env || {}, origin = new URL(context.request.url).origin;
    const b = await context.request.json().catch(() => ({}));
    const id = String(b.order_id || "");
    const o = await db.prepare(
      "SELECT o.*, d.email AS d_email, d.lookup_token AS tok, c.email AS c_email FROM orders o LEFT JOIN order_details d ON d.order_id=o.id LEFT JOIN customers c ON c.id=o.customer_id WHERE o.id=?"
    ).bind(id).first();
    if (!o) return json({ success: false, status: "ORDER_NOT_FOUND" }, 404);
    const stamp = new Date().toISOString();

    if (b.action === "set_tracking") {
      const courier = String(b.courier || "other").toLowerCase();
      const isSelf = courier === "self"; // shop delivers by itself: no tracking number, optional short note
      const tracking = isSelf
        ? String(b.tracking_no || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 100)
        : String(b.tracking_no || "").trim().replace(/\s+/g, "");
      if (!isSelf && !/^[A-Za-z0-9\-]{6,30}$/.test(tracking)) return json({ success: false, status: "INVALID_TRACKING_NO", error: "เลขพัสดุต้องเป็นตัวอักษร/ตัวเลข 6-30 ตัว" }, 400);
      if (!COURIERS.includes(courier)) return json({ success: false, status: "INVALID_COURIER" }, 400);
      if (String(o.status).toLowerCase() !== "paid") return json({ success: false, status: "ORDER_NOT_PAID", error: "ใส่เลขพัสดุได้เมื่อออเดอร์ชำระแล้วเท่านั้น" }, 409);
      await db.prepare("UPDATE orders SET tracking_no=?, courier=?, fulfillment_status='shipped', shipped_at=? WHERE id=?").bind(tracking, courier, stamp, id).run();
      const to = o.d_email || o.c_email;
      let emailed = false;
      if (to && o.tok) {
        emailed = await sendEmail(env, {
          to, subject: "ออเดอร์ " + orderNo(id) + " จัดส่งแล้ว",
          text: "ออเดอร์ " + orderNo(id) + " จัดส่งแล้ว\n" + (isSelf ? "จัดส่งโดย: ร้านส่งเอง\n" + (tracking ? "หมายเหตุ: " + tracking + "\n" : "") : "ขนส่ง: " + courier + "\nเลขพัสดุ: " + tracking + "\n") + "\nดูสถานะ: " + statusUrl(origin, id, o.tok),
        });
      }
      return json({ success: true, status: "TRACKING_SAVED", emailed });
    }
    if (b.action === "cancel") {
      if (String(o.status).toLowerCase() === "paid") return json({ success: false, status: "ORDER_ALREADY_PAID", error: "ออเดอร์ที่ชำระแล้วยกเลิกจากหน้านี้ไม่ได้" }, 409);
      await db.prepare("UPDATE orders SET status='cancelled', cancel_reason='cancelled_by_admin', cancelled_at=? WHERE id=?").bind(stamp, id).run();
      return json({ success: true, status: "ORDER_CANCELLED" });
    }
    if (b.action === "reopen") {
      if (String(o.status).toLowerCase() !== "cancelled") return json({ success: false, status: "ORDER_NOT_CANCELLED" }, 409);
      // created_at is moved to now so the 48 h expiry clock restarts (otherwise it would re-cancel at once)
      await db.prepare("UPDATE orders SET status='pending', cancel_reason=NULL, cancelled_at=NULL, created_at=? WHERE id=?").bind(stamp, id).run();
      return json({ success: true, status: "ORDER_REOPENED" });
    }
    return json({ success: false, status: "UNSUPPORTED_ACTION", allowed: ["set_tracking", "cancel", "reopen"] }, 400);
  } catch (e) {
    return json({ success: false, status: "ERROR", error: e && e.message ? e.message : String(e) }, 500);
  }
}
