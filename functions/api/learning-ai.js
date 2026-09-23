// TATO-OS
// Learning AI V1.7
// Purpose: Learn from CONTENT_ATTRIBUTION_V2 measurement
// No winner decision

const LAYER = "LEARNING_AI_V1.7";
const MODEL = "@cf/zai-org/glm-4.7-flash";
const ATTRIBUTION_MODE = "CONTENT_ATTRIBUTION_V2";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function rate(a, b) {
  a = safeNumber(a);
  b = safeNumber(b);
  return b > 0 ? Number((a / b).toFixed(4)) : 0;
}

async function getLatestMeasurement(env) {
  const result = await env.DB.prepare(`
    SELECT *
    FROM content_measurements
    WHERE attribution_mode = ?
      AND status = 'MEASURED'
    ORDER BY measured_at DESC
    LIMIT 1
  `).bind(ATTRIBUTION_MODE).all();

  return result.results?.[0] || null;
}

async function getContent(env, contentId) {
  if (!contentId) return null;

  const result = await env.DB.prepare(`
    SELECT *
    FROM content_engine
    WHERE id = ?
    LIMIT 1
  `).bind(contentId).all();

  return result.results?.[0] || null;
}

function getMetrics(measurement) {
  return {
    attention: safeNumber(measurement.attention),
    product_views: safeNumber(measurement.product_views),
    clicks: safeNumber(measurement.clicks),
    engagements: safeNumber(measurement.engagements),
    customers: safeNumber(measurement.customers),
    orders: safeNumber(measurement.orders),
    revenue: safeNumber(measurement.revenue)
  };
}

function getConversion(measurement, metrics) {
  return {
    attention_to_view:
      safeNumber(measurement.attention_to_view) ||
      rate(metrics.product_views, metrics.attention),

    view_to_click:
      safeNumber(measurement.view_to_click) ||
      rate(metrics.clicks, metrics.product_views),

    click_to_customer:
      safeNumber(measurement.click_to_customer) ||
      rate(metrics.customers, metrics.clicks),

    customer_to_order:
      safeNumber(measurement.customer_to_order) ||
      rate(metrics.orders, metrics.customers),

    engagement_to_order:
      rate(metrics.orders, metrics.engagements)
  };
}

function buildPrompt(measurement, content, metrics, conversion) {
  return `
You are the Learning AI for TATO Coffee.

Analyze ONLY this CONTENT_ATTRIBUTION_V2 measurement.

Rules:
- Do NOT use old measurements.
- Do NOT use AGGREGATE_V1.
- Do NOT declare a winner.
- Do NOT invent data.
- Base conclusions only on the supplied evidence.

Return one JSON object matching this structure:

{
  "summary": "short factual summary",
  "observed_signals": [],
  "learning": {
    "what_we_learned": "what the measured behavior tells us",
    "confidence": "LOW|MEDIUM|HIGH"
  },
  "problems": [],
  "next_content": {
    "action": "OPTIMIZE|REPEAT|TEST|WAIT",
    "direction": "specific direction",
    "angle": "specific content angle",
    "cta": "specific CTA",
    "success_metric": "Attention|Product Views|Clicks|Engagements|Customers|Orders|Revenue"
  },
  "next_action": {
    "type": "OPTIMIZE|REPEAT|TEST|WAIT",
    "reason": "reason based only on evidence"
  },
  "priority": "LOW|MEDIUM|HIGH"
}

CONTENT:
${JSON.stringify(content || {}, null, 2)}

MEASUREMENT:
${JSON.stringify(measurement, null, 2)}

METRICS:
${JSON.stringify(metrics, null, 2)}

CONVERSION:
${JSON.stringify(conversion, null, 2)}
`;
}

