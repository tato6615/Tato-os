// TATO-OS
// Learning AI V1.4
// Route: /api/learning-ai
//
// Pipeline:
//
// Measurement V2.2
//        ↓
// Intelligence V2.1
//        ↓
// Learning AI V1.4
//        ↓
// Decision Layer
//
// Learning does NOT:
// - declare a winner
// - change strategy
// - execute actions
// - modify measurement
//
// Learning DOES:
// - read Measurement evidence
// - read Intelligence evidence
// - identify repeated behavioral signals
// - create learning hypotheses
// - expose decision input

const MODEL = "@cf/zai-org/glm-4.7-flash";

const LAYER = "LEARNING_AI_V1";
const VERSION = "1.4";

const MEASUREMENT_SOURCE =
  "CONTENT_MEASUREMENT_ENGINE_V2.2";

const INTELLIGENCE_SOURCE =
  "INTELLIGENCE_LAYER_V2.1";

const ATTENTION_TYPE =
  "weighted_behavioral_signal";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

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

function upper(value) {
  return s(value).trim().toUpperCase();
}

function extractText(response) {
  if (!response) return null;

  if (typeof response === "string") {
    return response.trim() || null;
  }

  if (typeof response.response === "string") {
    return response.response.trim() || null;
  }

  if (
    response.result &&
    typeof response.result.response === "string"
  ) {
    return response.result.response.trim() || null;
  }

  if (typeof response.content === "string") {
    return response.content.trim() || null;
  }

  if (Array.isArray(response.content)) {
    const value = response.content
      .map(item => {
        if (typeof item === "string") {
          return item;
        }

        if (
          item &&
          typeof item.text === "string"
        ) {
          return item.text;
        }

        if (
          item &&
          typeof item.content === "string"
        ) {
          return item.content;
        }

        return "";
      })
      .join("\n")
      .trim();

    if (value) return value;
  }

  const message =
    response?.choices?.[0]?.message;

  if (message) {
    if (
      typeof message.content === "string"
    ) {
      return message.content.trim() || null;
    }

    if (Array.isArray(message.content)) {
      const value = message.content
        .map(item => {
          if (typeof item === "string") {
            return item;
          }

          if (
            item &&
            typeof item.text === "string"
          ) {
            return item.text;
          }

          return "";
        })
        .join("\n")
        .trim();

      if (value) return value;
    }
  }

  if (
    typeof response.output_text === "string"
  ) {
    return response.output_text.trim() || null;
  }

  return null;
}

function parseJSON(value) {
  if (!value) return null;

  let text = value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(text);

    if (
      parsed &&
      typeof parsed === "object"
    ) {
      return parsed;
    }
  } catch (_) {}

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(
        text.slice(start, end + 1)
      );

      if (
        parsed &&
        typeof parsed === "object"
      ) {
        return parsed;
      }
    } catch (_) {}
  }

  return null;
}

function normalizeMeasurement(row) {
  if (!row) return null;

  return {
    id: row.id || null,
    content_id: row.content_id || null,

    measured_at:
      row.measured_at || null,

    measurement_start:
      row.measurement_start || null,

    attribution_mode:
      row.attribution_mode || null,

    attention: n(row.attention),
    product_views: n(row.product_views),
    clicks: n(row.clicks),
    engagements: n(row.engagements),
    customers: n(row.customers),
    orders: n(row.orders),
    revenue: n(row.revenue)
  };
}

function aggregateMeasurements(rows) {
  const totals = {
    attention: 0,
    product_views: 0,
    clicks: 0,
    engagements: 0,
    customers: 0,
    orders: 0,
    revenue: 0
  };

  for (const row of rows || []) {
    const m = normalizeMeasurement(row);

    if (!m) continue;

    totals.attention += m.attention;
    totals.product_views += m.product_views;
    totals.clicks += m.clicks;
    totals.engagements += m.engagements;
    totals.customers += m.customers;
    totals.orders += m.orders;
    totals.revenue += m.revenue;
  }

  return totals;
}

