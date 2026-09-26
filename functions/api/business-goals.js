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
//   PROFIT = THB 100,000 / month
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
  if (value) {
    const m = String(value).match(/^(\\d{4})-(\\d{2})$/);
    if (m) {
      const start = `${m[1]}-${m[2]}-01T00:00:00.000Z`;
      const endDate = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1));
      return { start, end: endDate.toISOString() };
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

async function getMonthlyProfit(db, range) {
  const row = await db.prepare(`
    SELECT
      COALESCE(SUM(revenue), 0) AS revenue,
      COALESCE(SUM(cost), 0) AS cost,
      COALESCE(SUM(gross_profit), 0) AS profit,
      COUNT(*) AS records
    FROM profit_ledger
    WHERE calculated_at >= ? AND calculated_at < ?
  `).bind(range.start, range.end).first();

  return {
    revenue: Number(row?.revenue || 0),
    cost: Number(row?.cost || 0),
    profit: Number(row?.profit || 0),
    records: Number(row?.records || 0)
  };
}

async function getMonthlyPaidRevenue(db, range) {
  const row = await db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS revenue
    FROM revenue_ledger
    WHERE recognized_at >= ? AND recognized_at < ?
  `).bind(range.start, range.end).first();

  return Number(row?.revenue || 0);
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
      reason: "PRODUCT_PRICE_OR_COST_COLUMN_NOT_FOUND"
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
  const profit = await getMonthlyProfit(db, range);
  const paidRevenue = await getMonthlyPaidRevenue(db, range);
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
      period: range.month || String(month || "").slice(0, 7)
    },
    actual: {
      verified_paid_revenue: paidRevenue,
      recorded_profit: achieved,
      recorded_cost: profit.cost,
      profit_ledger_records: profit.records
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
      profit_source: "profit_ledger",
      revenue_source: "revenue_ledger",
      uses_verified_payment_revenue: true,
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
      required_for_true_net_profit:
        "Record real operating expenses separately before treating the target as NET_PROFIT.",
      commercial_focus:
        "Increase verified profitable sales until the monthly profit target is reached."
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
