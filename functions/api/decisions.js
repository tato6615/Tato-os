// ============================================================
// TATO-OS
// Decision Layer V1.0
// Route: /api/decision
//
// Pipeline:
//
// Measurement V2.2
//        ↓
// Intelligence V2.1
//        ↓
// Learning AI V1.4
//        ↓
// Decision Layer V1.0
//        ↓
// Action / Automation
//        ↓
// Feedback
//
// Decision Layer DOES:
// - read Learning AI
// - evaluate learned signals
// - create explicit decisions
// - assign priority
// - define required action
// - preserve evidence chain
//
// Decision Layer DOES NOT:
// - invent metrics
// - declare content winner
// - change strategy by itself
// - execute actions
// - publish content
// - modify measurement data
// ============================================================

const VERSION = "1.0";
const LAYER = "DECISION_LAYER_V1";

const LEARNING_SOURCE = "LEARNING_AI_V1";
const INTELLIGENCE_SOURCE = "INTELLIGENCE_LAYER_V2.1";
const MEASUREMENT_SOURCE = "CONTENT_MEASUREMENT_ENGINE_V2.2";

const DECISION_STATUS = {
  READY: "DECISION_READY",
  OBSERVE: "OBSERVE",
  INVESTIGATE: "INVESTIGATE",
  BLOCKED: "BLOCKED"
};

const PRIORITY = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW"
};

// ============================================================
// RESPONSE
// ============================================================

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}

// ============================================================
// HELPERS
// ============================================================

