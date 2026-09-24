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
// Action Layer
//
// Decision does NOT:
// - execute actions
// - modify content
// - modify measurement
// - declare winners
// - change strategy
//
// Decision DOES:
// - read Learning AI
// - read Measurement evidence
// - convert learned signals into explicit decisions
// - define required next action
// - provide an Action Layer input contract

const VERSION = "1.0";
const LAYER = "DECISION_LAYER_V1";

const MEASUREMENT_SOURCE = "CONTENT_MEASUREMENT_ENGINE_V2.2";
const INTELLIGENCE_SOURCE = "INTELLIGENCE_LAYER_V2.1";
const LEARNING_SOURCE = "LEARNING_AI_V1";
const MODEL = "RULE_ENGINE";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: HEADERS
  });
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

function upper(value) {
  return s(value).trim().toUpperCase();
}

function safeJSON(value, fallback = null) {
  if (value == null) return fallback;

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch (_) {
    return fallback;
  }
}

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
      name TEXT,
      description TEXT,
      trigger_type TEXT,
      trigger_config TEXT,
      action_type TEXT,
      action_config TEXT,
      status TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `).run();
}

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

function normalizeMeasurement(row) {
  if (!row) return null;

  return {
    id: row.id || null,
    content_id: row.content_id || null,
    measured_at: row.measured_at || null,
    measurement_start: row.measurement_start || null,
    attribution_mode: row.attribution_mode || null,
    status: row.status || null,

    attention: n(row.attention),
    product_views: n(row.product_views),
    clicks: n(row.clicks),
    engagements: n(row.engagements),
    customers: n(row.customers),
    orders: n(row.orders),
    revenue: n(row.revenue)
  };
}

async function getMeasurement(db, contentId = null) {
  try {
    if (contentId) {
      const row = await db.prepare(`
        SELECT *
        FROM content_measurements
        WHERE content_id = ?
        ORDER BY measured_at DESC
        LIMIT 1
      `).bind(contentId).first();

      if (row) {
        return normalizeMeasurement(row);
      }
    }
  } catch (_) {}

  try {
    const row = await db.prepare(`
      SELECT *
      FROM content_measurements
      ORDER BY measured_at DESC
      LIMIT 1
    `).first();

    return normalizeMeasurement(row);
  } catch (_) {
    return null;
  }
}

async function getLearningFeedback(db, contentId = null) {
  try {
    if (contentId) {
      const row = await db.prepare(`
        SELECT *
        FROM learning_feedback
        WHERE content_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).bind(contentId).first();

      if (row) return row;
    }
  } catch (_) {}

  try {
    const row = await db.prepare(`
      SELECT *
      FROM learning_feedback
      ORDER BY created_at DESC
      LIMIT 1
    `).first();

    if (row) return row;
  } catch (_) {}

  return null;
}

async function getLearningAI(request, contentId = null) {
  try {
    const url = new URL(request.url);

    const endpoint = new URL(
      "/api/learning-ai",
      url.origin
    );

    if (contentId) {
      endpoint.searchParams.set("content_id", contentId);
    }

    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    const text = await response.text();

    let data = null;

    try {
      data = JSON.parse(text);
    } catch (_) {
      data = null;
    }

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: data?.error || text || "Learning AI request failed"
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      status: 500,
      error: error?.message || String(error)
    };
  }
}

function extractEvidence(learningAI, measurement) {
  const intelligence =
    learningAI?.intelligence ||
    learningAI?.learning?.intelligence ||
    null;

  const learning =
    learningAI?.learning ||
    null;

  const latestMeasurement =
    learningAI?.latest_measurement ||
    measurement ||
    null;

  const totals =
    intelligence?.totals ||
    learning?.funnel ||
    null;

  const attention = n(
    totals?.attention ??
    latestMeasurement?.attention
  );

  const clicks = n(
    totals?.clicks ??
    latestMeasurement?.clicks
  );

  const productViews = n(
    totals?.product_views ??
    latestMeasurement?.product_views
  );

  const engagements = n(
    totals?.engagements ??
    latestMeasurement?.engagements
  );

  const customers = n(
    totals?.customers ??
    latestMeasurement?.customers
  );

  const orders = n(
    totals?.orders ??
    latestMeasurement?.orders
  );

  const revenue = n(
    totals?.revenue ??
    latestMeasurement?.revenue
  );

  return {
    attention,
    clicks,
    product_views: productViews,
    engagements,
    customers,
    orders,
    revenue,

    rounds: n(
      intelligence?.rounds ??
      learning?.rounds ??
      learningAI?.measurement_rounds
    ),

    intelligence_state:
      intelligence?.state || null,

    learning_state:
      learning?.state || null,

    decision_input:
      learning?.decision_input || null
  };
}

