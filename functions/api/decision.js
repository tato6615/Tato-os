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
//
// Decision Layer DOES:
// - consume Learning AI output
// - evaluate downstream funnel state
// - create an explicit decision
// - define target + required action
// - hand off to Action Layer
//
// Decision Layer DOES NOT:
// - execute actions
// - change strategy automatically
// - declare content winner
// - invent behavioral data
//
// Cloudflare Pages Functions
// Path: functions/api/decision.js

const VERSION = "1.0";
const LAYER = "DECISION_LAYER_V1";

const MEASUREMENT_SOURCE = "CONTENT_MEASUREMENT_ENGINE_V2.2";
const INTELLIGENCE_SOURCE = "INTELLIGENCE_LAYER_V2.1";
const LEARNING_SOURCE = "LEARNING_AI_V1.4";

const MAX_ROUNDS = 20;

// --------------------------------------------------
// BASIC HELPERS
// --------------------------------------------------

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function uid(prefix = "decision") {
  return `${prefix}_${crypto.randomUUID()}`;
}

function nowISO() {
  return new Date().toISOString();
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function stringOrNull(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return String(value);
}

function firstDefinedNumber(...sources) {
  for (const source of sources) {
    if (
      source !== null &&
      source !== undefined &&
      Number.isFinite(Number(source))
    ) {
      return Number(source);
    }
  }

  return 0;
}

function firstDefinedValue(...sources) {
  for (const source of sources) {
    if (source !== undefined && source !== null) {
      return source;
    }
  }

  return null;
}

// --------------------------------------------------
// DATABASE
// --------------------------------------------------

async function ensureTables(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ai_runs (
      id TEXT PRIMARY KEY,
      run_type TEXT,
      model TEXT,
      status TEXT,
      input_json TEXT,
      output_json TEXT,
      created_at TEXT
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ai_insights (
      id TEXT PRIMARY KEY,
      insight_type TEXT,
      title TEXT,
      summary TEXT,
      priority TEXT,
      source TEXT,
      data_json TEXT,
      created_at TEXT
    )
  `).run();
}

// --------------------------------------------------
// CONTENT
// --------------------------------------------------

async function getContent(db, contentId) {
  if (!contentId) {
    return null;
  }

  try {
    const result = await db.prepare(`
      SELECT *
      FROM content_engine
      WHERE id = ?
      LIMIT 1
    `).bind(contentId).first();

    return result || null;
  } catch {
    return null;
  }
}

// --------------------------------------------------
// MEASUREMENT
// --------------------------------------------------

async function getLatestMeasurement(db, contentId) {
  if (!contentId) {
    return null;
  }

  try {
    const result = await db.prepare(`
      SELECT *
      FROM content_measurements
      WHERE content_id = ?
      ORDER BY measured_at DESC, created_at DESC
      LIMIT 1
    `).bind(contentId).first();

    return result || null;
  } catch {
    return null;
  }
}

async function getMeasurementHistory(db, contentId) {
  if (!contentId) {
    return [];
  }

  try {
    const result = await db.prepare(`
      SELECT *
      FROM content_measurements
      WHERE content_id = ?
      ORDER BY measured_at DESC, created_at DESC
      LIMIT ?
    `).bind(contentId, MAX_ROUNDS).all();

    return result?.results || [];
  } catch {
    return [];
  }
}

// --------------------------------------------------
// LEARNING FEEDBACK
// --------------------------------------------------

async function getLearningFeedback(db, contentId) {
  if (!contentId) {
    return [];
  }

  try {
    const result = await db.prepare(`
      SELECT *
      FROM learning_feedback
      WHERE content_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).bind(contentId).all();

    return result?.results || [];
  } catch {
    return [];
  }
}

// --------------------------------------------------
// LEARNING AI
// --------------------------------------------------

