// TATO OS — Intelligence Layer V2
// Purpose:
// 1. Aggregate repeated measurements
// 2. Detect persistent funnel problems
// 3. Detect AI-vs-metric contradictions
// 4. Build evidence for future Decision Policy
// 5. Never declare WINNER
// 6. No automatic action execution

const LAYER = "INTELLIGENCE_LAYER_V2";
const VERSION = "2.0";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

function safeJSON(value, fallback = {}) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function text(value) {
  return value === null || value === undefined ? "" : String(value);
}

function normalize(value) {
  return text(value).trim().toLowerCase();
}

function hasAnyPhrase(source, phrases) {
  const s = normalize(source);
  return phrases.some(p => s.includes(normalize(p)));
}

function getMetric(row, key) {
  return num(row?.[key]);
}

function parseLearningOutput(row) {
  const output = safeJSON(row?.output_data, {});
  const input = safeJSON(row?.input_data, {});

  return {
    output,
    input,
    analysis: output?.analysis || output?.learning || {},
    measurement_id:
      output?.measurement_id ||
      output?.measurement?.id ||
      input?.measurement_id ||
      null,
    content_id:
      output?.content_id ||
      output?.content?.id ||
      input?.content_id ||
      null
  };
}

function buildMeasurementSnapshot(row) {
  return {
    id: row?.id || null,
    content_id: row?.content_id || null,
    status: row?.status || null,
    measured_at: row?.measured_at || row?.created_at || null,
    measurement_start: row?.measurement_start || null,

    attention: getMetric(row, "attention"),
    product_views: getMetric(row, "product_views"),
    clicks: getMetric(row, "clicks"),
    engagements: getMetric(row, "engagements"),
    customers: getMetric(row, "customers"),
    orders: getMetric(row, "orders"),
    revenue: getMetric(row, "revenue")
  };
}

