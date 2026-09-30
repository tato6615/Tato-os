// TATO-OS sales by channel (UTM). Route: GET /api/sales-report?from=YYYY-MM-DD&to=YYYY-MM-DD
// Real orders only: WHERE is_test = 0. "paid" = status 'paid'. Cancelled orders are excluded from
// "orders" so expired/abandoned pending orders do not distort conversion.

import { ensureSchema } from "../../shared/schema.js";
import { expirePending } from "../../shared/orders.js";

function json(d, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" } });
}
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

export async function onRequestGet(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return json({ success: false, status: "DB_BINDING_NOT_FOUND" }, 500);
    await ensureSchema(db);
    await expirePending(db, context.env || {}, new URL(context.request.url).origin).catch(() => {});
    const u = new URL(context.request.url);
    const from = u.searchParams.get("from"), to = u.searchParams.get("to");
    const where = ["COALESCE(is_test,0)=0", "status<>'cancelled'"], binds = [];
    if (isDate(from)) { where.push("julianday(created_at) >= julianday(?)"); binds.push(from); }
    if (isDate(to)) { where.push("julianday(created_at) < julianday(?, '+1 day')"); binds.push(to); }
    const sql =
      "SELECT COALESCE(NULLIF(utm_source,''),'(direct)') AS source, COALESCE(NULLIF(utm_medium,''),'') AS medium, COALESCE(NULLIF(utm_campaign,''),'') AS campaign, " +
      "COUNT(*) AS orders, SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) AS paid_orders, " +
      "COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END),0) AS revenue, " +
      "COALESCE(SUM(CASE WHEN status='paid' THEN total_kg ELSE 0 END),0) AS kg, " +
      "COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0) AS pending_amount " +
      "FROM orders WHERE " + where.join(" AND ") + " GROUP BY 1,2,3 ORDER BY revenue DESC, orders DESC";
    const rows = ((await db.prepare(sql).bind(...binds).all()).results || []).map((r) => ({
      ...r, paid_rate_pct: r.orders ? Math.round((r.paid_orders / r.orders) * 1000) / 10 : 0,
    }));
    const t = rows.reduce((a, r) => ({ orders: a.orders + r.orders, paid_orders: a.paid_orders + r.paid_orders, revenue: a.revenue + r.revenue, kg: a.kg + r.kg, pending_amount: a.pending_amount + r.pending_amount }), { orders: 0, paid_orders: 0, revenue: 0, kg: 0, pending_amount: 0 });
    return json({ success: true, from: from || null, to: to || null, total: t, rows });
  } catch (e) { return json({ success: false, status: "ERROR", error: e && e.message ? e.message : String(e) }, 500); }
}
