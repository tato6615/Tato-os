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
// Learning Engine V2.2
//        ↓
// Decision Layer V1.1
//        ↓
// Action Layer V1.0
//        ↓
// Automation / Execution V1.0
//        ↓
// Feedback Layer V1.1
//        ↓
// Measurement V2.3
//
// Intelligence V2.1
//
// Purpose:
// - Consume Measurement V2.3
// - Preserve all Measurement metrics exactly
// - Read completed Feedback as operational context
// - Detect persistent behavioral patterns
// - Detect persistent funnel blocks
// - Pass structured intelligence to Learning
//
// Feedback is NEVER:
// - behavior
// - attention
// - funnel metric
// - conversion metric
//
// Intelligence does NOT:
// - declare winners
// - change strategy
// - create decisions
// - execute actions
//
// Cloudflare Pages Functions
// File: functions/api/intelligence.js

const VERSION = "2.1";
const LAYER = "INTELLIGENCE_LAYER_V2";
const ENGINE = "INTELLIGENCE_V2.1_FEEDBACK_AWARE";

const MEASUREMENT_SOURCE = "CONTENT_MEASUREMENT_ENGINE_V2.3";
const FEEDBACK_SOURCE = "FEEDBACK_LAYER_V1.1";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: HEADERS
  });
}

function s(value) {
  return value == null ? "" : String(value);
}

function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

function nowISO() {
  return new Date().toISOString();
}

function ratio(a, b) {
  const x = n(a);
  const y = n(b);

  if (y <= 0) return 0;

  return Number((x / y).toFixed(4));
}

async function getContent(db, contentId) {
  const result = await db.prepare(`
    SELECT *
    FROM content_engine
    WHERE id = ?
    LIMIT 1
  `).bind(contentId).first();

  return result || null;
}

async function getLatestMeasurement(db, contentId) {
  const result = await db.prepare(`
    SELECT *
    FROM content_measurements
    WHERE content_id = ?
    ORDER BY measured_at DESC, rowid DESC
    LIMIT 1
  `).bind(contentId).first();

  return result || null;
}

async function getMeasurementHistory(db, contentId) {
  const result = await db.prepare(`
    SELECT *
    FROM content_measurements
    WHERE content_id = ?
    ORDER BY measured_at DESC, rowid DESC
    LIMIT 100
  `).bind(contentId).all();

  return result?.results || [];
}

async function getCompletedFeedback(db, contentId) {
  try {
    const result = await db.prepare(`
      SELECT *
      FROM feedback_events
      WHERE content_id = ?
        AND measurement_completed = 1
      ORDER BY updated_at DESC, created_at DESC, rowid DESC
      LIMIT 1
    `).bind(contentId).first();

    return result || null;
  } catch (_) {
    return null;
  }
}

function getMetrics(row) {
  if (!row) {
    return {
      attention: 0,
      product_views: 0,
      clicks: 0,
      engagements: 0,
      customers: 0,
      orders: 0,
      revenue: 0
    };
  }

  return {
    attention: n(row.attention),
    product_views: n(row.product_views),
    clicks: n(row.clicks),
    engagements: n(row.engagements),
    customers: n(row.customers),
    orders: n(row.orders),
    revenue: n(row.revenue)
  };
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

  for (const row of history) {
    totals.attention += n(row.attention);
    totals.product_views += n(row.product_views);
    totals.clicks += n(row.clicks);
    totals.engagements += n(row.engagements);
    totals.customers += n(row.customers);
    totals.orders += n(row.orders);
    totals.revenue += n(row.revenue);
  }

  return totals;
}

