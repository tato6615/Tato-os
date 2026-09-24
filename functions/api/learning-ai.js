// TATO-OS
// Intelligence Layer V2.1
// Route: /api/learning-ai
//
// Source of Truth:
// CONTENT_MEASUREMENT_ENGINE_V2.2
//
// Important:
// Intelligence does NOT calculate Attention.
// It reads Attention directly from content_measurements.

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const LAYER = "INTELLIGENCE_LAYER_V2";
const VERSION = "2.1";

const ATTENTION_SOURCE =
  "CONTENT_MEASUREMENT_ENGINE_V2.2";

const ATTENTION_TYPE =
  "weighted_behavioral_signal";

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: HEADERS
    }
  );
}

function num(value) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : 0;
}

function text(value) {
  return value == null
    ? ""
    : String(value);
}

function percentage(value, base) {
  if (base <= 0) {
    return 0;
  }

  return Number(
    ((value / base) * 100).toFixed(2)
  );
}

function normalizeMeasurement(row) {
  if (!row) {
    return null;
  }

  return {
    id: text(row.id),

    content_id:
      text(row.content_id),

    measured_at:
      text(row.measured_at),

    measurement_start:
      text(row.measurement_start),

    attribution_mode:
      text(row.attribution_mode),

    attention:
      num(row.attention),

    product_views:
      num(row.product_views),

    clicks:
      num(row.clicks),

    engagements:
      num(row.engagements),

    customers:
      num(row.customers),

    orders:
      num(row.orders),

    revenue:
      num(row.revenue)
  };
}