function decide(evidence, learningAI) {
  const {
    attention,
    clicks,
    product_views,
    customers,
    orders,
    revenue
  } = evidence;

  const learningDecision =
    upper(evidence.decision_input);

  /*
   * RULE 1
   *
   * Attention exists
   * Click exists
   * Product View does not exist
   *
   * This means the upstream behavioral path exists,
   * but downstream product path is blocked or missing.
   */
  if (
    attention > 0 &&
    clicks > 0 &&
    product_views === 0
  ) {
    return {
      status: "INVESTIGATE",
      priority: "HIGH",
      decision: "INVESTIGATE_DOWNSTREAM_PATH",
      reason:
        "มี Attention และ Click แต่ยังไม่เกิด Product View จึงต้องตรวจสอบเส้นทางจาก Click ไป Product View",
      decision_type: "DOWNSTREAM_PATH_INVESTIGATION",
      target: "CLICK_TO_PRODUCT_VIEW_PATH",
      required_action: {
        type: "INVESTIGATE",
        target: "CLICK_TO_PRODUCT_VIEW_PATH",
        execute: false
      }
    };
  }

  /*
   * RULE 2
   *
   * Product View exists
   * Customer does not exist
   */
  if (
    product_views > 0 &&
    customers === 0
  ) {
    return {
      status: "INVESTIGATE",
      priority: "HIGH",
      decision: "INVESTIGATE_PRODUCT_TO_CUSTOMER",
      reason:
        "มี Product View แต่ยังไม่เกิด Customer จึงต้องตรวจสอบเส้นทางจาก Product ไป Customer",
      decision_type: "PRODUCT_TO_CUSTOMER_INVESTIGATION",
      target: "PRODUCT_TO_CUSTOMER_PATH",
      required_action: {
        type: "INVESTIGATE",
        target: "PRODUCT_TO_CUSTOMER_PATH",
        execute: false
      }
    };
  }

  /*
   * RULE 3
   *
   * Customer exists
   * Order does not exist
   */
  if (
    customers > 0 &&
    orders === 0
  ) {
    return {
      status: "INVESTIGATE",
      priority: "HIGH",
      decision: "INVESTIGATE_CUSTOMER_TO_ORDER",
      reason:
        "มี Customer แต่ยังไม่เกิด Order จึงต้องตรวจสอบเส้นทางจาก Customer ไป Order",
      decision_type: "CUSTOMER_TO_ORDER_INVESTIGATION",
      target: "CUSTOMER_TO_ORDER_PATH",
      required_action: {
        type: "INVESTIGATE",
        target: "CUSTOMER_TO_ORDER_PATH",
        execute: false
      }
    };
  }

  /*
   * RULE 4
   *
   * Order exists
   * Revenue does not exist
   */
  if (
    orders > 0 &&
    revenue === 0
  ) {
    return {
      status: "INVESTIGATE",
      priority: "MEDIUM",
      decision: "INVESTIGATE_ORDER_TO_REVENUE",
      reason:
        "มี Order แต่ยังไม่พบ Revenue จึงต้องตรวจสอบข้อมูลการชำระเงินหรือการบันทึกรายได้",
      decision_type: "ORDER_TO_REVENUE_INVESTIGATION",
      target: "ORDER_TO_REVENUE_PATH",
      required_action: {
        type: "INVESTIGATE",
        target: "ORDER_TO_REVENUE_PATH",
        execute: false
      }
    };
  }

  /*
   * RULE 5
   *
   * Learning AI explicitly identified
   * the downstream path as the learned problem.
   */
  if (
    learningDecision === "INVESTIGATE_DOWNSTREAM_PATH"
  ) {
    return {
      status: "INVESTIGATE",
      priority: "HIGH",
      decision: "INVESTIGATE_DOWNSTREAM_PATH",
      reason:
        "Learning AI ตรวจพบสัญญาณซ้ำของปัญหาใน Downstream Path",
      decision_type: "LEARNING_SIGNAL_DECISION",
      target: "DOWNSTREAM_PATH",
      required_action: {
        type: "INVESTIGATE",
        target: "DOWNSTREAM_PATH",
        execute: false
      }
    };
  }

  /*
   * RULE 6
   *
   * No measurable behavioral activity.
   */
  if (
    attention === 0 &&
    clicks === 0 &&
    product_views === 0 &&
    customers === 0 &&
    orders === 0
  ) {
    return {
      status: "OBSERVE",
      priority: "LOW",
      decision: "WAIT_FOR_BEHAVIORAL_DATA",
      reason:
        "ยังไม่มี Behavioral Evidence เพียงพอสำหรับสร้าง Decision",
      decision_type: "OBSERVATION",
      target: "BEHAVIOR_DATA",
      required_action: {
        type: "WAIT",
        target: "BEHAVIOR_DATA",
        execute: false
      }
    };
  }

  /*
   * DEFAULT
   */
  return {
    status: "OBSERVE",
    priority: "LOW",
    decision: "CONTINUE_OBSERVATION",
    reason:
      "มีข้อมูลพฤติกรรมแต่ยังไม่พบ Pattern ที่ชัดเจนเพียงพอสำหรับ Decision เพิ่มเติม",
    decision_type: "OBSERVATION",
    target: "CURRENT_FUNNEL",
    required_action: {
      type: "WAIT",
      target: "CURRENT_FUNNEL",
      execute: false
    }
  };
}

