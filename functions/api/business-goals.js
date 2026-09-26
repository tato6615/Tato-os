// TATO-OS
// Business Goal V1.0
// Route: /api/business-goals
//
// Purpose:
// - Store the real commercial target for TATO Coffee.
// - Measure the target from verified business records only.
// - Keep missing real-world costs as missing; never invent them.
//
// Current target:
//   GROSS PROFIT = THB 100,000 / month
//
// This is a business-domain service. It does not modify the closed
// Measurement / Intelligence / Learning / Decision / Action layers.

const LAYER = "BUSINESS_GOAL_V1.0";
const GOAL_CODE = "TATO_COFFEE_MONTHLY_PROFIT";
const TARGET_PROFIT = 100000;
const CURRENCY = "THB";

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

async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS business_goals (
      id TEXT PRIMARY KEY,
      goal_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      metric TEXT NOT NULL,
      target_value REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'THB',
      period_type TEXT NOT NULL DEFAULT 'MONTH',
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  const existing = await db.prepare(
    "SELECT * FROM business_goals WHERE goal_code=? LIMIT 1"
  ).bind(GOAL_CODE).first();

  if (!existing) {
    const timestamp = now();
    await db.prepare(`
      INSERT INTO business_goals
      (id, goal_code, name, metric, target_value, currency, period_type, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      crypto.randomUUID(),
      GOAL_CODE,
      "TATO Coffee monthly profit",
      "GROSS_PROFIT",
      TARGET_PROFIT,
      CURRENCY,
      "MONTH",
      timestamp,
      timestamp
    ).run();
  }

  return db.prepare(
    "SELECT * FROM business_goals WHERE goal_code=? LIMIT 1"
  ).bind(GOAL_CODE).first();
}

function monthRange(value) {
  let month = null;

  if (value) {
    const m = String(value).match(/^(\\d{4})-(\\d{2})$/);
    if (m) {
      month = `${m[1]}-${m[2]}`;
      const startDate = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
      const endDate = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1));
      return {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        month
      };
    }
  }

  const d = new Date();
  const startDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const endDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    month: startDate.toISOString().slice(0, 7)
  };
}

async function getVerifiedMonthlyProfit(db, range) {
  // Commercial truth:
  // revenue comes only from verified payments.
  // product cost comes only from a real product cost configured in products.
  // No quantity is guessed; orders.total_kg is the unit quantity for coffee.
  const info = await db.prepare("PRAGMA table_info(products)").all();
  const columns = (info.results || []).map(x => x.name);

  const costColumn = columns.includes("cost_price")
    ? "cost_price"
    : columns.includes("cost")
      ? "cost"
      : null;

  if (!costColumn) {
    return {
      available: false,
      reason: "PRODUCT_COST_COLUMN_NOT_FOUND",
      revenue: 0,
      cost: 0,
      profit: 0,
      records: 0
    };
  }

  const rows = await db.prepare(`
    SELECT
      rl.id,
      rl.order_id,
      rl.amount AS revenue,
      o.total_kg,
      p.${costColumn} AS cost_per_kg,
      p.name AS product_name
    FROM revenue_ledger rl
    JOIN orders o ON o.id = rl.order_id
    LEFT JOIN products p ON p.id = o.product_id
    WHERE rl.recognized_at >= ?
      AND rl.recognized_at < ?
  `).bind(range.start, range.end).all();

  let revenue = 0;
  let cost = 0;
  let completeRecords = 0;
  let incompleteRecords = 0;
  const details = [];

  for (const row of (rows.results || [])) {
    const rowRevenue = Number(row.revenue || 0);
    const kg = Number(row.total_kg || 0);
    const unitCost = Number(row.cost_per_kg);

    revenue += rowRevenue;

    if (Number.isFinite(unitCost) && unitCost >= 0 && kg >= 0) {
      cost += unitCost * kg;
      completeRecords += 1;
      details.push({
        order_id: row.order_id,
        product: row.product_name || null,
        kg,
        revenue: rowRevenue,
        cost: unitCost * kg,
        gross_profit: rowRevenue - (unitCost * kg)
      });
    } else {
      incompleteRecords += 1;
    }
  }

  return {
    available: completeRecords > 0 || (rows.results || []).length === 0,
    revenue,
    cost,
    profit: revenue - cost,
    records: (rows.results || []).length,
    complete_cost_records: completeRecords,
    incomplete_cost_records: incompleteRecords,
    details
  };
}

async function getUnitEconomics(db) {
  const info = await db.prepare("PRAGMA table_info(products)").all();
  const columns = (info.results || []).map(x => x.name);

  const saleColumn = columns.includes("sale_price")
    ? "sale_price"
    : columns.includes("price")
      ? "price"
      : null;

  const costColumn = columns.includes("cost_price")
    ? "cost_price"
    : columns.includes("cost")
      ? "cost"
      : null;

  if (!saleColumn || !costColumn) {
    return {
      available: false,
      reason: "PRODUCT_PRICE_OR_COST_COLUMN_NOT_FOUND",
      products: []
    };
  }

  const rows = await db.prepare(`
    SELECT id, name, ${saleColumn} AS sale_price, ${costColumn} AS cost_price
    FROM products
    WHERE ${saleColumn} IS NOT NULL
      AND ${costColumn} IS NOT NULL
      AND ${saleColumn} > 0
      AND ${costColumn} >= 0
    ORDER BY created_at DESC
  `).all();

  return {
    available: true,
    products: (rows.results || []).map(p => {
      const sale = Number(p.sale_price || 0);
      const cost = Number(p.cost_price || 0);
      const profitPerKg = sale - cost;
      return {
        product_id: p.id,
        name: p.name,
        sale_price_per_kg: sale,
        cost_per_kg: cost,
        gross_profit_per_kg: profitPerKg,
        required_kg_for_target: profitPerKg > 0
          ? Number((TARGET_PROFIT / profitPerKg).toFixed(2))
          : null
      };
    })
  };
}

async function dashboard(db, month) {
  const goal = await ensureTable(db);
  const range = monthRange(month);
  const profit = await getVerifiedMonthlyProfit(db, range);
  const economics = await getUnitEconomics(db);

  const target = Number(goal?.target_value || TARGET_PROFIT);
  const achieved = profit.profit;
  const gap = Math.max(target - achieved, 0);

  return {
    success: true,
    layer: LAYER,
    version: "1.0",
    status: "GOAL_TRACKING_READY",
    goal: {
      id: goal.id,
      code: goal.goal_code,
      name: goal.name,
      metric: goal.metric,
      target_value: target,
      currency: goal.currency,
      period: range.month
    },
    actual: {
      verified_paid_revenue: profit.revenue,
      recorded_cost_from_real_product_cost: profit.cost,
      gross_profit: achieved,
      verified_payment_records: profit.records,
      complete_cost_records: profit.complete_cost_records,
      incomplete_cost_records: profit.incomplete_cost_records
    },
    progress: {
      target: target,
      achieved: achieved,
      remaining: gap,
      percent: target > 0
        ? Number(((achieved / target) * 100).toFixed(2))
        : 0
    },
    unit_economics: economics,
    data_quality: {
      revenue_source: "revenue_ledger_from_verified_payment",
      cost_source: "orders.total_kg × products.cost_price",
      uses_verified_payment_revenue: true,
      uses_real_product_cost: true,
      uses_order_total_kg: true,
      invents_sales: false,
      invents_cost: false,
      invents_profit: false,
      missing_costs_remain_missing: true
    },
    guardrails: {
      modifies_core_layers: false,
      changes_strategy: false,
      creates_fake_orders: false,
      creates_fake_revenue: false,
      creates_fake_profit: false,
      automatic_execution: false
    },
    next: {
      commercial_focus:
        "Increase verified profitable sales until the monthly gross-profit target is reached.",
      note:
        "This target is GROSS_PROFIT. True NET_PROFIT requires real operating expenses to be recorded separately."
    }
  };
}

export async function onRequestGet(context) {
  try {
    if (!context.env?.DB) {
      return json({ success: false, layer: LAYER, status: "DB_BINDING_NOT_FOUND" }, 500);
    }

    const url = new URL(context.request.url);
    return json(
      await dashboard(context.env.DB, url.searchParams.get("month"))
    );
  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      status: "ERROR",
      error: error?.message || String(error)
    }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    if (!context.env?.DB) {
      return json({ success: false, layer: LAYER, status: "DB_BINDING_NOT_FOUND" }, 500);
    }

    const body = await context.request.json().catch(() => ({}));
    const value = Number(body.target_value);

    if (!Number.isFinite(value) || value <= 0) {
      return json({
        success: false,
        layer: LAYER,
        status: "INVALID_TARGET_VALUE"
      }, 400);
    }

    const db = context.env.DB;
    const goal = await ensureTable(db);
    const updatedAt = now();

    await db.prepare(`
      UPDATE business_goals
      SET target_value=?, updated_at=?
      WHERE goal_code=?
    `).bind(value, updatedAt, GOAL_CODE).run();

    return json({
      success: true,
      layer: LAYER,
      version: "1.0",
      status: "GOAL_UPDATED",
      goal: {
        id: goal.id,
        code: GOAL_CODE,
        target_value: value,
        currency: CURRENCY,
        period_type: "MONTH"
      },
      guardrails: {
        modifies_core_layers: false,
        invents_business_data: false
      }
    });
  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      status: "ERROR",
      error: error?.message || String(error)
    }, 400);
  }
}
