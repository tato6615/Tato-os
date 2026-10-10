export async function onRequestGet(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) {
      return Response.json({ success: false, error: "DB_BINDING_NOT_FOUND" }, { status: 500 });
    }

    const { results } = await db
      .prepare(`
        SELECT *
        FROM customers
        ORDER BY created_at DESC
      `)
      .all();

    return Response.json({
      success: true,
      customers: results
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error && error.message ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) {
      return Response.json({ success: false, error: "DB_BINDING_NOT_FOUND" }, { status: 500 });
    }

    const body = await context.request.json();

    const id = crypto.randomUUID();
    const email = body.email || null;
    const name = body.name || null;
    const phone = body.phone || null;
    const source = body.source || null;

    await db
      .prepare(`
        INSERT INTO customers
        (id, email, name, phone, source)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(id, email, name, phone, source)
      .run();

    return Response.json({
      success: true,
      customer: {
        id,
        email,
        name,
        phone,
        source
      }
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message
      },
      { status: 400 }
    );
  }
}

// Founder override of the customer status: tier = new | regular | cafe, or ""/"auto" to go back to automatic.
export async function onRequestPatch(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return Response.json({ success: false, error: "DB_BINDING_NOT_FOUND" }, { status: 500 });
    const body = await context.request.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    const raw = String(body.tier == null ? "" : body.tier).trim().toLowerCase();
    if (!id || id.length > 100) return Response.json({ success: false, error: "BAD_ID" }, { status: 400 });
    if (raw && raw !== "auto" && !["new", "regular", "cafe"].includes(raw))
      return Response.json({ success: false, error: "BAD_TIER" }, { status: 400 });
    const cols = await db.prepare("PRAGMA table_info(customers)").all();
    if (!(cols.results || []).some((x) => x.name === "tier")) await db.prepare("ALTER TABLE customers ADD COLUMN tier TEXT").run();
    const tier = !raw || raw === "auto" ? null : raw;
    const r = await db.prepare("UPDATE customers SET tier=? WHERE id=?").bind(tier, id).run();
    if (!(r.meta && Number(r.meta.changes))) return Response.json({ success: false, error: "NOT_FOUND" }, { status: 404 });
    return Response.json({ success: true, id, tier });
  } catch (error) {
    return Response.json({ success: false, error: error && error.message ? error.message : String(error) }, { status: 500 });
  }
}
