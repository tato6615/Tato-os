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
// Learning AI DOES:
// - read Measurement / Intelligence outputs
// - identify repeated behavioral signals
// - use AI to interpret learning evidence
// - create learning hypotheses
// - create decision input
//
// Learning AI DOES NOT:
// - declare a winner
// - change strategy
// - execute actions

const MODEL = "@cf/zai-org/glm-4.7-flash";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const LAYER = "LEARNING_AI_V1";
const VERSION = "1.4";
const MEASUREMENT_SOURCE = "CONTENT_MEASUREMENT_ENGINE_V2.2";
const INTELLIGENCE_SOURCE = "INTELLIGENCE_LAYER_V2.1";
const ATTENTION_TYPE = "weighted_behavioral_signal";

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

function firstDefined(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }

  return null;
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
        if (typeof item === "string") return item;

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
    if (typeof message.content === "string") {
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

  let text = String(value)
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
      row.measured_at ||
      row.created_at ||
      null,
    measurement_start:
      row.measurement_start ||
      null,
    attribution_mode:
      row.attribution_mode ||
      null,
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

  for (const row of rows) {
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

function buildPatterns(rows, totals) {
  const rounds = rows.length;

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

  const persistentAttention =
    rounds >= 2 &&
    rows.filter(
      row => n(row.attention) > 0
    ).length >= 2;

  const persistentClicks =
    rounds >= 2 &&
    rows.filter(
      row => n(row.clicks) > 0
    ).length >= 2;

  const persistentProductViews =
    rounds >= 2 &&
    rows.filter(
      row => n(row.product_views) > 0
    ).length >= 2;

  const persistentCustomer =
    rounds >= 2 &&
    rows.filter(
      row => n(row.customers) > 0
    ).length >= 2;

  const persistentOrder =
    rounds >= 2 &&
    rows.filter(
      row => n(row.orders) > 0
    ).length >= 2;

  const persistentRevenue =
    rounds >= 2 &&
    rows.filter(
      row => n(row.revenue) > 0
    ).length >= 2;

  const clickWithoutProductView =
    clickPresent &&
    !productViewPresent;

  const persistentFunnelBlock =
    rounds >= 2 &&
    attentionPresent &&
    clickPresent &&
    !productViewPresent;

  const persistentNoCustomer =
    rounds >= 2 &&
    (attentionPresent || clickPresent) &&
    !customerPresent;

  const persistentNoOrder =
    rounds >= 2 &&
    (attentionPresent ||
      clickPresent ||
      productViewPresent ||
      customerPresent) &&
    !orderPresent;

  const persistentNoRevenue =
    rounds >= 2 &&
    (attentionPresent ||
      clickPresent ||
      productViewPresent ||
      customerPresent ||
      orderPresent) &&
    !revenuePresent;

  let state = "OBSERVING";

  if (persistentFunnelBlock) {
    state = "PERSISTENT_FUNNEL_BLOCK";
  } else if (persistentNoCustomer) {
    state = "PERSISTENT_NO_CUSTOMER";
  } else if (persistentNoOrder) {
    state = "PERSISTENT_NO_ORDER";
  } else if (persistentNoRevenue) {
    state = "PERSISTENT_NO_REVENUE";
  } else if (
    persistentAttention ||
    persistentClicks ||
    persistentProductViews ||
    persistentCustomer ||
    persistentOrder ||
    persistentRevenue
  ) {
    state = "PATTERN_DETECTED";
  }

  return {
    rounds,

    attention_present: attentionPresent,
    click_present: clickPresent,
    product_view_present: productViewPresent,
    customer_present: customerPresent,
    order_present: orderPresent,
    revenue_present: revenuePresent,

    persistent_attention:
      persistentAttention,

    persistent_clicks:
      persistentClicks,

    persistent_product_views:
      persistentProductViews,

    persistent_customer:
      persistentCustomer,

    persistent_order:
      persistentOrder,

    persistent_revenue:
      persistentRevenue,

    click_without_product_view:
      clickWithoutProductView,

    persistent_funnel_block:
      persistentFunnelBlock,

    persistent_no_customer:
      persistentNoCustomer,

    persistent_no_order:
      persistentNoOrder,

    persistent_no_revenue:
      persistentNoRevenue
  };
}

function conversions(metrics) {
  const rate = (a, b) =>
    b > 0
      ? Number(
          ((a / b) * 100).toFixed(2)
        )
      : 0;

  return {
    attention_to_product_view:
      rate(
        n(metrics.product_views),
        n(metrics.attention)
      ),

    product_view_to_click:
      rate(
        n(metrics.clicks),
        n(metrics.product_views)
      ),

    click_to_customer:
      rate(
        n(metrics.customers),
        n(metrics.clicks)
      ),

    customer_to_order:
      rate(
        n(metrics.orders),
        n(metrics.customers)
      ),

    engagement_to_order:
      rate(
        n(metrics.orders),
        n(metrics.engagements)
      )
  };
}

function buildLearning(
  measurements,
  intelligence,
  content
) {
  const totals = intelligence.totals;
  const patterns = intelligence.patterns;

  const signals = [];
  const hypotheses = [];
  const problems = [];

  if (patterns.attention_present) {
    signals.push({
      type: "ATTENTION_PRESENT",
      signal: ATTENTION_TYPE,
      value: totals.attention,
      meaning:
        "มีพฤติกรรมที่ระบบสามารถวัดเป็น Attention ได้"
    });
  }

  if (patterns.click_present) {
    signals.push({
      type: "CLICK_PRESENT",
      signal: "behavioral_signal",
      value: totals.clicks,
      meaning:
        "มีผู้ใช้แสดงพฤติกรรมต่อจาก Content"
    });
  }

  if (patterns.product_view_present) {
    signals.push({
      type: "PRODUCT_VIEW_PRESENT",
      signal: "downstream_behavior",
      value: totals.product_views,
      meaning:
        "มีหลักฐานว่าผู้ใช้เข้าสู่ Product View"
    });
  }

  if (patterns.customer_present) {
    signals.push({
      type: "CUSTOMER_PRESENT",
      signal: "conversion_signal",
      value: totals.customers,
      meaning:
        "มีหลักฐานของ Customer"
    });
  }

  if (patterns.order_present) {
    signals.push({
      type: "ORDER_PRESENT",
      signal: "conversion_signal",
      value: totals.orders,
      meaning:
        "มีหลักฐานของ Order"
    });
  }

  if (patterns.revenue_present) {
    signals.push({
      type: "REVENUE_PRESENT",
      signal: "business_outcome",
      value: totals.revenue,
      meaning:
        "มีหลักฐานของ Revenue"
    });
  }

  if (
    patterns.attention_present &&
    patterns.click_present
  ) {
    hypotheses.push({
      type: "ATTENTION_CAN_PRODUCE_CLICK",
      evidence: {
        attention: totals.attention,
        clicks: totals.clicks
      },
      learning:
        "Content สามารถสร้าง Attention และพาผู้ใช้ไปถึง Click ได้"
    });
  }

  if (
    patterns.click_without_product_view
  ) {
    hypotheses.push({
      type:
        "CLICK_TO_PRODUCT_VIEW_PATH_REQUIRES_INVESTIGATION",
      evidence: {
        clicks: totals.clicks,
        product_views:
          totals.product_views
      },
      learning:
        "มี Click แต่ยังไม่มีหลักฐานว่าเส้นทางหลัง Click ไปถึง Product View"
    });

    problems.push({
      type: "CLICK_TO_PRODUCT_VIEW_BLOCK",
      evidence: {
        clicks: totals.clicks,
        product_views:
          totals.product_views
      },
      learning:
        "มี Click แต่ยังไม่มีหลักฐานของ Product View"
    });
  }

  if (
    patterns.persistent_no_customer
  ) {
    problems.push({
      type: "NO_CUSTOMER",
      evidence: {
        rounds: intelligence.rounds,
        customers: totals.customers
      },
      learning:
        "ยังไม่มีหลักฐานเพียงพอว่าพฤติกรรมที่เกิดขึ้นนำไปสู่ Customer"
    });
  }

  if (patterns.persistent_no_order) {
    problems.push({
      type: "NO_ORDER",
      evidence: {
        rounds: intelligence.rounds,
        orders: totals.orders
      },
      learning:
        "ยังไม่มีหลักฐานของ Order"
    });
  }

  if (
    patterns.persistent_no_revenue
  ) {
    problems.push({
      type: "NO_REVENUE",
      evidence: {
        rounds: intelligence.rounds,
        revenue: totals.revenue
      },
      learning:
        "ยังไม่มีหลักฐานของ Revenue"
    });
  }

  let state = "OBSERVING";

  if (
    patterns.persistent_funnel_block
  ) {
    state = "DOWNSTREAM_BLOCK_DETECTED";
  } else if (
    signals.length > 0
  ) {
    state = "SIGNAL_LEARNED";
  }

  let confidence = "LOW";

  if (
    intelligence.rounds >= 10 &&
    problems.length > 0
  ) {
    confidence = "HIGH";
  } else if (
    intelligence.rounds >= 3
  ) {
    confidence = "MEDIUM";
  }

  let decisionInput =
    "CONTINUE_OBSERVATION";

  if (
    patterns.persistent_funnel_block
  ) {
    decisionInput =
      "INVESTIGATE_DOWNSTREAM_PATH";
  } else if (
    state === "SIGNAL_LEARNED"
  ) {
    decisionInput =
      "EVALUATE_NEXT_EXPERIMENT";
  }

  return {
    state,
    confidence,
    rounds: intelligence.rounds,

    signals,
    hypotheses,
    problems,

    funnel: {
      attention: totals.attention,
      clicks: totals.clicks,
      product_views:
        totals.product_views,
      customers: totals.customers,
      orders: totals.orders,
      revenue: totals.revenue
    },

    conversions: {
      attention_to_product_view:
        intelligence.conversion
          .attention_to_product_view,

      product_view_to_click:
        intelligence.conversion
          .product_view_to_click,

      click_to_customer:
        intelligence.conversion
          .click_to_customer,

      customer_to_order:
        intelligence.conversion
          .customer_to_order
    },

    decision_input: decisionInput,

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
      strategy_change: false,
      automatic_execution: false,
      action_executed: false,
      requires_decision_layer: true
    }
  };
}

function fallback(
  learning,
  intelligence,
  content
) {
  const totals = intelligence.totals;
  const patterns = intelligence.patterns;

  let priority = "LOW";

  if (
    learning.state ===
    "DOWNSTREAM_BLOCK_DETECTED"
  ) {
    priority = "HIGH";
  } else if (
    learning.state === "SIGNAL_LEARNED"
  ) {
    priority = "MEDIUM";
  }

  let action = "WAIT";

  if (
    learning.decision_input ===
    "INVESTIGATE_DOWNSTREAM_PATH"
  ) {
    action = "INVESTIGATE";
  } else if (
    learning.decision_input ===
    "EVALUATE_NEXT_EXPERIMENT"
  ) {
    action = "EVALUATE";
  }

  return {
    summary:
      learning.state ===
      "DOWNSTREAM_BLOCK_DETECTED"
        ? "ระบบพบ Attention และ Click ต่อเนื่อง แต่ยังไม่พบ Product View จึงตรวจพบจุดติดขัดใน Downstream Path"
        : learning.state ===
            "SIGNAL_LEARNED"
          ? "ระบบพบ Behavioral Signal ที่สามารถนำไปเรียนรู้ต่อได้"
          : "ระบบยังมีข้อมูลไม่เพียงพอสำหรับสร้าง Learning ที่มีความมั่นใจสูง",

    observed_signals:
      learning.signals.map(
        signal =>
          `${signal.type}: ${signal.value}`
      ),

    learning: {
      what_we_learned:
        learning.hypotheses[0]
          ?.learning ||
        "ยังไม่มี Learning ที่ชัดเจน",

      confidence:
        learning.confidence
    },

    problems:
      learning.problems.map(
        problem =>
          problem.learning
      ),

    next_content: {
      action,
      direction:
        patterns.persistent_funnel_block
          ? "ตรวจสอบเส้นทางหลัง Click ก่อนปรับ Content"
          : "เก็บ Behavioral Evidence เพิ่มก่อนตัดสินใจ",

      angle:
        content?.angle ||
        "ยังไม่เปลี่ยนมุม Content จากข้อมูลชุดนี้",

      cta:
        content?.cta ||
        "ยังไม่เปลี่ยน CTA จากข้อมูลชุดนี้",

      success_metric:
        patterns.persistent_funnel_block
          ? "Product Views"
          : "Behavioral Evidence"
    },

    next_action: {
      type: action,
      reason:
        learning.decision_input
    },

    priority
  };
}

function sanitizeAIAnalysis(
  analysis,
  learning,
  content
) {
  if (
    !analysis ||
    typeof analysis !== "object"
  ) {
    return null;
  }

  const allowedActions = [
    "DISTRIBUTE",
    "OPTIMIZE",
    "SCALE",
    "WAIT",
    "INVESTIGATE",
    "EVALUATE"
  ];

  const allowedPriority = [
    "LOW",
    "MEDIUM",
    "HIGH"
  ];

  const result = {
    summary:
      s(analysis.summary) ||
      "AI วิเคราะห์ข้อมูล Learning แล้ว",

    observed_signals:
      Array.isArray(
        analysis.observed_signals
      )
        ? analysis.observed_signals
            .map(s)
            .filter(Boolean)
            .slice(0, 10)
        : [],

    learning: {
      what_we_learned:
        s(
          analysis.learning
            ?.what_we_learned
        ) ||
        "ยังไม่มี Learning ที่ชัดเจน",

      confidence:
        [
          "LOW",
          "MEDIUM",
          "HIGH"
        ].includes(
          s(
            analysis.learning
              ?.confidence
          ).toUpperCase()
        )
          ? s(
              analysis.learning
                ?.confidence
            ).toUpperCase()
          : learning.confidence
    },

    problems:
      Array.isArray(
        analysis.problems
      )
        ? analysis.problems
            .map(s)
            .filter(Boolean)
            .slice(0, 10)
        : [],

    next_content: {
      action:
        allowedActions.includes(
          s(
            analysis.next_content
              ?.action
          ).toUpperCase()
        )
          ? s(
              analysis.next_content
                ?.action
            ).toUpperCase()
          : "WAIT",

      direction:
        s(
          analysis.next_content
            ?.direction
        ) ||
        "รอ Decision Layer พิจารณา",

      angle:
        s(
          analysis.next_content?.angle
        ) ||
        s(content?.angle),

      cta:
        s(
          analysis.next_content?.cta
        ) ||
        s(content?.cta),

      success_metric:
        s(
          analysis.next_content
            ?.success_metric
        ) ||
        "Behavioral Evidence"
    },

    next_action: {
      type:
        allowedActions.includes(
          s(
            analysis.next_action?.type
          ).toUpperCase()
        )
          ? s(
              analysis.next_action?.type
            ).toUpperCase()
          : "WAIT",

      reason:
        s(
          analysis.next_action?.reason
        ) ||
        learning.decision_input
    },

    priority:
      allowedPriority.includes(
        s(
          analysis.priority
        ).toUpperCase()
      )
        ? s(
            analysis.priority
          ).toUpperCase()
        : "LOW"
  };

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
  contentId
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
  contentId
) {
  if (!contentId) return [];

  try {
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

    return (result.results || [])
      .map(normalizeMeasurement)
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

async function getLatestMeasurement(
  db
) {
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

async function getLearningFeedback(
  db
) {
  try {
    const row = await db.prepare(`
      SELECT *
      FROM learning_feedback
      ORDER BY created_at DESC
      LIMIT 1
    `).first();

    return row || null;
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

  const conversion =
    conversions(totals);

  return {
    state:
      patterns.persistent_funnel_block
        ? "PERSISTENT_FUNNEL_BLOCK"
        : patterns.persistent_no_customer
          ? "PERSISTENT_NO_CUSTOMER"
          : patterns.persistent_no_order
            ? "PERSISTENT_NO_ORDER"
            : patterns.persistent_no_revenue
              ? "PERSISTENT_NO_REVENUE"
              : patterns.rounds > 0
                ? "PATTERN_DETECTED"
                : "OBSERVING",

    rounds:
      measurements.length,

    totals,

    patterns,

    conversion
  };
}

function buildPrompt(
  learningFeedback,
  content,
  measurements,
  intelligence,
  learning
) {
  return `
คุณคือ Learning Intelligence ของ TATO-OS

หน้าที่ของคุณคือวิเคราะห์ "หลักฐานที่ผ่าน Measurement และ Intelligence แล้ว"
เพื่อสรุปสิ่งที่ระบบเรียนรู้ได้

กฎสำคัญ:
1. ใช้เฉพาะข้อมูลที่ให้มา
2. ห้ามสร้างตัวเลขใหม่
3. ห้ามประกาศ Winner
4. ห้ามเปลี่ยน Strategy
5. ห้าม Execute Action
6. ห้ามอ้างว่า Action ถูกดำเนินการแล้ว
7. ถ้าหลักฐานไม่พอ ให้ระบุว่าไม่พอ
8. ต้องแยก Evidence ออกจาก Hypothesis
9. ต้องส่ง Decision Input ให้ Decision Layer พิจารณาต่อ
10. ตอบ JSON เท่านั้น
11. ภาษาไทย
12. ห้าม Markdown

SOURCE CHAIN:
Measurement:
${MEASUREMENT_SOURCE}

Intelligence:
${INTELLIGENCE_SOURCE}

Learning:
${LAYER}

CONTENT:
${JSON.stringify({
  id: content?.id || null,
  title: content?.title || null,
  status: content?.status || null,
  objective: content?.objective || null,
  attention_type:
    content?.attention_type ||
    ATTENTION_TYPE,
  market_keyword:
    content?.market_keyword || null,
  angle: content?.angle || null,
  cta: content?.cta || null
})}

LEARNING FEEDBACK:
${JSON.stringify(
  learningFeedback || null
)}

MEASUREMENTS:
${JSON.stringify(
  measurements
)}

INTELLIGENCE:
${JSON.stringify(
  intelligence
)}

RULE-BASED LEARNING:
${JSON.stringify(
  learning
)}

ตอบโครงสร้างนี้เท่านั้น:

{
  "summary": "สรุปสิ่งที่เกิดขึ้น",
  "observed_signals": [
    "หลักฐานที่พบ"
  ],
  "learning": {
    "what_we_learned": "สิ่งที่เรียนรู้จากหลักฐาน",
    "confidence": "LOW"
  },
  "problems": [
    "ปัญหาที่พบจากหลักฐาน"
  ],
  "next_content": {
    "action": "WAIT",
    "direction": "ทิศทางที่ควรส่งให้ Decision Layer พิจารณา",
    "angle": "มุม Content ถ้ามีหลักฐานรองรับ",
    "cta": "CTA ถ้ามีหลักฐานรองรับ",
    "success_metric": "Metric ที่ควรติดตาม"
  },
  "next_action": {
    "type": "WAIT",
    "reason": "เหตุผลจากหลักฐาน"
  },
  "priority": "LOW"
}

Allowed action:
DISTRIBUTE
OPTIMIZE
SCALE
WAIT
INVESTIGATE
EVALUATE

Allowed priority:
LOW
MEDIUM
HIGH
`;
}

async function analyze(env, contentId) {
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

  let content =
    await getContent(
      env.DB,
      contentId
    );

  if (!content) {
    const latest =
      await getLatestMeasurement(
        env.DB
      );

    if (latest?.content_id) {
      content =
        await getContent(
          env.DB,
          latest.content_id
        );
    }
  }

  const measurements =
    await getMeasurements(
      env.DB,
      content?.id
    );

  const fallbackMeasurement =
    measurements.length === 0
      ? await getLatestMeasurement(
          env.DB
        )
      : null;

  if (
    measurements.length === 0 &&
    fallbackMeasurement
  ) {
    measurements.push(
      fallbackMeasurement
    );
  }

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

  const learningFeedback =
    await getLearningFeedback(
      env.DB
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
                  learningFeedback,
                  content,
                  measurements,
                  intelligence,
                  learning
                )
            }
          ],

          reasoning_effort: "low",

          max_completion_tokens: 1400,

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

    analysis =
      sanitizeAIAnalysis(
        parsed,
        learning,
        content
      );

    if (analysis) {
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
        intelligence,
        content
      );
  }

  return {
    source_chain: {
      measurement:
        MEASUREMENT_SOURCE,
      intelligence:
        INTELLIGENCE_SOURCE,
      learning:
        LAYER,
      version: VERSION
    },

    learning_feedback:
      learningFeedback,

    content,

    measurements,

    latest_measurement:
      measurements[0] ||
      fallbackMeasurement ||
      null,

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
        error: aiError
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
      source_chain:
        result.source_chain,

      learning_feedback:
        result.learning_feedback,

      content:
        result.content,

      measurements:
        result.measurements,

      intelligence:
        result.intelligence,

      learning:
        result.learning
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
    s(
      result.ai.analysis?.priority
    ).toUpperCase() ||
    "LOW";

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
      "LEARNING",
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

function responsePayload(
  result,
  mode
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

    source_chain:
      result.source_chain,

    learning_feedback:
      result.learning_feedback,

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
      result.measurements.length,

    intelligence:
      result.intelligence,

    learning:
      result.learning,

    ai:
      result.ai,

    next_step:
      mode === "execute"
        ? "Learning AI saved. Next stage: Decision Layer."
        : "Learning AI analysis ready."
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