function calculateTotals(measurements) {
  return measurements.reduce(
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
}

function calculateRates(metrics) {
  return {
    attention_to_product_view:
      metrics.attention > 0
        ? metrics.product_views / metrics.attention
        : 0,

    product_view_to_click:
      metrics.product_views > 0
        ? metrics.clicks / metrics.product_views
        : 0,

    click_to_customer:
      metrics.clicks > 0
        ? metrics.customers / metrics.clicks
        : 0,

    customer_to_order:
      metrics.customers > 0
        ? metrics.orders / metrics.customers
        : 0
  };
}

function detectPersistentPatterns(measurements) {
  const patterns = [];

  if (!measurements.length) {
    return patterns;
  }

  const repeatedNoProductView = measurements.every(
    m => m.product_views === 0
  );

  const repeatedNoCustomer = measurements.every(
    m => m.customers === 0
  );

  const repeatedNoOrder = measurements.every(
    m => m.orders === 0
  );

  const repeatedNoRevenue = measurements.every(
    m => m.revenue === 0
  );

  const repeatedAttention = measurements.every(
    m => m.attention > 0
  );

  const repeatedClick = measurements.every(
    m => m.clicks > 0
  );

  if (measurements.length >= 2 && repeatedAttention && repeatedNoProductView) {
    patterns.push({
      type: "PERSISTENT_ATTENTION_WITHOUT_PRODUCT_VIEW",
      severity: "MEDIUM",
      evidence:
        "หลาย Measurement มี Attention แต่ไม่มี Product View"
    });
  }

  if (measurements.length >= 2 && repeatedClick && repeatedNoProductView) {
    patterns.push({
      type: "CLICK_WITHOUT_PRODUCT_VIEW",
      severity: "HIGH",
      evidence:
        "มี Click ต่อเนื่อง แต่ Product View ยังเป็น 0"
    });
  }

  if (measurements.length >= 3 && repeatedNoCustomer) {
    patterns.push({
      type: "NO_CUSTOMER_AFTER_REPEATED_MEASUREMENT",
      severity: "HIGH",
      evidence:
        "ผ่านหลาย Measurement แล้วยังไม่มี Customer"
    });
  }

  if (measurements.length >= 3 && repeatedNoOrder) {
    patterns.push({
      type: "NO_ORDER_AFTER_REPEATED_MEASUREMENT",
      severity: "HIGH",
      evidence:
        "ผ่านหลาย Measurement แล้วยังไม่มี Order"
    });
  }

  if (measurements.length >= 3 && repeatedNoRevenue) {
    patterns.push({
      type: "NO_REVENUE_AFTER_REPEATED_MEASUREMENT",
      severity: "HIGH",
      evidence:
        "ผ่านหลาย Measurement แล้วยังไม่มี Revenue"
    });
  }

  return patterns;
}

function detectTrend(measurements) {
  if (measurements.length < 2) {
    return {
      available: false,
      direction: "INSUFFICIENT_DATA"
    };
  }

  const first = measurements[0];
  const last = measurements[measurements.length - 1];

  const compare = (a, b) => {
    if (b > a) return "UP";
    if (b < a) return "DOWN";
    return "FLAT";
  };

  return {
    available: true,
    attention: compare(first.attention, last.attention),
    product_views: compare(first.product_views, last.product_views),
    clicks: compare(first.clicks, last.clicks),
    customers: compare(first.customers, last.customers),
    orders: compare(first.orders, last.orders),
    revenue: compare(first.revenue, last.revenue)
  };
}

function detectAIContradictions(measurements, learningRuns) {
  const contradictions = [];

  for (const run of learningRuns) {
    const parsed = parseLearningOutput(run);
    const analysis = parsed.analysis;

    const measurementId = parsed.measurement_id;

    if (!measurementId) continue;

    const measurement = measurements.find(
      m => m.id === measurementId
    );

    if (!measurement) continue;

    const rawAnalysis = JSON.stringify(analysis);

    if (
      measurement.clicks > 0 &&
      hasAnyPhrase(rawAnalysis, [
        "ไม่มีการ click",
        "ไม่มี click",
        "no click",
        "clicks": 0
      ])
    ) {
      contradictions.push({
        type: "AI_METRIC_CONTRADICTION",
        measurement_id: measurement.id,
        learning_run_id: run.id,
        field: "clicks",
        metric_value: measurement.clicks,
        ai_claim: "AI text indicates no click"
      });
    }

    if (
      measurement.product_views > 0 &&
      hasAnyPhrase(rawAnalysis, [
        "ไม่มี product view",
        "ไม่มีการดูรายละเอียดสินค้า",
        "no product view"
      ])
    ) {
      contradictions.push({
        type: "AI_METRIC_CONTRADICTION",
        measurement_id: measurement.id,
        learning_run_id: run.id,
        field: "product_views",
        metric_value: measurement.product_views,
        ai_claim: "AI text indicates no product view"
      });
    }

    if (
      measurement.customers > 0 &&
      hasAnyPhrase(rawAnalysis, [
        "ไม่มี customer",
        "ไม่มีลูกค้า",
        "no customer"
      ])
    ) {
      contradictions.push({
        type: "AI_METRIC_CONTRADICTION",
        measurement_id: measurement.id,
        learning_run_id: run.id,
        field: "customers",
        metric_value: measurement.customers,
        ai_claim: "AI text indicates no customer"
      });
    }

    if (
      measurement.orders > 0 &&
      hasAnyPhrase(rawAnalysis, [
        "ไม่มี order",
        "ไม่มีคำสั่งซื้อ",
        "no order"
      ])
    ) {
      contradictions.push({
        type: "AI_METRIC_CONTRADICTION",
        measurement_id: measurement.id,
        learning_run_id: run.id,
        field: "orders",
        metric_value: measurement.orders,
        ai_claim: "AI text indicates no order"
      });
    }

    if (
      measurement.revenue > 0 &&
      hasAnyPhrase(rawAnalysis, [
        "ไม่มี revenue",
        "ไม่มีรายได้",
        "no revenue"
      ])
    ) {
      contradictions.push({
        type: "AI_METRIC_CONTRADICTION",
        measurement_id: measurement.id,
        learning_run_id: run.id,
        field: "revenue",
        metric_value: measurement.revenue,
        ai_claim: "AI text indicates no revenue"
      });
    }
  }

  return contradictions;
}

function buildDecisionEvidence({
  measurements,
  totals,
  rates,
  patterns,
  trend,
  contradictions,
  latestLearning,
  latestDecision
}) {
  const evidence = {
    measurement_count: measurements.length,
    measurement_ids: measurements.map(m => m.id),

    cumulative_metrics: totals,
    cumulative_rates: rates,

    latest_measurement:
      measurements.length > 0
        ? measurements[measurements.length - 1]
        : null,

    trend,

    persistent_patterns: patterns,

    ai_metric_contradictions: contradictions,

    latest_learning_run_id:
      latestLearning?.id || null,

    latest_decision_run_id:
      latestDecision?.id || null
  };

  return evidence;
}

function determineIntelligenceState({
  measurements,
  patterns,
  contradictions
}) {
  if (!measurements.length) {
    return {
      state: "NO_DATA",
      confidence: "LOW",
      reason: "ยังไม่มี Measurement เพียงพอ"
    };
  }

  if (contradictions.length > 0) {
    return {
      state: "DATA_QUALITY_REVIEW_REQUIRED",
      confidence: "MEDIUM",
      reason:
        "พบข้อความจาก Learning AI ที่ขัดกับ Metrics จริง ต้องยึด Metrics เป็นหลัก"
    };
  }

  if (
    patterns.some(
      p =>
        p.type === "CLICK_WITHOUT_PRODUCT_VIEW" &&
        p.severity === "HIGH"
    )
  ) {
    return {
      state: "PERSISTENT_FUNNEL_BLOCK",
      confidence: measurements.length >= 3 ? "HIGH" : "MEDIUM",
      reason:
        "พบ Click แต่ไม่มี Product View ต่อเนื่องหลาย Measurement"
    };
  }

  if (
    patterns.some(
      p => p.type === "NO_CUSTOMER_AFTER_REPEATED_MEASUREMENT"
    )
  ) {
    return {
      state: "PERSISTENT_NO_CUSTOMER",
      confidence: "HIGH",
      reason:
        "ยังไม่มี Customer หลังจากมี Measurement หลายรอบ"
    };
  }

  return {
    state: "OBSERVING",
    confidence: measurements.length >= 3 ? "MEDIUM" : "LOW",
    reason:
      "ยังอยู่ในช่วงสะสมหลักฐาน"
  };
}

function buildRecommendation(state, patterns) {
  if (state === "DATA_QUALITY_REVIEW_REQUIRED") {
    return {
      type: "REVIEW_DATA_QUALITY",
      action: "ตรวจความสอดคล้องของ Learning output กับ Metrics",
      automatic: false
    };
  }

  if (state === "PERSISTENT_FUNNEL_BLOCK") {
    return {
      type: "CHANGE_TEST_VARIABLE",
      action:
        "ควรทดสอบตัวแปร Content/CTA ใหม่ แทนการเพิ่ม Measurement แบบเดิมอย่างเดียว",
      automatic: false,
      evidence:
        "Click มี แต่ Product View ไม่มีต่อเนื่อง"
    };
  }

  if (state === "PERSISTENT_NO_CUSTOMER") {
    return {
      type: "REVIEW_CONVERSION_PATH",
      action:
        "ตรวจเส้นทาง Product View → Customer ก่อนเพิ่ม Traffic",
      automatic: false
    };
  }

  return {
    type: "CONTINUE_OBSERVATION",
    action:
      "สะสม Measurement เพิ่มโดยยังไม่เปลี่ยนกลยุทธ์",
    automatic: false
  };
}

async function loadIntelligenceData(db, contentId = null) {
  const measurementQuery = contentId
    ? `
      SELECT *
      FROM content_measurements
      WHERE content_id = ?
      ORDER BY measured_at ASC
    `
    : `
      SELECT *
      FROM content_measurements
      ORDER BY measured_at ASC
    `;

  const measurementResult = contentId
    ? await db.prepare(measurementQuery).bind(contentId).all()
    : await db.prepare(measurementQuery).all();

  const measurements = (measurementResult.results || []).map(
    buildMeasurementSnapshot
  );

  const learningResult = await db
    .prepare(`
      SELECT *
      FROM ai_runs
      WHERE run_type = 'LEARNING'
      ORDER BY created_at ASC
    `)
    .all();

  const learningRuns = learningResult.results || [];

  const decisionResult = await db
    .prepare(`
      SELECT *
      FROM decision_runs
      ORDER BY created_at ASC
    `)
    .all();

  const decisions = decisionResult.results || [];

  const latestLearning =
    learningRuns.length > 0
      ? learningRuns[learningRuns.length - 1]
      : null;

  const latestDecision =
    decisions.length > 0
      ? decisions[decisions.length - 1]
      : null;

  return {
    measurements,
    learningRuns,
    decisions,
    latestLearning,
    latestDecision
  };
}

async function saveInsight(db, intelligence, contentId) {
  const id = crypto.randomUUID();

  const title =
    intelligence.state === "PERSISTENT_FUNNEL_BLOCK"
      ? "Persistent funnel block detected"
      : intelligence.state === "DATA_QUALITY_REVIEW_REQUIRED"
      ? "Learning vs Metrics contradiction detected"
      : "TATO Intelligence update";

  const content = JSON.stringify(
    {
      layer: LAYER,
      version: VERSION,
      content_id: contentId,
      state: intelligence.state,
      confidence: intelligence.confidence,
      reason: intelligence.reason,
      recommendation: intelligence.recommendation,
      evidence: intelligence.evidence
    },
    null,
    2
  );

  await db
    .prepare(`
      INSERT INTO ai_insights
      (
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
      VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, 'new', CURRENT_TIMESTAMP)
    `)
    .bind(
      id,
      "INTELLIGENCE",
      title,
      content,
      intelligence.confidence === "HIGH"
        ? 90
        : intelligence.confidence === "MEDIUM"
        ? 60
        : 30,
      intelligence.state === "PERSISTENT_FUNNEL_BLOCK"
        ? "high"
        : intelligence.state === "DATA_QUALITY_REVIEW_REQUIRED"
        ? "high"
        : "normal"
    )
    .run();

  return id;
}

async function run(context) {
  const db = context.env.DB;

  if (!db) {
    return {
      success: false,
      layer: LAYER,
      error: "D1 binding DB not found"
    };
  }

  let body = {};

  if (context.request.method === "POST") {
    try {
      body = await context.request.json();
    } catch {
      body = {};
    }
  }

  const url = new URL(context.request.url);
  const contentId =
    body.content_id ||
    url.searchParams.get("content_id") ||
    null;

  const data = await loadIntelligenceData(db, contentId);

  const measurements = data.measurements;

  const totals = calculateTotals(measurements);
  const rates = calculateRates(totals);

  const patterns = detectPersistentPatterns(measurements);

  const trend = detectTrend(measurements);

  const contradictions = detectAIContradictions(
    measurements,
    data.learningRuns
  );

  const state = determineIntelligenceState({
    measurements,
    patterns,
    contradictions
  });

  const recommendation = buildRecommendation(
    state.state,
    patterns
  );

  const evidence = buildDecisionEvidence({
    measurements,
    totals,
    rates,
    patterns,
    trend,
    contradictions,
    latestLearning: data.latestLearning,
    latestDecision: data.latestDecision
  });

  const intelligence = {
    state: state.state,
    confidence: state.confidence,
    reason: state.reason,
    recommendation,
    evidence
  };

  let insightId = null;

  if (context.request.method === "POST") {
    insightId = await saveInsight(
      db,
      intelligence,
      contentId
    );
  }

  return {
    success: true,
    layer: LAYER,
    version: VERSION,
    mode:
      context.request.method === "POST"
        ? "execute"
        : "preview",
    status:
      context.request.method === "POST"
        ? "INTELLIGENCE_SAVED"
        : "INTELLIGENCE_ANALYZED",

    scope: {
      content_id: contentId || "ALL_CONTENT"
    },

    intelligence,

    latest_learning: data.latestLearning
      ? {
          id: data.latestLearning.id,
          created_at: data.latestLearning.created_at
        }
      : null,

    latest_decision: data.latestDecision
      ? {
          id: data.latestDecision.id,
          decision_type: data.latestDecision.decision_type,
          decision_status: data.latestDecision.decision_status,
          created_at: data.latestDecision.created_at
        }
      : null,

    insight_id: insightId,

    winner_decision:
      "NOT_DECLARED_IN_INTELLIGENCE_LAYER_V2",

    next_step:
      intelligence.state === "PERSISTENT_FUNNEL_BLOCK"
        ? "Review the evidence and create a new test variable before another identical measurement cycle."
        : "Send Intelligence evidence to Decision Policy."
  };
}

export async function onRequestGet(context) {
  try {
    return json(await run(context));
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        error: error?.message || String(error)
      },
      500
    );
  }
}

export async function onRequestPost(context) {
  try {
    return json(await run(context));
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        error: error?.message || String(error)
      },
      500
    );
  }
}
