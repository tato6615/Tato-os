// TATO-OS
// Market Test Distribution V1.0.1
// Route: /api/market-test-distribution
//
// Pipeline:
//
// Business Execution
//        ↓
// Market Test Distribution
//        ↓
// Measurement
//
// V1.0.1 DOES:
// - read READY_FOR_DISTRIBUTION market tests
// - create a controlled distribution record
// - persist distribution in D1
// - define tracking requirements
// - preserve full traceability
// - handoff to Measurement
//
// V1.0.1 DOES NOT:
// - publish content
// - run ads
// - spend money
// - change strategy
// - claim revenue
// - create purchase data
// - create revenue data
// - declare a winner

const ENGINE = "MARKET_TEST_DISTRIBUTION_V1";
const VERSION = "1.0.1";

const PREVIOUS_LAYER = "BUSINESS_EXECUTION_V1";
const NEXT_LAYER = "MEASUREMENT";

const ACCEPTED_MARKET_TEST_STATUS = "READY_FOR_DISTRIBUTION";
const DISTRIBUTION_STATUS_READY = "READY_FOR_MEASUREMENT";

const REQUIRED_EVENTS = [
  "content_view",
  "content_click",
  "engagement",
  "product_view",
  "order_created",
  "payment_completed",
  "revenue_recorded"
];

const ATTENTION_EVENTS = [
  "content_view",
  "content_click"
];

const INTEREST_EVENTS = [
  "engagement",
  "product_view"
];

const PURCHASE_EVENTS = [
  "order_created",
  "payment_completed"
];

const REVENUE_EVENTS = [
  "revenue_recorded"
];

const DEFAULT_CHANNEL = "ORGANIC_CONTENT";
const DEFAULT_ENTRY_POINT = "CONTROLLED_MARKET_TEST_ENTRY";

function now() {
  return new Date().toISOString();
}

function json(data, status) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status: status || 200,
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    }
  );
}

