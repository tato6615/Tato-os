// TATO-OS
// Demand Creation & Customer Acquisition V1.0
// Route: /api/demand-engine
//
// Purpose:
// - Turn verified market signals and the current business goal into a concrete
//   founder-controlled demand plan.
// - Define the path: market signal -> attention -> interest -> product -> order.
// - Create measurable demand plans that can be connected to the existing
//   Content / Measurement / Learning / Decision / Action loop.
// - Never publish content, contact customers, place orders, or spend money.
// - Never read raw behavior_events. Measurement owns raw behavior.
//
// This is an acquisition planning service, not a replacement for the closed
// Measurement / Intelligence / Learning / Decision / Action layers.

const LAYER = "DEMAND_CREATION_V1.0";
const GOAL_CODE = "TATO_COFFEE_MONTHLY_PROFIT";

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

async function ensureTables(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS demand_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      demand_signal TEXT,
      market_keyword TEXT,
      audience TEXT NOT NULL,
      channel TEXT NOT NULL,
      content_format TEXT NOT NULL,
      offer TEXT NOT NULL,
      cta TEXT NOT NULL,
      success_event TEXT NOT NULL,
      objective TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_demand_plans_status
    ON demand_plans(status)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_demand_plans_created
    ON demand_plans(created_at DESC)
  `).run();
}

async function readGoal(db) {
  if (!await tableExists(db, "business_goals")) {
    return {
      target_value: 100000,
      currency: "THB",
      period: null
    };
  }

  const goal = await db.prepare(
    "SELECT * FROM business_goals WHERE goal_code=? LIMIT 1"
  ).bind(GOAL_CODE).first();

  return {
    target_value: Number(goal?.target_value || 100000),
    currency: goal?.currency || "THB",
    period: goal?.period_type || "MONTH"
  };
}

async function readEconomics(db) {
  if (!await tableExists(db, "products")) {
    return { available: false, products: [] };
  }

  const info = await db.prepare("PRAGMA table_info(products)").all();
  const columns = (info.results || []).map(row => row.name);
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
    return { available: false, products: [] };
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

  const products = (rows.results || []).map(p => {
    const sale = Number(p.sale_price || 0);
    const cost = Number(p.cost_price || 0);
    const profit = sale - cost;
    return {
      product_id: p.id,
      name: p.name,
      sale_price_per_kg: sale,
      cost_per_kg: cost,
      gross_profit_per_kg: profit,
      required_kg_for_target: profit > 0
        ? Number((100000 / profit).toFixed(2))
        : null
    };
  });

  return { available: products.length > 0, products };
}

async function readMarketSignals(db) {
  if (!await tableExists(db, "market_signals")) return [];

  const result = await db.prepare(`
    SELECT id, source, signal_type, keyword, title, content, url, score,
           metadata, detected_at
    FROM market_signals
    ORDER BY score DESC, detected_at DESC
    LIMIT 20
  `).all();

  return result.results || [];
}

async function readContent(db) {
  if (!await tableExists(db, "content_engine")) return [];

  const result = await db.prepare(`
    SELECT id, source, status, title, objective, attention_type,
           market_keyword, angle, direction, cta, content_text, created_at
    FROM content_engine
    ORDER BY created_at DESC
    LIMIT 20
  `).all();

  return result.results || [];
}

async function readOrderSummary(db) {
  if (!await tableExists(db, "orders")) {
    return { orders: 0, kg: 0, revenue: 0 };
  }

  const row = await db.prepare(`
    SELECT
      COUNT(*) AS orders,
      COALESCE(SUM(total_kg), 0) AS kg,
      COALESCE(SUM(total_amount), 0) AS revenue
    FROM orders
  `).first();

  return {
    orders: Number(row?.orders || 0),
    kg: Number(row?.kg || 0),
    revenue: Number(row?.revenue || 0)
  };
}

function deriveDemand(signals, content) {
  const signal = signals[0] || null;
  const existing = content[0] || null;

  if (signal) {
    const keyword = String(signal.keyword || "coffee").trim();
    const label = String(signal.title || signal.signal_type || keyword).trim();

    return {
      signal_id: signal.id,
      keyword,
      finding:
        "A live market signal is available: " + label +
        ". Use it as the starting point for demand creation rather than inventing a market trend.",
      attention_action:
        "Create one useful " + keyword +
        " content asset that answers the observed demand and gives the audience a reason to continue.",
      interest_action:
        "Connect the content to a specific TATO product or trial offer and measure Product View.",
      conversion_action:
        "Move qualified interest toward a real Customer → Order → Payment event; traffic alone is not success."
    };
  }

  if (existing) {
    const keyword = String(existing.market_keyword || "coffee").trim();
    return {
      signal_id: null,
      keyword,
      finding:
        "No new market signal is available. The latest Content Engine brief is the current demand input.",
      attention_action:
        "Use the latest content brief to create a useful attention asset without inventing a new market claim.",
      interest_action:
        "Keep the CTA tied to the existing TATO offer and measure Product View.",
      conversion_action:
        "Measure Product View → Customer → Order → Payment before scaling the content."
    };
  }

  return {
    signal_id: null,
    keyword: "coffee",
    finding:
      "No verified market signal or content brief is available yet. The system will not fabricate one.",
    attention_action:
      "Add a real market signal first, then create content from that signal.",
    interest_action:
      "Do not invent an audience need; connect a verified demand signal to a relevant TATO offer.",
    conversion_action:
      "Once demand exists, measure Product View → Customer → Order → Payment."
  };
}

function nextActions(demand, economics, plans) {
  const actions = [];

  if (demand.signal_id) {
    actions.push({
      action: "CREATE_CONTENT_FROM_SIGNAL",
      reason: "Use the verified market signal as the content starting point."
    });
  } else {
    actions.push({
      action: "CAPTURE_A_REAL_MARKET_SIGNAL",
      reason: "The demand engine cannot manufacture market demand data."
    });
  }

  if (economics.available) {
    actions.push({
      action: "ATTACH_TATO_OFFER",
      reason:
        "Use the configured product economics and a concrete trial/product CTA."
    });
  } else {
    actions.push({
      action: "CONFIGURE_PRODUCT_ECONOMICS",
      reason:
        "A sale and cost basis is required before the demand target can be tied to kg."
    });
  }

  if (plans.length) {
    actions.push({
      action: "EXECUTE_FOUNDER_APPROVED_PLAN",
      reason:
        "Demand plans are drafts until the founder publishes the actual content and offer."
    });
  } else {
    actions.push({
      action: "CREATE_FIRST_DEMAND_PLAN",
      reason:
        "Create the first measurable bridge from attention to a real product/order event."
    });
  }

  actions.push({
    action: "WAIT_FOR_REAL_PURCHASE_SIGNAL",
    reason:
      "The first paid order is the proof point for the acquisition path."
  });

  return actions;
}

async function dashboard(db) {
  await ensureTables(db);

  const [goal, economics, signals, content, summary, plansResult] =
    await Promise.all([
      readGoal(db),
      readEconomics(db),
      readMarketSignals(db),
      readContent(db),
      readOrderSummary(db),
      db.prepare(`
        SELECT *
        FROM demand_plans
        ORDER BY created_at DESC
        LIMIT 50
      `).all()
    ]);

  const plans = plansResult.results || [];
  const demand = deriveDemand(signals, content);
  const firstProduct = economics.products[0] || null;

  return {
    success: true,
    layer: LAYER,
    version: "1.0",
    status: "DEMAND_ENGINE_READY",
    purpose:
      "Create measurable demand and customer acquisition plans without executing them automatically.",
    goal: {
      code: GOAL_CODE,
      target_value: goal.target_value,
      currency: goal.currency,
      period: goal.period
    },
    unit_economics: firstProduct || {
      available: false,
      required_kg_for_target: null
    },
    summary,
    demand,
    next_actions: nextActions(demand, economics, plans),
    plans,
    sources: {
      market: "market_signals",
      content: "content_engine",
      goal: "business_goals",
      orders: "orders"
    },
    guardrails: {
      reads_raw_behavior_events: false,
      modifies_measurement: false,
      modifies_intelligence: false,
      modifies_learning: false,
      modifies_decision: false,
      modifies_action: false,
      publishes_content: false,
      contacts_customers: false,
      creates_orders: false,
      spends_money: false,
      automatic_execution: false,
      invents_market_signals: false,
      invents_sales: false
    },
    next:
      "Founder approves and executes the demand plan; real behavior and purchase outcomes return through the existing core loop."
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

    return json(await dashboard(context.env.DB));
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
    const mode = String(body.mode || "create").toLowerCase();

    if (mode !== "create") {
      return json({
        success: false,
        layer: LAYER,
        status: "INVALID_MODE",
        allowed_modes: ["create"]
      }, 400);
    }

    const db = context.env.DB;
    await ensureTables(db);

    const [signals, content, economics] = await Promise.all([
      readMarketSignals(db),
      readContent(db),
      readEconomics(db)
    ]);

    const demand = deriveDemand(signals, content);
    const product = economics.products[0] || null;

    if (!demand.signal_id && !content.length) {
      return json({
        success: false,
        layer: LAYER,
        status: "NO_VERIFIED_DEMAND_INPUT",
        error:
          "Create a real market signal or content brief before creating a demand plan.",
        guardrails: {
          invents_market_signals: false,
          creates_fake_demand: false
        }
      }, 409);
    }

    const id = crypto.randomUUID();
    const timestamp = now();
    const keyword = demand.keyword || "coffee";
    const plan = {
      id,
      name: "TATO Demand Test · " + keyword,
      demand_signal: demand.signal_id || "CONTENT_ENGINE",
      market_keyword: keyword,
      audience:
        "People or coffee businesses showing verified interest in " + keyword,
      channel: "FOUNDER_SELECTED_SOCIAL_OR_SEARCH",
      content_format: "SHORT_VIDEO_OR_IMAGE",
      offer: product
        ? product.name + " · " + product.sale_price_per_kg + " THB/kg"
        : "TATO product offer",
      cta: "ดูรายละเอียดและทดลอง TATO",
      success_event: "PURCHASE",
      objective:
        "Turn verified market attention into a real TATO product interaction and paid order.",
      status: "DRAFT",
      source: demand.signal_id ? "MARKET_SIGNAL" : "CONTENT_ENGINE",
      created_at: timestamp,
      updated_at: timestamp
    };

    await db.prepare(`
      INSERT INTO demand_plans
      (
        id, name, demand_signal, market_keyword, audience, channel,
        content_format, offer, cta, success_event, objective, status,
        source, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      plan.id,
      plan.name,
      plan.demand_signal,
      plan.market_keyword,
      plan.audience,
      plan.channel,
      plan.content_format,
      plan.offer,
      plan.cta,
      plan.success_event,
      plan.objective,
      plan.status,
      plan.source,
      plan.created_at,
      plan.updated_at
    ).run();

    return json({
      success: true,
      layer: LAYER,
      version: "1.0",
      status: "DEMAND_PLAN_CREATED",
      plan,
      next: {
        action:
          "Create the actual content asset, publish through the founder-selected channel, and measure the resulting first-party events.",
        success_event: "PURCHASE",
        approval_required: true
      },
      guardrails: {
        creates_fake_demand: false,
        creates_fake_orders: false,
        publishes_content: false,
        contacts_customers: false,
        automatic_execution: false
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