function conversions(metrics) {
  const rate = (a, b) =>
    b > 0
      ? Number(((a / b) * 100).toFixed(2))
      : 0;

  return {
    attention_to_product_view:
      rate(
        metrics.product_views,
        metrics.attention
      ),

    product_view_to_click:
      rate(
        metrics.clicks,
        metrics.product_views
      ),

    click_to_customer:
      rate(
        metrics.customers,
        metrics.clicks
      ),

    customer_to_order:
      rate(
        metrics.orders,
        metrics.customers
      ),

    engagement_to_order:
      rate(
        metrics.orders,
        metrics.engagements
      )
  };
}

function buildPatterns(rows, totals) {
  const rounds = rows?.length || 0;

  const attentionPresent =
    totals.attention > 0;

  const clicksPresent =
    totals.clicks > 0;

  const productViewsPresent =
    totals.product_views > 0;

  const customersPresent =
    totals.customers > 0;

  const ordersPresent =
    totals.orders > 0;

  const revenuePresent =
    totals.revenue > 0;

  const persistentAttention =
    rounds >= 2 &&
    rows.filter(
      row =>
        n(row.attention) > 0
    ).length >= 2;

  const persistentClicks =
    rounds >= 2 &&
    rows.filter(
      row =>
        n(row.clicks) > 0
    ).length >= 2;

  const clickWithoutProductView =
    clicksPresent &&
    !productViewsPresent;

  const persistentFunnelBlock =
    persistentClicks &&
    clickWithoutProductView;

  let state = "OBSERVING";

  if (persistentFunnelBlock) {
    state = "PERSISTENT_FUNNEL_BLOCK";
  } else if (
    attentionPresent &&
    !customersPresent
  ) {
    state = "PERSISTENT_NO_CUSTOMER";
  } else if (
    customersPresent &&
    !ordersPresent
  ) {
    state = "PERSISTENT_NO_ORDER";
  } else if (
    ordersPresent &&
    !revenuePresent
  ) {
    state = "PERSISTENT_NO_REVENUE";
  } else if (
    attentionPresent ||
    clicksPresent ||
    productViewsPresent
  ) {
    state = "PATTERN_DETECTED";
  }

  return {
    rounds,

    attention_present:
      attentionPresent,

    clicks_present:
      clicksPresent,

    product_views_present:
      productViewsPresent,

    customers_present:
      customersPresent,

    orders_present:
      ordersPresent,

    revenue_present:
      revenuePresent,

    persistent_attention:
      persistentAttention,

    persistent_clicks:
      persistentClicks,

    click_without_product_view:
      clickWithoutProductView,

    persistent_funnel_block:
      persistentFunnelBlock
  };
}

