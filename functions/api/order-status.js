// TATO-OS
// Public order status for customers. Route: GET /api/order-status?id=...&t=...
// Needs the private lookup token from the customer's link, so order ids alone reveal nothing.
// Returns only what the customer needs; the address is masked.

import { ensureSchema } from "../../shared/schema.js";
import { orderNo, statusLabel, safeEq } from "../../shared/orders.js";

function json(d, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" } });
}

const TRACK_URLS = {
  thaipost: "https://track.thailandpost.co.th/?trackNumber=",
  kerry: "https://th.kerryexpress.com/th/track/?track=",
  flash: "https://www.flashexpress.co.th/tracking/?se=",
  jt: "https://www.jtexpress.co.th/index/query/gzquery.html?bills=",
};

export async function onRequestGet(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return json({ success: false, status: "DB_BINDING_NOT_FOUND" }, 500);
    await ensureSchema(db);
    const u = new URL(context.request.url);
    const id = String(u.searchParams.get("id") || ""), t = String(u.searchParams.get("t") || "");
    if (!id || !t) return json({ success: false, status: "NOT_FOUND" }, 404);
    const o = await db.prepare(
      "SELECT o.*, d.name AS d_name, d.address AS d_address, d.postal_code AS d_postal, d.roast AS d_roast, d.grind AS d_grind, d.lookup_token AS tok " +
      "FROM orders o JOIN order_details d ON d.order_id=o.id WHERE o.id=? LIMIT 1"
    ).bind(id).first();
    if (!o || !o.tok || !safeEq(o.tok, t)) return json({ success: false, status: "NOT_FOUND" }, 404);
    const st = statusLabel(o);
    const courier = String(o.courier || "");
    const track = o.tracking_no ? { courier, tracking_no: o.tracking_no, url: TRACK_URLS[courier.toLowerCase()] ? TRACK_URLS[courier.toLowerCase()] + encodeURIComponent(o.tracking_no) : "", shipped_at: o.shipped_at || null } : null;
    const addr = String(o.d_address || "");
    const env = context.env || {};
    return json({
      success: true,
      order: {
        number: orderNo(o.id), created_at: o.created_at, status: st.code, status_th: st.th,
        name: o.d_name || "", address_masked: addr ? addr.slice(0, 12) + "…" + (o.d_postal ? " " + o.d_postal : "") : "",
        roast: o.d_roast || "", grind: o.d_grind || "", kg: Number(o.total_kg || 0),
        subtotal: Number(o.subtotal != null ? o.subtotal : o.amount || 0), discount: Number(o.discount_amount || 0),
        shipping: Number(o.shipping_fee || 0), amount: Number(o.amount != null ? o.amount : o.total_amount || 0),
        cancel_reason: o.cancel_reason || null,
      },
      tracking: track,
      payment: st.code === "pending" ? {
        bank_name: String(env.PAYMENT_BANK_NAME || ""), account_name: String(env.PAYMENT_ACCOUNT_NAME || ""),
        account_number: String(env.PAYMENT_ACCOUNT_NUMBER || ""), promptpay: String(env.PAYMENT_PROMPTPAY || ""),
        line_oa: String(env.PAYMENT_LINE_OA || ""),
      } : null,
    });
  } catch (e) {
    return json({ success: false, status: "ERROR", error: e && e.message ? e.message : String(e) }, 500);
  }
}