function randomId(prefix) {
  return (
    prefix +
    "-" +
    Date.now().toString() +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

function safeString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

async function ensureTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS market_test_distributions (
      id TEXT PRIMARY KEY,
      market_test_id TEXT NOT NULL,
      execution_id TEXT,
      action_id TEXT,
      approval_id TEXT,
      decision_id TEXT,
      market_theme TEXT,
      opportunity_type TEXT,
      channel TEXT,
      entry_point TEXT,
      status TEXT,
      external_distribution_status TEXT,
      tracking_status TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `).run();
}

async function getMarketTests(env) {
  const result = await env.DB.prepare(`
    SELECT *
    FROM business_market_tests
    ORDER BY rowid DESC
  `).all();

  return result.results || [];
}

async function getDistributionRecords(env) {
  const result = await env.DB.prepare(`
    SELECT *
    FROM market_test_distributions
    ORDER BY rowid DESC
  `).all();

  return result.results || [];
}

async function findMarketTest(env, marketTestId) {
  const result = await env.DB.prepare(`
    SELECT *
    FROM business_market_tests
    WHERE id = ?
    LIMIT 1
  `)
    .bind(marketTestId)
    .all();

  if (
    !result.results ||
    result.results.length === 0
  ) {
    return null;
  }

  return result.results[0];
}

async function findExistingDistribution(env, marketTestId) {
  const result = await env.DB.prepare(`
    SELECT *
    FROM market_test_distributions
    WHERE market_test_id = ?
    ORDER BY rowid DESC
    LIMIT 1
  `)
    .bind(marketTestId)
    .all();

  if (
    !result.results ||
    result.results.length === 0
  ) {
    return null;
  }

  return result.results[0];
}

function buildDistributionPlan(marketTest) {
  return {
    objective:
      "Distribute the approved market test through a controlled entry point and measure real customer behavior.",

    market_theme:
      marketTest.market_theme || "unknown",

    opportunity_type:
      marketTest.opportunity_type || "unknown",

    channel: DEFAULT_CHANNEL,

    entry_point: DEFAULT_ENTRY_POINT,

    tracking: {
      required: true,
      event_types: REQUIRED_EVENTS,
      measurement_owner: "MEASUREMENT_LAYER"
    },

    control_rules: {
      controlled_test: true,
      test_data_as_market_evidence: false,
      automatic_scaling: false,
      strategy_change: false,
      paid_advertising: false,
      external_publishing: false
    }
  };
}

async function createDistribution(env, marketTest) {
  const existing = await findExistingDistribution(
    env,
    marketTest.id
  );

  if (existing) {
    return {
      duplicate: true,
      distribution: existing,
      plan: null
    };
  }

  const id = randomId("distribution");
  const timestamp = now();

  const plan = buildDistributionPlan(
    marketTest
  );

  await env.DB.prepare(`
    INSERT INTO market_test_distributions (
      id,
      market_test_id,
      execution_id,
      action_id,
      approval_id,
      decision_id,
      market_theme,
      opportunity_type,
      channel,
      entry_point,
      status,
      external_distribution_status,
      tracking_status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      id,
      marketTest.id,
      marketTest.execution_id || null,
      marketTest.action_id || null,
      marketTest.approval_id || null,
      marketTest.decision_id || null,
      marketTest.market_theme || null,
      marketTest.opportunity_type || null,
      plan.channel,
      plan.entry_point,
      DISTRIBUTION_STATUS_READY,
      "NOT_STARTED",
      "READY",
      timestamp,
      timestamp
    )
    .run();

  await env.DB.prepare(`
    UPDATE business_market_tests
    SET status = ?,
        updated_at = ?
    WHERE id = ?
  `)
    .bind(
      DISTRIBUTION_STATUS_READY,
      timestamp,
      marketTest.id
    )
    .run();

  return {
    duplicate: false,

    distribution: {
      id: id,
      market_test_id: marketTest.id,
      execution_id: marketTest.execution_id || null,
      action_id: marketTest.action_id || null,
      approval_id: marketTest.approval_id || null,
      decision_id: marketTest.decision_id || null,
      market_theme: marketTest.market_theme || null,
      opportunity_type: marketTest.opportunity_type || null,
      channel: plan.channel,
      entry_point: plan.entry_point,
      status: DISTRIBUTION_STATUS_READY,
      external_distribution_status: "NOT_STARTED",
      tracking_status: "READY",
      created_at: timestamp,
      updated_at: timestamp
    },

    plan: plan
  };
}

async function handleGet(env) {
  await ensureTables(env);

  const marketTests = await getMarketTests(env);
  const distributions = await getDistributionRecords(env);

  const readyMarketTests = marketTests.filter(
    function (item) {
      return (
        item.status === ACCEPTED_MARKET_TEST_STATUS ||
        item.status === DISTRIBUTION_STATUS_READY
      );
    }
  );

  return json({
    success: true,

    engine: ENGINE,
    version: VERSION,
    timestamp: now(),

    state:
      distributions.length > 0
        ? "DISTRIBUTION_READY"
        : "WAITING_FOR_MARKET_TEST",

    summary: {
      market_tests: marketTests.length,
      ready_market_tests: readyMarketTests.length,
      distributions: distributions.length,

      measurement_ready_distributions:
        distributions.filter(
          function (item) {
            return (
              item.status ===
              DISTRIBUTION_STATUS_READY
            );
          }
        ).length
    },

    market_tests: marketTests,

    distributions: distributions,

    contract: {
      current_layer: ENGINE,
      version: VERSION,
      previous_layer: PREVIOUS_LAYER,
      next_layer: NEXT_LAYER,

      accepted_market_test_status:
        ACCEPTED_MARKET_TEST_STATUS,

      distribution_status:
        DISTRIBUTION_STATUS_READY,

      duplicate_distribution_blocked: true,

      external_distribution_started: false
    },

    tracking_contract: {
      required_events: REQUIRED_EVENTS,

      attention_events: ATTENTION_EVENTS,

      interest_events: INTEREST_EVENTS,

      purchase_events: PURCHASE_EVENTS,

      revenue_events: REVENUE_EVENTS
    },

    guardrails: {
      publishes_content: false,
      spends_money: false,
      runs_ads: false,
      changes_strategy: false,
      creates_purchase_data: false,
      creates_revenue_data: false,
      guarantees_revenue: false,
      automatic_scaling: false,
      duplicate_distribution_blocked: true
    },

    data_integrity: {
      distribution_persistence: "D1",
      market_test_traceability: true,
      execution_traceability: true,
      approval_traceability: true,
      decision_traceability: true,
      test_data_not_promoted_to_market_evidence: true
    }
  });
}

async function handlePost(request, env) {
  await ensureTables(env);

  let body;

  try {
    body = await request.json();
  } catch (error) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "INVALID_JSON"
      },
      400
    );
  }

  const marketTestId = safeString(
    body.market_test_id
  );

  if (!marketTestId) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "market_test_id_required"
      },
      400
    );
  }

  const marketTest = await findMarketTest(
    env,
    marketTestId
  );

  if (!marketTest) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "MARKET_TEST_NOT_FOUND",
        market_test_id: marketTestId
      },
      404
    );
  }

  const currentStatus = safeString(
    marketTest.status
  );

  if (
    currentStatus !==
      ACCEPTED_MARKET_TEST_STATUS &&
    currentStatus !==
      DISTRIBUTION_STATUS_READY
  ) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "MARKET_TEST_NOT_READY_FOR_DISTRIBUTION",

        market_test_id: marketTestId,

        current_status: currentStatus,

        required_status:
          ACCEPTED_MARKET_TEST_STATUS
      },
      409
    );
  }

  const result = await createDistribution(
    env,
    marketTest
  );

  if (result.duplicate) {
    return json({
      success: true,

      engine: ENGINE,
      version: VERSION,
      timestamp: now(),

      state: "DISTRIBUTION_ALREADY_EXISTS",

      distribution: result.distribution,

      handoff: {
        ready: true,
        next_layer: NEXT_LAYER,

        reason:
          "A distribution record already exists for this market test."
      },

      guardrails: {
        external_distribution_started: false,
        publishes_content: false,
        spends_money: false,
        runs_ads: false,
        duplicate_distribution_blocked: true
      }
    });
  }

  return json({
    success: true,

    engine: ENGINE,
    version: VERSION,
    timestamp: now(),

    state: "DISTRIBUTION_READY",

    market_test: {
      id: marketTest.id,
      execution_id:
        marketTest.execution_id || null,
      action_id:
        marketTest.action_id || null,
      approval_id:
        marketTest.approval_id || null,
      decision_id:
        marketTest.decision_id || null,
      market_theme:
        marketTest.market_theme || null,
      opportunity_type:
        marketTest.opportunity_type || null
    },

    distribution: result.distribution,

    plan: result.plan,

    handoff: {
      ready: true,
      next_layer: NEXT_LAYER,

      reason:
        "The market test has been converted into a controlled distribution record and is ready to connect to Measurement."
    },

    external_distribution: {
      published: false,
      distributed: false,
      advertising_started: false,
      money_spent: false
    },

    guardrails: {
      publishes_content: false,
      spends_money: false,
      runs_ads: false,
      changes_strategy: false,
      creates_purchase_data: false,
      creates_revenue_data: false,
      guarantees_revenue: false,
      automatic_scaling: false,
      duplicate_distribution_blocked: true
    },

    data_integrity: {
      distribution_persistence: "D1",
      market_test_traceability: true,
      execution_traceability: true,
      approval_traceability: true,
      decision_traceability: true
    },

    contract: {
      current_layer: ENGINE,
      version: VERSION,
      previous_layer: PREVIOUS_LAYER,
      next_layer: NEXT_LAYER,

      distribution_status:
        DISTRIBUTION_STATUS_READY,

      external_distribution: "NOT_STARTED",

      measurement_required: true
    }
  });
}

export async function onRequestGet(context) {
  try {
    return await handleGet(
      context.env
    );
  } catch (error) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          error && error.message
            ? error.message
            : String(error)
      },
      500
    );
  }
}

export async function onRequestPost(context) {
  try {
    return await handlePost(
      context.request,
      context.env
    );
  } catch (error) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          error && error.message
            ? error.message
            : String(error)
      },
      500
    );
  }
}