function collectText(value, depth = 0, visited = new Set()) {
  if (depth > 8 || value == null) return "";

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return "";

    if (
      text.startsWith("{") ||
      text.startsWith("[") ||
      text.includes('"summary"') ||
      text.includes('"learning"') ||
      text.includes('"next_content"')
    ) {
      return text;
    }

    return text;
  }

  if (typeof value !== "object") return "";

  if (visited.has(value)) return "";
  visited.add(value);

  const preferredKeys = [
    "response",
    "output_text",
    "text",
    "content",
    "message",
    "choices",
    "result"
  ];

  for (const key of preferredKeys) {
    if (!(key in value)) continue;

    const found = collectText(
      value[key],
      depth + 1,
      visited
    );

    if (found) return found;
  }

  for (const key of Object.keys(value)) {
    if (
      key === "usage" ||
      key === "prompt_token_ids" ||
      key === "kv_transfer_params" ||
      key === "prompt_logprobs"
    ) {
      continue;
    }

    const found = collectText(
      value[key],
      depth + 1,
      visited
    );

    if (found) return found;
  }

  return "";
}

function extractResponseText(response) {
  return collectText(response);
}

function cleanJSON(text) {
  if (!text) return "";

  let cleaned = String(text).trim();

  cleaned = cleaned.replace(/^```json\s*/i, "");
  cleaned = cleaned.replace(/^```\s*/i, "");
  cleaned = cleaned.replace(/\s*```$/i, "");

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");

  if (first >= 0 && last > first) {
    cleaned = cleaned.slice(first, last + 1);
  }

  return cleaned.trim();
}

function parseJSON(text) {
  const cleaned = cleanJSON(text);

  if (!cleaned) return null;

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function fallbackAnalysis(metrics) {
  let summary = "ยังมีข้อมูลไม่เพียงพอสำหรับการเรียนรู้";
  let whatWeLearned = "ต้องเก็บพฤติกรรมเพิ่มเติมก่อนตัดสินใจ";
  let action = "WAIT";
  let direction = "เก็บข้อมูลพฤติกรรมเพิ่มเติม";
  let angle = "ยังไม่สรุปมุม Content จากข้อมูลไม่เพียงพอ";
  let cta = "รอข้อมูล";
  let successMetric = "Attention";
  let reason = "ข้อมูลยังไม่เพียงพอ";
  let priority = "LOW";
  let confidence = "LOW";
  const problems = [];

  if (
    metrics.customers > 0 ||
    metrics.orders > 0 ||
    metrics.revenue > 0
  ) {
    summary = "Content มีสัญญาณ Conversion จากพฤติกรรมจริง";
    whatWeLearned = "พบพฤติกรรมที่เชื่อมต่อไปถึง Customer หรือ Order";
    action = "TEST";
    direction = "ทดสอบรูปแบบ Content ที่สร้าง Conversion";
    angle = "ใช้รูปแบบและเส้นทางที่นำไปสู่ Conversion มาทดสอบต่อ";
    cta = "ดูรายละเอียดและทดลอง TATO";
    successMetric = metrics.revenue > 0 ? "Revenue" : "Orders";
    reason = "พบ Conversion จากข้อมูลที่วัดได้";
    priority = "HIGH";
    confidence = "MEDIUM";
  } else if (metrics.clicks > 0) {
    summary = "Content สร้าง Click แล้ว แต่ยังต้องเพิ่ม Conversion";
    whatWeLearned = "มีพฤติกรรมการคลิก แต่ยังไม่พบ Customer";
    action = "OPTIMIZE";
    direction = "ปรับเส้นทางหลัง Click เพื่อเพิ่ม Customer";
    angle = "ใช้พฤติกรรมจริงของผู้ชมเป็นตัวกำหนดมุม Content";
    cta = "ดูรายละเอียดและทดลอง TATO";
    successMetric = "Customers";
    reason = "Content สร้าง Click แล้ว แต่ยังต้องเพิ่ม Conversion";
    priority = "MEDIUM";
    confidence = "MEDIUM";
    problems.push("ยังไม่มี Customer");
  } else if (metrics.attention > 0) {
    summary = "Content ได้รับ Attention แต่ยังไม่มี Click";
    whatWeLearned = "มี Attention แต่ยังไม่พบพฤติกรรมต่อเนื่องถึง Click";
    action = "OPTIMIZE";
    direction = "ปรับ Content และ CTA เพื่อเพิ่ม Click";
    angle = "ทดสอบมุมที่เชื่อม Attention ไปสู่ความสนใจเชิงลึก";
    cta = "ดูรายละเอียด TATO";
    successMetric = "Clicks";
    reason = "มี Attention แต่ยังไม่มี Click";
    priority = "MEDIUM";
    confidence = "MEDIUM";
    problems.push("ยังไม่มี Click");
  }

  return {
    summary,
    observed_signals: [
      `Attribution: ${ATTRIBUTION_MODE}`,
      `Attention: ${metrics.attention}`,
      `Product Views: ${metrics.product_views}`,
      `Clicks: ${metrics.clicks}`,
      `Engagements: ${metrics.engagements}`,
      `Customers: ${metrics.customers}`,
      `Orders: ${metrics.orders}`,
      `Revenue: ${metrics.revenue}`
    ],
    learning: {
      what_we_learned: whatWeLearned,
      confidence
    },
    problems,
    next_content: {
      action,
      direction,
      angle,
      cta,
      success_metric: successMetric
    },
    next_action: {
      type: action,
      reason
    },
    priority
  };
}

async function analyzeAI(env, promptText, metrics) {
  const debug = {
    ai_called: false,
    response_text_received: false,
    parsed_json: false,
    error: null,
    raw_response_type: null,
    raw_response_keys: [],
    raw_choice_keys: [],
    provider_status: null
  };

  try {
    debug.ai_called = true;

    const response = await env.AI.run(MODEL, {
      messages: [
        {
          role: "system",
          content: "Return ONLY one valid JSON object. No markdown. No explanation."
        },
        {
          role: "user",
          content: promptText
        }
      ],
      response_format: {
        type: "json_object"
      },
      max_completion_tokens: 1200,
      temperature: 0.1
    });

    debug.raw_response_type = typeof response;

    if (response && typeof response === "object") {
      debug.raw_response_keys = Object.keys(response);

      if (Array.isArray(response.choices) && response.choices[0]) {
        debug.raw_choice_keys =
          typeof response.choices[0] === "object"
            ? Object.keys(response.choices[0])
            : [];
      }
    }

    const responseText = extractResponseText(response);

    if (responseText) {
      debug.response_text_received = true;
    }

    const parsed = parseJSON(responseText);

    if (parsed) {
      debug.parsed_json = true;
      debug.provider_status = "AI_RESPONSE_PARSED";

      return {
        status: "AI_ANALYZED",
        analysis: parsed,
        debug
      };
    }

    debug.provider_status = "EMPTY_OR_INVALID_RESPONSE";

    return {
      status: "FALLBACK_ANALYZED",
      analysis: fallbackAnalysis(metrics),
      debug
    };
  } catch (error) {
    debug.error = error?.message || String(error);
    debug.provider_status = "AI_ERROR";

    return {
      status: "FALLBACK_ANALYZED",
      analysis: fallbackAnalysis(metrics),
      debug
    };
  }
}

async function saveLearning(
  env,
  measurement,
  content,
  metrics,
  conversion,
  aiResult
) {
  const runId = crypto.randomUUID();
  const insightId = crypto.randomUUID();
  const now = new Date().toISOString();

  const inputData = {
    source: ATTRIBUTION_MODE,
    measurement,
    content,
    metrics,
    conversion
  };

  const outputData = {
    layer: LAYER,
    status: aiResult.status,
    analysis: aiResult.analysis,
    debug: aiResult.debug
  };

  await env.DB.prepare(`
    INSERT INTO ai_runs
    (
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
  `).bind(
    runId,
    null,
    "LEARNING",
    MODEL,
    JSON.stringify(inputData),
    JSON.stringify(outputData),
    aiResult.status,
    null,
    now
  ).run();

  await env.DB.prepare(`
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    insightId,
    null,
    runId,
    "CONTENT_LEARNING",
    aiResult.analysis?.summary || "Content Learning",
    JSON.stringify(aiResult.analysis),
    null,
    aiResult.analysis?.priority || "MEDIUM",
    "ACTIVE",
    now
  ).run();

  return {
    run_id: runId,
    insight_id: insightId
  };
}

async function handlePreview(env) {
  const measurement = await getLatestMeasurement(env);

  if (!measurement) {
    return json({
      success: true,
      layer: LAYER,
      mode: "preview",
      status: "WAITING_FOR_MEASUREMENT",
      learning: null,
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
        status: "WAITING_FOR_MEASUREMENT",
        model: MODEL,
        analysis: null,
        debug: {
          ai_called: false,
          response_text_received: false,
          parsed_json: false,
          error: null,
          raw_response_type: null,
          raw_response_keys: [],
          raw_choice_keys: [],
          provider_status: "WAITING_FOR_MEASUREMENT"
        }
      },
      winner_decision: "NOT_DECLARED_IN_LEARNING_AI_V1.7",
      next_step: "Create CONTENT_ATTRIBUTION_V2 measurement first."
    });
  }

  const content = await getContent(env, measurement.content_id);
  const metrics = getMetrics(measurement);
  const conversion = getConversion(measurement, metrics);

  const promptText = buildPrompt(
    measurement,
    content,
    metrics,
    conversion
  );

  const aiResult = await analyzeAI(
    env,
    promptText,
    metrics
  );

  return json({
    success: true,
    layer: LAYER,
    mode: "preview",
    status: "ANALYZED",

    learning: {
      source: ATTRIBUTION_MODE,
      measurement,
      signal_type: "MEASUREMENT",
      measurement_start: measurement.measurement_start,
      created_at: measurement.created_at
    },

    measurement: {
      id: measurement.id,
      content_id: measurement.content_id,
      status: measurement.status,
      measured_at: measurement.measured_at,
      attribution_mode: measurement.attribution_mode
    },

    content: content
      ? {
          id: content.id,
          title: content.title,
          status: content.status
        }
      : null,

    metrics,
    conversion,

    ai: {
      status: aiResult.status,
      model: MODEL,
      analysis: aiResult.analysis,
      debug: aiResult.debug
    },

    winner_decision: "NOT_DECLARED_IN_LEARNING_AI_V1.7",

    next_step:
      aiResult.status === "AI_ANALYZED"
        ? "Learning AI analyzed successfully. POST to save Learning."
        : "AI response was not parsed. Inspect ai.debug."
  });
}

