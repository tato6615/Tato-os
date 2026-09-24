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
// Decision Layer:
// - reads Learning AI
// - validates evidence
// - creates explicit decision
// - preserves source chain
// - does NOT execute actions
// - does NOT change strategy
// - does NOT declare winners
// ============================================================

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const VERSION = "1.0";
const LAYER = "DECISION_LAYER_V1";

const MEASUREMENT_SOURCE =
  "CONTENT_MEASUREMENT_ENGINE_V2.2";

const INTELLIGENCE_SOURCE =
  "INTELLIGENCE_LAYER_V2.1";

const LEARNING_SOURCE =
  "LEARNING_AI_V1";

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: HEADERS
    }
  );
}

function id() {
  return crypto.randomUUID();
}

function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

function s(value) {
  return value == null ? "" : String(value);
}

// ============================================================
// SAFE JSON
// ============================================================

function safeParse(value) {
  if (!value) return null;

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

// ============================================================
// DATABASE
// ============================================================

async function ensureTables(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ai_runs (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      run_type TEXT,
      model TEXT,
      input_data TEXT,
      output_data TEXT,
      status TEXT,
      tokens_used INTEGER,
      created_at TEXT
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ai_insights (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      run_id TEXT,
      insight_type TEXT,
      title TEXT,
      content TEXT,
      score REAL,
      priority TEXT,
      status TEXT,
      created_at TEXT
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      workflow_type TEXT,
      status TEXT,
      input_json TEXT,
      output_json TEXT,
      created_at TEXT
    )
  `).run();
}

// ============================================================
// CONTENT
// ============================================================

async function getContent(db, contentId = null) {
  try {
    if (contentId) {
      const row = await db.prepare(`
        SELECT *
        FROM content_engine
        WHERE id = ?
        LIMIT 1
      `).bind(contentId).first();

      if (row) return row;
    }
  } catch (_) {}

  try {
    return await db.prepare(`
      SELECT *
      FROM content_engine
      ORDER BY created_at DESC
      LIMIT 1
    `).first();
  } catch (_) {
    return null;
  }
}

// ============================================================
// MEASUREMENT
// ============================================================

function normalizeMeasurement(row) {
  if (!row) return null;

  return {
    id: s(row.id),
    content_id: s(row.content_id),
    measured_at: s(row.measured_at),
    measurement_start: s(row.measurement_start),
    attribution_mode: s(
      row.attribution_mode ||
      "CONTENT_ATTRIBUTION_V2"
    ),

    attention: n(row.attention),
    product_views: n(row.product_views),
    clicks: n(row.clicks),
    engagements: n(row.engagements),
    customers: n(row.customers),
    orders: n(row.orders),
    revenue: n(row.revenue)
  };
}

async function getMeasurement(
  db,
  contentId = null
) {
  let row = null;

  try {
    if (contentId) {
      row = await db.prepare(`
        SELECT *
        FROM content_measurements
        WHERE content_id = ?
        ORDER BY measured_at DESC
        LIMIT 1
      `).bind(contentId).first();
    }
  } catch (_) {}

  if (!row) {
    try {
      row = await db.prepare(`
        SELECT *
        FROM content_measurements
        ORDER BY measured_at DESC
        LIMIT 1
      `).first();
    } catch (_) {}
  }

  return normalizeMeasurement(row);
}

// ============================================================
// LEARNING FEEDBACK
// ============================================================

async function getLearningFeedback(
  db,
  contentId = null
) {
  let row = null;

  try {
    if (contentId) {
      row = await db.prepare(`
        SELECT *
        FROM learning_feedback
        WHERE content_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).bind(contentId).first();
    }
  } catch (_) {}

  if (!row) {
    try {
      row = await db.prepare(`
        SELECT *
        FROM learning_feedback
        ORDER BY created_at DESC
        LIMIT 1
      `).first();
    } catch (_) {}
  }

  if (!row) return null;

  return {
    id: s(row.id),
    content_id: s(row.content_id),
    measurement_id: s(row.measurement_id),
    signal_type: s(row.signal_type),
    title: s(row.title),
    finding: s(row.finding),
    recommendation: s(row.recommendation),
    score: n(row.score),
    status: s(row.status),
    created_at: s(row.created_at)
  };
}

// ============================================================
// LEARNING AI
//
// IMPORTANT:
// Decision Layer reads the existing Learning AI endpoint.
// It does NOT recreate Learning logic independently.
// ============================================================