function uuid() {
  return crypto.randomUUID();
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nowISO() {
  return new Date().toISOString();
}

// ============================================================
// DATABASE
// ============================================================

async function ensureTables(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ai_runs (
      id TEXT PRIMARY KEY,
      run_type TEXT,
      model TEXT,
      status TEXT,
      input_json TEXT,
      output_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ai_insights (
      id TEXT PRIMARY KEY,
      insight_type TEXT,
      title TEXT,
      content TEXT,
      confidence TEXT,
      status TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      workflow_type TEXT,
      status TEXT,
      input_json TEXT,
      output_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

// ============================================================
// CONTENT
// ============================================================

async function getContent(db, contentId = null) {
  if (contentId) {
    const result = await db.prepare(`
      SELECT
        id,
        title,
        status,
        created_at
      FROM content_engine
      WHERE id = ?
      LIMIT 1
    `).bind(contentId).first();

    if (result) return result;
  }

  return await db.prepare(`
    SELECT
      id,
      title,
      status,
      created_at
    FROM content_engine
    ORDER BY created_at DESC
    LIMIT 1
  `).first();
}

// ============================================================
// MEASUREMENT
// ============================================================

function normalizeMeasurement(row) {
  if (!row) return null;

  return {
    id: safeString(row.id),
    content_id: safeString(row.content_id),
    measured_at: safeString(row.measured_at),
    measurement_start: safeString(row.measurement_start),
    attribution_mode: safeString(
      row.attribution_mode,
      "CONTENT_ATTRIBUTION_V2"
    ),

    attention: safeNumber(row.attention),
    product_views: safeNumber(row.product_views),
    clicks: safeNumber(row.clicks),
    engagements: safeNumber(row.engagements),
    customers: safeNumber(row.customers),
    orders: safeNumber(row.orders),
    revenue: safeNumber(row.revenue)
  };
}

async function getLatestMeasurement(db, contentId = null) {
  let result;

  if (contentId) {
    result = await db.prepare(`
      SELECT *
      FROM content_measurements
      WHERE content_id = ?
      ORDER BY measured_at DESC
      LIMIT 1
    `).bind(contentId).first();
  }

  if (!result) {
    result = await db.prepare(`
      SELECT *
      FROM content_measurements
      ORDER BY measured_at DESC
      LIMIT 1
    `).first();
  }

  return normalizeMeasurement(result);
}

// ============================================================
// LEARNING FEEDBACK
// ============================================================

async function getLearningFeedback(db, contentId = null) {
  let result;

  if (contentId) {
    result = await db.prepare(`
      SELECT *
      FROM learning_feedback
      WHERE content_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(contentId).first();
  }

  if (!result) {
    result = await db.prepare(`
      SELECT *
      FROM learning_feedback
      ORDER BY created_at DESC
      LIMIT 1
    `).first();
  }

  if (!result) return null;

  return {
    id: safeString(result.id),
    content_id: safeString(result.content_id),
    measurement_id: safeString(result.measurement_id),
    signal_type: safeString(result.signal_type),
    title: safeString(result.title),
    finding: safeString(result.finding),
    recommendation: safeString(result.recommendation),
    score: safeNumber(result.score),
    status: safeString(result.status),
    created_at: safeString(result.created_at)
  };
}

// ============================================================
// LEARNING AI
// ============================================================

async function getLearningAI(request, contentId = null) {
  const baseURL = new URL(request.url);

  const target = new URL("/api/learning-ai", baseURL);

  if (contentId) {
    target.searchParams.set("content_id", contentId);
  }

  const response = await fetch(target.toString(), {
    method: "GET",
    headers: {
      "accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Learning AI returned HTTP ${response.status}`
    );
  }

  const data = await response.json();

  if (!data || data.success !== true) {
    throw new Error("Learning AI response is invalid");
  }

  return data;
}

// ============================================================
// EVIDENCE VALIDATION
// ============================================================

function validateEvidence(learningAI) {
  const learning = learningAI?.learning || {};
  const intelligence = learningAI?.intelligence || {};
  const measurement = learningAI?.latest_measurement || {};

  const rounds = safeNumber(
    learning.rounds || intelligence.rounds || learningAI.measurement_rounds
  );

  const attention = safeNumber(
    learning?.funnel?.attention ||
    intelligence?.totals?.attention ||
    measurement?.attention
  );

  const clicks = safeNumber(
    learning?.funnel?.clicks ||
    intelligence?.totals?.clicks ||
    measurement?.clicks
  );

  const productViews = safeNumber(
    learning?.funnel?.product_views ||
    intelligence?.totals?.product_views ||
    measurement?.product_views
  );

  const customers = safeNumber(
    learning?.funnel?.customers ||
    intelligence?.totals?.customers ||
    measurement?.customers
  );

  const orders = safeNumber(
    learning?.funnel?.orders ||
    intelligence?.totals?.orders ||
    measurement?.orders
  );

  const revenue = safeNumber(
    learning?.funnel?.revenue ||
    intelligence?.totals?.revenue ||
    measurement?.revenue
  );

  return {
    rounds,
    attention,
    clicks,
    product_views: productViews,
    customers,
    orders,
    revenue
  };
}

// ============================================================
// DECISION ENGINE
// ============================================================

function makeDecision(learningAI, evidence) {
  const learning = learningAI?.learning || {};
  const intelligence = learningAI?.intelligence || {};
  const ai = learningAI?.ai || {};

  const learningState = safeString(
    learning.state,
    "OBSERVING"
  );

  const decisionInput = safeString(
    learning.decision_input,
    ""
  );

  const intelligenceState = safeString(
    intelligence.state,
    ""
  );

  const aiAction = safeString(
    ai?.analysis?.next_action?.type,
    ""
  );

  const aiReason = safeString(
    ai?.analysis?.next_action?.reason,
    ""
  );

  // ----------------------------------------------------------
  // RULE 1
  // Persistent Attention + Click
  // but Product View = 0
  // ----------------------------------------------------------

  if (
    evidence.rounds > 0 &&
    evidence.attention > 0 &&
    evidence.clicks > 0 &&
    evidence.product_views === 0
  ) {
    return {
      status: DECISION_STATUS.INVESTIGATE,
      priority: PRIORITY.HIGH,

      decision_type: "DOWNSTREAM_PATH_INVESTIGATION",

      decision: "INVESTIGATE_DOWNSTREAM_PATH",

      reason:
        "Measurement shows persistent Attention and Click behavior, " +
        "but no Product View evidence.",

      evidence: {
        rounds: evidence.rounds,
        attention: evidence.attention,
        clicks: evidence.clicks,
        product_views: evidence.product_views,
        customers: evidence.customers,
        orders: evidence.orders,
        revenue: evidence.revenue
      },

      required_action: {
        type: "INVESTIGATE",
        target: "CLICK_TO_PRODUCT_VIEW_PATH",
        execute: false
      },

      learning_reference: {
        state: learningState,
        decision_input: decisionInput,
        intelligence_state: intelligenceState
      }
    };
  }

  // ----------------------------------------------------------
  // RULE 2
  // Product View exists but no Customer
  // ----------------------------------------------------------

  if (
    evidence.product_views > 0 &&
    evidence.customers === 0
  ) {
    return {
      status: DECISION_STATUS.INVESTIGATE,
      priority: PRIORITY.HIGH,

      decision_type: "PRODUCT_TO_CUSTOMER_INVESTIGATION",

      decision: "INVESTIGATE_PRODUCT_TO_CUSTOMER_PATH",

      reason:
        "Product View exists but there is no Customer evidence.",

      evidence: {
        rounds: evidence.rounds,
        attention: evidence.attention,
        clicks: evidence.clicks,
        product_views: evidence.product_views,
        customers: evidence.customers,
        orders: evidence.orders,
        revenue: evidence.revenue
      },

      required_action: {
        type: "INVESTIGATE",
        target: "PRODUCT_TO_CUSTOMER_PATH",
        execute: false
      },

      learning_reference: {
        state: learningState,
        decision_input: decisionInput,
        intelligence_state: intelligenceState
      }
    };
  }

  // ----------------------------------------------------------
  // RULE 3
  // Customer exists but no Order
  // ----------------------------------------------------------

  if (
    evidence.customers > 0 &&
    evidence.orders === 0
  ) {
    return {
      status: DECISION_STATUS.INVESTIGATE,
      priority: PRIORITY.HIGH,

      decision_type: "CUSTOMER_TO_ORDER_INVESTIGATION",

      decision: "INVESTIGATE_CUSTOMER_TO_ORDER_PATH",

      reason:
        "Customer evidence exists but no Order evidence exists.",

      evidence: {
        rounds: evidence.rounds,
        attention: evidence.attention,
        clicks: evidence.clicks,
        product_views: evidence.product_views,
        customers: evidence.customers,
        orders: evidence.orders,
        revenue: evidence.revenue
      },

      required_action: {
        type: "INVESTIGATE",
        target: "CUSTOMER_TO_ORDER_PATH",
        execute: false
      },

      learning_reference: {
        state: learningState,
        decision_input: decisionInput,
        intelligence_state: intelligenceState
      }
    };
  }

  // ----------------------------------------------------------
  // RULE 4
  // Order exists but no Revenue
  // ----------------------------------------------------------

  if (
    evidence.orders > 0 &&
    evidence.revenue === 0
  ) {
    return {
      status: DECISION_STATUS.INVESTIGATE,
      priority: PRIORITY.MEDIUM,

      decision_type: "ORDER_TO_REVENUE_INVESTIGATION",

      decision: "INVESTIGATE_REVENUE_PATH",

      reason:
        "Order evidence exists but Revenue has not been recorded.",

      evidence: {
        rounds: evidence.rounds,
        attention: evidence.attention,
        clicks: evidence.clicks,
        product_views: evidence.product_views,
        customers: evidence.customers,
        orders: evidence.orders,
        revenue: evidence.revenue
      },

      required_action: {
        type: "INVESTIGATE",
        target: "ORDER_TO_REVENUE_TRACKING",
        execute: false
      },

      learning_reference: {
        state: learningState,
        decision_input: decisionInput,
        intelligence_state: intelligenceState
      }
    };
  }

  // ----------------------------------------------------------
  // RULE 5
  // No meaningful traffic / behavior yet
  // ----------------------------------------------------------

  if (
    evidence.attention === 0 &&
    evidence.clicks === 0 &&
    evidence.product_views === 0 &&
    evidence.customers === 0 &&
    evidence.orders === 0
  ) {
    return {
      status: DECISION_STATUS.OBSERVE,
      priority: PRIORITY.LOW,

      decision_type: "WAIT_FOR_DATA",

      decision: "OBSERVE",

      reason:
        "There is not enough behavioral evidence to make a downstream decision.",

      evidence: {
        rounds: evidence.rounds,
        attention: evidence.attention,
        clicks: evidence.clicks,
        product_views: evidence.product_views,
        customers: evidence.customers,
        orders: evidence.orders,
        revenue: evidence.revenue
      },

      required_action: {
        type: "OBSERVE",
        target: "MEASUREMENT",
        execute: false
      },

      learning_reference: {
        state: learningState,
        decision_input: decisionInput,
        intelligence_state: intelligenceState
      }
    };
  }

  // ----------------------------------------------------------
  // RULE 6
  // Existing Learning decision input
  // ----------------------------------------------------------

  if (decisionInput === "INVESTIGATE_DOWNSTREAM_PATH") {
    return {
      status: DECISION_STATUS.INVESTIGATE,
      priority: PRIORITY.HIGH,

      decision_type: "LEARNING_SIGNAL_REVIEW",

      decision: "INVESTIGATE_DOWNSTREAM_PATH",

      reason:
        "Learning AI identified a downstream path requiring investigation.",

      evidence: {
        rounds: evidence.rounds,
        attention: evidence.attention,
        clicks: evidence.clicks,
        product_views: evidence.product_views,
        customers: evidence.customers,
        orders: evidence.orders,
        revenue: evidence.revenue
      },

      required_action: {
        type: "INVESTIGATE",
        target: "DOWNSTREAM_PATH",
        execute: false
      },

      learning_reference: {
        state: learningState,
        decision_input: decisionInput,
        intelligence_state: intelligenceState
      }
    };
  }

  // ----------------------------------------------------------
  // RULE 7
  // AI recommendation is informational only
  // ----------------------------------------------------------

  if (aiAction === "INVESTIGATE") {
    return {
      status: DECISION_STATUS.INVESTIGATE,
      priority: PRIORITY.MEDIUM,

      decision_type: "AI_SUPPORTED_INVESTIGATION",

      decision: "INVESTIGATE",

      reason:
        aiReason ||
        "Learning AI recommends investigation based on observed evidence.",

      evidence: {
        rounds: evidence.rounds,
        attention: evidence.attention,
        clicks: evidence.clicks,
        product_views: evidence.product_views,
        customers: evidence.customers,
        orders: evidence.orders,
        revenue: evidence.revenue
      },

      required_action: {
        type: "INVESTIGATE",
        target: "LEARNING_SIGNAL",
        execute: false
      },

      learning_reference: {
        state: learningState,
        decision_input: decisionInput,
        intelligence_state: intelligenceState
      }
    };
  }

  // ----------------------------------------------------------
  // DEFAULT
  // ----------------------------------------------------------

  return {
    status: DECISION_STATUS.OBSERVE,
    priority: PRIORITY.LOW,

    decision_type: "CONTINUE_OBSERVATION",

    decision: "OBSERVE",

    reason:
      "Current evidence does not meet a decision rule requiring intervention.",

    evidence: {
      rounds: evidence.rounds,
      attention: evidence.attention,
      clicks: evidence.clicks,
      product_views: evidence.product_views,
      customers: evidence.customers,
      orders: evidence.orders,
      revenue: evidence.revenue
    },

    required_action: {
      type: "OBSERVE",
      target: "MEASUREMENT",
      execute: false
    },

    learning_reference: {
      state: learningState,
      decision_input: decisionInput,
      intelligence_state: intelligenceState
    }
  };
}

// ============================================================
// DECISION CONTRACT
// ============================================================

function buildDecisionContract(
  learningAI,
  learningFeedback,
  measurement,
  content,
  decision
) {
  return {
    layer: LAYER,
    version: VERSION,

    status: decision.status,

    content_id:
      content?.id ||
      learningAI?.content?.id ||
      measurement?.content_id ||
      null,

    content: content
      ? {
          id: content.id,
          title: content.title,
          status: content.status
        }
      : null,

    decision,

    source_chain: {
      measurement: MEASUREMENT_SOURCE,
      intelligence: INTELLIGENCE_SOURCE,
      learning: LEARNING_SOURCE,
      decision: LAYER
    },

    source_contract: {
      measurement_id:
        measurement?.id ||
        learningAI?.learning?.source_contract?.latest_measurement_id ||
        null,

      measurement_rounds:
        learningAI?.learning?.source_contract?.measurement_rounds ||
        learningAI?.measurement_rounds ||
        0,

      content_id:
        content?.id ||
        learningAI?.learning?.source_contract?.content_id ||
        null,

      attribution_mode:
        measurement?.attribution_mode ||
        "CONTENT_ATTRIBUTION_V2",

      attention_type:
        learningAI?.learning?.source_contract?.attention_type ||
        "weighted_behavioral_signal"
    },

    learning_feedback: learningFeedback,

    guardrails: {
      winner_declared: false,
      winner_selected: false,
      strategy_change: false,
      automatic_execution: false,
      action_executed: false,
      content_modified: false,
      measurement_modified: false,
      requires_action_layer: true
    },

    created_at: nowISO()
  };
}

// ============================================================
// SAVE DECISION
// ============================================================

async function saveDecision(db, contract) {
  await ensureTables(db);

  const runId = uuid();
  const insightId = uuid();

  await db.prepare(`
    INSERT INTO ai_runs (
      id,
      run_type,
      model,
      status,
      input_json,
      output_json,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    runId,
    "DECISION",
    "RULE_ENGINE",
    contract.status,
    JSON.stringify({
      source_chain: contract.source_chain,
      source_contract: contract.source_contract,
      learning_feedback: contract.learning_feedback
    }),
    JSON.stringify(contract)
  ).run();

  await db.prepare(`
    INSERT INTO ai_insights (
      id,
      insight_type,
      title,
      content,
      confidence,
      status,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    insightId,
    "DECISION",
    `Decision: ${contract.decision.decision}`,
    JSON.stringify(contract),
    contract.decision.priority,
    contract.status
  ).run();

  return {
    run_id: runId,
    insight_id: insightId
  };
}

// ============================================================
// ANALYZE
// ============================================================

async function analyze(request, env, contentId = null) {
  if (!env.DB) {
    throw new Error("D1 binding DB is missing");
  }

  const db = env.DB;

  const content = await getContent(db, contentId);

  const resolvedContentId =
    content?.id ||
    contentId ||
    null;

  const learningAI = await getLearningAI(
    request,
    resolvedContentId
  );

  const measurement =
    normalizeMeasurement(
      learningAI?.latest_measurement
    ) ||
    await getLatestMeasurement(
      db,
      resolvedContentId
    );

  const learningFeedback =
    learningAI?.learning_feedback ||
    await getLearningFeedback(
      db,
      resolvedContentId
    );

  const evidence = validateEvidence(
    learningAI
  );

  const decision = makeDecision(
    learningAI,
    evidence
  );

  const contract = buildDecisionContract(
    learningAI,
    learningFeedback,
    measurement,
    content,
    decision
  );

  return {
    success: true,

    layer: LAYER,
    version: VERSION,

    mode: "preview",

    status: decision.status,

    content: contract.content,

    measurement,

    intelligence:
      learningAI?.intelligence || null,

    learning:
      learningAI?.learning || null,

    learning_feedback:
      learningFeedback,

    decision,

    source_chain:
      contract.source_chain,

    source_contract:
      contract.source_contract,

    guardrails:
      contract.guardrails,

    contract
  };
}

// ============================================================
// EXECUTE / SAVE
// ============================================================

async function executeDecision(
  request,
  env,
  contentId = null
) {
  if (!env.DB) {
    throw new Error("D1 binding DB is missing");
  }

  const db = env.DB;

  const preview = await analyze(
    request,
    env,
    contentId
  );

  const saved = await saveDecision(
    db,
    preview.contract
  );

  return {
    ...preview,

    mode: "execute",

    status: "DECISION_SAVED",

    saved,

    next_step:
      "Decision saved. Next stage: Action / Automation Layer."
  };
}

// ============================================================
// REQUEST PARSER
// ============================================================

async function parseBody(request) {
  try {
    const text = await request.text();

    if (!text) return {};

    const body = JSON.parse(text);

    return body && typeof body === "object"
      ? body
      : {};
  } catch {
    return {};
  }
}

// ============================================================
// GET
// ============================================================

async function handleGET(request, env) {
  const url = new URL(request.url);

  const contentId =
    url.searchParams.get("content_id");

  try {
    return json(
      await analyze(
        request,
        env,
        contentId
      )
    );
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        status: "ERROR",
        error: error?.message || "Decision analysis failed"
      },
      500
    );
  }
}

// ============================================================
// POST
// ============================================================

async function handlePOST(request, env) {
  const body = await parseBody(request);

  const mode =
    safeString(
      body.mode,
      "preview"
    ).toLowerCase();

  const contentId =
    body.content_id ||
    null;

  try {
    if (mode === "execute") {
      return json(
        await executeDecision(
          request,
          env,
          contentId
        )
      );
    }

    return json(
      await analyze(
        request,
        env,
        contentId
      )
    );
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        mode,
        status: "ERROR",
        error: error?.message || "Decision failed"
      },
      500
    );
  }
}

// ============================================================
// ROUTER
// ============================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname !== "/api/decision") {
      return new Response("Not Found", {
        status: 404
      });
    }

    if (request.method === "GET") {
      return handleGET(
        request,
        env
      );
    }

    if (request.method === "POST") {
      return handlePOST(
        request,
        env
      );
    }

    return new Response("Method Not Allowed", {
      status: 405,
      headers: {
        allow: "GET, POST"
      }
    });
  }
};
