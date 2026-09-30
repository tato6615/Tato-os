// TATO-OS slip check (optional, human still confirms payment).
// Route: POST /api/verify-slip  multipart/form-data: order_id, file (slip image)
// Needs SLIPOK_API_KEY and SLIPOK_BRANCH_ID in Pages > Variables (SlipOK account). Without them it
// answers SLIP_VERIFY_NOT_CONFIGURED and nothing changes.
// It never marks an order paid: it only reports whether the slip is real, the amount matches, and the
// slip has not been used on another order. The owner then presses "ยืนยันว่าเงินเข้าแล้ว".
//
// UNTESTED against the live SlipOK service (no account available while building).
// Check the response field names against SlipOK's current docs before relying on it.

import { ensureSchema } from "../../shared/schema.js";

function json(d, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" } });
}

export async function onRequestPost(context) {
  try {
    const db = context.env && context.env.DB, env = context.env || {};
    if (!db) return json({ success: false, status: "DB_BINDING_NOT_FOUND" }, 500);
    if (!env.SLIPOK_API_KEY || !env.SLIPOK_BRANCH_ID) return json({ success: false, status: "SLIP_VERIFY_NOT_CONFIGURED" }, 501);
    await ensureSchema(db);
    const form = await context.request.formData();
    const orderId = String(form.get("order_id") || ""), file = form.get("file");
    if (!orderId || !file || typeof file === "string") return json({ success: false, status: "ORDER_AND_FILE_REQUIRED" }, 400);
    if (file.size > 5 * 1024 * 1024) return json({ success: false, status: "FILE_TOO_LARGE" }, 400);
    const o = await db.prepare("SELECT id, amount, total_amount, status FROM orders WHERE id=?").bind(orderId).first();
    if (!o) return json({ success: false, status: "ORDER_NOT_FOUND" }, 404);
    const expected = Number(o.amount != null ? o.amount : o.total_amount || 0);

    const fd = new FormData();
    fd.append("files", file, file.name || "slip.jpg");
    fd.append("amount", String(expected));
    fd.append("log", "true");
    const r = await fetch("https://api.slipok.com/api/line/apikey/" + encodeURIComponent(env.SLIPOK_BRANCH_ID), {
      method: "POST", headers: { "x-authorization": env.SLIPOK_API_KEY }, body: fd,
    });
    const j = await r.json().catch(() => ({}));
    const d = (j && j.data) || {};
    const ok = !!(j && j.success !== false && r.ok && d.success !== false);
    const ref = String(d.transRef || "").trim();
    const paid = Number(d.amount);
    const amountMatches = ok && Number.isFinite(paid) && Math.abs(paid - expected) < 0.005;

    let duplicate = false;
    if (ok && ref) {
      const used = await db.prepare("SELECT order_id FROM order_details WHERE slip_ref=? AND order_id<>?").bind(ref, orderId).first();
      duplicate = !!used;
    }
    const verdict = !ok ? "SLIP_NOT_VERIFIED" : duplicate ? "SLIP_ALREADY_USED" : !amountMatches ? "AMOUNT_MISMATCH" : "SLIP_OK";
    if (verdict === "SLIP_OK" && ref) {
      await db.prepare("UPDATE order_details SET slip_ref=?, slip_checked_at=?, slip_result=? WHERE order_id=?").bind(ref, new Date().toISOString(), verdict, orderId).run();
    } else {
      await db.prepare("UPDATE order_details SET slip_checked_at=?, slip_result=? WHERE order_id=?").bind(new Date().toISOString(), verdict, orderId).run();
    }
    return json({ success: true, status: verdict, expected_amount: expected, slip_amount: Number.isFinite(paid) ? paid : null, message: (j && j.message) || null });
  } catch (e) {
    return json({ success: false, status: "ERROR", error: e && e.message ? e.message : String(e) }, 500);
  }
}