function buildLearning(
  measurements,
  intelligence,
  content
) {
  const totals =
    intelligence?.totals ||
    aggregateMeasurements(
      measurements
    );

  const patterns =
    intelligence?.patterns ||
    buildPatterns(
      measurements,
      totals
    );

  const conversion =
    intelligence?.conversions ||
    conversions(totals);

  const signals = [];

  if (totals.attention > 0) {
    signals.push({
      type: "ATTENTION_PRESENT",
      value: totals.attention
    });
  }

  if (totals.clicks > 0) {
    signals.push({
      type: "CLICK_PRESENT",
      value: totals.clicks
    });
  }

  if (totals.product_views > 0) {
    signals.push({
      type: "PRODUCT_VIEW_PRESENT",
      value: totals.product_views
    });
  }

  if (totals.customers > 0) {
    signals.push({
      type: "CUSTOMER_PRESENT",
      value: totals.customers
    });
  }

  if (totals.orders > 0) {
    signals.push({
      type: "ORDER_PRESENT",
      value: totals.orders
    });
  }

  if (totals.revenue > 0) {
    signals.push({
      type: "REVENUE_PRESENT",
      value: totals.revenue
    });
  }

  const hypotheses = [];
  const problems = [];

  if (
    totals.attention > 0 &&
    totals.clicks > 0
  ) {
    hypotheses.push({
      type: "ATTENTION_CAN_PRODUCE_CLICK",
      evidence: {
        attention: totals.attention,
        clicks: totals.clicks
      }
    });
  }

  if (
    totals.clicks > 0 &&
    totals.product_views === 0
  ) {
    hypotheses.push({
      type:
        "CLICK_TO_PRODUCT_VIEW_PATH_REQUIRES_INVESTIGATION",
      evidence: {
        clicks: totals.clicks,
        product_views:
          totals.product_views
      }
    });

    problems.push(
      "CLICK_TO_PRODUCT_VIEW_BLOCK"
    );
  }

  if (
    totals.product_views > 0 &&
    totals.customers === 0
  ) {
    problems.push(
      "PRODUCT_VIEW_TO_CUSTOMER_BLOCK"
    );
  }

  if (
    totals.customers > 0 &&
    totals.orders === 0
  ) {
    problems.push(
      "CUSTOMER_TO_ORDER_BLOCK"
    );
  }

  if (
    totals.orders > 0 &&
    totals.revenue === 0
  ) {
    problems.push(
      "ORDER_TO_REVENUE_BLOCK"
    );
  }

  if (totals.customers === 0) {
    problems.push("NO_CUSTOMER");
  }

  if (totals.orders === 0) {
    problems.push("NO_ORDER");
  }

  if (totals.revenue === 0) {
    problems.push("NO_REVENUE");
  }

  let state = "OBSERVING";
  let confidence = "LOW";
  let decisionInput =
    "CONTINUE_OBSERVATION";

  if (
    patterns.persistent_funnel_block
  ) {
    state =
      "DOWNSTREAM_BLOCK_DETECTED";

    confidence = "HIGH";

    decisionInput =
      "INVESTIGATE_DOWNSTREAM_PATH";
  } else if (
    patterns.persistent_attention ||
    patterns.persistent_clicks
  ) {
    state =
      "REPEATED_BEHAVIORAL_SIGNAL";

    confidence = "MEDIUM";

    decisionInput =
      "CONTINUE_OBSERVATION";
  } else if (
    signals.length > 0
  ) {
    state =
      "BEHAVIORAL_SIGNAL_DETECTED";

    confidence = "MEDIUM";

    decisionInput =
      "CONTINUE_OBSERVATION";
  }

  return {
    state,
    confidence,
    rounds:
      intelligence?.rounds ||
      measurements.length,

    signals,
    hypotheses,
    problems,

    funnel: {
      attention: totals.attention,
      clicks: totals.clicks,
      product_views:
        totals.product_views,
      engagements:
        totals.engagements,
      customers: totals.customers,
      orders: totals.orders,
      revenue: totals.revenue
    },

    conversions: conversion,

    decision_input:
      decisionInput,

    source_contract: {
      measurement:
        MEASUREMENT_SOURCE,

      intelligence:
        INTELLIGENCE_SOURCE,

      attention_type:
        ATTENTION_TYPE,

      measurement_rounds:
        measurements.length,

      latest_measurement_id:
        measurements[0]?.id || null,

      content_id:
        content?.id || null
    },

    guardrails: {
      winner_declared: false,
      strategy_changed: false,
      automatic_execution: false,
      action_executed: false,
      requires_decision_layer: true
    }
  };
}

function fallback(
  learning,
  content
) {
  return {
    summary:
      learning.state ===
      "DOWNSTREAM_BLOCK_DETECTED"
        ? "พบสัญญาณซ้ำว่ามี Attention และ Click แต่ยังไม่เกิด Product View"
        : "พบข้อมูลพฤติกรรมจาก Measurement และ Intelligence",

    observed_signals:
      learning.signals.map(
        signal =>
          `${signal.type}: ${signal.value}`
      ),

    learning: {
      what_we_learned:
        learning.state ===
        "DOWNSTREAM_BLOCK_DETECTED"
          ? "Attention สามารถเกิดร่วมกับ Click ได้ แต่เส้นทางหลัง Click ยังไม่สร้าง Product View"
          : "ระบบพบ Behavioral Evidence แต่ยังต้องเก็บข้อมูลต่อเพื่อยืนยัน Pattern",

      confidence:
        learning.confidence
    },

    problems:
      learning.problems,

    next_content: {
      action: "WAIT",

      direction:
        "ยังไม่เปลี่ยน Content จนกว่า Decision Layer จะประเมินหลักฐาน",

      angle:
        content?.angle ||
        "ยังไม่เปลี่ยน Angle",

      cta:
        content?.cta ||
        "ยังไม่เปลี่ยน CTA",

      success_metric:
        learning.state ===
        "DOWNSTREAM_BLOCK_DETECTED"
          ? "Product Views"
          : "Behavioral Evidence"
    },

    next_action: {
      type: "WAIT",

      reason:
        learning.decision_input
    },

    priority:
      learning.confidence === "HIGH"
        ? "HIGH"
        : learning.confidence === "MEDIUM"
          ? "MEDIUM"
          : "LOW"
  };
}

