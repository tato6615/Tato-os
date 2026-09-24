// TATO-OS
// Decision Layer V1.0
// Route: /api/decision-ai
//
// Chain:
// Measurement V2.2
// -> Intelligence V2.1
// -> Learning V1
// -> Decision V1
//
// IMPORTANT:
// Decision Layer creates a decision.
// It does NOT execute business actions.
// It does NOT change strategy automatically.
// It does NOT declare winners.

const LAYER = "DECISION_LAYER_V1";
const VERSION = "1.0";

const MEASUREMENT_SOURCE = "CONTENT_MEASUREMENT_ENGINE_V2.2";
const INTELLIGENCE_SOURCE = "INTELLIGENCE_LAYER_V2.1";
const LEARNING_SOURCE = "LEARNING_LAYER_V1";

const ATTENTION_TYPE = "weighted_behavioral_signal";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function now() {
  return new Date().toISOString();
}

function normalizeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeMeasurement(row) {
  if (!row) return null;

  return {
    id: row.id ?? null,
    content_id: row.content_id ?? null,
    measured_at: row.measured_at ?? null,
    measurement_start: row.measurement_start ?? null,
    attribution_mode: row.attribution_mode ?? null,
    attention: normalizeNumber(row.attention),
    product_views: normalizeNumber(row.product_views),
    clicks: normalizeNumber(row.clicks),
    engagements: normalizeNumber(row.engagements),
    customers: normalizeNumber(row.customers),
    orders: normalizeNumber(row.orders),
    revenue: normalizeNumber(row.revenue)
  };
}

async function getContent(db, contentId) {
  if (!contentId) return null;

  return await db
    .prepare(`
      SELECT
        id,
        title,
        status,
        objective,
        attention_type,
        market_keyword,
        angle,
        cta
      FROM content_engine
      WHERE id = ?
      LIMIT 1
    `)
    .bind(contentId)
    .first();
}

async function getMeasurements(db, contentId) {
  const result = await db
    .prepare(`
      SELECT
        id,
        content_id,
        measured_at,
        measurement_start,
        attribution_mode,
        attention,
        product_views,
        clicks,
        engagements,
        customers,
        orders,
        revenue
      FROM content_measurements
      WHERE content_id = ?
      ORDER BY measured_at DESC
      LIMIT 50
    `)
    .bind(contentId)
    .all();

  return (result?.results || []).map(normalizeMeasurement);
}

function buildIntelligence(measurements) {
  const rounds = measurements.length;

  const totals = measurements.reduce(
    (acc, row) => {
      acc.attention += row.attention;
      acc.product_views += row.product_views;
      acc.clicks += row.clicks;
      acc.engagements += row.engagements;
      acc.customers += row.customers;
      acc.orders += row.orders;
      acc.revenue += row.revenue;
      return acc;
    },
    {
      attention: 0,
      product_views: 0,
      clicks: 0,
      engagements: 0,
      customers: 0,
      orders: 0,
      revenue: 0
    }
  );

  return {
    state:
      totals.attention > 0 &&
      totals.clicks > 0 &&
      totals.product_views === 0
        ? "PERSISTENT_FUNNEL_BLOCK"
        : "OBSERVATION_REQUIRED",

    rounds,

    totals,

    patterns: {
      rounds,
      attention_present: totals.attention > 0,
      click_present: totals.clicks > 0,
      product_view_present: totals.product_views > 0,
      customer_present: totals.customers > 0,
      order_present: totals.orders > 0,
      revenue_present: totals.revenue > 0,

      persistent_attention:
        rounds >= 3 && totals.attention > 0,

      click_without_product_view:
        totals.clicks > 0 &&
        totals.product_views === 0,

      persistent_funnel_block:
        rounds >= 3 &&
        totals.attention > 0 &&
        totals.clicks > 0 &&
        totals.product_views === 0,

      persistent_no_customer:
        rounds >= 3 &&
        totals.customers === 0,

      persistent_no_order:
        rounds >= 3 &&
        totals.orders === 0,

      persistent_no_revenue:
        rounds >= 3 &&
        totals.revenue === 0
    }
  };
}