function buildDecision({
  decision,
  evidence,
  learningAI,
  measurement,
  learningFeedback,
  content
}) {
  return {
    status: decision.status,
    priority: decision.priority,
    decision: decision.decision,
    reason: decision.reason,

    decision_type: decision.decision_type,

    target: decision.target,

    required_action: decision.required_action,

    evidence: {
      attention: evidence.attention,
      clicks: evidence.clicks,
      product_views: evidence.product_views,
      engagements: evidence.engagements,
      customers: evidence.customers,
      orders: evidence.orders,
      revenue: evidence.revenue,
      rounds: evidence.rounds
    },

    states: {
      intelligence: evidence.intelligence_state,
      learning: evidence.learning_state
    },

    learning: {
      decision_input: evidence.decision_input,
      signal_type:
        learningFeedback?.signal_type || null,
      title:
        learningFeedback?.title || null,
      finding:
        learningFeedback?.finding || null,
      score:
        n(learningFeedback?.score)
    },

    content: content
      ? {
          id: content.id || null,
          title: content.title || null,
          status: content.status || null
        }
      : null,

    source_chain: {
      measurement: MEASUREMENT_SOURCE,
      intelligence: INTELLIGENCE_SOURCE,
      learning: LEARNING_SOURCE,
      decision: LAYER,
      version: VERSION
    },

    source_contract: {
      measurement_version: "2.2",
      intelligence_version: "2.1",
      learning_version: "1.4",
      decision_version: VERSION,
      measurement_id:
        measurement?.id || null,
      content_id:
        content?.id || null,
      attribution_mode:
        measurement?.attribution_mode || null,
      measurement_rounds:
        evidence.rounds
    },

    guardrails: {
      winner_declared: false,
      strategy_changed: false,
      automatic_execution: false,
      action_executed: false,
      content_modified: false,
      measurement_modified: false,
      requires_action_layer: true
    },

    action_contract: {
      ready: true,
      execute: false,
      action_layer_required: true,
      action_type:
        decision.required_action?.type || "WAIT",
      target:
        decision.required_action?.target || null
    },

    learning_ai_status:
      learningAI?.success === true
        ? "AVAILABLE"
        : "UNAVAILABLE"
  };
}

