````javascript
// TATO-OS
// Learning AI V1.5
// Route: /api/learning-ai
//
// PURPOSE
// ATTENTION → BEHAVIOR → MEASUREMENT → LEARNING AI
//
// V1.5 changes:
// - CONTENT_ATTRIBUTION_V2 is the only measurement source
// - AGGREGATE_V1 is ignored
// - No re-aggregation of behavior_events/customers/orders
// - Uses content-specific measurement data
// - Stronger Workers AI response extraction
// - AI response diagnostics
// - Deterministic fallback
// - Preview / Execute preserved
// - Never declares WINNER

const MODEL = "@cf/zai-org/glm-4.7-flash";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

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

function cleanText(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

/*
 * Workers AI response extraction.
 *
 * Different Workers AI model/runtime versions can return:
 * - string
 * - { response: "..." }
 * - { result: { response: "..." } }
 * - OpenAI-like choices
 * - content arrays
 * - output_text
 */
function extractText(response) {
  if (response == null) {
    return null;
  }

  if (typeof response === "string") {
    return cleanText(response);
  }

  if (typeof response.response === "string") {
    return cleanText(response.response);
  }

  if (
    response.result &&
    typeof response.result.response === "string"
  ) {
    return cleanText(response.result.response);
  }

  if (response.result && typeof response.result === "string") {
    return cleanText(response.result);
  }

  if (typeof response.output_text === "string") {
    return cleanText(response.output_text);
  }

  if (typeof response.content === "string") {
    return cleanText(response.content);
  }

  if (Array.isArray(response.content)) {
    const value = response.content
      .map(function(item) {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item.text === "string") {
          return item.text;
        }

        if (item && typeof item.content === "string") {
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

  if (
    response.choices &&
    Array.isArray(response.choices) &&
    response.choices.length > 0
  ) {
    const choice = response.choices[0];

    if (choice) {
      if (typeof choice.text === "string") {
        return cleanText(choice.text);
      }

      const message = choice.message;

      if (message) {
        if (typeof message.content === "string") {
          return cleanText(message.content);
        }

        if (Array.isArray(message.content)) {
          const value = message.content
            .map(function(item) {
              if (typeof item === "string") {
                return item;
              }

              if (item && typeof item.text === "string") {
                return item.text;
              }

              if (item && typeof item.content === "string") {
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
      }
    }
  }

  return null;
}

function parseJSON(value) {
  if (!value) {
    return null;
  }

  let text = s(value).trim();

  text = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(text);

    if (parsed && typeof parsed === "object") {
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

      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch (_) {}
  }

  return null;
}

function normalizeAction(value) {
  const action = s(value).toUpperCase();

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
  const priority = s(value).toUpperCase();

  if (
    priority === "LOW" ||
    priority === "MEDIUM" ||
    priority === "HIGH"
  ) {
    return priority;
  }

  return "LOW";
}

function normalizeConfidence(value) {
  const confidence = s(value).toUpperCase();

  if (
    confidence === "LOW" ||
    confidence === "MEDIUM" ||
    confidence === "HIGH"
  ) {
    return confidence;
  }

  return "LOW";
}

function normalizeAnalysis(analysis, metrics, content) {
  if (!analysis || typeof analysis !== "object") {
    return null;
  }

  const nextContent =
    analysis.next_content &&
    typeof analysis.next_content === "object"
      ? analysis.next_content
      : {};

  const nextAction =
    analysis.next_action &&
    typeof analysis.next_action === "object"
      ? analysis.next_action
      : {};

  const learning =
    analysis.learning &&
    typeof analysis.learning === "object"
      ? analysis.learning
      : {};

  const action = normalizeAction(
    nextContent.action || nextAction.type
  );

  const priority = normalizePriority(
    analysis.priority
  );

  const confidence = normalizeConfidence(
    learning.confidence
  );

  return {
    summary:
      s(analysis.summary) ||
      "ยังมีข้อมูลไม่เพียงพอสำหรับสรุปผล",

    observed_signals:
      Array.isArray(analysis.observed_signals)
        ? analysis.observed_signals.map(function(item) {
            return s(item);
          }).filter(Boolean)
        : [],

    learning: {
      what_we_learned:
        s(learning.what_we_learned) ||
        "ยังไม่มีหลักฐานเพียงพอสำหรับการเรียนรู้",

      confidence
    },

    problems:
      Array.isArray(analysis.problems)
        ? analysis.problems.map(function(item) {
            return s(item);
          }).filter(Boolean)
        : [],

    next_content: {
      action,

      direction:
        s(nextContent.direction) ||
        "เก็บข้อมูลพฤติกรรมเพิ่มเติม",

      angle:
        s(nextContent.angle) ||
        s(content && content.angle) ||
        "ใช้ข้อมูลพฤติกรรมจริงเพื่อพัฒนา Content",

      cta:
        s(nextContent.cta) ||
        s(content && content.cta) ||
        "ดูรายละเอียด TATO",

      success_metric:
        s(nextContent.success_metric) ||
        getPrimaryMetric(metrics)
    },

    next_action: {
      type: action,

      reason:
        s(nextAction.reason) ||
        "ใช้ข้อมูล Measurement ล่าสุดเป็นฐานในการตัดสินใจ"
    },

    priority
  };
}

function getPrimaryMetric(metrics) {
  if (n(metrics.orders) > 0) {
    return "Orders";
  }

  if (n(metrics.customers) > 0) {
    return "Customers";
  }

  if (n(metrics.clicks) > 0) {
    return "Product Views";
  }

  if (n(metrics.product_views) > 0) {
    return "Product Views";
  }

  if (n(metrics.engagements) > 0) {
    return "Engagements";
  }

  return "Attention";
}

function fallback(metrics, measurement, content) {
  const attention = n(metrics.attention);
  const views = n(metrics.product_views);
  const clicks = n(metrics.clicks);
  const engagements = n(metrics.engagements);
  const customers = n(metrics.customers);
  const orders = n(metrics.orders);
  const revenue = n(metrics.revenue);

  let action = "WAIT";
  let priority = "LOW";
  let metric = "Attention";

  if (orders > 0 || revenue > 0) {
    action = "SCALE";
    priority = "HIGH";
    metric = "Orders";
  } else if (customers > 0) {
    action = "OPTIMIZE";
    priority = "MEDIUM";
    metric = "Customers";
  } else if (clicks > 0) {
    action = "OPTIMIZE";
    priority = "MEDIUM";
    metric = "Product Views";
  } else if (views > 0 || engagements > 0) {
    action = "OPTIMIZE";
    priority = "MEDIUM";
    metric = views > 0
      ? "Product Views"
      : "Engagements";
  } else if (attention > 0) {
    action = "DISTRIBUTE";
    priority = "LOW";
    metric = "Attention";
  }

  const problems = [];

  if (attention === 0) {
    problems.push("ยังไม่มี Attention");
  }

  if (attention > 0 && views === 0) {
    problems.push("ยังไม่มี Product View");
  }

  if (clicks === 0 && views > 0) {
    problems.push("ยังไม่มี Click");
  }

  if (customers === 0 && clicks > 0) {
    problems.push("ยังไม่มี Customer");
  }

  if (orders === 0 && customers > 0) {
    problems.push("ยังไม่มี Order");
  }

  let summary = "ยังมีข้อมูลไม่เพียงพอ";

  if (orders > 0 || revenue > 0) {
    summary =
      "พบหลักฐาน Conversion จาก Content Measurement";
  } else if (customers > 0) {
    summary =
      "Content สร้าง Customer แล้ว แต่ยังต้องติดตาม Order";
  } else if (clicks > 0) {
    summary =
      "Content สร้าง Click แล้ว แต่ยังไม่พบ Customer";
  } else if (views > 0) {
    summary =
      "Content สร้าง Product View แล้ว แต่ยังไม่พบ Click";
  } else if (attention > 0) {
    summary =
      "Content ได้รับ Attention แต่ยังไม่เกิดพฤติกรรมถัดไป";
  }

  return {
    summary,

    observed_signals: [
      "Measurement ID: " +
        s(measurement && measurement.id),

      "Attribution: " +
        s(
          measurement &&
          measurement.attribution_mode
        ),

      "Attention: " + attention,
      "Product Views: " + views,
      "Clicks: " + clicks,
      "Engagements: " + engagements,
      "Customers: " + customers,
      "Orders: " + orders,
      "Revenue: " + revenue
    ],

    learning: {
      what_we_learned:
        orders > 0
          ? "Content มีหลักฐานเชื่อมโยงกับ Conversion"
          : customers > 0
            ? "Content สามารถสร้าง Customer ได้"
            : clicks > 0
              ? "Content สามารถสร้าง Click ได้ แต่ยังไม่พบ Customer"
              : views > 0
                ? "Content สามารถสร้าง Product View ได้"
                : attention > 0
                  ? "Content สามารถสร้าง Attention ได้ แต่ยังไม่พบพฤติกรรมถัดไป"
                  : "ยังไม่มี behavioral evidence เพียงพอ",

      confidence:
        orders > 0
          ? "HIGH"
          : customers > 0 || clicks > 0
            ? "MEDIUM"
            : "LOW"
    },

    problems,

    next_content: {
      action,

      direction:
        action === "SCALE"
          ? "ขยาย Content ที่มีหลักฐาน Conversion"
          : action === "OPTIMIZE"
            ? "ปรับ Content จากพฤติกรรมที่เกิดขึ้น"
            : action === "DISTRIBUTE"
              ? "เพิ่มการกระจาย Content เพื่อเก็บ behavioral data"
              : "รอข้อมูลเพิ่มเติมก่อนปรับ Content",

      angle:
        s(content && content.angle) ||
        "ใช้ความสนใจจริงของลูกค้าเป็นฐานในการพัฒนา Content",

      cta:
        s(content && content.cta) ||
        "ดูรายละเอียด TATO",

      success_metric: metric
    },

    next_action: {
      type: action,

      reason:
        action === "SCALE"
          ? "พบ Conversion จาก Measurement"
          : action === "OPTIMIZE"
            ? "พบพฤติกรรมที่สามารถนำไป Optimize"
            : action === "DISTRIBUTE"
              ? "มี Attention แต่ต้องเก็บข้อมูลเพิ่ม"
              : "ยังไม่มีหลักฐานเพียงพอสำหรับการดำเนินการ"
    },

    priority
  };
}

async function ensureTables(db) {
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS ai_runs (" +
    "id TEXT PRIMARY KEY, " +
    "customer_id TEXT, " +
    "run_type TEXT, " +
    "model TEXT, " +
    "input_data TEXT, " +
    "output_data TEXT, " +
    "status TEXT, " +
    "tokens_used INTEGER, " +
    "created_at TEXT" +
    ")"
  ).run();

  await db.prepare(
    "CREATE TABLE IF NOT EXISTS ai_insights (" +
    "id TEXT PRIMARY KEY, " +
    "customer_id TEXT, " +
    "run_id TEXT, " +
    "insight_type TEXT, " +
    "title TEXT, " +
    "content TEXT, " +
    "score REAL, " +
    "priority TEXT, " +
    "status TEXT, " +
    "created_at TEXT" +
    ")"
  ).run();
}

/*
 * IMPORTANT:
 * Only CONTENT_ATTRIBUTION_V2 is accepted.
 *
 * Legacy AGGREGATE_V1 is deliberately excluded.
 */
async function getLatestMeasurement(db) {
  try {
    const row = await db.prepare(
      "SELECT * FROM content_measurements " +
      "WHERE attribution_mode = 'CONTENT_ATTRIBUTION_V2' " +
      "ORDER BY measured_at DESC " +
      "LIMIT 1"
    ).first();

    return row || null;
  } catch (_) {
    return null;
  }
}

async function getLearning(db, measurement) {
  if (measurement) {
    return {
      source: "CONTENT_MEASUREMENT_V2",

      measurement,

      signal_type:
        measurement.status === "WAITING_FOR_TRAFFIC"
          ? "NO_TRAFFIC"
          : "MEASUREMENT",

      measurement_start:
        measurement.measurement_start || null,

      created_at:
        measurement.created_at ||
        measurement.measured_at ||
        null
    };
  }

  return {
    source: "CONTENT_MEASUREMENT_V2",

    measurement: null,

    signal_type: "NO_MEASUREMENT",

    measurement_start: null,

    created_at: null
  };
}

async function getContent(db, measurement) {
  try {
    if (measurement && measurement.content_id) {
      const row = await db.prepare(
        "SELECT * FROM content_engine " +
        "WHERE id = ? " +
        "LIMIT 1"
      )
        .bind(measurement.content_id)
        .first();

      if (row) {
        return row;
      }
    }
  } catch (_) {}

  try {
    return await db.prepare(
      "SELECT * FROM content_engine " +
      "ORDER BY created_at DESC " +
      "LIMIT 1"
    ).first();
  } catch (_) {
    return null;
  }
}

function getMeasurementMetrics(measurement) {
  return {
    attention: n(measurement && measurement.attention),

    product_views: n(
      measurement && measurement.product_views
    ),

    clicks: n(
      measurement && measurement.clicks
    ),

    engagements: n(
      measurement && measurement.engagements
    ),

    customers: n(
      measurement && measurement.customers
    ),

    orders: n(
      measurement && measurement.orders
    ),

    revenue: n(
      measurement && measurement.revenue
    )
  };
}

function getMeasurementConversion(measurement, metrics) {
  return {
    attention_to_view: n(
      measurement && measurement.attention_to_view
    ),

    view_to_click: n(
      measurement && measurement.view_to_click
    ),

    click_to_customer: n(
      measurement && measurement.click_to_customer
    ),

    customer_to_order: n(
      measurement && measurement.customer_to_order
    ),

    engagement_to_order:
      metrics.engagements > 0
        ? Number(
            (
              (metrics.orders /
                metrics.engagements) *
              100
            ).toFixed(2)
          )
        : 0
  };
}

function prompt(
  learning,
  content,
  metrics,
  conversion
) {
  return [
    "คุณคือ Learning AI ของ TATO Coffee Intelligence OS.",
    "",
    "หน้าที่:",
    "1. เรียนรู้จาก Measurement V2 เท่านั้น",
    "2. ห้ามสร้างข้อมูลที่ไม่มีใน input",
    "3. แยกสิ่งที่สังเกตได้ออกจากสิ่งที่อนุมาน",
    "4. ห้ามประกาศ WINNER",
    "5. ห้ามใช้ข้อมูลจาก Content อื่น",
    "6. ตอบเป็น JSON เท่านั้น",
    "",
    "Learning:",
    JSON.stringify(learning),
    "",
    "Content:",
    JSON.stringify({
      id: content && content.id
        ? content.id
        : null,

      title: content && content.title
        ? content.title
        : null,

      status: content && content.status
        ? content.status
        : null,

      objective: content && content.objective
        ? content.objective
        : null,

      attention_type:
        content && content.attention_type
          ? content.attention_type
          : null,

      market_keyword:
        content && content.market_keyword
          ? content.market_keyword
          : null,

      angle:
        content && content.angle
          ? content.angle
          : null,

      cta:
        content && content.cta
          ? content.cta
          : null
    }),
    "",
    "Metrics:",
    JSON.stringify(metrics),
    "",
    "Conversion:",
    JSON.stringify(conversion),
    "",
    "ตอบโครงสร้างนี้เท่านั้น:",
    "{",
    '  "summary": "สรุปสั้นภาษาไทย",',
    '  "observed_signals": ["สัญญาณจากข้อมูลจริง"],',
    '  "learning": {',
    '    "what_we_learned": "สิ่งที่เรียนรู้",',
    '    "confidence": "LOW"',
    "  },",
    '  "problems": ["ปัญหาที่พบ"],',
    '  "next_content": {',
    '    "action": "WAIT",',
    '    "direction": "ทิศทาง Content",',
    '    "angle": "มุม Content",',
    '    "cta": "CTA",',
    '    "success_metric": "Attention"',
    "  },",
    '  "next_action": {',
    '    "type": "WAIT",',
    '    "reason": "เหตุผลจากข้อมูล"',
    "  },",
    '  "priority": "LOW"',
    "}",
    "",
    "Allowed action:",
    "DISTRIBUTE, OPTIMIZE, SCALE, WAIT",
    "",
    "Allowed priority:",
    "LOW, MEDIUM, HIGH",
    "",
    "Allowed confidence:",
    "LOW, MEDIUM, HIGH"
  ].join("\n");
}

async function analyzeAI(
  env,
  learning,
  content,
  metrics,
  conversion
) {
  if (!env.AI) {
    return {
      status: "AI_UNAVAILABLE",
      text: null,
      analysis: null,
      error: "Workers AI binding AI is missing",
      raw_type: null,
      raw_keys: []
    };
  }

  const inputPrompt = prompt(
    learning,
    content,
    metrics,
    conversion
  );

  try {
    /*
     * Keep the request simple.
     * Some Workers AI model/runtime combinations
     * do not support every OpenAI-compatible option.
     */
    const response = await env.AI.run(
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
            content: inputPrompt
          }
        ],
        max_tokens: 1200,
        temperature: 0.1
      }
    );

    const rawType =
      response === null
        ? "null"
        : Array.isArray(response)
          ? "array"
          : typeof response;

    const rawKeys =
      response &&
      typeof response === "object"
        ? Object.keys(response)
        : [];

    const text = extractText(response);
    const parsed = parseJSON(text);

    if (parsed) {
      return {
        status: "AI_ANALYZED",
        text,
        analysis: parsed,
        error: null,
        raw_type: rawType,
        raw_keys: rawKeys
      };
    }

    return {
      status: "AI_RESPONSE_UNPARSED",
      text,
      analysis: null,
      error: null,
      raw_type: rawType,
      raw_keys: rawKeys
    };
  } catch (error) {
    return {
      status: "AI_ERROR",
      text: null,
      analysis: null,
      error:
        error && error.message
          ? error.message
          : String(error),
      raw_type: null,
      raw_keys: []
    };
  }
}

async function analyze(env) {
  if (!env.DB) {
    throw new Error(
      "D1 binding DB is missing"
    );
  }

  await ensureTables(env.DB);

  const measurement =
    await getLatestMeasurement(env.DB);

  const learning =
    await getLearning(
      env.DB,
      measurement
    );

  const content =
    await getContent(
      env.DB,
      measurement
    );

  /*
   * No Measurement V2 = do not fabricate metrics.
   */
  const metrics =
    measurement
      ? getMeasurementMetrics(measurement)
      : {
          attention: 0,
          product_views: 0,
          clicks: 0,
          engagements: 0,
          customers: 0,
          orders: 0,
          revenue: 0
        };

  const conversion =
    measurement
      ? getMeasurementConversion(
          measurement,
          metrics
        )
      : {
          attention_to_view: 0,
          view_to_click: 0,
          click_to_customer: 0,
          customer_to_order: 0,
          engagement_to_order: 0
        };

  let aiResult;

  if (!measurement) {
    aiResult = {
      status: "WAITING_FOR_MEASUREMENT",
      text: null,
      analysis: null,
      error: null,
      raw_type: null,
      raw_keys: []
    };
  } else {
    aiResult = await analyzeAI(
      env,
      learning,
      content,
      metrics,
      conversion
    );
  }

  let analysis = null;

  if (aiResult.analysis) {
    analysis = normalizeAnalysis(
      aiResult.analysis,
      metrics,
      content
    );
  }

  if (!analysis) {
    analysis = fallback(
      metrics,
      measurement,
      content
    );
  }

  const finalStatus =
    aiResult.status === "AI_ANALYZED" &&
    aiResult.analysis
      ? "AI_ANALYZED"
      : "FALLBACK_ANALYZED";

  return {
    learning,
    measurement,
    content,
    metrics,
    conversion,

    ai: {
      status: finalStatus,

      model: MODEL,

      analysis,

      debug: {
        ai_called:
          aiResult.status !==
          "WAITING_FOR_MEASUREMENT",

        response_text_received:
          !!aiResult.text,

        parsed_json:
          !!aiResult.analysis,

        error:
          aiResult.error,

        raw_response_type:
          aiResult.raw_type,

        raw_response_keys:
          aiResult.raw_keys,

        provider_status:
          aiResult.status
      }
    }
  };
}

async function save(env, result) {
  const runId = id();
  const insightId = id();
  const now = new Date().toISOString();

  const input = JSON.stringify({
    source: "CONTENT_MEASUREMENT_V2",

    measurement:
      result.measurement,

    learning:
      result.learning,

    content:
      result.content,

    metrics:
      result.metrics,

    conversion:
      result.conversion
  });

  const output =
    JSON.stringify(result.ai.analysis);

  await env.DB.prepare(
    "INSERT INTO ai_runs (" +
    "id, " +
    "customer_id, " +
    "run_type, " +
    "model, " +
    "input_data, " +
    "output_data, " +
    "status, " +
    "tokens_used, " +
    "created_at" +
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
    "id, " +
    "customer_id, " +
    "run_id, " +
    "insight_type, " +
    "title, " +
    "content, " +
    "score, " +
    "priority, " +
    "status, " +
    "created_at" +
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

  result.ai.run_id = runId;
  result.ai.insight_id = insightId;

  return result;
}

function responsePayload(
  result,
  mode,
  status
) {
  return {
    success: true,

    layer: "LEARNING_AI_V1.5",

    mode,

    status,

    learning: result.learning,

    measurement:
      result.measurement
        ? {
            id: result.measurement.id,
            content_id:
              result.measurement.content_id,
            status:
              result.measurement.status,
            measured_at:
              result.measurement.measured_at,
            attribution_mode:
              result.measurement.attribution_mode
          }
        : null,

    content:
      result.content
        ? {
            id: result.content.id,
            title: result.content.title,
            status: result.content.status
          }
        : null,

    metrics: result.metrics,

    conversion:
      result.conversion,

    ai: result.ai,

    winner_decision:
      "NOT_DECLARED_IN_LEARNING_AI_V1.5",

    next_step:
      result.ai.status === "AI_ANALYZED"
        ? "Learning AI analysis ready. Run POST execute to save."
        : result.ai.debug.provider_status ===
          "WAITING_FOR_MEASUREMENT"
          ? "Run Content Measurement V2 before Learning AI."
          : "Learning AI used deterministic fallback. Inspect debug before execute."
  };
}

export async function onRequestGet(context) {
  try {
    const result =
      await analyze(context.env);

    return json(
      responsePayload(
        result,
        "preview",
        "ANALYZED"
      )
    );
  } catch (error) {
    return json(
      {
        success: false,
        layer: "LEARNING_AI_V1.5",
        error:
          error && error.message
            ? error.message
            : String(error)
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
      body && body.mode
        ? body.mode
        : "preview";

    const result =
      await analyze(context.env);

    if (mode === "execute") {
      const saved =
        await save(
          context.env,
          result
        );

      return json(
        responsePayload(
          saved,
          "execute",
          "EXECUTED"
        )
      );
    }

    return json(
      responsePayload(
        result,
        "preview",
        "ANALYZED"
      )
    );
  } catch (error) {
    return json(
      {
        success: false,
        layer: "LEARNING_AI_V1.5",
        error:
          error && error.message
            ? error.message
            : String(error)
      },
      500
    );
  }
}
````
