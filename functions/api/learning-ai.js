// TATO-OS — Learning AI V1.5
// Primary source: CONTENT_ATTRIBUTION_V2 measurement
// No winner declaration in Learning AI

const MODEL = "@cf/zai-org/glm-4.7-flash";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function nowISO() {
  return new Date().toISOString();
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safeRate(value) {
  const n = safeNumber(value);
  return Math.max(0, Math.min(100, n));
}

function normalizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseJSON(text) {
  if (!text) return null;

  let value = String(text).trim();

  value = value.replace(/^```json\s*/i, "");
  value = value.replace(/^```\s*/i, "");
  value = value.replace(/\s*```$/i, "");
  value = value.trim();

  try {
    return JSON.parse(value);
  } catch (_) {}

  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");

  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(value.slice(first, last + 1));
    } catch (_) {}
  }

  return null;
}

function extractText(response) {
  if (response === null || response === undefined) {
    return "";
  }

  if (typeof response === "string") {
    return response;
  }

  if (typeof response.response === "string") {
    return response.response;
  }

  if (
    response.result &&
    typeof response.result.response === "string"
  ) {
    return response.result.response;
  }

  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  if (response.result && typeof response.result === "string") {
    return response.result;
  }

  if (typeof response.content === "string") {
    return response.content;
  }

  if (Array.isArray(response.content)) {
    return response.content
      .map(function(item) {
        if (typeof item === "string") return item;
        if (item && typeof item.text === "string") return item.text;
        return "";
      })
      .join("");
  }

  if (
    response.choices &&
    response.choices[0]
  ) {
    const choice = response.choices[0];

    if (typeof choice.text === "string") {
      return choice.text;
    }

    if (
      choice.message &&
      typeof choice.message.content === "string"
    ) {
      return choice.message.content;
    }

    if (
      choice.message &&
      Array.isArray(choice.message.content)
    ) {
      return choice.message.content
        .map(function(item) {
          if (typeof item === "string") return item;
          if (item && typeof item.text === "string") return item.text;
          return "";
        })
        .join("");
    }
  }

  return "";
}

function normalizeAction(value) {
  const allowed = [
    "OPTIMIZE",
    "REPEAT",
    "TEST",
    "WAIT"
  ];

  const v = normalizeText(value).toUpperCase();

  return allowed.includes(v) ? v : "OPTIMIZE";
}

function normalizePriority(value) {
  const allowed = [
    "LOW",
    "MEDIUM",
    "HIGH"
  ];

  const v = normalizeText(value).toUpperCase();

  return allowed.includes(v) ? v : "MEDIUM";
}

function normalizeConfidence(value) {
  const allowed = [
    "LOW",
    "MEDIUM",
    "HIGH"
  ];

  const v = normalizeText(value).toUpperCase();

  return allowed.includes(v) ? v : "MEDIUM";
}

function buildFallback(measurement) {
  const attention = safeNumber(measurement.attention);
  const productViews = safeNumber(measurement.product_views);
  const clicks = safeNumber(measurement.clicks);
  const engagements = safeNumber(measurement.engagements);
  const customers = safeNumber(measurement.customers);
  const orders = safeNumber(measurement.orders);
  const revenue = safeNumber(measurement.revenue);

  let action = "WAIT";
  let priority = "LOW";
  let summary = "ยังมีข้อมูลไม่เพียงพอสำหรับการเรียนรู้";
  let whatWeLearned = "ต้องรอข้อมูลพฤติกรรมเพิ่ม";
  let direction = "รอข้อมูลเพิ่มก่อนปรับ Content";
  let angle = "เก็บข้อมูลจาก Attention และพฤติกรรมจริง";
  let cta = "ติดตามรายละเอียด";
  let successMetric = "Attention";

  if (attention > 0 && clicks === 0) {
    action = "OPTIMIZE";
    priority = "MEDIUM";
    summary = "มี Attention แต่ยังไม่เกิด Click";
    whatWeLearned = "Content สามารถดึงความสนใจได้ แต่ยังไม่เห็นการตอบสนองต่อไปใน funnel";
    direction = "ปรับ Content เพื่อเพิ่มการคลิกจากความสนใจที่เกิดขึ้นแล้ว";
    angle = "เชื่อมสิ่งที่ผู้ชมสนใจกับข้อเสนอหรือประโยชน์ที่ชัดเจน";
    cta = "ดูรายละเอียด TATO";
    successMetric = "Clicks";
  } else if (clicks > 0 && customers === 0) {
    action = "OPTIMIZE";
    priority = "MEDIUM";
    summary = "Content สร้าง Traffic แล้ว แต่ยังไม่พบ Customer";
    whatWeLearned = "มีพฤติกรรมการคลิก แต่ยังไม่พบการเปลี่ยนเป็น Customer";
    direction = "ปรับจุดหลัง Click เพื่อเพิ่ม Conversion";
    angle = "เชื่อมความสนใจจาก Content กับข้อเสนอที่ชัดเจน";
    cta = "ดูรายละเอียดและทดลอง TATO";
    successMetric = "Customers";
  } else if (customers > 0 && orders === 0) {
    action = "OPTIMIZE";
    priority = "HIGH";
    summary = "พบ Customer แต่ยังไม่เกิด Order";
    whatWeLearned = "Content สามารถสร้าง Customer ได้ แต่ยังไม่พบการซื้อ";
    direction = "ปรับข้อเสนอและเส้นทางจาก Customer ไป Order";
    angle = "ลดแรงเสียดทานก่อนการซื้อและทำข้อเสนอให้ชัดขึ้น";
    cta = "สั่งซื้อ TATO";
    successMetric = "Orders";
  } else if (orders > 0 || revenue > 0) {
    action = "REPEAT";
    priority = "HIGH";
    summary = "พบ Conversion และ Revenue จาก Content";
    whatWeLearned = "Content มีหลักฐานของ Conversion หรือ Revenue แล้ว";
    direction = "สร้าง Content ที่มีโครงสร้างใกล้เคียงและทดสอบซ้ำ";
    angle = "นำองค์ประกอบที่สัมพันธ์กับ Conversion ไปทดสอบกับ Content ใหม่";
    cta = "สั่งซื้อ TATO";
    successMetric = "Revenue";
  } else if (
    attention > 0 ||
    productViews > 0 ||
    clicks > 0 ||
    engagements > 0
  ) {
    action = "OPTIMIZE";
    priority = "MEDIUM";
    summary = "พบพฤติกรรมจาก Content แต่ยังไม่มี Conversion";
    whatWeLearned = "Content เริ่มสร้างพฤติกรรม แต่ยังไม่มีหลักฐานการซื้อ";
    direction = "ปรับ Content ตามจุดที่ funnel หยุด";
    angle = "ใช้พฤติกรรมจริงเพื่อปรับข้อความและ CTA";
    cta = "ดูรายละเอียด TATO";
    successMetric = "Product Views";
  }

  return {
    summary: summary,
    observed_signals: [
      "Attention: " + attention,
      "Product Views: " + productViews,
      "Clicks: " + clicks,
      "Engagements: " + engagements,
      "Customers: " + customers,
      "Orders: " + orders,
      "Revenue: " + revenue
    ],
    learning: {
      what_we_learned: whatWeLearned,
      confidence: "MEDIUM"
    },
    problems: [],
    next_content: {
      action: action,
      direction: direction,
      angle: angle,
      cta: cta,
      success_metric: successMetric
    },
    next_action: {
      type: action,
      reason: summary
    },
    priority: priority
  };
}

function normalizeAnalysis(data, measurement) {
  const fallback = buildFallback(measurement);

  if (!data || typeof data !== "object") {
    return fallback;
  }

  const result = {
    summary:
      normalizeText(data.summary) ||
      fallback.summary,

    observed_signals:
      Array.isArray(data.observed_signals)
        ? data.observed_signals
        : fallback.observed_signals,

    learning: {
      what_we_learned:
        data.learning &&
        normalizeText(data.learning.what_we_learned)
          ? normalizeText(data.learning.what_we_learned)
          : fallback.learning.what_we_learned,

      confidence:
        data.learning
          ? normalizeConfidence(data.learning.confidence)
          : fallback.learning.confidence
    },

    problems:
      Array.isArray(data.problems)
        ? data.problems
        : fallback.problems,

    next_content: {
      action:
        data.next_content
          ? normalizeAction(data.next_content.action)
          : fallback.next_content.action,

      direction:
        data.next_content &&
        normalizeText(data.next_content.direction)
          ? normalizeText(data.next_content.direction)
          : fallback.next_content.direction,

      angle:
        data.next_content &&
        normalizeText(data.next_content.angle)
          ? normalizeText(data.next_content.angle)
          : fallback.next_content.angle,

      cta:
        data.next_content &&
        normalizeText(data.next_content.cta)
          ? normalizeText(data.next_content.cta)
          : fallback.next_content.cta,

      success_metric:
        data.next_content &&
        normalizeText(data.next_content.success_metric)
          ? normalizeText(data.next_content.success_metric)
          : fallback.next_content.success_metric
    },

    next_action: {
      type:
        data.next_action
          ? normalizeAction(data.next_action.type)
          : fallback.next_action.type,

      reason:
        data.next_action &&
        normalizeText(data.next_action.reason)
          ? normalizeText(data.next_action.reason)
          : fallback.next_action.reason
    },

    priority:
      normalizePriority(data.priority)
  };

  return result;
}

async function getLatestMeasurement(env) {
  return await env.DB.prepare(
    "SELECT * FROM content_measurements " +
    "WHERE attribution_mode = 'CONTENT_ATTRIBUTION_V2' " +
    "ORDER BY measured_at DESC LIMIT 1"
  ).first();
}

async function getContent(env, contentId) {
  if (!contentId) return null;

  return await env.DB.prepare(
    "SELECT * FROM content_engine WHERE id = ? LIMIT 1"
  )
    .bind(contentId)
    .first();
}

function getMeasurementMetrics(measurement) {
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

function getMeasurementConversion(measurement) {
  return {
    attention_to_view: safeRate(
      measurement.attention_to_view
    ),
    view_to_click: safeRate(
      measurement.view_to_click
    ),
    click_to_customer: safeRate(
      measurement.click_to_customer
    ),
    customer_to_order: safeRate(
      measurement.customer_to_order
    ),
    engagement_to_order: safeRate(
      measurement.engagement_to_order
    )
  };
}

function buildPrompt(content, measurement, metrics, conversion) {
  return JSON.stringify({
    task: "Analyze content performance and produce learning for the next action.",
    rules: [
      "Use only the supplied measurement data.",
      "Do not invent missing data.",
      "Do not declare a winner.",
      "Do not rank content.",
      "Separate observed facts from recommendations.",
      "Return ONLY valid JSON."
    ],
    required_output: {
      summary: "short factual summary",
      observed_signals: [
        "list of observed signals"
      ],
      learning: {
        what_we_learned: "what the data indicates",
        confidence: "LOW | MEDIUM | HIGH"
      },
      problems: [
        "observed bottlenecks"
      ],
      next_content: {
        action: "OPTIMIZE | REPEAT | TEST | WAIT",
        direction: "next content direction",
        angle: "content angle",
        cta: "CTA",
        success_metric: "metric to observe"
      },
      next_action: {
        type: "OPTIMIZE | REPEAT | TEST | WAIT",
        reason: "reason based on data"
      },
      priority: "LOW | MEDIUM | HIGH"
    },
    content: content
      ? {
          id: content.id,
          title: content.title,
          status: content.status
        }
      : null,
    measurement: {
      id: measurement.id,
      content_id: measurement.content_id,
      measured_at: measurement.measured_at,
      measurement_start: measurement.measurement_start,
      attribution_mode: measurement.attribution_mode,
      status: measurement.status
    },
    metrics: metrics,
    conversion: conversion
  });
}

async function analyzeAI(env, prompt) {
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

    const response = await env.AI.run(MODEL, {
      messages: [
        {
          role: "system",
          content:
            "Return ONLY valid JSON. No markdown. No explanation."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 1200,
      temperature: 0.1
    });

    debug.raw_response_type = typeof response;

    if (
      response &&
      typeof response === "object"
    ) {
      debug.raw_response_keys =
        Object.keys(response);
    }

    const text = extractText(response);

    if (!text) {
      debug.provider_status = "EMPTY_RESPONSE";

      return {
        status: "FALLBACK_ANALYZED",
        analysis: null,
        debug: debug
      };
    }

    debug.response_text_received = true;

    const parsed = parseJSON(text);

    if (!parsed) {
      debug.provider_status = "INVALID_JSON";

      return {
        status: "FALLBACK_ANALYZED",
        analysis: null,
        debug: debug
      };
    }

    debug.parsed_json = true;
    debug.provider_status = "AI_RESPONSE_PARSED";

    return {
      status: "AI_ANALYZED",
      analysis: parsed,
      debug: debug
    };
  } catch (error) {
    debug.error =
      error && error.message
        ? error.message
        : String(error);

    debug.provider_status = "ERROR";

    return {
      status: "FALLBACK_ANALYZED",
      analysis: null,
      debug: debug
    };
  }
}

async function saveAIRun(
  env,
  measurement,
  content,
  result
) {
  const id = crypto.randomUUID();

  const input = JSON.stringify({
    measurement_id: measurement.id,
    content_id: measurement.content_id,
    metrics: getMeasurementMetrics(measurement),
    conversion: getMeasurementConversion(measurement)
  });

  const output = JSON.stringify({
    status: result.status,
    analysis: result.analysis,
    debug: result.debug
  });

  try {
    await env.DB.prepare(
      "INSERT INTO ai_runs " +
      "(id, run_type, model, input, output, status, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        id,
        "LEARNING_AI",
        MODEL,
        input,
        output,
        result.status,
        nowISO()
      )
      .run();

    return id;
  } catch (_) {
    return null;
  }
}

async function saveAIInsight(
  env,
  measurement,
  content,
  analysis
) {
  const id = crypto.randomUUID();

  const insight = JSON.stringify({
    measurement_id: measurement.id,
    content_id: measurement.content_id,
    source: "CONTENT_MEASUREMENT_V2",
    analysis: analysis,
    winner_decision:
      "NOT_DECLARED_IN_LEARNING_AI_V1.5"
  });

  try {
    await env.DB.prepare(
      "INSERT INTO ai_insights " +
      "(id, insight_type, content_id, insight, created_at) " +
      "VALUES (?, ?, ?, ?, ?)"
    )
      .bind(
        id,
        "LEARNING",
        measurement.content_id,
        insight,
        nowISO()
      )
      .run();

    return id;
  } catch (_) {
    return null;
  }
}

async function runLearning(env) {
  const measurement =
    await getLatestMeasurement(env);

  if (!measurement) {
    const fallbackMeasurement = {
      attention: 0,
      product_views: 0,
      clicks: 0,
      engagements: 0,
      customers: 0,
      orders: 0,
      revenue: 0
    };

    return {
      success: true,
      layer: "LEARNING_AI_V1.5",
      status: "WAITING_FOR_MEASUREMENT",
      learning: null,
      measurement: null,
      content: null,
      metrics:
        getMeasurementMetrics(
          fallbackMeasurement
        ),
      conversion:
        getMeasurementConversion(
          fallbackMeasurement
        ),
      ai: {
        status: "WAITING_FOR_MEASUREMENT",
        model: MODEL,
        analysis:
          buildFallback(
            fallbackMeasurement
          ),
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
      },
      winner_decision:
        "NOT_DECLARED_IN_LEARNING_AI_V1.5",
      next_step:
        "Create CONTENT_ATTRIBUTION_V2 measurement first."
    };
  }

  const content =
    await getContent(
      env,
      measurement.content_id
    );

  const metrics =
    getMeasurementMetrics(measurement);

  const conversion =
    getMeasurementConversion(measurement);

  const prompt =
    buildPrompt(
      content,
      measurement,
      metrics,
      conversion
    );

  const aiResult =
    await analyzeAI(
      env,
      prompt
    );

  const fallback =
    buildFallback(measurement);

  const analysis =
    normalizeAnalysis(
      aiResult.analysis || fallback,
      measurement
    );

  const finalAIStatus =
    aiResult.status === "AI_ANALYZED"
      ? "AI_ANALYZED"
      : "FALLBACK_ANALYZED";

  const finalResult = {
    status: finalAIStatus,
    model: MODEL,
    analysis: analysis,
    debug: aiResult.debug
  };

  const aiRunId =
    await saveAIRun(
      env,
      measurement,
      content,
      finalResult
    );

  const aiInsightId =
    await saveAIInsight(
      env,
      measurement,
      content,
      analysis
    );

  return {
    success: true,
    layer: "LEARNING_AI_V1.5",
    status: "ANALYZED",

    learning: {
      source: "CONTENT_MEASUREMENT_V2",
      measurement: measurement,
      signal_type: "MEASUREMENT",
      measurement_start:
        measurement.measurement_start,
      created_at:
        measurement.created_at
    },

    measurement: {
      id: measurement.id,
      content_id:
        measurement.content_id,
      status:
        measurement.status,
      measured_at:
        measurement.measured_at,
      attribution_mode:
        measurement.attribution_mode
    },

    content: content
      ? {
          id: content.id,
          title: content.title,
          status: content.status
        }
      : null,

    metrics: metrics,

    conversion: conversion,

    ai: finalAIStatus === "AI_ANALYZED"
      ? finalResult
      : {
          status: "FALLBACK_ANALYZED",
          model: MODEL,
          analysis: analysis,
          debug: aiResult.debug
        },

    persistence: {
      ai_run_id: aiRunId,
      ai_insight_id: aiInsightId
    },

    winner_decision:
      "NOT_DECLARED_IN_LEARNING_AI_V1.5",

    next_step:
      finalAIStatus === "AI_ANALYZED"
        ? "Learning AI analyzed successfully. Next stage can use this learning for Decision."
        : "Fallback Learning analysis returned. Inspect ai.debug before proceeding."
  };
}

export async function onRequest(context) {
  const request = context.request;
  const env = context.env;

  try {
    const url =
      new URL(request.url);

    const mode =
      url.searchParams.get("mode") ||
      "preview";

    if (
      request.method === "GET"
    ) {
      const result =
        await runLearning(env);

      return json({
        ...result,
        mode: mode
      });
    }

    if (
      request.method === "POST"
    ) {
      const result =
        await runLearning(env);

      return json({
        ...result,
        mode: "execute"
      });
    }

    return json(
      {
        success: false,
        error: "Method not allowed"
      },
      405
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