function buildPatterns(totals, latest, rounds) {
  const latestMetrics = getMetrics(latest);

  const attentionPresent = totals.attention > 0;
  const clicksPresent = totals.clicks > 0;
  const productViewsPresent = totals.product_views > 0;
  const customersPresent = totals.customers > 0;
  const ordersPresent = totals.orders > 0;
  const revenuePresent = totals.revenue > 0;

  return {
    rounds,

    attention_present: attentionPresent,
    clicks_present: clicksPresent,
    product_views_present: productViewsPresent,
    engagements_present: totals.engagements > 0,
    customers_present: customersPresent,
    orders_present: ordersPresent,
    revenue_present: revenuePresent,

    persistent_attention:
      rounds >= 2 && attentionPresent,

    persistent_clicks:
      rounds >= 2 && clicksPresent,

    click_without_product_view:
      clicksPresent && !productViewsPresent,

    persistent_funnel_block:
      rounds >= 2 &&
      attentionPresent &&
      clicksPresent &&
      !productViewsPresent,

    persistent_no_customer:
      rounds >= 2 &&
      attentionPresent &&
      !customersPresent,

    persistent_no_order:
      rounds >= 2 &&
      attentionPresent &&
      !ordersPresent,

    persistent_no_revenue:
      rounds >= 2 &&
      attentionPresent &&
      !revenuePresent,

    latest_attention_present:
      latestMetrics.attention > 0,

    latest_click_present:
      latestMetrics.clicks > 0,

    latest_product_view_present:
      latestMetrics.product_views > 0,

    no_behavior:
      totals.attention === 0 &&
      totals.clicks === 0 &&
      totals.product_views === 0 &&
      totals.engagements === 0
  };
}

function buildConversions(totals) {
  return {
    attention_to_product_view:
      ratio(
        totals.product_views,
        totals.attention
      ),

    product_view_to_click:
      ratio(
        totals.clicks,
        totals.product_views
      ),

    click_to_customer:
      ratio(
        totals.customers,
        totals.clicks
      ),

    customer_to_order:
      ratio(
        totals.orders,
        totals.customers
      )
  };
}

function buildInsights(patterns, totals) {
  const insights = [];

  if (
    patterns.persistent_attention &&
    patterns.click_without_product_view
  ) {
    insights.push({
      type: "PERSISTENT_ATTENTION_WITHOUT_PRODUCT_VIEW",
      title: "Attention และ Click แต่ไม่มี Product View",
      finding:
        "พบ Attention และ Click ต่อเนื่อง แต่ยังไม่พบ Product View",
      evidence: {
        attention: totals.attention,
        clicks: totals.clicks,
        product_views: totals.product_views
      }
    });
  }

  if (patterns.click_without_product_view) {
    insights.push({
      type: "CLICK_WITHOUT_PRODUCT_VIEW",
      title: "Click ยังไม่ไปถึง Product View",
      finding:
        "พบ Click แต่ downstream ยังไม่มี Product View",
      evidence: {
        clicks: totals.clicks,
        product_views: totals.product_views
      }
    });
  }

  if (patterns.persistent_no_customer) {
    insights.push({
      type: "NO_CUSTOMER_AFTER_REPEATED_MEASUREMENT",
      title: "ยังไม่เกิด Customer",
      finding:
        "มี Measurement หลายรอบแต่ยังไม่พบ Customer",
      evidence: {
        rounds: patterns.rounds,
        customers: totals.customers
      }
    });
  }

  if (patterns.persistent_no_order) {
    insights.push({
      type: "NO_ORDER_AFTER_REPEATED_MEASUREMENT",
      title: "ยังไม่เกิด Order",
      finding:
        "มี Measurement หลายรอบแต่ยังไม่พบ Order",
      evidence: {
        rounds: patterns.rounds,
        orders: totals.orders
      }
    });
  }

  if (patterns.persistent_no_revenue) {
    insights.push({
      type: "NO_REVENUE_AFTER_REPEATED_MEASUREMENT",
      title: "ยังไม่เกิด Revenue",
      finding:
        "มี Measurement หลายรอบแต่ยังไม่พบ Revenue",
      evidence: {
        rounds: patterns.rounds,
        revenue: totals.revenue
      }
    });
  }

  if (patterns.no_behavior) {
    insights.push({
      type: "NO_BEHAVIOR_SIGNAL",
      title: "ยังไม่พบ Behavioral Signal",
      finding:
        "ยังไม่มีข้อมูลพฤติกรรมเพียงพอสำหรับสร้าง Intelligence",
      evidence: {
        rounds: patterns.rounds
      }
    });
  }

  return insights;
}

