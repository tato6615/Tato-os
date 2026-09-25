// TATO-OS
// Intelligence Layer V2.1
// Route: /api/intelligence
//
// Pipeline:
//
// Measurement V2.3
//        ↓
// Intelligence V2.1
//        ↓
// Learning V2.3
//
// Intelligence DOES:
// - read Measurement
// - read operational Feedback context
// - detect persistent behavioral patterns
// - identify funnel blocks
// - create evidence-based intelligence
//
// Intelligence DOES NOT:
// - read raw behavior directly
// - recalculate Measurement
// - count Feedback as behavior
// - count Feedback as Attention
// - alter funnel metrics from Feedback
// - declare winners
// - change strategy automatically
// - execute actions
//
// V2.1:
// - Feedback-aware
// - compatible with Measurement V2.3
// - preserves V2.0 intelligence logic
// - exposes feedback_context for Learning layer

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const LAYER = "INTELLIGENCE_LAYER_V2";
const VERSION = "2.1";

const MEASUREMENT_SOURCE =
  "CONTENT_MEASUREMENT_ENGINE_V2.3";

const FEEDBACK_SOURCE =
  "FEEDBACK_LAYER_V1.1";

const ENGINE =
  "INTELLIGENCE_V2.1_FEEDBACK_AWARE";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: HEADERS
  });
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function text(value) {
  return value == null ? "" : String(value);
}