async function getLearningAI(request, contentId) {
  if (!contentId) {
    return {
      success: false,
      error: "content_id_required"
    };
  }

  try {
    const url = new URL(request.url);

    const learningURL =
      `${url.origin}/api/learning-ai?content_id=${encodeURIComponent(contentId)}`;

    const response = await fetch(learningURL, {
      method: "GET",
      headers: {
        "accept": "application/json"
      }
    });

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      return {
        success: false,
        error: "learning_ai_invalid_json",
        http_status: response.status
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: "learning_ai_http_error",
        http_status: response.status,
        data
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: "learning_ai_fetch_failed",
      message: error?.message || String(error)
    };
  }
}

// --------------------------------------------------
// EVIDENCE EXTRACTION
// --------------------------------------------------

function extractEvidence(learningAI, latestMeasurement) {
  const intelligence =
    learningAI?.intelligence &&
    typeof learningAI.intelligence === "object"
      ? learningAI.intelligence
      : {};

  const learning =
    learningAI?.learning &&
    typeof learningAI.learning === "object"
      ? learningAI.learning
      : {};

  const intelligenceTotals =
    intelligence?.totals &&
    typeof intelligence.totals === "object"
      ? intelligence.totals
      : {};

  const learningFunnel =
    learning?.funnel &&
    typeof learning.funnel === "object"
      ? learning.funnel
      : {};

  const latest =
    learningAI?.latest_measurement &&
    typeof learningAI.latest_measurement === "object"
      ? learningAI.latest_measurement
      : {};

  const measurement =
    latestMeasurement &&
    typeof latestMeasurement === "object"
      ? latestMeasurement
      : {};

  const attention = firstDefinedNumber(
    intelligenceTotals.attention,
    learningFunnel.attention,
    latest.attention,
    measurement.attention
  );

  const clicks = firstDefinedNumber(
    intelligenceTotals.clicks,
    learningFunnel.clicks,
    latest.clicks,
    measurement.clicks
  );

  const productViews = firstDefinedNumber(
    intelligenceTotals.product_views,
    learningFunnel.product_views,
    latest.product_views,
    measurement.product_views
  );

  const engagements = firstDefinedNumber(
    intelligenceTotals.engagements,
    learningFunnel.engagements,
    latest.engagements,
    measurement.engagements
  );

  const customers = firstDefinedNumber(
    intelligenceTotals.customers,
    learningFunnel.customers,
    latest.customers,
    measurement.customers
  );

  const orders = firstDefinedNumber(
    intelligenceTotals.orders,
    learningFunnel.orders,
    latest.orders,
    measurement.orders
  );

  const revenue = firstDefinedNumber(
    intelligenceTotals.revenue,
    learningFunnel.revenue,
    latest.revenue,
    measurement.revenue
  );

  return {
    attention,
    clicks,
    product_views: productViews,
    engagements,
    customers,
    orders,
    revenue
  };
}

// --------------------------------------------------
// DECISION ENGINE
// --------------------------------------------------

