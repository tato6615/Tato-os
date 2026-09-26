// TATO-OS
// Business Order Entry V1.0
// Route: /api/business-order-entry
//
// Purpose:
// Real customer -> real order -> pending payment
//
// This layer DOES:
// - accept a real customer submission
// - create/update a customer record
// - create a real pending order
// - record order_created behavior
//
// This layer DOES NOT:
// - invent customers
// - invent payments
// - invent revenue
// - invent profit
// - confirm payment
// - change strategy
// - auto-publish
//
// Payment continues through:
// /api/business-money -> confirm_payment

const LAYER = "BUSINESS_ORDER_ENTRY_V1.0";
const PRODUCT_NAME = "TATO Coffee Arabica 100% Single Origin";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type"
    }
  });
}

function now() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return prefix + "-" + Date.now() + "-" + crypto.randomUUID().slice(0, 8);
}

async function tableExists(db, table) {
  const row = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).bind(table).first();
  return !!row;
}

async function columns(db, table) {
  const result = await db.prepare(
    "PRAGMA table_info(" + table + ")"
  ).all();
  return result.results || [];
}

function has(cols, name) {
  return cols.some(c => c.name === name);
}

function firstValue(row, names, fallback = null) {
  for (const name of names) {
    if (row && row[name] !== undefined && row[name] !== null) {
      return row[name];
    }
  }
  return fallback;
}

async function insertDynamic(db, table, data) {
  const cols = await columns(db, table);
  const values = {};

  for (const [name, value] of Object.entries(data)) {
    if (has(cols, name) && value !== undefined) {
      values[name] = value;
    }
  }

  const missing = cols
    .filter(c => c.notnull === 1 && c.pk !== 1 && c.dflt_value === null)
    .map(c => c.name)
    .filter(name => values[name] === undefined);

  if (missing.length) {
    throw new Error(table.toUpperCase() + "_REQUIRED_COLUMNS_MISSING:" + missing.join(","));
  }

  const names = Object.keys(values);
  if (!names.length) {
    throw new Error("NO_COMPATIBLE_" + table.toUpperCase() + "_COLUMNS");
  }

  const placeholders = names.map(() => "?").join(",");
  await db.prepare(
    "INSERT INTO " + table + " (" + names.join(",") + ") VALUES (" + placeholders + ")"
  ).bind(...names.map(name => values[name])).run();

  return values;
}

async function recordBehavior(db, payload) {
  if (!(await tableExists(db, "behavior_events"))) {
    return { recorded: false, reason: "BEHAVIOR_EVENTS_TABLE_NOT_FOUND" };
  }

  const cols = await columns(db, "behavior_events");
  const values = {};

  const id = makeId("behavior");
  const eventType = "order_created";
  const timestamp = now();

  const set = (name, value) => {
    if (has(cols, name) && value !== undefined) values[name] = value;
  };

  set("id", id);
  set("event_type", eventType);
  set("event_name", eventType);
  set("customer_id", payload.customer_id || null);
  set("anonymous_id", payload.session_id || null);
  set("session_id", payload.session_id || null);
  set("page", "/market-test");
  set("object_type", "order");
  set("object_id", payload.order_id);
  set("product_id", payload.product_id || null);
  set("content_id", payload.content_id || null);
  set("source", "REAL_MARKET_TEST");
  set("source_type", "REAL_MARKET_TEST");
  set("metadata", JSON.stringify({
    source: "REAL_MARKET_TEST",
    order_id: payload.order_id,
    customer_id: payload.customer_id,
    product_id: payload.product_id || null,
    content_id: payload.content_id || null,
    session_id: payload.session_id || null
  }));
  set("created_at", timestamp);
  set("updated_at", timestamp);

  const missing = cols
    .filter(c => c.notnull === 1 && c.pk !== 1 && c.dflt_value === null)
    .map(c => c.name)
    .filter(name => values[name] === undefined);

  if (missing.length) {
    return {
      recorded: false,
      reason: "REQUIRED_COLUMNS_MISSING",
      columns: missing
    };
  }

  const names = Object.keys(values);
  await db.prepare(
    "INSERT INTO behavior_events (" + names.join(",") + ") VALUES (" +
    names.map(() => "?").join(",") + ")"
  ).bind(...names.map(name => values[name])).run();

  return {
    recorded: true,
    id,
    event_type: eventType
  };
}

async function findProduct(db, productId) {
  if (!(await tableExists(db, "products"))) {
    throw new Error("PRODUCTS_TABLE_NOT_FOUND");
  }

  if (productId) {
    const row = await db.prepare(
      "SELECT * FROM products WHERE id=? LIMIT 1"
    ).bind(productId).first();

    if (!row) throw new Error("PRODUCT_NOT_FOUND");
    return row;
  }

  const row = await db.prepare(
    "SELECT * FROM products WHERE active IS NULL OR active=1 ORDER BY created_at ASC LIMIT 1"
  ).first();

  if (!row) throw new Error("PRODUCT_NOT_CONFIGURED");
  return row;
}

async function findOrCreateCustomer(db, body) {
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  const phone = String(body.phone || "").trim();
  const businessName = String(body.business_name || "").trim();

  if (!name) throw new Error("CUSTOMER_NAME_REQUIRED");
  if (!email && !phone) throw new Error("CUSTOMER_EMAIL_OR_PHONE_REQUIRED");

  if (!(await tableExists(db, "customers"))) {
    throw new Error("CUSTOMERS_TABLE_NOT_FOUND");
  }

  const customerCols = await columns(db, "customers");

  let existing = null;

  if (email && has(customerCols, "email")) {
    existing = await db.prepare(
      "SELECT * FROM customers WHERE email=? LIMIT 1"
    ).bind(email).first();
  }

  if (!existing && phone && has(customerCols, "phone")) {
    existing = await db.prepare(
      "SELECT * FROM customers WHERE phone=? LIMIT 1"
    ).bind(phone).first();
  }

  if (existing) return { customer: existing, created: false };

  const id = makeId("customer");

  const data = {
    id,
    name,
    business_name: businessName || null,
    email: email || null,
    phone: phone || null,
    segment: "MARKET_TEST",
    status: "active",
    intent_score: 1,
    created_at: now()
  };

  const customer = await insertDynamic(db, "customers", data);

  return {
    customer,
    created: true
  };
}

