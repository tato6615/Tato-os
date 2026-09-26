const VERSION = "1.4";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function createId(prefix) {
  return prefix + "_" + crypto.randomUUID();
}

async function tableColumns(db, table) {
  const result = await db.prepare("PRAGMA table_info(" + table + ")").all();
  return (result.results || []).map(function (row) {
    return row.name;
  });
}

async function ensureOrdersTable(db) {
  const exists = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='orders'"
  ).first();

  if (exists) return;

  await db.prepare(
    "CREATE TABLE orders (" +
    "id TEXT PRIMARY KEY," +
    "customer_id TEXT," +
    "total_amount REAL NOT NULL DEFAULT 0," +
    "total_kg REAL NOT NULL DEFAULT 0," +
    "status TEXT NOT NULL DEFAULT 'pending'," +
    "created_at TEXT NOT NULL DEFAULT (datetime('now'))" +
    ")"
  ).run();
}

async function getOrders(db) {
  const rows = await db.prepare(
    "SELECT o.*, c.name AS customer_name " +
    "FROM orders o " +
    "LEFT JOIN customers c ON c.id = o.customer_id " +
    "ORDER BY o.created_at DESC LIMIT 100"
  ).all();

  const orders = rows.results || [];

  let revenue = 0;
  let kg = 0;

  for (const order of orders) {
    revenue += Number(order.total_amount || order.amount || 0);
    kg += Number(order.total_kg || order.quantity || order.qty || 0);
  }

  return json({
    success: true,
    version: VERSION,
    orders: orders,
    count: orders.length,
    revenue: revenue,
    total_kg: kg
  });
}

async function createOrder(db, body) {
  await ensureOrdersTable(db);

  const customerId = text(body.customer_id);
  const productId = text(body.product_id);
  const status = text(body.status).toLowerCase() || "pending";
  const amount = Number(body.amount);
  const totalKg = Number(body.total_kg != null ? body.total_kg : body.quantity);

  if (!customerId) throw new Error("CUSTOMER_ID_REQUIRED");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("INVALID_AMOUNT");
  if (!Number.isFinite(totalKg) || totalKg <= 0) throw new Error("INVALID_TOTAL_KG");

  const customer = await db.prepare(
    "SELECT id, name FROM customers WHERE id = ? LIMIT 1"
  ).bind(customerId).first();

  if (!customer) throw new Error("CUSTOMER_NOT_FOUND");

  if (productId) {
    const product = await db.prepare(
      "SELECT id, name, price, currency, status FROM products WHERE id = ? LIMIT 1"
    ).bind(productId).first();

    if (!product) throw new Error("PRODUCT_NOT_FOUND");

    if (text(product.status).toLowerCase() !== "active") {
      throw new Error("PRODUCT_NOT_ACTIVE");
    }
  }

  const cols = await tableColumns(db, "orders");
  const allowed = new Set(cols);
  const id = createId("order");
  const data = {
    id: id,
    customer_id: customerId,
    product_id: productId || null,
    amount: amount,
    total_amount: amount,
    total_kg: totalKg,
    quantity: totalKg,
    qty: totalKg,
    currency: "THB",
    status: status,
    source: "TATO_OS_SALES",
    created_at: new Date().toISOString()
  };

  const names = Object.keys(data).filter(function (key) {
    return allowed.has(key);
  });

  const placeholders = names.map(function () { return "?"; }).join(", ");
  const values = names.map(function (key) { return data[key]; });

  const insertStatement = db.prepare(
    "INSERT INTO orders (" + names.join(", ") + ") VALUES (" + placeholders + ")"
  );
  await insertStatement.bind(...values).run();

  const created = await db.prepare(
    "SELECT o.*, c.name AS customer_name " +
    "FROM orders o LEFT JOIN customers c ON c.id = o.customer_id " +
    "WHERE o.id = ? LIMIT 1"
  ).bind(id).first();

  return json({
    success: true,
    version: VERSION,
    order: created,
    message: "Order created"
  });
}

export async function onRequestGet(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return json({ success: false, error: "DB_BINDING_NOT_FOUND" }, 500);
    return await getOrders(db);
  } catch (error) {
    return json({
      success: false,
      version: VERSION,
      error: error && error.message ? error.message : String(error)
    }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return json({ success: false, error: "DB_BINDING_NOT_FOUND" }, 500);

    let body = {};
    try {
      body = await context.request.json();
    } catch (_) {
      return json({ success: false, error: "INVALID_JSON" }, 400);
    }

    return await createOrder(db, body);
  } catch (error) {
    return json({
      success: false,
      version: VERSION,
      error: error && error.message ? error.message : String(error)
    }, 400);
  }
}