function decide(evidence, learningAI) {
  const {
    attention,
    clicks,
    product_views,
    engagements,
    customers,
    orders,
    revenue
  } = evidence;

  const learningDecisionInput =
    stringOrNull(learningAI?.learning?.decision_input);

  const learningState =
    stringOrNull(learningAI?.learning?.state);

  const intelligenceState =
    stringOrNull(learningAI?.intelligence?.state);

  // ----------------------------------------------
  // RULE 1
  // ATTENTION + CLICK
  // BUT NO PRODUCT VIEW
  // ----------------------------------------------

  if (
    attention > 0 &&
    clicks > 0 &&
    product_views === 0
  ) {
    return {
      status: "DECISION_READY",
      priority: "HIGH",
      decision: "INVESTIGATE_DOWNSTREAM_PATH",
      target: "CLICK_TO_PRODUCT_VIEW_PATH",
      required_action: {
        type: "INVESTIGATE",
        execute: false
      },
      reason:
        "Attention and clicks are present, but no product view has been measured."
    };
  }

  // ----------------------------------------------
  // RULE 2
  // PRODUCT VIEW
  // BUT NO CUSTOMER
  // ----------------------------------------------

  if (
    product_views > 0 &&
    customers === 0
  ) {
    return {
      status: "DECISION_READY",
      priority: "HIGH",
      decision: "INVESTIGATE_PRODUCT_TO_CUSTOMER",
      target: "PRODUCT_TO_CUSTOMER_PATH",
      required_action: {
        type: "INVESTIGATE",
        execute: false
      },
      reason:
        "Product views are present, but no customer conversion has been measured."
    };
  }

  // ----------------------------------------------
  // RULE 3
  // CUSTOMER
  // BUT NO ORDER
  // ----------------------------------------------

  if (
    customers > 0 &&
    orders === 0
  ) {
    return {
      status: "DECISION_READY",
      priority: "HIGH",
      decision: "INVESTIGATE_CUSTOMER_TO_ORDER",
      target: "CUSTOMER_TO_ORDER_PATH",
      required_action: {
        type: "INVESTIGATE",
        execute: false
      },
      reason:
        "Customers are present, but no order conversion has been measured."
    };
  }

  // ----------------------------------------------
  // RULE 4
  // ORDER
  // BUT NO REVENUE
  // ----------------------------------------------

  if (
    orders > 0 &&
    revenue === 0
  ) {
    return {
      status: "DECISION_READY",
      priority: "HIGH",
      decision: "INVESTIGATE_ORDER_TO_REVENUE",
      target: "ORDER_TO_REVENUE_PATH",
      required_action: {
        type: "INVESTIGATE",
        execute: false
      },
      reason:
        "Orders are present, but revenue has not been measured."
    };
  }

  // ----------------------------------------------
  // RULE 5
  // NO BEHAVIOR
  // ----------------------------------------------

  if (
    attention === 0 &&
    clicks === 0 &&
    product_views === 0 &&
    engagements === 0 &&
    customers === 0 &&
    orders === 0 &&
    revenue === 0
  ) {
    return {
      status: "WAITING",
      priority: "LOW",
      decision: "WAIT_FOR_BEHAVIORAL_DATA",
      target: "MEASUREMENT",
      required_action: {
        type: "WAIT",
        execute: false
      },
      reason:
        "No measurable behavioral or commercial signal is currently available."
    };
  }

  // ----------------------------------------------
  // RULE 6
  // RESPECT LEARNING HANDOFF
  // ----------------------------------------------

  if (
    learningDecisionInput === "INVESTIGATE_DOWNSTREAM_PATH"
  ) {
    return {
      status: "DECISION_READY",
      priority: "HIGH",
      decision: "INVESTIGATE_DOWNSTREAM_PATH",
      target: "CLICK_TO_PRODUCT_VIEW_PATH",
      required_action: {
        type: "INVESTIGATE",
        execute: false
      },
      reason:
        "Learning AI identified a downstream funnel block requiring Decision Layer evaluation."
    };
  }

  // ----------------------------------------------
  // RULE 7
  // PERSISTENT FUNNEL BLOCK
  // ----------------------------------------------

  if (
    intelligenceState === "PERSISTENT_FUNNEL_BLOCK" ||
    learningState === "DOWNSTREAM_BLOCK_DETECTED"
  ) {
    return {
      status: "DECISION_READY",
      priority: "HIGH",
      decision: "INVESTIGATE_DOWNSTREAM_PATH",
      target: "FUNNEL",
      required_action: {
        type: "INVESTIGATE",
        execute: false
      },
      reason:
        "The upstream intelligence layers report a persistent funnel block."
    };
  }

  // ----------------------------------------------
  // DEFAULT
  // ----------------------------------------------

  return {
    status: "DECISION_READY",
    priority: "MEDIUM",
    decision: "CONTINUE_OBSERVATION",
    target: "BEHAVIOR",
    required_action: {
      type: "WAIT",
      execute: false
    },
    reason:
      "Current evidence does not satisfy a specific downstream intervention rule."
  };
}

