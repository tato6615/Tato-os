// TATO-OS
// Orders API V1.2
// Route: /api/orders
//
// D1-compatible
// Current products schema:
//   id, name, slug, category, description,
//   price, currency, status, created_at, updated_at
//
// Current orders contract used by TATO UI:
//   customer_id
//   product_id
//   amount
//   currency
//   status
//
// IMPORTANT:
// - products uses status, NOT active
// - This file never queries products.active
// - GET /api/orders
// - POST /api/orders

const VERSION = "1.2";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: HEADERS
  });
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function createId(prefix = "ord") {
  return prefix + "_" + crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

async function ensureOrdersTable(db) {
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS orders (" +
    "id TEXT PRIMARY KEY, " +
    "customer_id TEXT, " +
    "product_id TEXT, " +
    "amount REAL DEFAULT 0, " +
    "currency TEXT DEFAULT 'THB', " +
    "status TEXT DEFAULT 'PENDING', " +
    "created_at TEXT DEFAULT CURRENT_TIMESTAMP" +
    ")"
  ).run();
}

async function getOrders(db) {
  const result = await db.prepare(
    "SELECT " +
    "o.id, " +
    "o.customer_id, " +
    "o.product_id, " +
    "o.amount, " +
    "o.currency, " +
    "o.status, " +
    "o.created_at, " +
    "p.name AS product_name, " +
    "p.price AS product_price, " +
    "p.status AS product_status, " +
    "c.name AS customer_name " +
    "FROM orders o " +
    "LEFT JOIN products p ON p.id = o.product_id " +
    "LEFT JOIN customers c ON c.id = o.customer_id " +
    "ORDER BY datetime(o.created_at) DESC " +
    "LIMIT 500"
  ).all();

  return result && result.results ? result.results : [];
}

async function createOrder(db, body) {
  const customerId = text(body.customer_id);
  const productId = text(body.product_id);
  const amount = number(body.amount);
  const currency = text(body.currency) || "THB";
  const status = (text(body.status) || "PENDING").toUpperCase();

  if (!customerId) {
    return { error: "customer_id is required", status: 400 };
  }

  if (!productId) {
    return { error: "product_id is required", status: 400 };
  }

  if (amount <= 0) {
    return { error: "amount must be greater than 0", status: 400 };
  }

  const customer = await db.prepare(
    "SELECT id, name FROM customers WHERE id = ? LIMIT 1"
  ).bind(customerId).first();

  if (!customer) {
    return {
      error: "customer_not_found",
      customer_id: customerId,
      status: 404
    };
  }

  const product = await db.prepare(
    "SELECT id, name, price, currency, status " +
    "FROM products WHERE id = ? LIMIT 1"
  ).bind(productId).first();

  if (!product) {
    return {
      error: "product_not_found",
      product_id: productId,
      status: 404
    };
  }

  const productStatus = text(product.status).toLowerCase();

  if (productStatus !== "active") {
    return {
      error: "product_inactive",
      product_id: productId,
      product_status: product.status,
      status: 409
    };
  }

  const id = createId();
  const createdAt = now();

  await db.prepare(
    "INSERT INTO orders " +
    "(id, customer_id, product_id, amount, currency, status, created_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    id,
    customerId,
    productId,
    amount,
    currency,
    status,
    createdAt
  ).run();

  const order = await db.prepare(
    "SELECT " +
    "o.id, o.customer_id, o.product_id, o.amount, o.currency, " +
    "o.status, o.created_at, p.name AS product_name, " +
    "p.price AS product_price, p.status AS product_status, " +
    "c.name AS customer_name " +
    "FROM orders o " +
    "LEFT JOIN products p ON p.id = o.product_id " +
    "LEFT JOIN customers c ON c.id = o.customer_id " +
    "WHERE o.id = ? LIMIT 1"
  ).bind(id).first();

  return {
    success: true,
    order,
    status: 201
  };
}

export async function onRequestGet({ env }) {
  try {
    if (!env || !env.DB) {
      return json({
        success: false,
        error: "D1 binding DB is missing",
        version: VERSION
      }, 500);
    }

    const orders = await getOrders(env.DB);

    const revenue = orders.reduce(
      (sum, order) => sum + number(order.amount),
      0
    );

    return json({
      success: true,
      version: VERSION,
      orders,
      count: orders.length,
      revenue
    });
  } catch (error) {
    return json({
      success: false,
      version: VERSION,
      error: error && error.message ? error.message : String(error)
    }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env || !env.DB) {
      return json({
        success: false,
        error: "D1 binding DB is missing",
        version: VERSION
      }, 500);
    }

    let body;

    try {
      body = await request.json();
    } catch (_) {
      return json({
        success: false,
        error: "invalid_json",
        version: VERSION
      }, 400);
    }

    await ensureOrdersTable(env.DB);

    const result = await createOrder(env.DB, body);

    if (result.error) {
      const status = result.status || 400;
      delete result.status;

      return json({
        success: false,
        version: VERSION,
        ...result
      }, status);
    }

    return json({
      version: VERSION,
      ...result
    }, 201);
  } catch (error) {
    return json({
      success: false,
      version: VERSION,
      error: error && error.message ? error.message : String(error)
    }, 500);
  }
}
