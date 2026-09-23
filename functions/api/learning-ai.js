// functions/api/learning-ai.js
// TATO OS — Learning AI V1.4
// Route: /api/learning-ai
//
// Flow:
// CONTENT
// → MEASUREMENT V2
// → LEARNING AI
// → INSIGHT
// → NEXT ACTION
//
// V1.4:
// - Uses content_measurements as the primary learning source
// - Keeps content attribution from Measurement V2
// - AI analyzes measured evidence instead of mixing global behavior
// - AI failure automatically falls back to deterministic analysis
// - GET = preview only
// - POST mode=execute = save learning result
// - Does NOT declare a WINNER
// - Parser-safe: avoids unnecessary template literals

const MODEL = "@cf/zai-org/glm-4.7-flash";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: HEADERS
    }
  );
}

function id() {
  if (
    typeof crypto !== "undefined" &&
    crypto.randomUUID
  ) {
    return crypto.randomUUID();
  }

  return String(Date.now()) + "-" +
    Math.random().toString(36).slice(2);
}

function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

function s(value) {
  return value == null ? "" : String(value);
}

function extractText(response) {
  if (!response) {
    return null;
  }

  if (typeof response === "string") {
    return response.trim() || null;
  }

  if (
    typeof response.response === "string"
  ) {
    return response.response.trim() || null;
  }

  if (
    response.result &&
    typeof response.result.response === "string"
  ) {
    return response.result.response.trim() || null;
  }

  if (
    typeof response.content === "string"
  ) {
    return response.content.trim() || null;
  }

  if (Array.isArray(response.content)) {
    const value = response.content
      .map(function(item) {
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

    if (value) {
      return value;
    }
  }

  const message =
    response?.choices?.[0]?.message;

  if (message) {
    if (
      typeof message.content === "string"
    ) {
      return (
        message.content.trim() || null
      );
    }

    if (
      Array.isArray(message.content)
    ) {
      const value = message.content
        .map(function(item) {
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

      if (value) {
        return value;
      }
    }
  }

  if (
    typeof response.output_text === "string"
  ) {
    return (
      response.output_text.trim() || null
    );
  }

  return null;
}

function parseJSON(value) {
  if (!value) {
    return null;
  }

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

  if (
    start >= 0 &&
    end > start
  ) {
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

function normalizeAction(value) {
  const action = s(value)
    .toUpperCase()
    .trim();

  if (
    action === "DISTRIBUTE" ||
    action === "OPTIMIZE" ||
    action === "SCALE" ||
    action === "WAIT"
  ) {
    return action;
  }

  return "WAIT";
}

function normalizePriority(value) {
  const priority = s(value)
    .toUpperCase()
    .trim();

  if (
    priority === "LOW" ||
    priority === "MEDIUM" ||
    priority === "HIGH"
  ) {
    return priority;
  }

  return "LOW";
}

function normalizeAnalysis(
  analysis,
  fallback
) {
  if (
    !analysis ||
    typeof analysis !== "object"
  ) {
    return fallback;
  }

  return {
    summary:
      s(analysis.summary) ||
      fallback.summary,

    observed_signals:
      Array.isArray(
        analysis.observed_signals
      )
        ? analysis.observed_signals
        : fallback.observed_signals,

    learning: {
      what_we_learned:
        s(
          analysis.learning?.what_we_learned
        ) ||
        fallback.learning.what_we_learned,

      confidence:
        normalizePriority(
          analysis.learning?.confidence
        ) === "HIGH"
          ? "HIGH"
          : normalizePriority(
              analysis.learning?.confidence
            ) === "MEDIUM"
            ? "MEDIUM"
            : "LOW"
    },

    problems:
      Array.isArray(analysis.problems)
        ? analysis.problems
        : fallback.problems,

    next_content: {
      action:
        normalizeAction(
          analysis.next_content?.action
        ),

      direction:
        s(
          analysis.next_content?.direction
        ) ||
        fallback.next_content.direction,

      angle:
        s(
          analysis.next_content?.angle
        ) ||
        fallback.next_content.angle,

      cta:
        s(
          analysis.next_content?.cta
        ) ||
        fallback.next_content.cta,

      success_metric:
        s(
          analysis.next_content?.success_metric
        ) ||
        fallback.next_content.success_metric
    },

    next_action: {
      type:
        normalizeAction(
          analysis.next_action?.type
        ),

      reason:
        s(
          analysis.next_action?.reason
        ) ||
        fallback.next_action.reason
    },

    priority:
      normalizePriority(
        analysis.priority
      )
  };
}

async function ensureTables(db) {
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS ai_runs (" +
    "id TEXT PRIMARY KEY," +
    "customer_id TEXT," +
    "run_type TEXT," +
    "model TEXT," +
    "input_data TEXT," +
    "output_data TEXT," +
    "status TEXT," +
    "tokens_used INTEGER," +
    "created_at TEXT" +
    ")"
  ).run();

  await db.prepare(
    "CREATE TABLE IF NOT EXISTS ai_insights (" +
    "id TEXT PRIMARY KEY," +
    "customer_id TEXT," +
    "run_id TEXT," +
    "insight_type TEXT," +
    "title TEXT," +
    "content TEXT," +
    "score REAL," +
    "priority TEXT," +
    "status TEXT," +
    "created_at TEXT" +
    ")"
  ).run();
}

async function getLatestMeasurement(db) {
  try {
    return await db
      .prepare(
        "SELECT * " +
        "FROM content_measurements " +
        "ORDER BY measured_at DESC " +
        "LIMIT 1"
      )
      .first();
  } catch (_) {
    return null;
  }
}

async function getContent(
  db,
  contentId
) {
  if (!contentId) {
    try {
      return await db
        .prepare(
          "SELECT * " +
          "FROM content_engine " +
          "ORDER BY created_at DESC " +
          "LIMIT 1"
        )
        .first();
    } catch (_) {
      return null;
    }
  }

  try {
    return await db
      .prepare(
        "SELECT * " +
        "FROM content_engine " +
        "WHERE id = ? " +
        "LIMIT 1"
      )
      .bind(contentId)
      .first();
  } catch (_) {
    return null;
  }
}

async function getLearningSource(db) {
  const measurement =
    await getLatestMeasurement(db);

  if (measurement) {
    return {
      source: "CONTENT_MEASUREMENT_V2",
      measurement: measurement,
      signal_type:
        measurement.status ===
        "WAITING_FOR_TRAFFIC"
          ? "NO_TRAFFIC"
          : measurement.status ===
            "CONVERTING"
            ? "CONVERSION"
            : "MEASUREMENT",
      measurement_start:
        measurement.measurement_start,
      created_at:
        measurement.created_at ||
        measurement.measured_at
    };
  }

  return {
    source: "NO_MEASUREMENT",
    measurement: null,
    signal_type: "NO_TRAFFIC",
    measurement_start: null,
    created_at: null
  };
}

function buildMetrics(measurement) {
  if (!measurement) {
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
    attention: n(
      measurement.attention
    ),

    product_views: n(
      measurement.product_views
    ),

    clicks: n(
      measurement.clicks
    ),

    engagements: n(
      measurement.engagements
    ),

    customers: n(
      measurement.customers
    ),

    orders: n(
      measurement.orders
    ),

    revenue: n(
      measurement.revenue
    )
  };
}

function conversions(metrics) {
  function rate(a, b) {
    if (b <= 0) {
      return 0;
    }

    return Number(
      ((a / b) * 100).toFixed(2)
    );
  }

  return {
    attention_to_view:
      rate(
        metrics.product_views,
        metrics.attention
      ),

    view_to_click:
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

function fallback(
  learning,
  content,
  metrics,
  conversion
) {
  const hasAttention =
    metrics.attention > 0;

  const hasTraffic =
    metrics.product_views > 0 ||
    metrics.clicks > 0;

  const hasEngagement =
    metrics.engagements > 0;

  const hasCustomer =
    metrics.customers > 0;

  const hasOrder =
    metrics.orders > 0;

  let action = "WAIT";
  let priority = "LOW";
  let successMetric = "Attention";

  if (hasOrder) {
    action = "SCALE";
    priority = "HIGH";
    successMetric = "Orders";
  } else if (hasCustomer) {
    action = "OPTIMIZE";
    priority = "MEDIUM";
    successMetric = "Customers";
  } else if (hasEngagement) {
    action = "OPTIMIZE";
    priority = "MEDIUM";
    successMetric = "Engagements";
  } else if (hasTraffic) {
    action = "OPTIMIZE";
    priority = "MEDIUM";
    successMetric = "Product Views";
  } else if (hasAttention) {
    action = "OPTIMIZE";
    priority = "MEDIUM";
    successMetric = "Product Views";
  } else {
    action = "DISTRIBUTE";
    priority = "LOW";
    successMetric = "Attention";
  }

  let learned =
    "ยังไม่มี behavioral evidence เพียงพอสำหรับการเรียนรู้";

  if (hasOrder) {
    learned =
      "Content มีหลักฐานเชื่อมโยงกับ Conversion และ Revenue";
  } else if (hasCustomer) {
    learned =
      "Content สามารถสร้าง Customer ได้ แต่ยังไม่มี Order ที่ยืนยัน";
  } else if (hasEngagement) {
    learned =
      "Content สามารถสร้าง Engagement แต่ยังไม่พบ Conversion";
  } else if (hasTraffic) {
    learned =
      "Content สามารถสร้าง Traffic แต่ยังไม่พบ Customer";
  } else if (hasAttention) {
    learned =
      "Content เริ่มได้รับ Attention แต่ยังไม่มี Traffic ต่อเนื่อง";
  }

  let summary =
    "ยังไม่มีข้อมูลเพียงพอสำหรับประเมิน Content";

  if (hasOrder) {
    summary =
      "พบ Conversion จาก Content และควรนำข้อมูลไปต่อยอด";
  } else if (hasCustomer) {
    summary =
      "Content เริ่มสร้าง Customer แต่ควรเก็บข้อมูล Conversion เพิ่ม";
  } else if (hasTraffic) {
    summary =
      "Content สร้าง Traffic แล้ว แต่ยังต้องเพิ่ม Conversion";
  } else if (hasAttention) {
    summary =
      "Content เริ่มได้รับ Attention แต่ยังต้องสร้าง Traffic";
  }

  const confidence =
    hasOrder
      ? "HIGH"
      : hasCustomer ||
        hasTraffic
        ? "MEDIUM"
        : "LOW";

  const problems = [];

  if (!hasAttention) {
    problems.push(
      "ยังไม่มี Attention"
    );
  }

  if (
    hasAttention &&
    !hasTraffic
  ) {
    problems.push(
      "Attention ยังไม่เปลี่ยนเป็น Traffic"
    );
  }

  if (
    hasTraffic &&
    !hasCustomer
  ) {
    problems.push(
      "ยังไม่มี Customer"
    );
  }

  if (
    hasCustomer &&
    !hasOrder
  ) {
    problems.push(
      "ยังไม่มี Order"
    );
  }

  return {
    summary: summary,

    observed_signals: [
      "Signal: " +
        s(
          learning.signal_type
        ),

      "Attention: " +
        String(metrics.attention),

      "Product Views: " +
        String(metrics.product_views),

      "Clicks: " +
        String(metrics.clicks),

      "Engagements: " +
        String(metrics.engagements),

      "Customers: " +
        String(metrics.customers),

      "Orders: " +
        String(metrics.orders),

      "Revenue: " +
        String(metrics.revenue)
    ],

    learning: {
      what_we_learned:
        learned,

      confidence:
        confidence
    },

    problems: problems,

    next_content: {
      action: action,

      direction:
        hasTraffic
          ? "ปรับ Content จากพฤติกรรมจริงเพื่อเพิ่ม Conversion"
          : "กระจาย Content เพื่อสร้างพฤติกรรมและ Traffic",

      angle:
        content?.angle ||
        "เชื่อมความสนใจของลูกค้ากับความต้องการเรื่องกาแฟ",

      cta:
        content?.cta ||
        "ดูรายละเอียดและทดลอง TATO",

      success_metric:
        successMetric
    },

    next_action: {
      type: action,

      reason:
        hasOrder
          ? "พบ Order จาก Content"
          : hasCustomer
            ? "พบ Customer จาก Content"
            : hasTraffic
              ? "พบ Traffic แต่ยังไม่มี Conversion"
              : "ยังต้องสร้าง Traffic"
    },

    priority: priority
  };
}

function buildPrompt(
  learning,
  content,
  metrics,
  conversion
) {
  const payload = {
    learning: learning,
    content: content
      ? {
          id: content.id || null,
          title:
            content.title || null,
          status:
            content.status || null,
          objective:
            content.objective || null,
          attention_type:
            content.attention_type ||
            null,
          market_keyword:
            content.market_keyword ||
            null,
          angle:
            content.angle || null,
          cta:
            content.cta || null
        }
      : null,
    metrics: metrics,
    conversion: conversion
  };

  return (
    "วิเคราะห์ข้อมูล Learning ของ TATO Coffee " +
    "จากข้อมูลที่ให้เท่านั้น " +
    "ตอบเป็น JSON เท่านั้น " +
    "ห้ามอธิบายเหตุผล " +
    "ห้ามใช้ Markdown " +
    "ห้ามประกาศ Winner " +
    "\n\nDATA:\n" +
    JSON.stringify(payload) +
    "\n\n" +
    "คืนโครงสร้างนี้เท่านั้น:\n" +
    "{\n" +
    '  "summary": "สรุปสั้นภาษาไทย",' +
    "\n" +
    '  "observed_signals": ["สัญญาณ"],' +
    "\n" +
    '  "learning": {' +
    "\n" +
    '    "what_we_learned": "สิ่งที่เรียนรู้",' +
    "\n" +
    '    "confidence": "LOW"' +
    "\n" +
    "  },\n" +
    '  "problems": ["ปัญหา"],' +
    "\n" +
    '  "next_content": {' +
    "\n" +
    '    "action": "DISTRIBUTE",' +
    "\n" +
    '    "direction": "ทิศทาง Content",' +
    "\n" +
    '    "angle": "มุม Content",' +
    "\n" +
    '    "cta": "CTA",' +
    "\n" +
    '    "success_metric": "Product Views"' +
    "\n" +
    "  },\n" +
    '  "next_action": {' +
    "\n" +
    '    "type": "DISTRIBUTE",' +
    "\n" +
    '    "reason": "เหตุผล"' +
    "\n" +
    "  },\n" +
    '  "priority": "LOW"' +
    "\n" +
    "}\n\n" +
    "Allowed action: " +
    "DISTRIBUTE, OPTIMIZE, SCALE, WAIT\n" +
    "Allowed priority: " +
    "LOW, MEDIUM, HIGH"
  );
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

  const learning =
    await getLearningSource(
      env.DB
    );

  const measurement =
    learning.measurement;

  const content =
    await getContent(
      env.DB,
      contentId ||
        measurement?.content_id ||
        null
    );

  const metrics =
    buildMetrics(
      measurement
    );

  const conversion =
    measurement
      ? {
          attention_to_view:
            n(
              measurement.attention_to_view
            ),

          view_to_click:
            n(
              measurement.view_to_click
            ),

          click_to_customer:
            n(
              measurement.click_to_customer
            ),

          customer_to_order:
            n(
              measurement.customer_to_order
            ),

          engagement_to_order:
            conversionFromMetrics(
              metrics
            ).engagement_to_order
        }
      : conversionFromMetrics(
          metrics
        );

  const fallbackAnalysis =
    fallback(
      learning,
      content,
      metrics,
      conversion
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
                "Return ONLY valid JSON. " +
                "No reasoning. " +
                "No markdown. " +
                "Do not declare a winner."
            },
            {
              role: "user",
              content:
                buildPrompt(
                  learning,
                  content,
                  metrics,
                  conversion
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
      extractText(
        response
      );

    analysis =
      parseJSON(
        aiText
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

  analysis =
    normalizeAnalysis(
      analysis,
      fallbackAnalysis
    );

  return {
    learning: learning,
    measurement: measurement,
    content: content,
    metrics: metrics,
    conversion: conversion,

    ai: {
      status: aiStatus,
      model: MODEL,
      analysis: analysis,

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

function conversionFromMetrics(
  metrics
) {
  return conversions(
    metrics
  );
}

async function save(
  env,
  result
) {
  const runId = id();
  const insightId = id();
  const createdAt =
    new Date().toISOString();

  const input =
    JSON.stringify({
      learning:
        result.learning,

      measurement:
        result.measurement,

      content:
        result.content,

      metrics:
        result.metrics,

      conversion:
        result.conversion
    });

  const output =
    JSON.stringify(
      result.ai.analysis
    );

  await env.DB
    .prepare(
      "INSERT INTO ai_runs (" +
      "id," +
      "customer_id," +
      "run_type," +
      "model," +
      "input_data," +
      "output_data," +
      "status," +
      "tokens_used," +
      "created_at" +
      ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      runId,
      null,
      "LEARNING_ANALYSIS",
      MODEL,
      input,
      output,
      result.ai.status,
      null,
      createdAt
    )
    .run();

  const priority =
    normalizePriority(
      result.ai.analysis?.priority
    );

  let score = 30;

  if (priority === "MEDIUM") {
    score = 60;
  }

  if (priority === "HIGH") {
    score = 90;
  }

  await env.DB
    .prepare(
      "INSERT INTO ai_insights (" +
      "id," +
      "customer_id," +
      "run_id," +
      "insight_type," +
      "title," +
      "content," +
      "score," +
      "priority," +
      "status," +
      "created_at" +
      ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      insightId,
      null,
      runId,
      "LEARNING",
      "LEARNING",
      "Learning AI Analysis",
      output,
      score,
      priority,
      "NEW",
      createdAt
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
  mode,
  nextStep
) {
  return {
    success: true,

    layer:
      "LEARNING_AI_V1.4",

    mode: mode,

    status:
      mode === "execute"
        ? "EXECUTED"
        : "ANALYZED",

    learning:
      result.learning,

    measurement:
      result.measurement
        ? {
            id:
              result.measurement.id,

            content_id:
              result.measurement.content_id,

            status:
              result.measurement.status,

            measured_at:
              result.measurement.measured_at
          }
        : null,

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

    metrics:
      result.metrics,

    conversion:
      result.conversion,

    ai:
      result.ai,

    winner_decision:
      "NOT_DECLARED_IN_LEARNING_AI_V1.4",

    next_step:
      nextStep
  };
}

export async function onRequestGet(
  context
) {
  try {
    const result =
      await analyze(
        context.env,
        null
      );

    return json(
      responsePayload(
        result,
        "preview",
        result.ai.status ===
          "AI_ANALYZED"
          ? "AI Learning analysis ready. Run POST execute to save."
          : "Fallback Learning analysis returned."
      )
    );
  } catch (error) {
    return json(
      {
        success: false,
        layer:
          "LEARNING_AI_V1.4",
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
    } catch (_) {
      body = {};
    }

    const mode =
      body?.mode ||
      "preview";

    if (
      mode !== "preview" &&
      mode !== "execute"
    ) {
      return json(
        {
          success: false,
          layer:
            "LEARNING_AI_V1.4",
          error:
            "Invalid mode. Use 'preview' or 'execute'."
        },
        400
      );
    }

    const result =
      await analyze(
        context.env,
        body?.content_id ||
          null
      );

    if (
      mode === "execute"
    ) {
      const saved =
        await save(
          context.env,
          result
        );

      return json(
        responsePayload(
          saved,
          "execute",
          "Learning AI saved. Next stage: AI → Action Engine."
        )
      );
    }

    return json(
      responsePayload(
        result,
        "preview",
        "AI Learning analysis ready."
      )
    );
  } catch (error) {
    return json(
      {
        success: false,
        layer:
          "LEARNING_AI_V1.4",
        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}
