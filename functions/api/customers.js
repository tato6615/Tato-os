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

// Founder overrides. Two independent fields:
//   tier        : "new" | "regular" | ""/"auto"  (purchase-history status)
//   price_group : "cafe" | ""/"retail"           (price group: cafes get 550/kg)
// Send only the field(s) you want to change.
export async function onRequestPatch(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return Response.json({ success: false, error: "DB_BINDING_NOT_FOUND" }, { status: 500 });
    const body = await context.request.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    if (!id || id.length > 100) return Response.json({ success: false, error: "BAD_ID" }, { status: 400 });
    const hasTier = body.tier !== undefined, hasGroup = body.price_group !== undefined;
    if (!hasTier && !hasGroup) return Response.json({ success: false, error: "NOTHING_TO_UPDATE" }, { status: 400 });
    const tierRaw = String(body.tier == null ? "" : body.tier).trim().toLowerCase();
    const groupRaw = String(body.price_group == null ? "" : body.price_group).trim().toLowerCase();
    if (hasTier && tierRaw && tierRaw !== "auto" && !["new", "regular"].includes(tierRaw))
      return Response.json({ success: false, error: "BAD_TIER" }, { status: 400 });
    if (hasGroup && groupRaw && groupRaw !== "retail" && groupRaw !== "cafe")
      return Response.json({ success: false, error: "BAD_PRICE_GROUP" }, { status: 400 });
    const cols = ((await db.prepare("PRAGMA table_info(customers)").all()).results || []).map((x) => x.name);
    if (!cols.includes("tier")) await db.prepare("ALTER TABLE customers ADD COLUMN tier TEXT").run();
    if (!cols.includes("price_group")) await db.prepare("ALTER TABLE customers ADD COLUMN price_group TEXT").run();
    let r;
    if (hasTier) {
      // old rows stored the cafe flag in tier; move it to price_group before overwriting tier
      r = await db.prepare("UPDATE customers SET price_group=CASE WHEN tier='cafe' THEN 'cafe' ELSE price_group END, tier=? WHERE id=?")
        .bind(!tierRaw || tierRaw === "auto" ? null : tierRaw, id).run();
    }
    if (hasGroup) {
      r = await db.prepare("UPDATE customers SET price_group=?, tier=CASE WHEN tier='cafe' THEN NULL ELSE tier END WHERE id=?")
        .bind(groupRaw === "cafe" ? "cafe" : null, id).run();
    }
    if (!(r && r.meta && Number(r.meta.changes))) return Response.json({ success: false, error: "NOT_FOUND" }, { status: 404 });
    return Response.json({ success: true, id });
  } catch (error) {
    return Response.json({ success: false, error: error && error.message ? error.message : String(error) }, { status: 500 });
  }
}
