// TATO-OS
// Business Goal V1.1
// Route: /api/business-goals
//
// Purpose:
// - Store the real commercial target for TATO Coffee.
// - Measure the target from the existing Business Money Loop.
// - Use verified payment revenue and recorded gross profit only.
// - Never invent sales, cost, profit, customers, or orders.
//
// Current target:
//   GROSS PROFIT = THB 100,000 / month
//
// This is a business-domain service. It does not modify the closed
// Measurement / Intelligence / Learning / Decision / Action layers.

const LAYER = "BUSINESS_GOAL_V1.1";
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
      "TATO Coffee monthly gross profit",
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
    const match = String(value).match(/^(\\d{4})-(\\d{2})$/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);

      if (month >= 1 && month <= 12) {
        const startDate = new Date(Date.UTC(year, month - 1, 1));
        const endDate = new Date(Date.UTC(year, month, 1));

        return {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          month: String(value)
        };
      }
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

async function tableExists(db, table) {
  const row = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).bind(table).first();

  return !!row;
}

async function getActualMonthlyMoney(db, range) {
  const hasRevenueLedger = await tableExists(db, "revenue_ledger");
  const hasProfitLedger = await tableExists(db, "profit_ledger");

  if (!hasRevenueLedger || !hasProfitLedger) {
    return {
      available: false,
      reason: "BUSINESS_MONEY_DATA_NOT_INITIALIZED",
      verified_payment_records: 0,
      verified_paid_revenue: 0,
      gross_profit: 0,
      recorded_cost: 0,
      complete_profit_records: 0
    };
  }

  const revenueRow = await db.prepare(`
    SELECT
      COUNT(*) AS records,
      COALESCE(SUM(amount), 0) AS revenue
    FROM revenue_ledger
    WHERE recognized_at >= ?
      AND recognized_at < ?
      AND source = 'VERIFIED_PAYMENT'
  `).bind(range.start, range.end).first();

  // profit_ledger can receive a later real cost record for the same order.
  // Use the latest recorded profit per order in the requested month so a
  // cost correction does not double-count the same sale.
  const profitRows = await db.prepare(`
    SELECT
      p.order_id,
      p.revenue,
      p.cost,
      p.gross_profit,
      p.calculated_at,
      p.source
    FROM profit_ledger p
    INNER JOIN revenue_ledger r
      ON r.order_id = p.order_id
     AND r.source = 'VERIFIED_PAYMENT'
    INNER JOIN (
      SELECT order_id, MAX(calculated_at) AS latest_calculated_at
      FROM profit_ledger
      WHERE calculated_at >= ?
        AND calculated_at < ?
      GROUP BY order_id
    ) latest
      ON latest.order_id = p.order_id
     AND latest.latest_calculated_at = p.calculated_at
    WHERE p.calculated_at >= ?
      AND p.calculated_at < ?
  `).bind(
    range.start,
    range.end,
    range.start,
    range.end
  ).all();

  let recordedCost = 0;
  let grossProfit = 0;
  let completeProfitRecords = 0;

  for (const row of (profitRows.results || [])) {
    const revenue = Number(row.revenue);
    const cost = Number(row.cost);
    const profit = Number(row.gross_profit);

    if (
      Number.isFinite(revenue) &&
      Number.isFinite(cost) &&
      Number.isFinite(profit)
    ) {
      recordedCost += cost;
      grossProfit += profit;
      completeProfitRecords += 1;
    }
  }

  return {
    available: true,
    verified_payment_records: Number(revenueRow?.records || 0),
    verified_paid_revenue: Number(revenueRow?.revenue || 0),
    gross_profit: grossProfit,
    recorded_cost: recordedCost,
    complete_profit_records: completeProfitRecords
  };
}

async function getUnitEconomics(db) {
  const info = await db.prepare("PRAGMA table_info(products)").all();
  const columns = (info.results || []).map(row => row.name);

  const saleColumn = columns.includes("sale_price")
    ? "sale_price"
    : columns.includes("price")
      ? "price"
      : null;

  let costColumn = columns.includes("cost_price")
    ? "cost_price"
    : columns.includes("cost")
      ? "cost"
      : null;

  if (!costColumn) {
    await db.prepare("ALTER TABLE products ADD COLUMN cost_price REAL").run();
    costColumn = "cost_price";
  }

  if (!saleColumn) {
    return {
      available: false,
      reason: "PRODUCT_PRICE_COLUMN_NOT_FOUND",
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
    products: (rows.results || []).map(product => {
      const sale = Number(product.sale_price || 0);
      const cost = Number(product.cost_price || 0);
      const grossProfitPerKg = sale - cost;

      return {
        product_id: product.id,
        name: product.name,
        sale_price_per_kg: sale,
        cost_per_kg: cost,
        gross_profit_per_kg: grossProfitPerKg,
        required_kg_for_target: grossProfitPerKg > 0
          ? Number((TARGET_PROFIT / grossProfitPerKg).toFixed(2))
          : null
      };
    })
  };
}

async function dashboard(db, month) {
  const goal = await ensureTable(db);
  const range = monthRange(month);
  const money = await getActualMonthlyMoney(db, range);
  const economics = await getUnitEconomics(db);

  const target = Number(goal?.target_value || TARGET_PROFIT);
  const achieved = money.gross_profit;
  const remaining = Math.max(target - achieved, 0);

  return {
    success: true,
    layer: LAYER,
    version: "1.1",
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
      verified_paid_revenue: money.verified_paid_revenue,
      recorded_cost_from_profit_ledger: money.recorded_cost,
      gross_profit: achieved,
      verified_payment_records: money.verified_payment_records,
      complete_profit_records: money.complete_profit_records
    },
    progress: {
      target,
      achieved,
      remaining,
      percent: target > 0
        ? Number(((achieved / target) * 100).toFixed(2))
        : 0
    },
    unit_economics: economics,
    data_quality: {
      revenue_source: "revenue_ledger.source=VERIFIED_PAYMENT",
      profit_source: "latest profit_ledger record per order",
      uses_verified_payment_revenue: true,
      uses_recorded_cost: true,
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
        "This target is GROSS_PROFIT. TRUE NET_PROFIT requires real operating expenses to be recorded separately."
    }
  };
}

export async function onRequestGet(context) {
  try {
    if (!context.env?.DB) {
      return json({
        success: false,
        layer: LAYER,
        status: "DB_BINDING_NOT_FOUND"
      }, 500);
    }

    const url = new URL(context.request.url);

    return json(
      await dashboard(
        context.env.DB,
        url.searchParams.get("month")
      )
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
      return json({
        success: false,
        layer: LAYER,
        status: "DB_BINDING_NOT_FOUND"
      }, 500);
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
    `).bind(
      value,
      updatedAt,
      GOAL_CODE
    ).run();

    return json({
      success: true,
      layer: LAYER,
      version: "1.1",
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