function buildLearning(intelligence) {
  const totals = intelligence.totals;
  const patterns = intelligence.patterns;

  let decisionInput = "OBSERVE_MORE_DATA";
  let state = "INSUFFICIENT_EVIDENCE";

  const signals = [];
  const hypotheses = [];
  const problems = [];

  if (totals.attention > 0) {
    signals.push({
      type: "ATTENTION_PRESENT",
      value: totals.attention,
      signal: ATTENTION_TYPE
    });
  }

  if (totals.clicks > 0) {
    signals.push({
      type: "CLICK_PRESENT",
      value: totals.clicks
    });
  }

  if (patterns.click_without_product_view) {
    state = "DOWNSTREAM_BLOCK_DETECTED";
    decisionInput = "INVESTIGATE_DOWNSTREAM_PATH";

    hypotheses.push({
      type: "DOWNSTREAM_PATH_REQUIRES_INVESTIGATION",
      evidence: {
        clicks: totals.clicks,
        product_views: totals.product_views
      }
    });

    problems.push({
      type: "CLICK_TO_PRODUCT_VIEW_BLOCK",
      evidence: {
        clicks: totals.clicks,
        product_views: totals.product_views
      }
    });
  }

  if (patterns.persistent_no_customer) {
    problems.push({
      type: "NO_CUSTOMER",
      evidence: {
        rounds: intelligence.rounds,
        customers: totals.customers
      }
    });
  }

  if (patterns.persistent_no_order) {
    problems.push({
      type: "NO_ORDER",
      evidence: {
        rounds: intelligence.rounds,
        orders: totals.orders
      }
    });
  }

  if (patterns.persistent_no_revenue) {
    problems.push({
      type: "NO_REVENUE",
      evidence: {
        rounds: intelligence.rounds,
        revenue: totals.revenue
      }
    });
  }

  return {
    state,
    rounds: intelligence.rounds,
    signals,
    hypotheses,
    problems,
    funnel: totals,
    decision_input: decisionInput
  };
}

function buildDecision({
  content,
  measurement,
  intelligence,
  learning
}) {
  const totals = intelligence.totals;

  let decisionType = "OBSERVE_MORE_DATA";
  let decision = "CONTINUE_MEASUREMENT";
  let priority = "LOW";
  let confidence = "LOW";

  const evidence = [];

  if (
    learning.decision_input === "INVESTIGATE_DOWNSTREAM_PATH"
  ) {
    decisionType = "DOWNSTREAM_INVESTIGATION";

    decision = "INVESTIGATE_CLICK_TO_PRODUCT_PATH";

    priority = "HIGH";
    confidence = "HIGH";

    evidence.push({
      signal: "ATTENTION",
      value: totals.attention,
      interpretation:
        "มี Weighted Attention สะสมเพียงพอให้ตรวจสอบ downstream"
    });

    evidence.push({
      signal: "CLICK",
      value: totals.clicks,
      interpretation:
        "มี Click เกิดขึ้นต่อเนื่อง"
    });

    evidence.push({
      signal: "PRODUCT_VIEW",
      value: totals.product_views,
      interpretation:
        "ยังไม่มี Product View ที่ถูกวัดได้"
    });

    evidence.push({
      signal: "CUSTOMER",
      value: totals.customers,
      interpretation:
        "ยังไม่มี Customer"
    });

    evidence.push({
      signal: "ORDER",
      value: totals.orders,
      interpretation:
        "ยังไม่มี Order"
    });

    evidence.push({
      signal: "REVENUE",
      value: totals.revenue,
      interpretation:
        "ยังไม่มี Revenue"
    });
  }

  return {
    state: "DECISION_READY",

    decision_type: decisionType,

    decision,

    priority,

    confidence,

    reason:
      decision === "INVESTIGATE_CLICK_TO_PRODUCT_PATH"
        ? "Learning พบ Click ต่อเนื่อง แต่ยังไม่มี Product View จึงควรตรวจสอบเส้นทางหลัง Click ก่อนเปลี่ยนกลยุทธ์"
        : "หลักฐานยังไม่เพียงพอสำหรับ Decision เชิง downstream",

    evidence,

    scope: {
      content_id: content?.id ?? null,
      content_title: content?.title ?? null
    },

    next_action_candidate:
      decision === "INVESTIGATE_CLICK_TO_PRODUCT_PATH"
        ? {
            type: "FUNNEL_PATH_AUDIT",
            target: "CLICK_TO_PRODUCT_VIEW",
            status: "PROPOSED_ONLY"
          }
        : {
            type: "CONTINUE_MEASUREMENT",
            target: "CONTENT_FUNNEL",
            status: "PROPOSED_ONLY"
          },

    guardrails: {
      winner_declared: false,
      strategy_change: false,
      automatic_execution: false,
      action_executed: false,
      requires_human_approval: true,
      requires_action_layer: true
    }
  };
}