function buildState(patterns) {
  if (patterns.persistent_funnel_block) {
    return "PERSISTENT_FUNNEL_BLOCK";
  }

  if (patterns.persistent_no_customer) {
    return "PERSISTENT_NO_CUSTOMER";
  }

  if (patterns.persistent_no_order) {
    return "PERSISTENT_NO_ORDER";
  }

  if (patterns.persistent_no_revenue) {
    return "PERSISTENT_NO_REVENUE";
  }

  if (patterns.no_behavior) {
    return "INSUFFICIENT_BEHAVIOR";
  }

  return "MEASUREMENT_ACTIVE";
}

function buildConfidence(patterns, rounds) {
  if (
    patterns.persistent_funnel_block &&
    rounds >= 10
  ) {
    return "HIGH";
  }

  if (
    patterns.persistent_funnel_block &&
    rounds >= 2
  ) {
    return "MEDIUM";
  }

  if (rounds >= 2) {
    return "MEDIUM";
  }

  return "LOW";
}

function buildRecommendation(patterns) {
  if (patterns.persistent_funnel_block) {
    return {
      action: "INVESTIGATE_FUNNEL",
      direction:
        "ตรวจเส้นทาง Click ไป Product View",
      reason:
        "มี Attention และ Click ต่อเนื่อง แต่ยังไม่มี Product View",
      do_not_change_strategy_yet: true,
      winner_declared: false
    };
  }

  if (patterns.persistent_no_customer) {
    return {
      action: "INVESTIGATE_CONVERSION",
      direction:
        "ตรวจเส้นทางจาก Click ไป Customer",
      reason:
        "มี Behavioral Signal แต่ยังไม่พบ Customer",
      do_not_change_strategy_yet: true,
      winner_declared: false
    };
  }

  if (patterns.persistent_no_order) {
    return {
      action: "INVESTIGATE_ORDER_PATH",
      direction:
        "ตรวจเส้นทางจาก Customer ไป Order",
      reason:
        "มี Customer แต่ยังไม่พบ Order",
      do_not_change_strategy_yet: true,
      winner_declared: false
    };
  }

  if (patterns.persistent_no_revenue) {
    return {
      action: "INVESTIGATE_REVENUE_PATH",
      direction:
        "ตรวจเส้นทางจาก Order ไป Revenue",
      reason:
        "มี Order แต่ยังไม่พบ Revenue",
      do_not_change_strategy_yet: true,
      winner_declared: false
    };
  }

  return {
    action: "CONTINUE_MEASUREMENT",
    direction:
      "เก็บ Measurement ต่อ",
    reason:
      "ยังไม่มี Persistent Pattern ที่เพียงพอสำหรับการตรวจสอบเชิงลึก",
    do_not_change_strategy_yet: true,
    winner_declared: false
  };
}

function buildFeedbackContext(feedback) {
  if (!feedback) {
    return {
      available: false,

      layer: FEEDBACK_SOURCE,

      role: "Operational context only",

      counted_as_behavior: false,
      counted_as_attention: false,
      alters_funnel_metrics: false,

      measurement_required: false,
      measurement_completed: false
    };
  }

  return {
    available: true,

    layer: FEEDBACK_SOURCE,

    role: "Operational context only",

    id: s(feedback.id),

    action_code:
      s(feedback.action_code),

    action_target:
      s(feedback.action_target),

    actual_outcome:
      s(feedback.actual_outcome),

    outcome_status:
      s(feedback.outcome_status),

    measurement_required:
      n(feedback.measurement_required) === 1,

    measurement_completed:
      n(feedback.measurement_completed) === 1,

    created_at:
      s(feedback.created_at),

    updated_at:
      s(feedback.updated_at),

    counted_as_behavior: false,

    counted_as_attention: false,

    alters_funnel_metrics: false,

    interpretation:
      "Feedback ใช้เป็น operational context เท่านั้น ไม่ใช่ behavioral measurement"
  };
}

