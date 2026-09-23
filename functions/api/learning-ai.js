// TATO-OS
// Learning AI V1.5
// Route: /api/learning-ai
// Primary source: CONTENT_ATTRIBUTION_V2

const MODEL = "@cf/zai-org/glm-4.7-flash";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
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

function rate(a, b) {
  return b > 0 ? Number(((a / b) * 100).toFixed(2)) : 0;
}

function extractText(response) {
  if (response == null) return null;

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

  if (
    response.result &&
    typeof response.result === "string"
  ) {
    return response.result.trim() || null;
  }

  if (typeof response.output_text === "string") {
    return response.output_text.trim() || null;
  }

  if (typeof response.content === "string") {
    return response.content.trim() || null;
  }

  if (Array.isArray(response.content)) {
    const value = response.content
      .map(function(item) {
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

  if (
    response.choices &&
    response.choices[0]
  ) {
    const choice = response.choices[0];

    if (typeof choice.text === "string") {
      return choice.text.trim() || null;
    }

    if (
      choice.message &&
      typeof choice.message.content === "string"
    ) {
      return choice.message.content.trim() || null;
    }

    if (
      choice.message &&
      Array.isArray(choice.message.content)
    ) {
      const value = choice.message.content
        .map(function(item) {
          if (typeof item === "string") return item;

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

function normalizeAction(value) {
  const allowed = [
    "OPTIMIZE",
    "REPEAT",
    "TEST",
    "WAIT"
  ];

  const action = s(value)
    .trim()
    .toUpperCase();

  return allowed.includes(action)
    ? action
    : "OPTIMIZE";
}

function normalizePriority(value) {
  const allowed = [
    "LOW",
    "MEDIUM",
    "HIGH"
  ];

  const priority = s(value)
    .trim()
    .toUpperCase();

  return allowed.includes(priority)
    ? priority
    : "MEDIUM";
}

function normalizeConfidence(value) {
  const allowed = [
    "LOW",
    "MEDIUM",
    "HIGH"
  ];

  const confidence = s(value)
    .trim()
    .toUpperCase();

  return allowed.includes(confidence)
    ? confidence
    : "MEDIUM";
}

function getMetrics(measurement) {
  return {
    attention: n(measurement.attention),
    product_views: n(measurement.product_views),
    clicks: n(measurement.clicks),
    engagements: n(measurement.engagements),
    customers: n(measurement.customers),
    orders: n(measurement.orders),
    revenue: n(measurement.revenue)
  };
}

function getConversion(measurement, metrics) {
  return {
    attention_to_view:
      n(measurement.attention_to_view) ||
      rate(
        metrics.product_views,
        metrics.attention
      ),

    view_to_click:
      n(measurement.view_to_click) ||
      rate(
        metrics.clicks,
        metrics.product_views
      ),

    click_to_customer:
      n(measurement.click_to_customer) ||
      rate(
        metrics.customers,
        metrics.clicks
      ),

    customer_to_order:
      n(measurement.customer_to_order) ||
      rate(
        metrics.orders,
        metrics.customers
      ),

    engagement_to_order:
      n(measurement.engagement_to_order) ||
      rate(
        metrics.orders,
        metrics.engagements
      )
  };
}

async function getLatestMeasurement(db) {
  try {
    return await db.prepare(
      "SELECT * FROM content_measurements " +
      "WHERE attribution_mode = 'CONTENT_ATTRIBUTION_V2' " +
      "ORDER BY measured_at DESC LIMIT 1"
    ).first();
  } catch (error) {
    throw new Error(
      "Cannot read CONTENT_ATTRIBUTION_V2 measurement: " +
      (error?.message || String(error))
    );
  }
}

async function getContent(db, contentId) {
  if (!contentId) return null;

  try {
    return await db.prepare(
      "SELECT * FROM content_engine " +
      "WHERE id = ? LIMIT 1"
    )
      .bind(contentId)
      .first();
  } catch (_) {
    return null;
  }
}

function fallback(measurement, metrics) {
  const attention = metrics.attention;
  const views = metrics.product_views;
  const clicks = metrics.clicks;
  const engagements = metrics.engagements;
  const customers = metrics.customers;
  const orders = metrics.orders;
  const revenue = metrics.revenue;

  let action = "WAIT";
  let priority = "LOW";
  let successMetric = "Attention";

  if (orders > 0 || revenue > 0) {
    action = "REPEAT";
    priority = "HIGH";
    successMetric = "Revenue";
  } else if (customers > 0) {
    action = "OPTIMIZE";
    priority = "HIGH";
    successMetric = "Customers";
  } else if (clicks > 0) {
    action = "OPTIMIZE";
    priority = "MEDIUM";
    successMetric = "Customers";
  } else if (views > 0 || engagements > 0) {
    action = "OPTIMIZE";
    priority = "MEDIUM";
    successMetric = "Clicks";
  } else if (attention > 0) {
    action = "OPTIMIZE";
    priority = "MEDIUM";
    successMetric = "Product Views";
  }

  let summary =
    "ยังไม่มี behavioral evidence เพียงพอ";

  let learning =
    "ยังไม่มีข้อมูลเพียงพอสำหรับการเรียนรู้";

  let direction =
    "รอข้อมูลพฤติกรรมเพิ่มก่อนปรับ Content";

  let confidence = "LOW";

  if (attention > 0) {
    summary =
      "Content เริ่มสร้าง Attention แล้ว";

    learning =
      "พบความสนใจจาก Content แต่ต้องติดตาม funnel ต่อ";

    direction =
      "ปรับ Content เพื่อพาผู้ชมไปยังขั้นถัดไป";

    confidence = "MEDIUM";
  }

  if (clicks > 0) {
    summary =
      "Content สร้าง Click แล้ว แต่ยังต้องเพิ่ม Conversion";

    learning =
      "มีพฤติกรรมการคลิก แต่ยังไม่พบ Customer";

    direction =
      "ปรับเส้นทางหลัง Click เพื่อเพิ่ม Customer";

    confidence = "MEDIUM";
  }

  if (customers > 0) {
    summary =
      "Content สามารถสร้าง Customer ได้";

    learning =
      "พบ Customer จาก Content และควรศึกษาจุดที่นำไปสู่ Conversion";

    direction =
      "ปรับข้อเสนอและเส้นทางจาก Customer ไป Order";

    confidence = "HIGH";
  }

  if (orders > 0 || revenue > 0) {
    summary =
      "พบ Conversion จาก Content";

    learning =
      "มีหลักฐานว่า Content เชื่อมโยงกับ Order หรือ Revenue";

    direction =
      "ทดสอบ Content ใหม่โดยใช้โครงสร้างที่สอดคล้องกับข้อมูล Conversion";

    confidence = "HIGH";
  }

  return {
    summary: summary,

    observed_signals: [
      "Attribution: " +
        s(
          measurement.attribution_mode
        ),

      "Attention: " +
        attention,

      "Product Views: " +
        views,

      "Clicks: " +
        clicks,

      "Engagements: " +
        engagements,

      "Customers: " +
        customers,

      "Orders: " +
        orders,

      "Revenue: " +
        revenue
    ],

    learning: {
      what_we_learned: learning,
      confidence: confidence
    },

    problems:
      orders > 0
        ? []
        : customers > 0
          ? ["ยังไม่มี Order"]
          : clicks > 0
            ? ["ยังไม่มี Customer"]
            : attention > 0
              ? ["ยังไม่มี Click หรือ Conversion"]
              : ["ยังไม่มี behavioral evidence"],

    next_content: {
      action: action,
      direction: direction,
      angle:
        "ใช้พฤติกรรมจริงของผู้ชมเป็นตัวกำหนดมุม Content",

      cta:
        "ดูรายละเอียดและทดลอง TATO",

      success_metric:
        successMetric
    },

    next_action: {
      type: action,
      reason: summary
    },

    priority: priority
  };
}

function normalizeAnalysis(
  analysis,
  measurement,
  metrics
) {
  const base =
    fallback(
      measurement,
      metrics
    );

  if (
    !analysis ||
    typeof analysis !== "object"
  ) {
    return base;
  }

  return {
    summary:
      s(analysis.summary) ||
      base.summary,

    observed_signals:
      Array.isArray(
        analysis.observed_signals
      )
        ? analysis.observed_signals
        : base.observed_signals,

    learning: {
      what_we_learned:
        s(
          analysis.learning &&
          analysis.learning.what_we_learned
        ) ||
        base.learning.what_we_learned,

      confidence:
        normalizeConfidence(
          analysis.learning &&
          analysis.learning.confidence
        )
    },

    problems:
      Array.isArray(analysis.problems)
        ? analysis.problems
        : base.problems,

    next_content: {
      action:
        normalizeAction(
          analysis.next_content &&
          analysis.next_content.action
        ),

      direction:
        s(
          analysis.next_content &&
          analysis.next_content.direction
        ) ||
        base.next_content.direction,

      angle:
        s(
          analysis.next_content &&
          analysis.next_content.angle
        ) ||
        base.next_content.angle,

      cta:
        s(
          analysis.next_content &&
          analysis.next_content.cta
        ) ||
        base.next_content.cta,

      success_metric:
        s(
          analysis.next_content &&
          analysis.next_content.success_metric
        ) ||
        base.next_content.success_metric
    },

    next_action: {
      type:
        normalizeAction(
          analysis.next_action &&
          analysis.next_action.type
        ),

      reason:
        s(
          analysis.next_action &&
          analysis.next_action.reason
        ) ||
        base.next_action.reason
    },

    priority:
      normalizePriority(
        analysis.priority
      )
  };
}

function buildPrompt(
  measurement,
  content,
  metrics,
  conversion
) {
  return JSON.stringify({
    task:
      "Analyze TATO Coffee content performance using the supplied CONTENT_ATTRIBUTION_V2 measurement.",

    rules: [
      "Use only supplied data.",
      "Do not invent data.",
      "Do not declare a winner.",
      "Do not rank content.",
      "Do not use old AGGREGATE_V1 data.",
      "Distinguish observed signals from recommendations.",
      "Return ONLY valid JSON."
    ],

    measurement: {
      id: measurement.id,
      content_id: measurement.content_id,
      measured_at: measurement.measured_at,
      measurement_start:
        measurement.measurement_start,
      status: measurement.status,
      attribution_mode:
        measurement.attribution_mode
    },

    content: content
      ? {
          id: content.id,
          title: content.title,
          status: content.status,
          objective:
            content.objective || null,
          attention_type:
            content.attention_type || null,
          market_keyword:
            content.market_keyword || null,
          angle:
            content.angle || null,
          cta:
            content.cta || null
        }
      : null,

    metrics: metrics,

    conversion: conversion,

    required_output: {
      summary:
        "สรุปสั้นภาษาไทย",

      observed_signals:
        ["สัญญาณที่พบจากข้อมูลจริง"],

      learning: {
        what_we_learned:
          "สิ่งที่เรียนรู้จากข้อมูล",

        confidence:
          "LOW | MEDIUM | HIGH"
      },

      problems:
        ["ปัญหาหรือ bottleneck ที่พบ"],

      next_content: {
        action:
          "OPTIMIZE | REPEAT | TEST | WAIT",

        direction:
          "ทิศทาง Content ถัดไป",

        angle:
          "มุม Content",

        cta:
          "CTA",

        success_metric:
          "Metric ที่ต้องติดตาม"
      },

      next_action: {
        type:
          "OPTIMIZE | REPEAT | TEST | WAIT",

        reason:
          "เหตุผลจากข้อมูล"
      },

      priority:
        "LOW | MEDIUM | HIGH"
    }
  });
}

async function analyzeAI(
  env,
  promptText
) {
  const debug = {
    ai_called: false,
    response_text_received: false,
    parsed_json: false,
    error: null,
    raw_response_type: null,
    raw_response_keys: [],
    provider_status: "NOT_CALLED"
  };

  try {
    debug.ai_called = true;
    debug.provider_status = "CALLED";

    const response =
      await env.AI.run(
        MODEL,
        {
          messages: [
            {
              role: "system",
              content:
                "Return ONLY valid JSON. No markdown. No explanation."
            },
            {
              role: "user",
              content: promptText
            }
          ],
          max_tokens: 1200,
          temperature: 0.1
        }
      );

    debug.raw_response_type =
      typeof response;

    if (
      response &&
      typeof response === "object"
    ) {
      debug.raw_response_keys =
        Object.keys(response);
    }

    const text =
      extractText(response);

    if (!text) {
      debug.provider_status =
        "EMPTY_RESPONSE";

      return {
        status:
          "FALLBACK_ANALYZED",

        analysis: null,

        debug: debug
      };
    }

    debug.response_text_received = true;

    const parsed =
      parseJSON(text);

    if (!parsed) {
      debug.provider_status =
        "INVALID_JSON";

      return {
        status:
          "FALLBACK_ANALYZED",

        analysis: null,

        debug: debug
      };
    }

    debug.parsed_json = true;
    debug.provider_status =
      "AI_RESPONSE_PARSED";

    return {
      status: "AI_ANALYZED",
      analysis: parsed,
      debug: debug
    };
  } catch (error) {
    debug.error =
      error?.message ||
      String(error);

    debug.provider_status =
      "ERROR";

    return {
      status:
        "FALLBACK_ANALYZED",

      analysis: null,

      debug: debug
    };
  }
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

async function save(
  env,
  result
) {
  await ensureTables(env.DB);

  const runId = id();
  const insightId = id();
  const now =
    new Date().toISOString();

  const input =
    JSON.stringify({
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

  await env.DB.prepare(
    "INSERT INTO ai_runs (" +
    "id, customer_id, run_type, model, " +
    "input_data, output_data, status, " +
    "tokens_used, created_at" +
    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
      now
    )
    .run();

  const priority =
    normalizePriority(
      result.ai.analysis &&
      result.ai.analysis.priority
    );

  const score =
    priority === "HIGH"
      ? 90
      : priority === "MEDIUM"
        ? 60
        : 30;

  await env.DB.prepare(
    "INSERT INTO ai_insights (" +
    "id, customer_id, run_id, " +
    "insight_type, title, content, " +
    "score, priority, status, created_at" +
    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
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

async function analyze(env) {
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

  const measurement =
    await getLatestMeasurement(
      env.DB
    );

  if (!measurement) {
    return {
      status:
        "WAITING_FOR_MEASUREMENT",

      measurement: null,

      content: null,

      metrics: {
        attention: 0,
        product_views: 0,
        clicks: 0,
        engagements: 0,
        customers: 0,
        orders: 0,
        revenue: 0
      },

      conversion: {
        attention_to_view: 0,
        view_to_click: 0,
        click_to_customer: 0,
        customer_to_order: 0,
        engagement_to_order: 0
      },

      ai: {
        status:
          "WAITING_FOR_MEASUREMENT",

        model: MODEL,

        analysis: {
          summary:
            "ยังไม่มี CONTENT_ATTRIBUTION_V2 measurement",

          observed_signals: [],

          learning: {
            what_we_learned:
              "ต้องสร้าง Measurement V2 ก่อน",

            confidence:
              "LOW"
          },

          problems: [
            "ไม่มี CONTENT_ATTRIBUTION_V2 measurement"
          ],

          next_content: {
            action: "WAIT",
            direction:
              "รอ Measurement V2",
            angle:
              "ยังไม่ตัดสินจากข้อมูลเก่า",
            cta:
              "รอข้อมูล",
            success_metric:
              "Attention"
          },

          next_action: {
            type: "WAIT",
            reason:
              "ยังไม่มีข้อมูล Measurement V2"
          },

          priority: "LOW"
        },

        debug: {
          ai_called: false,
          response_text_received: false,
          parsed_json: false,
          error: null,
          raw_response_type: null,
          raw_response_keys: [],
          provider_status:
            "WAITING_FOR_MEASUREMENT"
        }
      }
    };
  }

  const content =
    await getContent(
      env.DB,
      measurement.content_id
    );

  const metrics =
    getMetrics(measurement);

  const conversion =
    getConversion(
      measurement,
      metrics
    );

  const promptText =
    buildPrompt(
      measurement,
      content,
      metrics,
      conversion
    );

  const aiResult =
    await analyzeAI(
      env,
      promptText
    );

  const analysis =
    normalizeAnalysis(
      aiResult.analysis,
      measurement,
      metrics
    );

  return {
    status: "ANALYZED",

    measurement: measurement,

    content: content,

    metrics: metrics,

    conversion: conversion,

    ai: {
      status:
        aiResult.status,

      model: MODEL,

      analysis: analysis,

      debug: aiResult.debug
    }
  };
}

export async function onRequestGet(
  context
) {
  try {
    const result =
      await analyze(
        context.env
      );

    return json({
      success: true,

      layer:
        "LEARNING_AI_V1.5",

      mode:
        "preview",

      status:
        result.status,

      learning:
        result.measurement
          ? {
              source:
                "CONTENT_MEASUREMENT_V2",

              measurement:
                result.measurement,

              signal_type:
                "MEASUREMENT",

              measurement_start:
                result.measurement
                  .measurement_start,

              created_at:
                result.measurement
                  .created_at
            }
          : null,

      measurement:
        result.measurement
          ? {
              id:
                result.measurement.id,

              content_id:
                result.measurement
                  .content_id,

              status:
                result.measurement.status,

              measured_at:
                result.measurement
                  .measured_at,

              attribution_mode:
                result.measurement
                  .attribution_mode
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
        "NOT_DECLARED_IN_LEARNING_AI_V1.5",

      next_step:
        result.ai.status ===
        "AI_ANALYZED"
          ? "Learning AI passed. Next stage: Decision."
          : result.ai.status ===
            "WAITING_FOR_MEASUREMENT"
            ? "Create CONTENT_ATTRIBUTION_V2 measurement first."
            : "Inspect ai.debug before proceeding."
    });
  } catch (error) {
    return json(
      {
        success: false,
        layer:
          "LEARNING_AI_V1.5",
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

    const result =
      await analyze(
        context.env
      );

    if (
      mode === "execute"
    ) {
      if (
        result.status ===
        "WAITING_FOR_MEASUREMENT"
      ) {
        return json({
          success: true,
          layer:
            "LEARNING_AI_V1.5",
          mode:
            "execute",
          status:
            "WAITING_FOR_MEASUREMENT",
          measurement: null,
          ai:
            result.ai,
          winner_decision:
            "NOT_DECLARED_IN_LEARNING_AI_V1.5",
          next_step:
            "Create CONTENT_ATTRIBUTION_V2 measurement first."
        });
      }

      const saved =
        await save(
          context.env,
          result
        );

      return json({
        success: true,

        layer:
          "LEARNING_AI_V1.5",

        mode:
          "execute",

        status:
          "EXECUTED",

        measurement:
          saved.measurement,

        content:
          saved.content
            ? {
                id:
                  saved.content.id,

                title:
                  saved.content.title,

                status:
                  saved.content.status
              }
            : null,

        metrics:
          saved.metrics,

        conversion:
          saved.conversion,

        ai:
          saved.ai,

        winner_decision:
          "NOT_DECLARED_IN_LEARNING_AI_V1.5",

        next_step:
          "Learning AI saved. Next stage: Decision."
      });
    }

    return json({
      success: true,

      layer:
        "LEARNING_AI_V1.5",

      mode:
        "preview",

      status:
        result.status,

      measurement:
        result.measurement,

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
        "NOT_DECLARED_IN_LEARNING_AI_V1.5",

      next_step:
        result.ai.status ===
        "AI_ANALYZED"
          ? "Learning AI analysis ready."
          : result.ai.status ===
            "WAITING_FOR_MEASUREMENT"
            ? "Create CONTENT_ATTRIBUTION_V2 measurement first."
            : "Inspect ai.debug before proceeding."
    });
  } catch (error) {
    return json(
      {
        success: false,
        layer:
          "LEARNING_AI_V1.5",
        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}