async function saveDecision(db, content, measurement, intelligence, learning, decision) {
  const runId = crypto.randomUUID();
  const createdAt = now();

  await db
    .prepare(`
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
      "DECISION_LAYER_V1",
      "TATO-DECISION-ENGINE-V1",
      JSON.stringify({
        content_id: content?.id ?? null,
        measurement,
        intelligence,
        learning
      }),
      JSON.stringify(decision),
      "COMPLETED",
      0,
      createdAt
    )
    .run();

  const insightId = crypto.randomUUID();

  await db
    .prepare(`
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
      decision.decision,
      JSON.stringify(decision),
      decision.confidence === "HIGH" ? 1 : 0.5,
      decision.priority,
      "READY",
      createdAt
    )
    .run();

  return {
    run_id: runId,
    insight_id: insightId,
    saved_at: createdAt
  };
}

async function analyze(request, env, mode = "preview") {
  const db = env.DB;

  if (!db) {
    throw new Error("D1 binding DB not found");
  }

  const url = new URL(request.url);

  const contentId =
    url.searchParams.get("content_id") ||
    (request.method === "POST"
      ? (await request.clone().json().catch(() => ({}))).content_id
      : null);

  if (!contentId) {
    throw new Error("content_id is required");
  }

  const content = await getContent(db, contentId);

  if (!content) {
    throw new Error("Content not found");
  }

  const measurements = await getMeasurements(db, contentId);

  if (!measurements.length) {
    throw new Error("No measurement data found for content");
  }

  const measurement = measurements[0];

  const intelligence = buildIntelligence(measurements);

  const learning = buildLearning(intelligence);

  const decision = buildDecision({
    content,
    measurement,
    intelligence,
    learning
  });

  let persistence = null;

  if (mode === "execute") {
    persistence = await saveDecision(
      db,
      content,
      measurement,
      intelligence,
      learning,
      decision
    );
  }

  return {
    success: true,

    layer: LAYER,
    version: VERSION,

    mode,

    status: "DECIDED",

    content: {
      id: content.id,
      title: content.title,
      status: content.status
    },

    source_chain: {
      measurement: MEASUREMENT_SOURCE,
      intelligence: INTELLIGENCE_SOURCE,
      learning: LEARNING_SOURCE,
      decision: LAYER
    },

    measurement: {
      id: measurement.id,
      attention: measurement.attention,
      clicks: measurement.clicks,
      product_views: measurement.product_views,
      customers: measurement.customers,
      orders: measurement.orders,
      revenue: measurement.revenue
    },

    learning: {
      state: learning.state,
      decision_input: learning.decision_input,
      rounds: learning.rounds
    },

    decision,

    persistence,

    next_step:
      "Decision ready. Action Layer must be designed separately."
  };
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);

    const contentId = url.searchParams.get("content_id");

    if (!contentId) {
      return json(
        {
          success: false,
          layer: LAYER,
          version: VERSION,
          error: "content_id is required",
          example:
            "/api/decision-ai?content_id=YOUR_CONTENT_ID"
        },
        400
      );
    }

    const result = await analyze(
      context.request,
      context.env,
      "preview"
    );

    return json(result);
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        error: error?.message || String(error)
      },
      500
    );
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request
      .clone()
      .json()
      .catch(() => ({}));

    const mode =
      body?.mode === "execute"
        ? "execute"
        : "preview";

    const result = await analyze(
      context.request,
      context.env,
      mode
    );

    return json(result);
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        error: error?.message || String(error)
      },
      500
    );
  }
}
