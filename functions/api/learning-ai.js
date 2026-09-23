// TATO-OS
// Intelligence Layer V2.0
// Route: /api/intelligence
// Contract:
// CONTENT MEASUREMENT V2.1
//        ↓
// INTELLIGENCE LAYER V2
//        ↓
// LEARNING AI V2
//        ↓
// DECISION ENGINE V1.5

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const LAYER = "INTELLIGENCE_LAYER_V2";
const VERSION = "2.0";

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
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function normalizeMeasurement(row) {
  if (!row) return null;

  const metrics = safeJSON(row.metrics, null);
  const learningSignal = safeJSON(row.learning_signal, null);

  return {
    id: s(row.id),
    content_id: s(row.content_id),
    measured_at: s(row.measured_at),
    measurement_start: s(row.measurement_start),
    attribution_mode: s(row.attribution_mode),

    attention: n(
      row.attention ??
      metrics?.attention
    ),

    product_views: n(
      row.product_views ??
      metrics?.product_views
    ),

    clicks: n(
      row.clicks ??
      metrics?.clicks
    ),

    engagements: n(
      row.engagements ??
      metrics?.engagements
    ),

    customers: n(
      row.customers ??
      metrics?.customers
    ),

    orders: n(
      row.orders ??
      metrics?.orders
    ),

    revenue: n(
      row.revenue ??
      metrics?.revenue
    ),

    learning_signal:
      learningSignal ||
      row.learning_signal ||
      null,

    winner_decision:
      s(row.winner_decision)
  };
}