async function analyze(db, contentId) {
  const content =
    await getContent(
      db,
      contentId
    );

  if (!content) {
    return {
      success: false,
      layer: LAYER,
      version: VERSION,
      engine: ENGINE,
      error: "content_not_found",
      content_id: contentId
    };
  }

  const latestMeasurement =
    await getLatestMeasurement(
      db,
      contentId
    );

  const history =
    await getMeasurementHistory(
      db,
      contentId
    );

  const feedback =
    await getCompletedFeedback(
      db,
      contentId
    );

  const latestMetrics =
    getMetrics(
      latestMeasurement
    );

  const totals =
    aggregate(history);

  const rounds =
    history.length;

  const patterns =
    buildPatterns(
      totals,
      latestMeasurement,
      rounds
    );

  const conversions =
    buildConversions(
      totals
    );

  const insights =
    buildInsights(
      patterns,
      totals
    );

  const state =
    buildState(
      patterns
    );

  const confidence =
    buildConfidence(
      patterns,
      rounds
    );

  const recommendation =
    buildRecommendation(
      patterns
    );

  const feedbackContext =
    buildFeedbackContext(
      feedback
    );

  return {
    success: true,

    layer: LAYER,

    version: VERSION,

    engine: ENGINE,

    mode: "preview",

    status: "ANALYZED",

    content: {
      id: s(content.id),
      title: s(content.title),
      status: s(content.status),

      objective:
        s(content.objective),

      attention_type:
        s(content.attention_type),

      market_keyword:
        s(content.market_keyword),

      angle:
        s(content.angle),

      cta:
        s(content.cta)
    },

    measurement: {
      source:
        MEASUREMENT_SOURCE,

      id:
        latestMeasurement
          ? s(latestMeasurement.id)
          : null,

      content_id:
        latestMeasurement
          ? s(latestMeasurement.content_id)
          : contentId,

      measured_at:
        latestMeasurement
          ? s(latestMeasurement.measured_at)
          : null,

      measurement_start:
        latestMeasurement
          ? s(latestMeasurement.measurement_start)
          : null,

      attribution_mode:
        latestMeasurement
          ? s(latestMeasurement.attribution_mode)
          : null,

      attention:
        latestMetrics.attention,

      product_views:
        latestMetrics.product_views,

      clicks:
        latestMetrics.clicks,

      engagements:
        latestMetrics.engagements,

      customers:
        latestMetrics.customers,

      orders:
        latestMetrics.orders,

      revenue:
        latestMetrics.revenue
    },

    measurement_history: {
      rounds,

      available:
        rounds > 0
    },

    metrics: {
      latest: {
        id:
          latestMeasurement
            ? s(latestMeasurement.id)
            : null,

        content_id:
          latestMeasurement
            ? s(latestMeasurement.content_id)
            : contentId,

        measured_at:
          latestMeasurement
            ? s(latestMeasurement.measured_at)
            : null,

        measurement_start:
          latestMeasurement
            ? s(latestMeasurement.measurement_start)
            : null,

        attribution_mode:
          latestMeasurement
            ? s(latestMeasurement.attribution_mode)
            : null,

        attention:
          latestMetrics.attention,

        product_views:
          latestMetrics.product_views,

        clicks:
          latestMetrics.clicks,

        engagements:
          latestMetrics.engagements,

        customers:
          latestMetrics.customers,

        orders:
          latestMetrics.orders,

        revenue:
          latestMetrics.revenue
      },

      totals
    },

    intelligence: {
      layer: LAYER,

      version: VERSION,

      engine: ENGINE,

      state,

      confidence,

      content: {
        id: s(content.id),
        title: s(content.title),
        objective:
          s(content.objective),
        attention_type:
          s(content.attention_type),
        market_keyword:
          s(content.market_keyword),
        angle:
          s(content.angle),
        cta:
          s(content.cta)
      },

      latest_measurement:
        latestMetrics,

      measurement_rounds:
        rounds,

      totals,

      conversions,

      patterns,

      insights,

      recommendation
    },

    feedback_context:
      feedbackContext,

    source_chain: [
      MEASUREMENT_SOURCE,
      LAYER
    ],

    source_contract: {
      measurement: {
        layer:
          MEASUREMENT_SOURCE,

        version: "2.3",

        rounds,

        latest_measurement_id:
          latestMeasurement
            ? s(latestMeasurement.id)
            : null
      },

      feedback: {
        layer:
          FEEDBACK_SOURCE,

        available:
          feedbackContext.available,

        measurement_completed:
          feedbackContext.measurement_completed
      },

      intelligence: {
        layer: LAYER,
        version: VERSION,
        engine: ENGINE
      }
    },

    guardrails: {
      reads_raw_behavior_events: false,

      reads_measurement_v23: true,

      reads_feedback_context: true,

      feedback_used_as_behavior: false,

      feedback_used_as_attention: false,

      feedback_alters_funnel_metrics: false,

      recalculates_measurement: false,

      recalculates_from_feedback: false,

      recalculates_learning: false,

      winner_declared: false,

      strategy_changed: false,

      decision_created: false,

      action_created: false,

      action_executed: false,

      automatic_execution: false,

      requires_human_approval: true
    },

    handoff: {
      current_layer:
        "INTELLIGENCE_V2.1",

      next_layer:
        "LEARNING_ENGINE_V2.2",

      learning_input_ready:
        true,

      feedback_context_available:
        feedbackContext.available,

      decision_created:
        false,

      action_executed:
        false
    },

    loop: {
      current_layer:
        "INTELLIGENCE_V2.1",

      previous_layer:
        "MEASUREMENT_V2.3",

      next_layer:
        "LEARNING_V2.2",

      feedback_context_available:
        feedbackContext.available,

      measurement_source_verified:
        Boolean(latestMeasurement),

      closed: false
    },

    timestamp:
      nowISO()
  };
}