// --------------------------------------------------
// GUARDRAILS
// --------------------------------------------------

function buildGuardrails() {
  return {
    winner_declared: false,
    strategy_changed: false,
    automatic_execution: false,
    action_executed: false,
    decision_is_executable: false,
    requires_action_layer: true
  };
}

// --------------------------------------------------
// SAVE DECISION
// --------------------------------------------------

async function saveDecision(db, payload) {
  const runId = uid("decision_run");
  const insightId = uid("decision_insight");

  const createdAt = nowISO();

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
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    runId,
    "DECISION",
    "RULE_ENGINE",
    payload.status,
    JSON.stringify(payload.input),
    JSON.stringify(payload.output),
    createdAt
  ).run();

  await db.prepare(`
    INSERT INTO ai_insights (
      id,
      insight_type,
      title,
      summary,
      priority,
      source,
      data_json,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    insightId,
    "DECISION",
    payload.output.decision,
    payload.output.reason,
    payload.output.priority,
    LAYER,
    JSON.stringify(payload.output),
    createdAt
  ).run();

  return {
    run_id: runId,
    insight_id: insightId,
    created_at: createdAt
  };
}

// --------------------------------------------------
// MAIN ENGINE
// --------------------------------------------------

async function runDecision(context, contentId) {
  const { request, env } = context;

  if (!env?.DB) {
    throw new Error("DB binding not found");
  }

  const db = env.DB;

  await ensureTables(db);

  // ----------------------------------------------
  // LOAD UPSTREAM LEARNING
  // ----------------------------------------------

  const learningAI = await getLearningAI(
    request,
    contentId
  );

  // ----------------------------------------------
  // LOAD MEASUREMENT DIRECTLY ONLY FOR EVIDENCE
  // ----------------------------------------------
  //
  // Decision does not recalculate Measurement.
  // It only uses the latest stored measurement as
  // a fallback/evidence reference.

  const latestMeasurement =
    await getLatestMeasurement(db, contentId);

  const measurementHistory =
    await getMeasurementHistory(db, contentId);

  const content =
    await getContent(db, contentId);

  const learningFeedback =
    await getLearningFeedback(db, contentId);

  // ----------------------------------------------
  // EXTRACT NORMALIZED EVIDENCE
  // ----------------------------------------------

  const evidence =
    extractEvidence(
      learningAI,
      latestMeasurement
    );

  // ----------------------------------------------
  // CREATE DECISION
  // ----------------------------------------------

  const decision =
    decide(
      evidence,
      learningAI
    );

  // ----------------------------------------------
  // SOURCE CONTRACT
  // ----------------------------------------------

  const sourceContract = {
    measurement: {
      layer: MEASUREMENT_SOURCE,
      rounds:
        learningAI?.measurement_rounds ??
        measurementHistory.length,
      latest_measurement_id:
        learningAI?.latest_measurement?.id ??
        latestMeasurement?.id ??
        null
    },

    intelligence: {
      layer: INTELLIGENCE_SOURCE,
      state:
        learningAI?.intelligence?.state ??
        null
    },

    learning: {
      layer: LEARNING_SOURCE,
      version:
        learningAI?.version ??
        "1.4",
      state:
        learningAI?.learning?.state ??
        null,
      decision_input:
        learningAI?.learning?.decision_input ??
        null
    }
  };

  // ----------------------------------------------
  // FINAL OUTPUT
  // ----------------------------------------------

  const output = {
    success: true,

    layer: LAYER,
    version: VERSION,

    status: decision.status,

    content: {
      id: contentId,
      title:
        content?.title ??
        learningAI?.content?.title ??
        null,
      status:
        content?.status ??
        learningAI?.content?.status ??
        null
    },

    decision: {
      priority: decision.priority,
      type: decision.decision,
      target: decision.target,
      reason: decision.reason
    },

    required_action: decision.required_action,

    evidence: {
      attention: evidence.attention,
      clicks: evidence.clicks,
      product_views: evidence.product_views,
      engagements: evidence.engagements,
      customers: evidence.customers,
      orders: evidence.orders,
      revenue: evidence.revenue
    },

    learning: {
      state:
        learningAI?.learning?.state ??
        null,

      confidence:
        learningAI?.learning?.confidence ??
        null,

      decision_input:
        learningAI?.learning?.decision_input ??
        null,

      signals:
        learningAI?.learning?.signals ??
        [],

      hypotheses:
        learningAI?.learning?.hypotheses ??
        [],

      problems:
        learningAI?.learning?.problems ??
        []
    },

    intelligence: {
      state:
        learningAI?.intelligence?.state ??
        null,

      patterns:
        learningAI?.intelligence?.patterns ??
        {},

      conversions:
        learningAI?.intelligence?.conversions ??
        {}
    },

    funnel: {
      attention: evidence.attention,
      clicks: evidence.clicks,
      product_views: evidence.product_views,
      engagements: evidence.engagements,
      customers: evidence.customers,
      orders: evidence.orders,
      revenue: evidence.revenue
    },

    feedback: {
      count: learningFeedback.length,
      latest:
        learningFeedback[0] ??
        null
    },

    source_chain: [
      MEASUREMENT_SOURCE,
      INTELLIGENCE_SOURCE,
      LEARNING_SOURCE,
      LAYER
    ],

    source_contract: sourceContract,

    guardrails: buildGuardrails(),

    handoff: {
      next_layer: "ACTION_LAYER",
      action_required:
        decision.required_action.type !== "WAIT",
      execute:
        false
    },

    execution: {
      allowed: false,
      executed: false,
      reason:
        "Decision Layer creates decisions only. Action execution belongs to the Action / Automation Layer."
    },

    timestamp: nowISO()
  };

  return {
    output,
    input: {
      content_id: contentId,
      learning_ai_status:
        learningAI?.status ??
        null,
      evidence
    }
  };
}

// --------------------------------------------------
// CONTENT ID RESOLUTION
// --------------------------------------------------

function resolveContentId(request, body = {}) {
  const url = new URL(request.url);

  return (
    body?.content_id ||
    url.searchParams.get("content_id") ||
    null
  );
}

// --------------------------------------------------
// GET
// --------------------------------------------------

export async function onRequestGet(context) {
  try {
    const contentId =
      resolveContentId(context.request);

    if (!contentId) {
      return json({
        success: false,
        layer: LAYER,
        version: VERSION,
        error: "content_id_required",
        usage:
          "/api/decision?content_id=YOUR_CONTENT_ID"
      }, 400);
    }

    const result =
      await runDecision(
        context,
        contentId
      );

    return json({
      ...result.output,
      mode: "PREVIEW",
      saved: false
    });

  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      version: VERSION,
      error: "DECISION_LAYER_ERROR",
      message:
        error?.message ||
        String(error)
    }, 500);
  }
}

// --------------------------------------------------
// POST
// --------------------------------------------------

export async function onRequestPost(context) {
  try {
    const request = context.request;

    let body = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const contentId =
      resolveContentId(
        request,
        body
      );

    if (!contentId) {
      return json({
        success: false,
        layer: LAYER,
        version: VERSION,
        error: "content_id_required"
      }, 400);
    }

    const mode =
      body?.mode ||
      "preview";

    const result =
      await runDecision(
        context,
        contentId
      );

    // ----------------------------------------------
    // PREVIEW
    // ----------------------------------------------

    if (mode !== "save") {
      return json({
        ...result.output,
        mode: "PREVIEW",
        saved: false
      });
    }

    // ----------------------------------------------
    // SAVE DECISION
    // ----------------------------------------------

    const saved =
      await saveDecision(
        context.env.DB,
        result
      );

    return json({
      ...result.output,
      mode: "SAVE",
      saved: true,
      persistence: saved
    });

  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      version: VERSION,
      error: "DECISION_LAYER_ERROR",
      message:
        error?.message ||
        String(error)
    }, 500);
  }
}