async function getContent(db, contentId = null) {
  if (contentId) {
    try {
      const row = await db
        .prepare(`
          SELECT *
          FROM content_engine
          WHERE id = ?
          LIMIT 1
        `)
        .bind(contentId)
        .first();

      if (row) return row;
    } catch (_) {}
  }

  try {
    return await db
      .prepare(`
        SELECT *
        FROM content_engine
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .first();
  } catch (_) {
    return null;
  }
}

async function getMeasurements(db, contentId, limit = 20) {
  if (!contentId) return [];

  try {
    const rows = await db
      .prepare(`
        SELECT *
        FROM content_measurements
        WHERE content_id = ?
        ORDER BY measured_at DESC
        LIMIT ?
      `)
      .bind(contentId, limit)
      .all();

    return (rows.results || [])
      .map(normalizeMeasurement)
      .filter(Boolean);
  } catch (_) {
    return [];
  }
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

  for (const m of history) {
    totals.attention += n(m.attention);
    totals.product_views += n(m.product_views);
    totals.clicks += n(m.clicks);
    totals.engagements += n(m.engagements);
    totals.customers += n(m.customers);
    totals.orders += n(m.orders);
    totals.revenue += n(m.revenue);
  }

  return totals;
}

function rate(a, b) {
  return b > 0
    ? Number(((a / b) * 100).toFixed(2))
    : 0;
}

function conversions(latest, totals) {
  return {
    attention_to_product_view:
      rate(
        totals.product_views,
        totals.attention
      ),

    product_view_to_click:
      rate(
        totals.clicks,
        totals.product_views
      ),

    click_to_customer:
      rate(
        totals.customers,
        totals.clicks
      ),

    customer_to_order:
      rate(
        totals.orders,
        totals.customers
      ),

    latest_attention_to_product_view:
      rate(
        n(latest?.product_views),
        n(latest?.attention)
      ),

    latest_click_to_customer:
      rate(
        n(latest?.customers),
        n(latest?.clicks)
      )
  };
}

function detectPatterns(history, totals) {
  const rounds = history.length;

  const persistentAttention =
    rounds >= 2 &&
    totals.attention > 0;

  const hasClick =
    totals.clicks > 0;

  const noProductView =
    totals.product_views === 0;

  const noCustomer =
    totals.customers === 0;

  const noOrder =
    totals.orders === 0;

  const noRevenue =
    totals.revenue === 0;

  return {
    rounds,

    persistent_attention:
      persistentAttention,

    attention_present:
      totals.attention > 0,

    click_present:
      hasClick,

    product_view_present:
      totals.product_views > 0,

    customer_present:
      totals.customers > 0,

    order_present:
      totals.orders > 0,

    revenue_present:
      totals.revenue > 0,

    click_without_product_view:
      hasClick &&
      noProductView,

    no_customer_after_repeated_measurement:
      rounds >= 2 &&
      noCustomer,

    no_order_after_repeated_measurement:
      rounds >= 2 &&
      noOrder,

    no_revenue_after_repeated_measurement:
      rounds >= 2 &&
      noRevenue,

    persistent_funnel_block:
      persistentAttention &&
      hasClick &&
      noProductView &&
      rounds >= 2,

    current_funnel_block:
      hasClick &&
      noProductView
  };
}

function determineState(patterns) {
  if (patterns.rounds === 0) {
    return "NO_DATA";
  }

  if (patterns.persistent_funnel_block) {
    return "PERSISTENT_FUNNEL_BLOCK";
  }

  if (
    patterns.no_customer_after_repeated_measurement
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

function determineRecommendation(state, patterns) {
  if (state === "NO_DATA") {
    return {
      action: "WAIT",
      direction:
        "ยังไม่มี Measurement เพียงพอสำหรับการเรียนรู้"
    };
  }

  if (state === "PERSISTENT_FUNNEL_BLOCK") {
    return {
      action: "INVESTIGATE_FUNNEL",
      direction:
        "ตรวจเส้นทาง Click → Product View"
    };
  }

  if (state === "PERSISTENT_NO_CUSTOMER") {
    return {
      action: "INVESTIGATE_CONVERSION",
      direction:
        "ตรวจเส้นทางจากพฤติกรรมไป Customer"
    };
  }

  if (patterns.attention_present) {
    return {
      action: "CONTINUE_MEASUREMENT",
      direction:
        "เก็บ downstream behavior เพิ่มก่อนเปลี่ยนกลยุทธ์"
    };
  }

  return {
    action: "CONTINUE_MEASUREMENT",
    direction:
      "เก็บ Measurement ต่อเพื่อเพิ่มหลักฐาน"
  };
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
    determineState(patterns);

  const recommendation =
    determineRecommendation(
      state,
      patterns
    );

  let confidence = "LOW";

  if (
    state === "PERSISTENT_FUNNEL_BLOCK"
  ) {
    confidence = "HIGH";
  } else if (
    state === "PERSISTENT_NO_CUSTOMER"
  ) {
    confidence = "MEDIUM";
  } else if (
    state === "PATTERN_DETECTED"
  ) {
    confidence = "MEDIUM";
  }

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
        "พบสัญญาณ Attention และ Click ต่อเนื่อง แต่ยังไม่พบ Product View จาก Measurement ที่มี"
    });
  }

  if (
    patterns.current_funnel_block
  ) {
    insights.push({
      type:
        "CLICK_WITHOUT_PRODUCT_VIEW",
      title:
        "พบ Funnel Block ระหว่าง Click กับ Product View",
      finding:
        "มี Click แต่ downstream ยังไม่เกิด Product View"
    });
  }

  if (
    patterns.no_customer_after_repeated_measurement
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
    patterns.no_order_after_repeated_measurement
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
    patterns.no_revenue_after_repeated_measurement
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
      type: "OBSERVING",
      title:
        "กำลังสะสมหลักฐาน",
      finding:
        "ยังไม่พบ pattern ที่เพียงพอสำหรับการเปลี่ยนแปลง"
    });
  }

  return {
    layer: LAYER,
    version: VERSION,

    state,

    confidence,

    content: {
      id:
        content?.id ||
        latest?.content_id ||
        null,

      title:
        content?.title ||
        null,

      objective:
        content?.objective ||
        null,

      attention_type:
        content?.attention_type ||
        null,

      market_keyword:
        content?.market_keyword ||
        null,

      angle:
        content?.angle ||
        null,

      cta:
        content?.cta ||
        null
    },

    latest_measurement: latest,

    measurement_rounds:
      history.length,

    totals,

    conversions:
      conversions(
        latest,
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
      winner_declared: false,
      automatic_execution: false,
      strategy_change_automatic: false,
      requires_human_approval: true
    }
  };
}

async function analyze(
  env,
  requestedContentId = null
) {
  if (!env.DB) {
    throw new Error(
      "D1 binding DB is missing"
    );
  }

  const content =
    await getContent(
      env.DB,
      requestedContentId
    );

  const contentId =
    content?.id ||
    requestedContentId ||
    null;

  const history =
    await getMeasurements(
      env.DB,
      contentId,
      20
    );

  const latest =
    history.length > 0
      ? history[0]
      : null;

  const totals =
    aggregate(history);

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
  const runId = id();
  const insightId = id();
  const now =
    new Date().toISOString();

  const measurementId =
    result.latest?.id ||
    null;

  const contentId =
    result.content?.id ||
    result.latest?.content_id ||
    null;

  const input =
    JSON.stringify({
      layer: LAYER,
      version: VERSION,
      content_id: contentId,
      measurement_id: measurementId,
      latest_measurement:
        result.latest,
      history:
        result.history,
      totals:
        result.totals
    });

  const output =
    JSON.stringify(
      result.intelligence
    );

  await env.DB
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
      "INTELLIGENCE",
      "RULE_BASED",
      input,
      output,
      "COMPLETED",
      null,
      now
    )
    .run();

  const priority =
    result.intelligence.state ===
    "PERSISTENT_FUNNEL_BLOCK"
      ? "HIGH"
      : result.intelligence.state ===
        "PERSISTENT_NO_CUSTOMER"
      ? "MEDIUM"
      : "LOW";

  const score =
    priority === "HIGH"
      ? 90
      : priority === "MEDIUM"
      ? 60
      : 30;

  await env.DB
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
      "INTELLIGENCE",
      "Intelligence Layer V2 Analysis",
      output,
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

function responsePayload(
  result,
  mode = "preview"
) {
  return {
    success: true,

    layer: LAYER,
    version: VERSION,

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

    run_id:
      result.run_id ||
      null,

    insight_id:
      result.insight_id ||
      null,

    next_step:
      mode === "execute"
        ? "Intelligence V2 saved. Learning AI V2 can use Content Measurement evidence."
        : "Intelligence V2 preview ready. Run POST mode=execute to save."
  };
}

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
      responsePayload(
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
      body?.mode ||
      "preview";

    const contentId =
      body?.content_id ||
      null;

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

      return json(
        responsePayload(
          saved,
          "execute"
        )
      );
    }

    return json(
      responsePayload(
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
        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}