export async function onRequestGet(context) {
  const env =
    context.env;

  if (!env || !env.DB) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        engine: ENGINE,
        error: "D1 binding DB not found"
      },
      500
    );
  }

  const url =
    new URL(
      context.request.url
    );

  const contentId =
    url.searchParams.get(
      "content_id"
    );

  if (!contentId) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        engine: ENGINE,
        error: "content_id_required"
      },
      400
    );
  }

  try {
    return json(
      await analyze(
        env.DB,
        contentId
      )
    );
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        engine: ENGINE,
        error: "intelligence_failed",
        message: s(
          error?.message
        )
      },
      500
    );
  }
}

export async function onRequestPost(context) {
  const env =
    context.env;

  if (!env || !env.DB) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        engine: ENGINE,
        error: "D1 binding DB not found"
      },
      500
    );
  }

  let body = {};

  try {
    body =
      await context.request.json();
  } catch (_) {
    body = {};
  }

  const contentId =
    s(
      body?.content_id
    ).trim();

  if (!contentId) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        engine: ENGINE,
        error: "content_id_required"
      },
      400
    );
  }

  try {
    return json(
      await analyze(
        env.DB,
        contentId
      )
    );
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        engine: ENGINE,
        error: "intelligence_failed",
        message: s(
          error?.message
        )
      },
      500
    );
  }
}