async function handleExecute(env) {
  const measurement = await getLatestMeasurement(env);

  if (!measurement) {
    return json({
      success: false,
      layer: LAYER,
      mode: "execute",
      status: "WAITING_FOR_MEASUREMENT",
      message: "No CONTENT_ATTRIBUTION_V2 measurement found."
    }, 400);
  }

  const content = await getContent(env, measurement.content_id);
  const metrics = getMetrics(measurement);
  const conversion = getConversion(measurement, metrics);

  const promptText = buildPrompt(
    measurement,
    content,
    metrics,
    conversion
  );

  const aiResult = await analyzeAI(
    env,
    promptText,
    metrics
  );

  const saved = await saveLearning(
    env,
    measurement,
    content,
    metrics,
    conversion,
    aiResult
  );

  return json({
    success: true,
    layer: LAYER,
    mode: "execute",
    status: aiResult.status,

    measurement: {
      id: measurement.id,
      content_id: measurement.content_id,
      attribution_mode: measurement.attribution_mode
    },

    metrics,
    conversion,

    ai: {
      status: aiResult.status,
      model: MODEL,
      analysis: aiResult.analysis,
      debug: aiResult.debug
    },

    saved,

    winner_decision: "NOT_DECLARED_IN_LEARNING_AI_V1.7",

    next_step:
      aiResult.status === "AI_ANALYZED"
        ? "Learning saved. Proceed to Decision layer."
        : "Learning saved as fallback. Inspect ai.debug before Decision."
  });
}

export async function onRequest(context) {
  const request = context.request;
  const env = context.env;

  try {
    if (request.method === "GET") {
      return await handlePreview(env);
    }

    if (request.method === "POST") {
      return await handleExecute(env);
    }

    return json({
      success: false,
      layer: LAYER,
      error: "Method not allowed"
    }, 405);

  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      error: error?.message || String(error)
    }, 500);
  }
}