async function saveDecision(env, result) {
  const runId = id();
  const insightId = id();
  const now = new Date().toISOString();

  const inputData = JSON.stringify({
    measurement: result.measurement,
    learning_feedback: result.learningFeedback,
    learning_ai: result.learningAI,
    evidence: result.evidence,
    content: result.content
  });

  const outputData = JSON.stringify(
    result.decision
  );

  await env.DB.prepare(`
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
  `)
    .bind(
      runId,
      null,
      "DECISION",
      MODEL,
      inputData,
      outputData,
      "DECISION_CREATED",
      null,
      now
    )
    .run();

  const priority =
    upper(result.decision?.priority) || "LOW";

  const score =
    priority === "HIGH"
      ? 90
      : priority === "MEDIUM"
        ? 60
        : 30;

  await env.DB.prepare(`
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
  `)
    .bind(
      insightId,
      null,
      runId,
      "DECISION",
      "Decision Layer V1",
      outputData,
      score,
      priority,
      "NEW",
      now
    )
    .run();

  return {
    ...result,
    run_id: runId,
    insight_id: insightId
  };
}

async function analyze(context) {
  const env = context.env;

  if (!env.DB) {
    throw new Error(
      "D1 binding DB is missing"
    );
  }

  await ensureTables(env.DB);

  const requestUrl = new URL(
    context.request.url
  );

  const contentId =
    requestUrl.searchParams.get(
      "content_id"
    ) || null;

  const content =
    await getContent(
      env.DB,
      contentId
    );

  const selectedContentId =
    contentId || content?.id || null;

  const measurement =
    await getMeasurement(
      env.DB,
      selectedContentId
    );

  const learningFeedback =
    await getLearningFeedback(
      env.DB,
      selectedContentId
    );

  const learningAI =
    await getLearningAI(
      context.request,
      selectedContentId
    );

  const evidence =
    extractEvidence(
      learningAI,
      measurement
    );

  const decision =
    decide(
      evidence,
      learningAI
    );

  const finalDecision =
    buildDecision({
      decision,
      evidence,
      learningAI,
      measurement,
      learningFeedback,
      content
    });

  return {
    content,
    measurement,
    learningFeedback,
    learningAI,
    evidence,
    decision: finalDecision
  };
}

export async function onRequestGet(context) {
  try {
    const result =
      await analyze(context);

    return json({
      success: true,

      layer: LAYER,
      version: VERSION,
      mode: "preview",

      status:
        result.decision.status,

      decision:
        result.decision,

      evidence:
        result.evidence,

      measurement:
        result.measurement,

      learning_feedback:
        result.learningFeedback,

      learning_ai:
        result.learningAI,

      content:
        result.content
          ? {
              id: result.content.id,
              title: result.content.title,
              status: result.content.status
            }
          : null,

      next_step:
        "Decision preview ready. Run POST execute to save the Decision Layer result."
    });
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}

export async function onRequestPost(context) {
  try {
    let body = {};

    try {
      body =
        await context.request.json();
    } catch (_) {}

    const mode =
      body?.mode || "preview";

    const result =
      await analyze(context);

    if (mode === "execute") {
      const saved =
        await saveDecision(
          context.env,
          result
        );

      return json({
        success: true,

        layer: LAYER,
        version: VERSION,
        mode: "execute",

        status: "EXECUTED",

        decision:
          saved.decision,

        evidence:
          saved.evidence,

        measurement:
          saved.measurement,

        learning_feedback:
          saved.learningFeedback,

        learning_ai:
          saved.learningAI,

        content:
          saved.content
            ? {
                id: saved.content.id,
                title: saved.content.title,
                status: saved.content.status
              }
            : null,

        run_id:
          saved.run_id,

        insight_id:
          saved.insight_id,

        next_step:
          "Decision saved. Next stage: Action Layer."
      });
    }

    return json({
      success: true,

      layer: LAYER,
      version: VERSION,
      mode: "preview",

      status:
        result.decision.status,

      decision:
        result.decision,

      evidence:
        result.evidence,

      measurement:
        result.measurement,

      learning_feedback:
        result.learningFeedback,

      learning_ai:
        result.learningAI,

      content:
        result.content
          ? {
              id: result.content.id,
              title: result.content.title,
              status: result.content.status
            }
          : null,

      next_step:
        "Decision preview ready."
    });
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}