function sanitizeAIAnalysis(
  analysis,
  learning
) {
  if (
    !analysis ||
    typeof analysis !== "object"
  ) {
    return fallback(
      learning,
      null
    );
  }

  const allowedActions = [
    "DISTRIBUTE",
    "OPTIMIZE",
    "SCALE",
    "WAIT"
  ];

  const allowedPriorities = [
    "LOW",
    "MEDIUM",
    "HIGH"
  ];

  const result = {
    summary:
      s(analysis.summary) ||
      "Learning analysis completed",

    observed_signals:
      Array.isArray(
        analysis.observed_signals
      )
        ? analysis.observed_signals
        : [],

    learning: {
      what_we_learned:
        s(
          analysis.learning
            ?.what_we_learned
        ) ||
        "ยังไม่มีข้อสรุปเพิ่มเติม",

      confidence:
        allowedPriorities.includes(
          upper(
            analysis.learning
              ?.confidence
          )
        )
          ? upper(
              analysis.learning
                ?.confidence
            )
          : learning.confidence
    },

    problems:
      Array.isArray(analysis.problems)
        ? analysis.problems
        : [],

    next_content: {
      action:
        allowedActions.includes(
          upper(
            analysis.next_content
              ?.action
          )
        )
          ? upper(
              analysis.next_content
                ?.action
            )
          : "WAIT",

      direction:
        s(
          analysis.next_content
            ?.direction
        ),

      angle:
        s(
          analysis.next_content
            ?.angle
        ),

      cta:
        s(
          analysis.next_content?.cta
        ),

      success_metric:
        s(
          analysis.next_content
            ?.success_metric
        ) || "Behavioral Evidence"
    },

    next_action: {
      type:
        allowedActions.includes(
          upper(
            analysis.next_action
              ?.type
          )
        )
          ? upper(
              analysis.next_action
                ?.type
            )
          : "WAIT",

      reason:
        s(
          analysis.next_action
            ?.reason
        )
    },

    priority:
      allowedPriorities.includes(
        upper(analysis.priority)
      )
        ? upper(analysis.priority)
        : learning.confidence
  };

  /*
   * Learning AI is not allowed to
   * override the system guardrails.
   */
  if (
    learning.decision_input ===
    "INVESTIGATE_DOWNSTREAM_PATH"
  ) {
    result.next_content.action =
      "WAIT";

    result.next_action.type =
      "WAIT";

    result.next_action.reason =
      "Decision Layer must evaluate the downstream-path learning signal before any action."
  }

  return result;
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
}