async function getContent(
  db,
  contentId
) {
  if (contentId) {
    const selected =
      await db
        .prepare(
          `SELECT *
           FROM content_engine
           WHERE id = ?
           LIMIT 1`
        )
        .bind(contentId)
        .first();

    if (selected) {
      return selected;
    }
  }

  return await db
    .prepare(
      `SELECT *
       FROM content_engine
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .first();
}

async function getMeasurements(
  db,
  contentId
) {
  if (!contentId) {
    return [];
  }

  const result =
    await db
      .prepare(
        `SELECT *
         FROM content_measurements
         WHERE content_id = ?
         ORDER BY measured_at DESC
         LIMIT 20`
      )
      .bind(contentId)
      .all();

  return (
    result.results || []
  )
    .map(normalizeMeasurement)
    .filter(Boolean);
}

function aggregateHistory(
  history
) {
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
    totals.attention +=
      num(item.attention);

    totals.product_views +=
      num(item.product_views);

    totals.clicks +=
      num(item.clicks);

    totals.engagements +=
      num(item.engagements);

    totals.customers +=
      num(item.customers);

    totals.orders +=
      num(item.orders);

    totals.revenue +=
      num(item.revenue);
  }

  return totals;
}

function buildConversions(
  totals
) {
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

function detectPatterns(
  history,
  totals
) {
  const rounds =
    history.length;

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

function determineState(
  patterns
) {
  if (patterns.rounds === 0) {
    return "NO_DATA";
  }

  if (
    patterns.persistent_funnel_block
  ) {
    return "PERSISTENT_FUNNEL_BLOCK";
  }

  if (
    patterns.persistent_no_customer
  ) {
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

function buildRecommendation(
  patterns
) {
  if (
    patterns.persistent_funnel_block
  ) {
    return {
      action:
        "INVESTIGATE_FUNNEL",

      direction:
        "ตรวจเส้นทาง Click ไป Product View",

      reason:
        "มี Weighted Attention และ Click ต่อเนื่อง แต่ยังไม่มี Product View"
    };
  }

  if (
    patterns.persistent_no_customer
  ) {
    return {
      action:
        "INVESTIGATE_CONVERSION",

      direction:
        "ตรวจเส้นทางจากพฤติกรรมไป Customer",

      reason:
        "มี Measurement หลายรอบแต่ยังไม่เกิด Customer"
    };
  }

  if (
    patterns.attention_present
  ) {
    return {
      action:
        "CONTINUE_MEASUREMENT",

      direction:
        "เก็บ downstream behavior เพิ่ม",

      reason:
        "มี Weighted Attention แต่หลักฐาน Conversion ยังไม่เพียงพอ"
    };
  }

  return {
    action:
      "CONTINUE_MEASUREMENT",

    direction:
      "เก็บ Measurement ต่อ",

    reason:
      "ยังมีข้อมูลไม่เพียงพอ"
  };
}

function buildInsights(
  patterns
) {
  const insights = [];

  if (
    patterns.persistent_funnel_block
  ) {
    insights.push({
      type:
        "PERSISTENT_ATTENTION_WITHOUT_PRODUCT_VIEW",

      title:
        "Attention และ Click แต่ไม่มี Product View",

      finding:
        "พบ Weighted Attention และ Click ต่อเนื่อง แต่ยังไม่พบ Product View"
    });
  }

  if (
    patterns.click_without_product_view
  ) {
    insights.push({
      type:
        "CLICK_WITHOUT_PRODUCT_VIEW",

      title:
        "Click ยังไม่ไปถึง Product View",

      finding:
        "พบ Click แต่ downstream ยังไม่มี Product View"
    });
  }

  if (
    patterns.persistent_no_customer
  ) {
    insights.push({
      type:
        "NO_CUSTOMER_AFTER_REPEATED_MEASUREMENT",

      title:
        "ยังไม่เกิด Customer",

      finding:
        "มี Measurement หลายรอบแต่ยังไม่พบ Customer"
    });
  }

  if (
    patterns.persistent_no_order
  ) {
    insights.push({
      type:
        "NO_ORDER_AFTER_REPEATED_MEASUREMENT",

      title:
        "ยังไม่เกิด Order",

      finding:
        "มี Measurement หลายรอบแต่ยังไม่พบ Order"
    });
  }

  if (
    patterns.persistent_no_revenue
  ) {
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
      type:
        "OBSERVING",

      title:
        "กำลังสะสมหลักฐาน",

      finding:
        "ยังไม่พบ Pattern ที่เพียงพอสำหรับการเปลี่ยนแปลง"
    });
  }

  return insights;
}

function buildIntelligence(
  content,
  latest,
  history,
  totals
) {
  const patterns =
    detectPatterns(
      history,
      totals
    );

  const state =
    determineState(
      patterns
    );

  const recommendation =
    buildRecommendation(
      patterns
    );

  const insights =
    buildInsights(
      patterns
    );

  let confidence =
    "LOW";

  if (
    state ===
    "PERSISTENT_FUNNEL_BLOCK"
  ) {
    confidence =
      "HIGH";
  } else if (
    state ===
    "PERSISTENT_NO_CUSTOMER"
  ) {
    confidence =
      "MEDIUM";
  } else if (
    state ===
    "PATTERN_DETECTED"
  ) {
    confidence =
      "MEDIUM";
  }

  return {
    layer:
      LAYER,

    version:
      VERSION,

    state,

    confidence,

    source_of_truth: {
      layer:
        ATTENTION_SOURCE,

      attention_type:
        ATTENTION_TYPE,

      attention_value:
        latest
          ? latest.attention
          : 0,

      rule:
        "Intelligence reads Attention from Measurement V2.2 and does not recalculate it"
    },

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
        ATTENTION_TYPE,

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
      buildConversions(
        totals
      ),

    patterns,

    insights,

    recommendation: {
      ...recommendation,

      do_not_change_strategy_yet:
        true,

      winner_declared:
        false
    },

    guardrails: {
      winner_declared:
        false,

      automatic_execution:
        false,

      strategy_change_automatic:
        false,

      requires_human_approval:
        true
    }
  };
}

async function analyze(
  env,
  contentId
) {
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
    aggregateHistory(
      history
    );

  const intelligence =
    buildIntelligence(
      content,
      latest,
      history,
      totals
    );

  return {
    content,
    latest,
    history,
    totals,
    intelligence
  };
}

async function save(
  env,
  result
) {
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

      source_of_truth:
        ATTENTION_SOURCE,

      attention_type:
        ATTENTION_TYPE,

      content_id:
        contentId,

      measurement_id:
        measurementId,

      latest_measurement:
        result.latest,

      history:
        result.history,

      totals:
        result.totals
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

  let priority =
    "LOW";

  if (
    result.intelligence.state ===
    "PERSISTENT_FUNNEL_BLOCK"
  ) {
    priority =
      "HIGH";
  } else if (
    result.intelligence.state ===
    "PERSISTENT_NO_CUSTOMER"
  ) {
    priority =
      "MEDIUM";
  }

  let score =
    30;

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

function publicResponse(
  result
) {
  return {
    success: true,

    layer:
      LAYER,

    version:
      VERSION,

    mode:
      "preview",

    status:
      "ANALYZED",

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

    next_step:
      "Intelligence V2.1 preview ready."
  };
}

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
        context.env,
        contentId
      );

    return json(
      publicResponse(result)
    );
  } catch (error) {
    return json(
      {
        success: false,

        layer:
          LAYER,

        version:
          VERSION,

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

export async function onRequestPost(
  context
) {
  try {
    let body = {};

    try {
      body =
        await context.request.json();
    } catch (_) {}

    const contentId =
      body &&
      body.content_id
        ? body.content_id
        : null;

    const mode =
      body &&
      body.mode
        ? body.mode
        : "preview";

    const result =
      await analyze(
        context.env,
        contentId
      );

    if (
      mode === "execute"
    ) {
      const saved =
        await save(
          context.env,
          result
        );

      return json({
        ...publicResponse(saved),

        mode:
          "execute",

        status:
          "EXECUTED",

        run_id:
          saved.run_id,

        insight_id:
          saved.insight_id,

        contract: {
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

          attention_source:
            ATTENTION_SOURCE,

          attention_type:
            ATTENTION_TYPE
        },

        next_step:
          "Intelligence V2.1 saved."
      });
    }

    return json(
      publicResponse(result)
    );
  } catch (error) {
    return json(
      {
        success: false,

        layer:
          LAYER,

        version:
          VERSION,

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
