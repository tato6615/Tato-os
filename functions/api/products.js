async function ensureProductEconomics(db) {
  const info = await db.prepare("PRAGMA table_info(products)").all();
  const columns = (info.results || []).map(row => row.name);
  if (!columns.includes("cost_price")) {
    await db.prepare("ALTER TABLE products ADD COLUMN cost_price REAL").run();
  }
}

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    await ensureProductEconomics(db);
    const { results } = await db.prepare("SELECT * FROM products ORDER BY created_at DESC").all();
    return Response.json({ success: true, products: results });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    await ensureProductEconomics(db);
    const body = await context.request.json();
    const name = body.name?.trim() || "";

    if (!name) {
      return Response.json({ success: false, error: "Product name is required" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const slug = body.slug?.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const category = body.category?.trim() || null;
    const description = body.description?.trim() || null;
    const price = Number(body.price || 0);
    const currency = body.currency?.trim() || "THB";
    const status = body.status || "active";
    const hasCostPrice = body.cost_price !== undefined && body.cost_price !== null && String(body.cost_price).trim() !== "";
    const costPrice = hasCostPrice ? Number(body.cost_price) : null;

    if (!Number.isFinite(price) || price <= 0) {
      return Response.json({ success: false, error: "INVALID_PRICE" }, { status: 400 });
    }

    if (hasCostPrice && (!Number.isFinite(costPrice) || costPrice < 0)) {
      return Response.json({ success: false, error: "INVALID_COST_PRICE" }, { status: 400 });
    }

    await db.prepare(`
      INSERT INTO products
      (id, name, slug, category, description, price, cost_price, currency, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, name, slug || null, category, description, price, costPrice, currency, status
    ).run();

    return Response.json({
      success: true,
      product: {
        id, name, slug: slug || null, category, description,
        price, cost_price: costPrice, currency, status
      }
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 400 });
  }
}
