// TATO-OS
// Business Money Loop V1.0
// Route: /api/business-money
//
// Business loop:
// MARKET -> ATTENTION -> INTEREST -> PRODUCT -> PURCHASE -> PAYMENT -> REVENUE -> PROFIT -> LEARNING
//
// This layer connects existing TATO-OS tables. It does not replace Measurement,
// Intelligence, Learning, Decision, Action, Approval, or Execution.
// It never invents customers, purchases, payments, revenue, or profit.

const LAYER = "BUSINESS_MONEY_LOOP_V1.0";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}

function now() {
  return new Date().toISOString();
}

async function tableExists(db, table) {
  const row = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).bind(table).first();
  return !!row;
}

async function columns(db, table) {
  const r = await db.prepare("PRAGMA table_info(" + table + ")").all();
  return r.results || [];
}

function has(cols, name) {
  return cols.some(c => c.name === name);
}

function value(row, names, fallback = null) {
  for (const n of names) {
    if (row && row[n] !== undefined && row[n] !== null) return row[n];
  }
  return fallback;
}

async function ensureMoneyTables(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      external_payment_id TEXT NOT NULL UNIQUE,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'THB',
      status TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS revenue_ledger (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      payment_id TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'THB',
      recognized_at TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS profit_ledger (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      revenue REAL NOT NULL,
      cost REAL NOT NULL,
      gross_profit REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'THB',
      calculated_at TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run();
}

async function getProduct(db, id) {
  return await db.prepare("SELECT * FROM products WHERE id=? LIMIT 1").bind(id).first();
}

async function getCustomer(db, id) {
  return await db.prepare("SELECT * FROM customers WHERE id=? LIMIT 1").bind(id).first();
}

async function getOrder(db, id) {
  return await db.prepare("SELECT * FROM orders WHERE id=? LIMIT 1").bind(id).first();
}

function orderAmount(order) {
  return Number(value(order, ["amount", "total_amount"], 0)) || 0;
}

function productPrice(product) {
  return Number(value(product, ["price", "sale_price"], 0)) || 0;
}

function productCost(product) {
  return Number(value(product, ["cost", "cost_price"], 0)) || 0;
}

async function recordBehavior(db, type, payload) {
  if (!(await tableExists(db, "behavior_events"))) return null;
  const cols = await columns(db, "behavior_events");
  const data = {};
  const id = crypto.randomUUID();
  const metadata = JSON.stringify(payload);

  if (has(cols, "id")) data.id = id;
  if (has(cols, "event_type")) data.event_type = type;
  if (has(cols, "event_name")) data.event_name = type;
  if (has(cols, "customer_id")) data.customer_id = payload.customer_id || null;
  if (has(cols, "anonymous_id")) data.anonymous_id = payload.session_id || null;
  if (has(cols, "page")) data.page = payload.page || null;
  if (has(cols, "object_type")) data.object_type = payload.object_type || null;
  if (has(cols, "object_id")) data.object_id = payload.object_id || null;
  if (has(cols, "product_id")) data.product_id = payload.product_id || null;
  if (has(cols, "session_id")) data.session_id = payload.session_id || null;
  if (has(cols, "metadata")) data.metadata = metadata;
  if (has(cols, "created_at")) data.created_at = now();

  const required = cols.filter(c => c.notnull === 1 && c.pk !== 1 && c.dflt_value === null)
    .map(c => c.name)
    .filter(n => data[n] === undefined);

  if (required.length) return { recorded: false, reason: "REQUIRED_COLUMNS_MISSING", columns: required };

  const names = Object.keys(data);
  const stmt = db.prepare(
    "INSERT INTO behavior_events (" + names.join(",") + ") VALUES (" + names.map(() => "?").join(",") + ")"
  );
  await stmt.bind(...names.map(n => data[n])).run();
  return { recorded: true, id, event_type: type };
}

async function paidOrder(db, orderId) {
  const row = await db.prepare(
    "SELECT * FROM payments WHERE order_id=? AND status='PAID' ORDER BY paid_at DESC LIMIT 1"
  ).bind(orderId).first();
  return row;
}

async function calculateProfit(db, order) {
  const productId = value(order, ["product_id"], null);
  const product = productId ? await getProduct(db, productId) : null;
  const revenue = orderAmount(order);
  const unitCost = product ? productCost(product) : 0;
  const quantity = Number(value(order, ["quantity", "qty"], 1)) || 1;
  const cost = unitCost * quantity;
  return {
    revenue,
    cost,
    gross_profit: revenue - cost,
    cost_source: product && unitCost > 0 ? "PRODUCT_COST" : "COST_NOT_CONFIGURED"
  };
}

async function confirmPayment(db, body) {
  await ensureMoneyTables(db);

  const order = await getOrder(db, body.order_id);
  if (!order) throw new Error("ORDER_NOT_FOUND");

  const externalId = String(body.external_payment_id || "").trim();
  if (!externalId) throw new Error("external_payment_id is required");

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("A positive verified payment amount is required");

  const expected = orderAmount(order);
  if (expected <= 0) throw new Error("ORDER_AMOUNT_INVALID");
  if (Math.abs(amount - expected) > 0.000001) throw new Error("PAYMENT_AMOUNT_MISMATCH");

  const existing = await db.prepare(
    "SELECT * FROM payments WHERE external_payment_id=? LIMIT 1"
  ).bind(externalId).first();

  if (existing) {
    return { duplicate: true, payment: existing };
  }

  const paidAt = body.paid_at || now();
  const paymentId = crypto.randomUUID();

  await db.prepare(`
    INSERT INTO payments
    (id, order_id, external_payment_id, amount, currency, status, paid_at, created_at)
    VALUES (?, ?, ?, ?, ?, 'PAID', ?, ?)
  `).bind(
    paymentId,
    order.id,
    externalId,
    amount,
    body.currency || value(order, ["currency"], "THB"),
    paidAt,
    now()
  ).run();

  const orderCols = await columns(db, "orders");
  const sets = [];
  const params = [];

  if (has(orderCols, "status")) { sets.push("status=?"); params.push("paid"); }
  if (has(orderCols, "payment_method") && body.payment_method) { sets.push("payment_method=?"); params.push(body.payment_method); }
  if (has(orderCols, "external_order_id") && body.external_order_id) { sets.push("external_order_id=?"); params.push(body.external_order_id); }
  if (sets.length) {
    params.push(order.id);
    await db.prepare("UPDATE orders SET " + sets.join(",") + " WHERE id=?").bind(...params).run();
  }

  const revenueId = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO revenue_ledger
    (id, order_id, payment_id, amount, currency, recognized_at, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    revenueId, order.id, paymentId, amount,
    body.currency || value(order, ["currency"], "THB"),
    paidAt, "VERIFIED_PAYMENT", now()
  ).run();

  const freshOrder = await getOrder(db, order.id);
  const profit = await calculateProfit(db, freshOrder);
  const profitId = crypto.randomUUID();

  await db.prepare(`
    INSERT INTO profit_ledger
    (id, order_id, revenue, cost, gross_profit, currency, calculated_at, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    profitId, order.id, profit.revenue, profit.cost, profit.gross_profit,
    body.currency || value(order, ["currency"], "THB"),
    now(), profit.cost_source, now()
  ).run();

  const behavior = await recordBehavior(db, "payment_completed", {
    customer_id: value(order, ["customer_id"], null),
    order_id: order.id,
    product_id: value(order, ["product_id"], null),
    revenue: amount,
    payment_id: paymentId,
    session_id: body.session_id || null,
    source: "VERIFIED_PAYMENT"
  });

  return {
    duplicate: false,
    payment: {
      id: paymentId,
      order_id: order.id,
      external_payment_id: externalId,
      amount,
      currency: body.currency || value(order, ["currency"], "THB"),
      status: "PAID",
      paid_at: paidAt
    },
    revenue: {
      id: revenueId,
      amount,
      source: "VERIFIED_PAYMENT"
    },
    profit: {
      id: profitId,
      ...profit
    },
    behavior_event: behavior
  };
}

async function dashboard(db, contentId = null) {
  await ensureMoneyTables(db);

  const counts = async (sql) => {
    const row = await db.prepare(sql).first();
    return Number(row?.value || 0);
  };

  const customers = await counts("SELECT COUNT(*) AS value FROM customers");
  const orders = await counts("SELECT COUNT(*) AS value FROM orders");
  const paidOrders = await counts("SELECT COUNT(*) AS value FROM payments WHERE status='PAID'");
  const revenueRow = await db.prepare("SELECT COALESCE(SUM(amount),0) AS revenue FROM revenue_ledger").first();
  const profitRow = await db.prepare("SELECT COALESCE(SUM(gross_profit),0) AS profit FROM profit_ledger").first();

  let measurement = null;
  if (contentId && await tableExists(db, "content_measurements")) {
    measurement = await db.prepare(
      "SELECT * FROM content_measurements WHERE content_id=? ORDER BY created_at DESC LIMIT 1"
    ).bind(contentId).first();
  }

  return {
    success: true,
    layer: LAYER,
    version: "1.0",
    status: "BUSINESS_MONEY_READY",
    funnel: {
      market: "EXTERNAL_MARKET_SIGNALS",
      attention: measurement ? Number(value(measurement, ["attention"], 0)) : 0,
      interest: measurement ? {
        product_views: Number(value(measurement, ["product_views"], 0)),
        clicks: Number(value(measurement, ["clicks"], 0)),
        engagements: Number(value(measurement, ["engagements"], 0))
      } : { product_views: 0, clicks: 0, engagements: 0 },
      customers,
      purchases: paidOrders,
      orders,
      payment: paidOrders,
      revenue: Number(revenueRow?.revenue || 0),
      profit: Number(profitRow?.profit || 0)
    },
    conversion: {
      attention_to_product_view: measurement?.attention ? Number(((Number(value(measurement, ["product_views"], 0)) / Number(measurement.attention)) * 100).toFixed(2)) : 0,
      click_to_customer: measurement?.clicks ? Number(((Number(value(measurement, ["customers"], 0)) / Number(measurement.clicks)) * 100).toFixed(2)) : 0,
      customer_to_paid_order: customers ? Number(((paidOrders / customers) * 100).toFixed(2)) : 0
    },
    guardrails: {
      invents_customer: false,
      invents_purchase: false,
      invents_payment: false,
      invents_revenue: false,
      invents_profit: false,
      strategy_change: false,
      winner_declaration: false
    },
    next: {
      when_real_payment_exists: "BUSINESS_MONEY_LOOP_CAN_FEED_LEARNING",
      missing_real_world_evidence: paidOrders === 0 ? "REAL_PAID_ORDER" : null
    }
  };
}

export async function onRequestGet(context) {
  try {
    if (!context.env?.DB) return json({ success: false, layer: LAYER, status: "DB_BINDING_NOT_FOUND" }, 500);
    const url = new URL(context.request.url);
    return json(await dashboard(context.env.DB, url.searchParams.get("content_id")));
  } catch (error) {
    return json({ success: false, layer: LAYER, status: "ERROR", error: error?.message || String(error) }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env?.DB;
    if (!db) return json({ success: false, layer: LAYER, status: "DB_BINDING_NOT_FOUND" }, 500);

    let body = {};
    try { body = await context.request.json(); } catch (_) {}

    const operation = body.operation;
    if (operation === "confirm_payment") {
      const result = await confirmPayment(db, body);
      return json({
        success: true,
        layer: LAYER,
        version: "1.0",
        status: result.duplicate ? "PAYMENT_ALREADY_RECORDED" : "PAYMENT_RECORDED",
        ...result,
        guardrails: {
          payment_must_be_verified: true,
          revenue_from_verified_payment_only: true,
          profit_from_recorded_cost_only: true,
          automatic_strategy_change: false
        }
      });
    }

    if (operation === "record_cost") {
      await ensureMoneyTables(db);
      const order = await getOrder(db, body.order_id);
      if (!order) return json({ success: false, layer: LAYER, status: "ORDER_NOT_FOUND" }, 404);
      const cost = Number(body.cost);
      if (!Number.isFinite(cost) || cost < 0) return json({ success: false, layer: LAYER, status: "INVALID_COST" }, 400);
      const revenue = orderAmount(order);
      const id = crypto.randomUUID();
      await db.prepare(`
        INSERT INTO profit_ledger
        (id, order_id, revenue, cost, gross_profit, currency, calculated_at, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, order.id, revenue, cost, revenue - cost, value(order, ["currency"], "THB"), now(), "VERIFIED_COST_INPUT", now()).run();
      return json({ success: true, layer: LAYER, status: "COST_RECORDED", profit: { id, revenue, cost, gross_profit: revenue - cost } });
    }

    return json({
      success: false,
      layer: LAYER,
      status: "UNSUPPORTED_OPERATION",
      allowed_operations: ["confirm_payment", "record_cost"]
    }, 400);
  } catch (error) {
    return json({ success: false, layer: LAYER, status: "ERROR", error: error?.message || String(error) }, 500);
  }
}