async function getContent(
  db,
  contentId = null
) {
  try {
    if (contentId) {
      const row = await db.prepare(`
        SELECT *
        FROM content_engine
        WHERE id = ?
        LIMIT 1
      `)
        .bind(contentId)
        .first();

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

async function getMeasurements(
  db,
  contentId = null
) {
  try {
    if (contentId) {
      const result =
        await db.prepare(`
          SELECT *
          FROM content_measurements
          WHERE content_id = ?
          ORDER BY measured_at DESC
          LIMIT 20
        `)
          .bind(contentId)
          .all();

      if (
        result.results &&
        result.results.length
      ) {
        return result.results;
      }
    }
  } catch (_) {}

  try {
    const result =
      await db.prepare(`
        SELECT *
        FROM content_measurements
        ORDER BY measured_at DESC
        LIMIT 20
      `).all();

    return result.results || [];
  } catch (_) {
    return [];
  }
}

async function getLatestMeasurement(
  db,
  contentId = null
) {
  try {
    if (contentId) {
      const row =
        await db.prepare(`
          SELECT *
          FROM content_measurements
          WHERE content_id = ?
          ORDER BY measured_at DESC
          LIMIT 1
        `)
          .bind(contentId)
          .first();

      if (row) {
        return normalizeMeasurement(row);
      }
    }
  } catch (_) {}

  try {
    const row =
      await db.prepare(`
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

async function getLearningFeedback(
  db,
  contentId = null
) {
  try {
    if (contentId) {
      const row =
        await db.prepare(`
          SELECT *
          FROM learning_feedback
          WHERE content_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `)
          .bind(contentId)
          .first();

      if (row) return row;
    }
  } catch (_) {}

  try {
    const row =
      await db.prepare(`
        SELECT *
        FROM learning_feedback
        ORDER BY created_at DESC
        LIMIT 1
      `).first();

    return row;
  } catch (_) {
    return null;
  }
}

function buildIntelligence(
  measurements
) {
  const totals =
    aggregateMeasurements(
      measurements
    );

  const patterns =
    buildPatterns(
      measurements,
      totals
    );

  return {
    state:
      patterns.persistent_funnel_block
        ? "PERSISTENT_FUNNEL_BLOCK"
        : patterns.persistent_attention ||
            patterns.persistent_clicks
          ? "PATTERN_DETECTED"
          : "OBSERVING",

    rounds:
      measurements.length,

    totals,

    patterns,

    conversions:
      conversions(totals),

    source:
      INTELLIGENCE_SOURCE
  };
}

function buildPrompt(
  learning,
  intelligence,
  content
) {
  return `
วิเคราะห์ Learning ของ TATO Coffee

ตอบเป็น JSON เท่านั้น
ห้ามใช้ Markdown
ห้ามสร้างตัวเลขใหม่
ห้ามเดาตัวเลข
ใช้เฉพาะ Evidence ที่ได้รับ

ข้อจำกัดสำคัญ:
- ห้ามประกาศ Winner
- ห้ามเปลี่ยน Strategy
- ห้าม Execute Action
- ห้ามแก้ Measurement
- Learning มีหน้าที่สร้าง Learning Hypothesis เท่านั้น
- Decision Layer จะเป็นผู้ตัดสินใจขั้นต่อไป

CONTENT:
${JSON.stringify({
  id: content?.id || null,
  title: content?.title || null,
  status: content?.status || null,
  objective: content?.objective || null,
  attention_type:
    content?.attention_type || null,
  market_keyword:
    content?.market_keyword || null,
  angle: content?.angle || null,
  cta: content?.cta || null
})}

MEASUREMENT + INTELLIGENCE:
${JSON.stringify(intelligence)}

LEARNING:
${JSON.stringify(learning)}

ต้องคืนโครงสร้าง:

{
  "summary": "สรุปสั้นภาษาไทย",
  "observed_signals": ["สัญญาณจากข้อมูลจริง"],
  "learning": {
    "what_we_learned": "สิ่งที่เรียนรู้",
    "confidence": "LOW"
  },
  "problems": ["ปัญหาที่พบ"],
  "next_content": {
    "action": "WAIT",
    "direction": "ทิศทาง",
    "angle": "มุม Content",
    "cta": "CTA",
    "success_metric": "Metric"
  },
  "next_action": {
    "type": "WAIT",
    "reason": "เหตุผล"
  },
  "priority": "LOW"
}

Allowed action:
DISTRIBUTE, OPTIMIZE, SCALE, WAIT

Allowed priority:
LOW, MEDIUM, HIGH
`;
}

async function analyze(env, contentId = null) {
  if (!env.DB) {
    throw new Error(
      "D1 binding DB is missing"
    );
  }

  if (!env.AI) {
    throw new Error(
      "Workers AI binding AI is missing"
    );
  }

  await ensureTables(env.DB);

  const content =
    await getContent(
      env.DB,
      contentId
    );

  const measurements =
    await getMeasurements(
      env.DB,
      content?.id || contentId
    );

  const latestMeasurement =
    await getLatestMeasurement(
      env.DB,
      content?.id || contentId
    );

  const learningFeedback =
    await getLearningFeedback(
      env.DB,
      content?.id || contentId
    );

  const intelligence =
    buildIntelligence(
      measurements
    );

  const learning =
    buildLearning(
      measurements,
      intelligence,
      content
    );

  let aiStatus =
    "FALLBACK_ANALYZED";

  let aiText = null;
  let analysis = null;
  let aiError = null;

  try {
    const response =
      await env.AI.run(
        MODEL,
        {
          messages: [
            {
              role: "system",
              content:
                "Return ONLY valid JSON. No reasoning. No markdown."
            },
            {
              role: "user",
              content:
                buildPrompt(
                  learning,
                  intelligence,
                  content
                )
            }
          ],

          reasoning_effort: "low",

          max_completion_tokens: 1200,

          temperature: 0.1,

          response_format: {
            type: "json_object"
          }
        }
      );

    aiText =
      extractText(response);

    const parsed =
      parseJSON(aiText);

    if (parsed) {
      analysis =
        sanitizeAIAnalysis(
          parsed,
          learning
        );

      aiStatus =
        "AI_ANALYZED";
    }
  } catch (error) {
    aiError =
      error?.message ||
      String(error);
  }

  if (!analysis) {
    analysis =
      fallback(
        learning,
        content
      );
  }

  return {
    content,

    measurements,

    measurement_rounds:
      measurements.length,

    latest_measurement:
      latestMeasurement,

    learning_feedback:
      learningFeedback,

    intelligence,

    learning,

    ai: {
      status: aiStatus,

      model: MODEL,

      analysis,

      debug: {
        ai_called:
          aiText !== null,

        response_text_received:
          !!aiText,

        parsed_json:
          aiStatus ===
          "AI_ANALYZED",

        error:
          aiError
      }
    }
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

  const input =
    JSON.stringify({
      content:
        result.content,

      measurement_rounds:
        result.measurement_rounds,

      latest_measurement:
        result.latest_measurement,

      intelligence:
        result.intelligence,

      learning:
        result.learning,

      learning_feedback:
        result.learning_feedback
    });

  const output =
    JSON.stringify(
      result.ai.analysis
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
      "LEARNING_ANALYSIS",
      MODEL,
      input,
      output,
      result.ai.status,
      null,
      now
    )
    .run();

  const priority =
    upper(
      result.ai.analysis?.priority
    ) || "LOW";

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
      "LEARNING",
      "Learning AI Analysis",
      output,
      score,
      priority,
      "NEW",
      now
    )
    .run();

  result.ai.run_id =
    runId;

  result.ai.insight_id =
    insightId;

  return result;
}

function publicResult(
  result
) {
  return {
    success: true,

    layer: LAYER,

    version: VERSION,

    status: "ANALYZED",

    source_chain: {
      measurement:
        MEASUREMENT_SOURCE,

      intelligence:
        INTELLIGENCE_SOURCE,

      learning:
        LAYER,

      version:
        VERSION
    },

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

    latest_measurement:
      result.latest_measurement,

    measurement_rounds:
      result.measurement_rounds,

    intelligence:
      result.intelligence,

    learning_feedback:
      result.learning_feedback,

    learning:
      result.learning,

    ai:
      result.ai
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
      ) || null;

    const result =
      await analyze(
        context.env,
        contentId
      );

    return json({
      ...publicResult(result),

      mode: "preview",

      next_step:
        "Learning AI analysis ready. Decision Layer can consume this evidence."
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
      body?.mode || "preview";

    const contentId =
      body?.content_id || null;

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

      return json({
        ...publicResult(saved),

        mode: "execute",

        status: "EXECUTED",

        next_step:
          "Learning AI saved. Decision Layer can now consume the Learning result."
      });
    }

    return json({
      ...publicResult(result),

      mode: "preview",

      next_step:
        "Learning AI analysis ready."
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