function parseJSON(value, fallback = null) {
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

/* =========================================================
   CONTENT
========================================================= */

async function getContent(db, contentId) {
  if (contentId) {
    const result = await db
      .prepare(
        "SELECT * FROM content_engine WHERE id = ? LIMIT 1"
      )
      .bind(contentId)
      .first();

    if (result) {
      return result;
    }
  }

  return await db
    .prepare(
      "SELECT * FROM content_engine ORDER BY created_at DESC LIMIT 1"
    )
    .first();
}

/* =========================================================
   MEASUREMENT
========================================================= */

function normalizeMeasurement(row) {
  if (!row) return null;

  const metrics = parseJSON(row.metrics, {});

  return {
    id: text(row.id),
    content_id: text(row.content_id),
    measured_at: text(row.measured_at),
    measurement_start: text(row.measurement_start),
    attribution_mode: text(row.attribution_mode),

    attention: num(
      row.attention != null
        ? row.attention
        : metrics.attention
    ),

    product_views: num(
      row.product_views != null
        ? row.product_views
        : metrics.product_views
    ),

    clicks: num(
      row.clicks != null
        ? row.clicks
        : metrics.clicks
    ),

    engagements: num(
      row.engagements != null
        ? row.engagements
        : metrics.engagements
    ),

    customers: num(
      row.customers != null
        ? row.customers
        : metrics.customers
    ),

    orders: num(
      row.orders != null
        ? row.orders
        : metrics.orders
    ),

    revenue: num(
      row.revenue != null
        ? row.revenue
        : metrics.revenue
    )
  };
}

async function getMeasurements(db, contentId) {
  if (!contentId) return [];

  const result = await db
    .prepare(
      `SELECT *
       FROM content_measurements
       WHERE content_id = ?
       ORDER BY measured_at DESC
       LIMIT 20`
    )
    .bind(contentId)
    .all();

  return (result.results || [])
    .map(normalizeMeasurement)
    .filter(Boolean);
}

function aggregate(history) {
  const totals = {
    attention: 0,
    product_views: 0,
    clicks: 0,
    engagements: 0,
    customers: 0,
    orders: 0,
    revenue: 0
  };

  for (const item of history) {
    totals.attention += num(item.attention);
    totals.product_views += num(item.product_views);
    totals.clicks += num(item.clicks);
    totals.engagements += num(item.engagements);
    totals.customers += num(item.customers);
    totals.orders += num(item.orders);
    totals.revenue += num(item.revenue);
  }

  return totals;
}

function percentage(value, base) {
  if (base <= 0) return 0;

  return Number(
    ((value / base) * 100).toFixed(2)
  );
}

function buildConversions(totals) {
  return {
    attention_to_product_view:
      percentage(
        totals.product_views,
        totals.attention
      ),

    product_view_to_click:
      percentage(
        totals.clicks,
        totals.product_views
      ),

    click_to_customer:
      percentage(
        totals.customers,
        totals.clicks
      ),

    customer_to_order:
      percentage(
        totals.orders,
        totals.customers
      )
  };
}

/* =========================================================
   PATTERN DETECTION
========================================================= */

function detectPatterns(history, totals) {
  const rounds = history.length;

  const attentionPresent =
    totals.attention > 0;

  const clickPresent =
    totals.clicks > 0;

  const productViewPresent =
    totals.product_views > 0;

  const customerPresent =
    totals.customers > 0;

  const orderPresent =
    totals.orders > 0;

  const revenuePresent =
    totals.revenue > 0;

  return {
    rounds,

    attention_present:
      attentionPresent,

    click_present:
      clickPresent,

    product_view_present:
      productViewPresent,

    customer_present:
      customerPresent,

    order_present:
      orderPresent,

    revenue_present:
      revenuePresent,

    persistent_attention:
      rounds >= 2 &&
      attentionPresent,

    persistent_clicks:
      rounds >= 2 &&
      clickPresent,

    click_without_product_view:
      clickPresent &&
      !productViewPresent,

    persistent_funnel_block:
      rounds >= 2 &&
      attentionPresent &&
      clickPresent &&
      !productViewPresent,

    persistent_no_customer:
      rounds >= 2 &&
      !customerPresent,

    persistent_no_order:
      rounds >= 2 &&
      !orderPresent,

    persistent_no_revenue:
      rounds >= 2 &&
      !revenuePresent
  };
}

/* =========================================================
   RECOMMENDATION
========================================================= */

function buildRecommendation(patterns) {
  if (patterns.persistent_funnel_block) {
    return {
      action: "INVESTIGATE_FUNNEL",
      direction:
        "ตรวจเส้นทาง Click ไป Product View",
      reason:
        "มี Attention และ Click ต่อเนื่อง แต่ยังไม่มี Product View"
    };
  }

  if (patterns.persistent_no_customer) {
    return {
      action: "INVESTIGATE_CONVERSION",
      direction:
        "ตรวจเส้นทางจากพฤติกรรมไป Customer",
      reason:
        "มี Measurement หลายรอบแต่ยังไม่เกิด Customer"
    };
  }

  if (patterns.attention_present) {
    return {
      action: "CONTINUE_MEASUREMENT",
      direction:
        "เก็บ downstream behavior เพิ่ม",
      reason:
        "มี Attention แต่หลักฐาน conversion ยังไม่เพียงพอ"
    };
  }

  return {
    action: "CONTINUE_MEASUREMENT",
    direction:
      "เก็บ Measurement ต่อ",
    reason:
      "ยังมีข้อมูลไม่เพียงพอ"
  };
}

/* =========================================================
   STATE
========================================================= */

function determineState(patterns) {
  if (patterns.rounds === 0) {
    return "NO_DATA";
  }

  if (patterns.persistent_funnel_block) {
    return "PERSISTENT_FUNNEL_BLOCK";
  }

  if (patterns.persistent_no_customer) {
    return "PERSISTENT_NO_CUSTOMER";
  }

  if (
    patterns.attention_present ||
    patterns.click_present ||
    patterns.product_view_present
  ) {
    return "PATTERN_DETECTED";
  }

  return "OBSERVING";
}

/* =========================================================
   INSIGHTS
========================================================= */

function buildInsights(patterns) {
  const insights = [];

  if (patterns.persistent_funnel_block) {
    insights.push({
      type:
        "PERSISTENT_ATTENTION_WITHOUT_PRODUCT_VIEW",

      title:
        "Attention และ Click แต่ไม่มี Product View",

      finding:
        "พบสัญญาณ Attention และ Click ต่อเนื่อง แต่ยังไม่พบ Product View"
    });
  }

  if (patterns.click_without_product_view) {
    insights.push({
      type:
        "CLICK_WITHOUT_PRODUCT_VIEW",

      title:
        "Click ยังไม่ไปถึง Product View",

      finding:
        "พบ Click แต่ downstream ยังไม่มี Product View"
    });
  }

  if (patterns.persistent_no_customer) {
    insights.push({
      type:
        "NO_CUSTOMER_AFTER_REPEATED_MEASUREMENT",

      title:
        "ยังไม่เกิด Customer",

      finding:
        "มี Measurement หลายรอบแต่ยังไม่พบ Customer"
    });
  }

  if (patterns.persistent_no_order) {
    insights.push({
      type:
        "NO_ORDER_AFTER_REPEATED_MEASUREMENT",

      title:
        "ยังไม่เกิด Order",

      finding:
        "มี Measurement หลายรอบแต่ยังไม่พบ Order"
    });
  }

  if (patterns.persistent_no_revenue) {
    insights.push({
      type:
        "NO_REVENUE_AFTER_REPEATED_MEASUREMENT",

      title:
        "ยังไม่เกิด Revenue",

      finding:
        "มี Measurement หลายรอบแต่ยังไม่พบ Revenue"
    });
  }

  if (insights.length === 0) {
    insights.push({
      type: "OBSERVING",

      title:
        "กำลังสะสมหลักฐาน",

      finding:
        "ยังไม่พบ Pattern ที่เพียงพอสำหรับการเปลี่ยนแปลง"
    });
  }

  return insights;
}

/* =========================================================
   FEEDBACK CONTEXT
   IMPORTANT:
   Feedback is operational context only.
   It NEVER modifies Measurement/Funnel metrics.
========================================================= */

function normalizeFeedback(row) {
  if (!row) return null;

  return {
    id: text(row.id),

    action_code:
      text(row.action_code),

    action_target:
      text(row.action_target),

    actual_outcome:
      text(row.actual_outcome),

    outcome_status:
      text(row.outcome_status),

    measurement_required:
      Boolean(num(row.measurement_required)),

    measurement_completed:
      Boolean(num(row.measurement_completed)),

    created_at:
      text(row.created_at),

    updated_at:
      text(row.updated_at)
  };
}

async function getFeedbackContext(db, contentId) {
  if (!contentId) {
    return {
      available: false,
      source: FEEDBACK_SOURCE,
      role: "OPERATIONAL_HANDOFF_ONLY",
      counted_as_behavior: false,
      counted_as_attention: false,
      alters_funnel_metrics: false,
      latest: null
    };
  }

  try {
    const result = await db
      .prepare(
        `SELECT *
         FROM feedback_events
         WHERE content_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .bind(contentId)
      .first();

    const latest =
      normalizeFeedback(result);

    return {
      available: Boolean(latest),

      source: FEEDBACK_SOURCE,

      role: "OPERATIONAL_HANDOFF_ONLY",

      counted_as_behavior: false,

      counted_as_attention: false,

      alters_funnel_metrics: false,

      latest
    };
  } catch (_) {
    return {
      available: false,

      source: FEEDBACK_SOURCE,

      role: "OPERATIONAL_HANDOFF_ONLY",

      counted_as_behavior: false,

      counted_as_attention: false,

      alters_funnel_metrics: false,

      latest: null,

      error: "FEEDBACK_READ_UNAVAILABLE"
    };
  }
}

/* =========================================================
   INTELLIGENCE BUILDER
========================================================= */

function buildIntelligence(
  content,
  latest,
  history,
  totals,
  feedbackContext
) {
  const patterns =
    detectPatterns(
      history,
      totals
    );

  const state =
    determineState(patterns);

  const recommendation =
    buildRecommendation(patterns);

  let confidence = "LOW";

  if (
    state === "PERSISTENT_FUNNEL_BLOCK" &&
    history.length >= 10
  ) {
    confidence = "HIGH";
  } else if (
    state === "PERSISTENT_FUNNEL_BLOCK"
  ) {
    confidence = "MEDIUM";
  } else if (
    state === "PERSISTENT_NO_CUSTOMER"
  ) {
    confidence = "MEDIUM";
  } else if (
    state === "PATTERN_DETECTED"
  ) {
    confidence = "MEDIUM";
  }

  return {
    layer: LAYER,

    version: VERSION,

    engine: ENGINE,

    state,

    confidence,

    content: {
      id:
        content
          ? content.id
          : latest
          ? latest.content_id
          : null,

      title:
        content
          ? content.title || null
          : null,

      objective:
        content
          ? content.objective || null
          : null,

      attention_type:
        content
          ? content.attention_type || null
          : null,

      market_keyword:
        content
          ? content.market_keyword || null
          : null,

      angle:
        content
          ? content.angle || null
          : null,

      cta:
        content
          ? content.cta || null
          : null
    },

    latest_measurement:
      latest,

    measurement_rounds:
      history.length,

    totals,

    conversions:
      buildConversions(totals),

    patterns,

    insights:
      buildInsights(patterns),

    recommendation: {
      ...recommendation,

      do_not_change_strategy_yet:
        true,

      winner_declared:
        false
    },

    feedback_context:
      feedbackContext,

    guardrails: {
      reads_raw_behavior_events:
        false,

      recalculates_measurement:
        false,

      feedback_used_as_behavior:
        false,

      feedback_used_as_attention:
        false,

      feedback_alters_funnel_metrics:
        false,

      winner_declared:
        false,

      automatic_execution:
        false,

      strategy_change_automatic:
        false,

      requires_human_approval:
        true
    },

    source_contract: {
      measurement:
        MEASUREMENT_SOURCE,

      feedback:
        FEEDBACK_SOURCE,

      intelligence:
        ENGINE
    },

    handoff: {
      next_layer:
        "LEARNING_ENGINE_V2.3",

      learning_required:
        true,

      ready:
        true
    }
  };
}

/* =========================================================
   ANALYZE
========================================================= */

async function analyze(env, contentId) {
  if (!env.DB) {
    throw new Error(
      "D1 binding DB is missing"
    );
  }

  const content =
    await getContent(
      env.DB,
      contentId
    );

  const resolvedContentId =
    content
      ? content.id
      : contentId;

  const history =
    await getMeasurements(
      env.DB,
      resolvedContentId
    );

  const latest =
    history.length > 0
      ? history[0]
      : null;

  const totals =
    aggregate(history);

  const feedbackContext =
    await getFeedbackContext(
      env.DB,
      resolvedContentId
    );

  const intelligence =
    buildIntelligence(
      content,
      latest,
      history,
      totals,
      feedbackContext
    );

  return {
    content,
    latest,
    history,
    totals,
    feedbackContext,
    intelligence
  };
}

/* =========================================================
   SAVE
========================================================= */

async function save(env, result) {
  const runId =
    crypto.randomUUID();

  const insightId =
    crypto.randomUUID();

  const now =
    new Date().toISOString();

  const contentId =
    result.content
      ? result.content.id
      : result.latest
      ? result.latest.content_id
      : null;

  const measurementId =
    result.latest
      ? result.latest.id
      : null;

  const inputData =
    JSON.stringify({
      layer: LAYER,

      version: VERSION,

      content_id:
        contentId,

      measurement_id:
        measurementId,

      measurement_source:
        MEASUREMENT_SOURCE,

      feedback_source:
        FEEDBACK_SOURCE,

      latest_measurement:
        result.latest,

      history:
        result.history,

      totals:
        result.totals,

      feedback_context:
        result.feedbackContext
    });

  const outputData =
    JSON.stringify(
      result.intelligence
    );

  await env.DB
    .prepare(
      `INSERT INTO ai_runs (
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      runId,
      null,
      "INTELLIGENCE",
      "RULE_BASED",
      inputData,
      outputData,
      "COMPLETED",
      null,
      now
    )
    .run();

  let priority = "LOW";

  if (
    result.intelligence.state ===
    "PERSISTENT_FUNNEL_BLOCK"
  ) {
    priority = "HIGH";
  } else if (
    result.intelligence.state ===
    "PERSISTENT_NO_CUSTOMER"
  ) {
    priority = "MEDIUM";
  }

  let score = 30;

  if (priority === "MEDIUM") {
    score = 60;
  }

  if (priority === "HIGH") {
    score = 90;
  }

  await env.DB
    .prepare(
      `INSERT INTO ai_insights (
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      insightId,
      null,
      runId,
      "INTELLIGENCE",
      "Intelligence Layer V2.1 Analysis",
      outputData,
      score,
      priority,
      "NEW",
      now
    )
    .run();

  return {
    ...result,

    run_id:
      runId,

    insight_id:
      insightId
  };
}

/* =========================================================
   RESPONSE BUILDER
========================================================= */

function buildResponse(
  result,
  mode = "preview"
) {
  return {
    success: true,

    layer: LAYER,

    version: VERSION,

    engine: ENGINE,

    mode,

    status:
      mode === "execute"
        ? "EXECUTED"
        : "ANALYZED",

    content:
      result.content
        ? {
            id:
              result.content.id,

            title:
              result.content.title,

            status:
              result.content.status
          }
        : null,

    measurement:
      result.latest,

    measurement_history: {
      rounds:
        result.history.length
    },

    metrics: {
      latest:
        result.latest,

      totals:
        result.totals
    },

    intelligence:
      result.intelligence,

    feedback_context:
      result.feedbackContext,

    source_chain: [
      MEASUREMENT_SOURCE,
      FEEDBACK_SOURCE,
      ENGINE
    ],

    loop: {
      current_layer:
        "INTELLIGENCE_V2.1",

      previous_layer:
        "MEASUREMENT_V2.3",

      feedback_source:
        "FEEDBACK_V1.1",

      next_layer:
        "LEARNING_V2.3",

      closed: false
    },

    next_step:
      mode === "execute"
        ? "Pass Intelligence V2.1 evidence to Learning V2.3."
        : "Intelligence V2.1 preview ready for Learning V2.3."
  };
}

/* =========================================================
   GET
========================================================= */

export async function onRequestGet(context) {
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
        context.env,
        contentId
      );

    return json(
      buildResponse(
        result,
        "preview"
      )
    );
  } catch (error) {
    return json(
      {
        success: false,

        layer: LAYER,

        version: VERSION,

        engine: ENGINE,

        error:
          error &&
          error.message
            ? error.message
            : String(error)
      },
      500
    );
  }
}

/* =========================================================
   POST
========================================================= */

export async function onRequestPost(context) {
  try {
    let body = {};

    try {
      body =
        await context.request.json();
    } catch (_) {}

    const mode =
      body.mode || "preview";

    const contentId =
      body.content_id || null;

    const result =
      await analyze(
        context.env,
        contentId
      );

    if (mode === "execute") {
      const saved =
        await save(
          context.env,
          result
        );

      const response =
        buildResponse(
          saved,
          "execute"
        );

      response.run_id =
        saved.run_id;

      response.insight_id =
        saved.insight_id;

      response.contract = {
        run_type:
          "INTELLIGENCE",

        measurement_id:
          saved.latest
            ? saved.latest.id
            : null,

        content_id:
          saved.content
            ? saved.content.id
            : saved.latest
            ? saved.latest.content_id
            : null,

        measurement_source:
          MEASUREMENT_SOURCE,

        feedback_source:
          FEEDBACK_SOURCE
      };

      return json(response);
    }

    return json(
      buildResponse(
        result,
        "preview"
      )
    );
  } catch (error) {
    return json(
      {
        success: false,

        layer: LAYER,

        version: VERSION,

        engine: ENGINE,

        error:
          error &&
          error.message
            ? error.message
            : String(error)
      },
      500
    );
  }
}