async function createOrder(db, body, customer, product) {
  if (!(await tableExists(db, "orders"))) {
    throw new Error("ORDERS_TABLE_NOT_FOUND");
  }

  const orderId = makeId("order");
  const quantity = Number(body.quantity || 1);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("INVALID_QUANTITY");
  }

  const price = Number(firstValue(product, ["sale_price", "price"], 0));
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("PRODUCT_PRICE_NOT_CONFIGURED");
  }

  const totalAmount = Number((price * quantity).toFixed(2));
  const orderCols = await columns(db, "orders");

  const data = {
    id: orderId,
    customer_id: firstValue(customer, ["id"]),
    product_id: firstValue(product, ["id"]),
    quantity,
    qty: quantity,
    total_kg: quantity,
    amount: totalAmount,
    total_amount: totalAmount,
    currency: "THB",
    status: "pending",
    source: "REAL_MARKET_TEST",
    content_id: body.content_id || null,
    session_id: body.session_id || null,
    created_at: now()
  };

  const order = await insertDynamic(db, "orders", data);

  return {
    order,
    order_id: orderId,
    quantity,
    unit_price: price,
    total_amount: totalAmount,
    order_columns: orderCols.map(c => c.name)
  };
}

async function handleStatus(db) {
  const productExists = await tableExists(db, "products");
  const customerExists = await tableExists(db, "customers");
  const orderExists = await tableExists(db, "orders");

  let products = [];

  if (productExists) {
    const result = await db.prepare(
      "SELECT * FROM products ORDER BY created_at ASC LIMIT 20"
    ).all();
    products = result.results || [];
  }

  return json({
    success: true,
    layer: LAYER,
    version: "1.0",
    status: "BUSINESS_ORDER_ENTRY_READY",
    tables: {
      customers: customerExists,
      products: productExists,
      orders: orderExists
    },
    products: products.map(product => ({
      id: firstValue(product, ["id"]),
      name: firstValue(product, ["name"]),
      sale_price: Number(firstValue(product, ["sale_price", "price"], 0)) || 0,
      active: firstValue(product, ["active"], 1)
    })),
    contract: {
      creates_real_customer: true,
      creates_real_pending_order: true,
      payment_required_before_revenue: true,
      next_layer: "BUSINESS_MONEY_CONFIRM_PAYMENT"
    },
    guardrails: {
      invents_customer: false,
      invents_order: false,
      invents_payment: false,
      invents_revenue: false,
      invents_profit: false,
      strategy_change: false
    }
  });
}

async function handleCreate(db, body) {
  const customerResult = await findOrCreateCustomer(db, body);
  const product = await findProduct(db, body.product_id);

  const orderResult = await createOrder(
    db,
    body,
    customerResult.customer,
    product
  );

  const behavior = await recordBehavior(db, {
    customer_id: firstValue(customerResult.customer, ["id"]),
    order_id: orderResult.order_id,
    product_id: firstValue(product, ["id"]),
    content_id: body.content_id || null,
    session_id: body.session_id || null
  });

  return json({
    success: true,
    layer: LAYER,
    version: "1.0",
    status: "REAL_ORDER_CREATED",
    customer: {
      id: firstValue(customerResult.customer, ["id"]),
      created: customerResult.created,
      name: firstValue(customerResult.customer, ["name"]),
      email: firstValue(customerResult.customer, ["email"]),
      phone: firstValue(customerResult.customer, ["phone"])
    },
    product: {
      id: firstValue(product, ["id"]),
      name: firstValue(product, ["name"]),
      sale_price: Number(firstValue(product, ["sale_price", "price"], 0)) || 0
    },
    order: {
      id: orderResult.order_id,
      quantity: orderResult.quantity,
      unit_price: orderResult.unit_price,
      total_amount: orderResult.total_amount,
      status: "pending"
    },
    behavior_event: behavior,
    payment: {
      status: "PENDING",
      next_operation: "confirm_payment",
      endpoint: "/api/business-money"
    },
    guardrails: {
      real_customer_required: true,
      real_order_created: true,
      payment_not_invented: true,
      revenue_not_created: true,
      profit_not_created: true,
      strategy_change: false
    },
    next_step: "VERIFY_REAL_PAYMENT"
  });
}

export async function onRequest(context) {
  try {
    if (context.request.method === "OPTIONS") {
      return json({}, 204);
    }

    const db = context.env?.DB;
    if (!db) {
      return json({
        success: false,
        layer: LAYER,
        status: "DB_BINDING_NOT_FOUND"
      }, 500);
    }

    if (context.request.method === "GET") {
      return handleStatus(db);
    }

    if (context.request.method !== "POST") {
      return json({
        success: false,
        layer: LAYER,
        status: "METHOD_NOT_ALLOWED"
      }, 405);
    }

    let body = {};
    try {
      body = await context.request.json();
    } catch (_) {
      return json({
        success: false,
        layer: LAYER,
        status: "INVALID_JSON"
      }, 400);
    }

    return handleCreate(db, body);
  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      version: "1.0",
      status: "ERROR",
      error: error?.message || String(error)
    }, 500);
  }
}
