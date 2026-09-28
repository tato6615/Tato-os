function json(d, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" } });
}
export async function onRequestGet(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return json({ success: false, status: "DB_BINDING_NOT_FOUND" }, 500);
    await db.prepare("CREATE TABLE IF NOT EXISTS order_details (order_id TEXT PRIMARY KEY, name TEXT, phone TEXT, email TEXT, address TEXT, roast TEXT, grind TEXT, note TEXT, payment_method TEXT, created_at TEXT)").run();
    const r = await db.prepare(
      "SELECT o.*, c.name AS c_name, c.phone AS c_phone, c.email AS c_email, d.name AS d_name, d.phone AS d_phone, d.address AS d_address, d.roast AS d_roast, d.grind AS d_grind, d.note AS d_note, d.payment_method AS d_pm " +
      "FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN order_details d ON d.order_id=o.id ORDER BY o.created_at DESC LIMIT 200"
    ).all();
    const orders = (r.results || []).map(function (o) {
      return {
        id: o.id,
        number: "TATO-" + String(o.id).replace(/^order_/, "").slice(0, 8).toUpperCase(),
        created_at: o.created_at,
        status: String(o.status || "pending").toLowerCase(),
        amount: Number(o.amount != null ? o.amount : (o.total_amount || 0)),
        kg: Number(o.total_kg != null ? o.total_kg : (o.quantity || 0)),
        name: o.d_name || o.c_name || "",
        phone: o.d_phone || o.c_phone || "",
        email: o.c_email || "",
        address: o.d_address || "",
        roast: o.d_roast || "",
        grind: o.d_grind || "",
        note: o.d_note || "",
        payment_method: o.d_pm || o.payment_method || ""
      };
    });
    return json({ success: true, orders: orders });
  } catch (e) {
    return json({ success: false, status: "ERROR", error: e && e.message ? e.message : String(e) }, 500);
  }
}