async function getLearningAI(
  request,
  contentId = null
) {
  const currentURL =
    new URL(request.url);

  const learningURL =
    new URL(
      "/api/learning-ai",
      currentURL.origin
    );

  if (contentId) {
    learningURL.searchParams.set(
      "content_id",
      contentId
    );
  }

  const response = await fetch(
    learningURL.toString(),
    {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `Learning AI HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  if (!data?.success) {
    throw new Error(
      "Learning AI returned unsuccessful response"
    );
  }

  return data;
}

// ============================================================
// EVIDENCE
// ============================================================

function extractEvidence(
  learningAI,
  measurement
) {
  const intelligence =
    learningAI?.intelligence || {};

  const learning =
    learningAI?.learning || {};

  const totals =
    intelligence?.totals || {};

  const funnel =
    learning?.funnel || {};

  return {
    rounds: n(
      learning?.rounds ||
      intelligence?.rounds ||
      learningAI?.measurement_rounds
    ),

    attention: n(
      funnel.attention ||
      totals.attention ||
      measurement?.attention
    ),

    clicks: n(
      funnel.clicks ||
      totals.clicks ||
      measurement?.clicks
    ),

    product_views: n(
      funnel.product_views ||
      totals.product_views ||
      measurement?.product_views
    ),

    engagements: n(
      funnel.engagements ||
      totals.engagements ||
      measurement?.engagements
    ),

    customers: n(
      funnel.customers ||
      totals.customers ||
      measurement?.customers
    ),

    orders: n(
      funnel.orders ||
      totals.orders ||
      measurement?.orders
    ),

    revenue: n(
      funnel.revenue ||
      totals.revenue ||
      measurement?.revenue
    )
  };
}

// ============================================================
// DECISION RULES
// ============================================================

function decide(
  learningAI,
  evidence
) {
  const learning =
    learningAI?.learning || {};

  const intelligence =
    learningAI?.intelligence || {};

  const decisionInput =
    s(learning.decision_input);

  const learningState =
    s(
      learning.state,
      "OBSERVING"
    );

  const intelligenceState =
    s(
      intelligence.state,
      "OBSERVING"
    );

  // ----------------------------------------------------------
  // RULE 1
  // ATTENTION + CLICK
  // BUT NO PRODUCT VIEW
  // ----------------------------------------------------------

  if (
    evidence.attention > 0 &&
    evidence.clicks > 0 &&
    evidence.product_views === 0
  ) {
    return {
      status: "INVESTIGATE",
      priority: "HIGH",
      decision_type:
        "DOWNSTREAM_PATH_INVESTIGATION",

      decision:
        "INVESTIGATE_DOWNSTREAM_PATH",

      reason:
        "มี Attention และ Click ต่อเนื่อง แต่ยังไม่พบ Product View",

      target:
        "CLICK_TO_PRODUCT_VIEW_PATH",

      required_action: {
        type: "INVESTIGATE",
        execute: false
      }
    };
  }

  // ----------------------------------------------------------
  // RULE 2
  // PRODUCT VIEW
  // BUT NO CUSTOMER
  // ----------------------------------------------------------

  if (
    evidence.product_views > 0 &&
    evidence.customers === 0
  ) {
    return {
      status: "INVESTIGATE",
      priority: "HIGH",
      decision_type:
        "PRODUCT_TO_CUSTOMER_INVESTIGATION",

      decision:
        "INVESTIGATE_PRODUCT_TO_CUSTOMER_PATH",

      reason:
        "มี Product View แต่ยังไม่มี Customer",

      target:
        "PRODUCT_TO_CUSTOMER_PATH",

      required_action: {
        type: "INVESTIGATE",
        execute: false
      }
    };
  }

  // ----------------------------------------------------------
  // RULE 3
  // CUSTOMER
  // BUT NO ORDER
  // ----------------------------------------------------------

  if (
    evidence.customers > 0 &&
    evidence.orders === 0
  ) {
    return {
      status: "INVESTIGATE",
      priority: "HIGH",
      decision_type:
        "CUSTOMER_TO_ORDER_INVESTIGATION",

      decision:
        "INVESTIGATE_CUSTOMER_TO_ORDER_PATH",

      reason:
        "มี Customer แต่ยังไม่มี Order",

      target:
        "CUSTOMER_TO_ORDER_PATH",

      required_action: {
        type: "INVESTIGATE",
        execute: false
      }
    };
  }

  // ----------------------------------------------------------
  // RULE 4
  // ORDER
  // BUT NO REVENUE
  // ----------------------------------------------------------

  if (
    evidence.orders > 0 &&
    evidence.revenue === 0
  ) {
    return {
      status: "INVESTIGATE",
      priority: "MEDIUM",
      decision_type:
        "ORDER_TO_REVENUE_INVESTIGATION",

      decision:
        "INVESTIGATE_REVENUE_PATH",

      reason:
        "มี Order แต่ยังไม่มี Revenue ที่ถูกบันทึก",

      target:
        "ORDER_TO_REVENUE_TRACKING",

      required_action: {
        type: "INVESTIGATE",
        execute: false
      }
    };
  }

  // ----------------------------------------------------------
  // RULE 5
  // NO BEHAVIOR
  // ----------------------------------------------------------

  if (
    evidence.attention === 0 &&
    evidence.clicks === 0 &&
    evidence.product_views === 0 &&
    evidence.customers === 0 &&
    evidence.orders === 0 &&
    evidence.revenue === 0
  ) {
    return {
      status: "OBSERVE",
      priority: "LOW",
      decision_type:
        "WAIT_FOR_BEHAVIORAL_DATA",

      decision:
        "OBSERVE",

      reason:
        "ยังไม่มี Behavioral Evidence เพียงพอสำหรับการตัดสินใจ",

      target:
        "MEASUREMENT",

      required_action: {
        type: "OBSERVE",
        execute: false
      }
    };
  }

  // ----------------------------------------------------------
  // RULE 6
  // TRUST LEARNING DECISION INPUT
  // ----------------------------------------------------------

  if (
    decisionInput ===
    "INVESTIGATE_DOWNSTREAM_PATH"
  ) {
    return {
      status: "INVESTIGATE",
      priority: "HIGH",
      decision_type:
        "LEARNING_SIGNAL_DECISION",

      decision:
        "INVESTIGATE_DOWNSTREAM_PATH",

      reason:
        "Learning AI ตรวจพบ Downstream Path ที่ต้องตรวจสอบ",

      target:
        "DOWNSTREAM_PATH",

      required_action: {
        type: "INVESTIGATE",
        execute: false
      }
    };
  }

  // ----------------------------------------------------------
  // DEFAULT
  // ----------------------------------------------------------

  return {
    status: "OBSERVE",
    priority: "LOW",

    decision_type:
      "CONTINUE_OBSERVATION",

    decision:
      "OBSERVE",

    reason:
      "หลักฐานปัจจุบันยังไม่เข้าเงื่อนไขการตัดสินใจที่ต้องดำเนินการ",

    target:
      "MEASUREMENT",

    required_action: {
      type: "OBSERVE",
      execute: false
    }
  };
}

// ============================================================
// DECISION CONTRACT
// ============================================================

function buildDecision(
  learningAI,
  measurement,
  learningFeedback,
  content,
  evidence,
  decision
) {
  return {
    layer: LAYER,
    version: VERSION,

    status: decision.status,

    content_id:
      content?.id ||
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

    evidence,

    source_chain: {
      measurement:
        MEASUREMENT_SOURCE,

      intelligence:
        INTELLIGENCE_SOURCE,

      learning:
        LEARNING_SOURCE,

      decision:
        LAYER
    },

    source_contract: {
      measurement_id:
        measurement?.id ||
        learningAI?.learning
          ?.source_contract
          ?.latest_measurement_id ||
        null,

      measurement_rounds:
        n(
          learningAI?.learning
            ?.source_contract
            ?.measurement_rounds ||
          learningAI?.measurement_rounds
        ),

      content_id:
        content?.id ||
        measurement?.content_id ||
        null,

      attribution_mode:
        measurement?.attribution_mode ||
        "CONTENT_ATTRIBUTION_V2",

      attention_type:
        learningAI?.learning
          ?.source_contract
          ?.attention_type ||
        "weighted_behavioral_signal"
    },

    learning_feedback:
      learningFeedback,

    learning_state:
      s(
        learningAI?.learning?.state
      ),

    intelligence_state:
      s(
        learningAI?.intelligence?.state
      ),

    guardrails: {
      winner_declared: false,
      winner_selected: false,
      strategy_change: false,
      automatic_execution: false,
      action_executed: false,
      content_modified: false,
      measurement_modified: false,

      requires_action_layer:
        true
    },

    created_at:
      new Date().toISOString()
  };
}

// ============================================================
// SAVE
// ============================================================

async function saveDecision(
  env,
  contract
) {
  const db = env.DB;

  await ensureTables(db);

  const runId = id();
  const insightId = id();

  const now =
    new Date().toISOString();

  const input = JSON.stringify({
    source_chain:
      contract.source_chain,

    source_contract:
      contract.source_contract,

    evidence:
      contract.evidence,

    learning_feedback:
      contract.learning_feedback
  });

  const output =
    JSON.stringify(contract);

  await db.prepare(`
    INSERT INTO ai_runs (
      id,
      customer_id,
      run_type,
      model,
      input_data,
      output_data,
      status,
      tokens_used,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    runId,
    null,
    "DECISION",
    "RULE_ENGINE",
    input,
    output,
    contract.status,
    null,
    now
  ).run();

  const priority =
    s(
      contract.decision?.priority
    ).toUpperCase() || "LOW";

  const score =
    priority === "HIGH"
      ? 90
      : priority === "MEDIUM"
        ? 60
        : 30;

  await db.prepare(`
    INSERT INTO ai_insights (
      id,
      customer_id,
      run_id,
      insight_type,
      title,
      content,
      score,
      priority,
      status,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    insightId,
    null,
    runId,
    "DECISION",
    `Decision: ${s(
      contract.decision?.decision
    )}`,
    output,
    score,
    priority,
    "NEW",
    now
  ).run();

  return {
    run_id: runId,
    insight_id: insightId
  };
}

// ============================================================
// ANALYZE
// ============================================================

async function analyze(
  context,
  contentId = null
) {
  const env =
    context.env;

  if (!env.DB) {
    throw new Error(
      "D1 binding DB is missing"
    );
  }

  const db =
    env.DB;

  await ensureTables(db);

  const learningAI =
    await getLearningAI(
      context.request,
      contentId
    );

  const resolvedContentId =
    contentId ||
    learningAI?.content?.id ||
    learningAI?.learning
      ?.source_contract
      ?.content_id ||
    null;

  const content =
    await getContent(
      db,
      resolvedContentId
    );

  const measurement =
    normalizeMeasurement(
      learningAI?.latest_measurement
    ) ||
    await getMeasurement(
      db,
      resolvedContentId
    );

  const learningFeedback =
    learningAI?.learning_feedback ||
    await getLearningFeedback(
      db,
      resolvedContentId
    );

  const evidence =
    extractEvidence(
      learningAI,
      measurement
    );

  const decision =
    decide(
      learningAI,
      evidence
    );

  const contract =
    buildDecision(
      learningAI,
      measurement,
      learningFeedback,
      content,
      evidence,
      decision
    );

  return {
    success: true,

    layer: LAYER,
    version: VERSION,

    mode: "preview",

    status:
      decision.status,

    content:
      contract.content,

    latest_measurement:
      measurement,

    measurement_rounds:
      evidence.rounds,

    intelligence:
      learningAI?.intelligence ||
      null,

    learning:
      learningAI?.learning ||
      null,

    learning_feedback:
      learningFeedback,

    decision:
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
// GET
// ============================================================

export async function onRequestGet(
  context
) {
  try {
    const url =
      new URL(
        context.request.url
      );

    const contentId =
      url.searchParams.get(
        "content_id"
      );

    const result =
      await analyze(
        context,
        contentId
      );

    return json(
      result
    );
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        status: "ERROR",
        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}

// ============================================================
// POST
// ============================================================

export async function onRequestPost(
  context
) {
  try {
    let body = {};

    try {
      body =
        await context.request.json();
    } catch (_) {}

    const mode =
      s(
        body?.mode ||
        "preview"
      ).toLowerCase();

    const contentId =
      body?.content_id ||
      null;

    const result =
      await analyze(
        context,
        contentId
      );

    if (mode === "execute") {
      const saved =
        await saveDecision(
          context.env,
          result.contract
        );

      return json({
        ...result,

        mode: "execute",

        status:
          "DECISION_SAVED",

        saved,

        next_step:
          "Decision saved. Next stage: Action / Automation Layer."
      });
    }

    return json(
      result
    );
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        status: "ERROR",
        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}
