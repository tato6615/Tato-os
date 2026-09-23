// TATO-OS
// Learning AI V1.10
// Exact Measurement Driven
// FIX: ai_insights live schema has NO agent_name column

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const LAYER = "LEARNING_AI_V1.10";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function uid() {
  return crypto.randomUUID();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pct(a, b) {
  return b > 0 ? Math.round((a / b) * 10000) / 100 : 0;
}

function safeJson(value, fallback = {}) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getMeasurementId(request) {
  const url = new URL(request.url);

  return (
    url.searchParams.get("measurement_id") ||
    url.searchParams.get("id") ||
    null
  );
}

async function loadExactMeasurement(db, measurementId) {
  if (!measurementId) {
    throw new Error(
      "measurement_id is required. Use ?measurement_id=<measurement_id>"
    );
  }

  const measurement = await db
    .prepare(`
      SELECT *
      FROM content_measurements
      WHERE id = ?
      LIMIT 1
    `)
    .bind(measurementId)
    .first();

  if (!measurement) {
    throw new Error(
      `Measurement not found: ${measurementId}`
    );
  }

  return measurement;
}

async function loadContent(db, contentId) {
  if (!contentId) return null;

  return await db
    .prepare(`
      SELECT *
      FROM content_engine
      WHERE id = ?
      LIMIT 1
    `)
    .bind(contentId)
    .first();
}

function buildMetrics(measurement) {
  return {
    attention: num(measurement.attention),
    product_views: num(measurement.product_views),
    clicks: num(measurement.clicks),
    engagements: num(measurement.engagements),
    customers: num(measurement.customers),
    orders: num(measurement.orders),
    revenue: num(measurement.revenue)
  };
}

function buildFunnel(metrics) {
  return {
    attention: metrics.attention,
    product_views: metrics.product_views,
    clicks: metrics.clicks,
    engagements: metrics.engagements,
    customers: metrics.customers,
    orders: metrics.orders,
    revenue: metrics.revenue
  };
}

function buildConversion(metrics) {
  return {
    attention_to_product_view: pct(
      metrics.product_views,
      metrics.attention
    ),

    product_view_to_click: pct(
      metrics.clicks,
      metrics.product_views
    ),

    click_to_customer: pct(
      metrics.customers,
      metrics.clicks
    ),

    customer_to_order: pct(
      metrics.orders,
      metrics.customers
    ),

    engagement_to_order: pct(
      metrics.orders,
      metrics.engagements
    ),

    attention_to_order: pct(
      metrics.orders,
      metrics.attention
    )
  };
}

function buildDeterministicLearning(metrics) {
  if (metrics.orders > 0 || metrics.revenue > 0) {
    return {
      signal_type: "CONVERSION",
      finding: "พบคำสั่งซื้อหรือรายได้จากช่วง Measurement นี้",
      recommendation:
        "ตรวจสอบเส้นทางจาก Attention ไป Conversion และเก็บหลักฐานเพิ่มก่อนนำไปตัดสินใจทำซ้ำ",
      confidence: "HIGH"
    };
  }

  if (metrics.customers > 0) {
    return {
      signal_type: "CUSTOMER",
      finding:
        "พบ Customer Signal แต่ยังไม่มี Conversion ใน Measurement นี้",
      recommendation:
        "ติดตาม Customer Journey ต่อจาก Click ไป Customer และ Order",
      confidence: "MEDIUM"
    };
  }

  if (metrics.engagements > 0) {
    return {
      signal_type: "ENGAGEMENT",
      finding:
        "Content สร้าง Engagement แต่ยังไม่เกิด Customer หรือ Conversion",
      recommendation:
        "เก็บ Measurement ต่อและตรวจเส้นทางจาก Engagement ไป Product View และ Customer",
      confidence: "MEDIUM"
    };
  }

  if (metrics.product_views > 0) {
    return {
      signal_type: "PRODUCT_INTEREST",
      finding:
        "พบ Product View แสดงถึงความสนใจในระดับสินค้า แต่ยังไม่เกิด Conversion",
      recommendation:
        "ตรวจสอบเส้นทางจาก Product View ไป Click และ Customer",
      confidence: "MEDIUM"
    };
  }

  if (metrics.clicks > 0) {
    return {
      signal_type: "TRAFFIC",
      finding:
        "Content สร้าง Click แต่ยังไม่เกิด Product View, Customer หรือ Conversion",
      recommendation:
        "ตรวจสอบเส้นทางหลัง Click และเก็บ Measurement ต่อก่อนเปลี่ยนกลยุทธ์",
      confidence: "LOW"
    };
  }

  if (metrics.attention > 0) {
    return {
      signal_type: "ATTENTION",
      finding:
        "Content ได้รับ Attention แต่ยังไม่มีพฤติกรรมปลายทางที่ชัดเจน",
      recommendation:
        "เก็บ Behavior และ Measurement เพิ่มก่อนตัดสินใจเปลี่ยนกลยุทธ์",
      confidence: "LOW"
    };
  }

  return {
    signal_type: "NO_SIGNAL",
    finding:
      "ยังไม่มี Behavior Signal ที่เพียงพอสำหรับการเรียนรู้",
    recommendation:
      "เผยแพร่หรือกระจาย Content และเก็บ Attention / Behavior เพิ่ม",
    confidence: "LOW"
  };
}

function fallbackAnalysis(data) {
  const m = data.metrics;
  const learning = data.deterministic_learning;

  let problems = [];

  if (m.attention > 0 && m.product_views === 0) {
    problems.push("มี Attention แต่ยังไม่มี Product View");
  }

  if (m.clicks > 0 && m.product_views === 0) {
    problems.push("มี Click แต่ยังไม่มี Product View");
  }

  if (m.attention > 0 && m.customers === 0) {
    problems.push("ยังไม่มี Customer");
  }

  if (m.orders === 0) {
    problems.push("ยังไม่มี Conversion");
  }

  if (problems.length === 0) {
    problems.push("ยังไม่มีปัญหาที่ระบุได้จากข้อมูลชุดนี้");
  }

  return {
    summary:
      `Measurement นี้มี Attention ${m.attention}, Click ${m.clicks}, ` +
      `Product View ${m.product_views}, Engagement ${m.engagements}, ` +
      `Customer ${m.customers}, Order ${m.orders}, Revenue ${m.revenue}`,

    observed_signals: [
      `Attention: ${m.attention}`,
      `Product Views: ${m.product_views}`,
      `Clicks: ${m.clicks}`,
      `Engagements: ${m.engagements}`,
      `Customers: ${m.customers}`,
      `Orders: ${m.orders}`,
      `Revenue: ${m.revenue}`
    ],

    learning: {
      what_we_learned: learning.finding,
      confidence: learning.confidence
    },

    problems,

    next_content: {
      action: "MEASURE_MORE",
      direction:
        "เก็บข้อมูลต่อโดยยังไม่เปลี่ยนกลยุทธ์จาก Measurement เดียว",
      angle: data.content?.angle || "",
      cta: data.content?.cta || "",
      success_metric: "Product Views, Customers, Orders, Revenue"
    },

    next_action: {
      type: "CONTINUE_MEASUREMENT",
      reason: learning.recommendation
    },

    priority:
      m.orders > 0 || m.revenue > 0
        ? "HIGH"
        : m.customers > 0 || m.product_views > 0
          ? "MEDIUM"
          : "LOW"
  };
}

function parseResponse(result) {
  const debug = {
    top_level_keys:
      result && typeof result === "object"
        ? Object.keys(result)
        : [],
    response_type: typeof result?.response,
    response_keys:
      result?.response &&
      typeof result.response === "object"
        ? Object.keys(result.response)
        : [],
    finish_reason:
      result?.choices?.[0]?.finish_reason ?? null
  };

  let content = null;

  const raw = result?.response;

  if (typeof raw === "string") {
    content = raw;
  } else if (raw && typeof raw === "object") {
    if (typeof raw.content === "string") {
      content = raw.content;
    } else if (typeof raw.text === "string") {
      content = raw.text;
    } else if (Array.isArray(raw)) {
      content = raw
        .map((x) => {
          if (typeof x === "string") return x;
          return x?.text || x?.content || "";
        })
        .join("");
    }
  }

  if (
    !content &&
    typeof result?.choices?.[0]?.message?.content === "string"
  ) {
    content = result.choices[0].message.content;
  }

  debug.content_length = content ? content.length : 0;

  if (!content) {
    return {
      parsed: null,
      debug
    };
  }

  content = content.trim();

  try {
    return {
      parsed: JSON.parse(content),
      debug
    };
  } catch {}

  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");

  if (start >= 0 && end > start) {
    try {
      return {
        parsed: JSON.parse(
          content.slice(start, end + 1)
        ),
        debug
      };
    } catch {}
  }

  return {
    parsed: null,
    debug
  };
}

async function callAI(ai, data) {
  if (!ai || typeof ai.run !== "function") {
    return {
      parsed: null,
      debug: {
        error: "AI binding unavailable"
      }
    };
  }

  const prompt = `
You are the Learning AI layer of TATO Coffee Intelligence OS.

Analyze ONLY the supplied Measurement data.

Do NOT declare a winner.
Do NOT rank content.
Do NOT invent missing data.
Do NOT treat one Measurement as proof of success or failure.
Distinguish observed facts from interpretation.
Recommend the next information/action needed to reduce uncertainty.

Return ONLY valid JSON with exactly these fields:

{
  "summary": "string",
  "observed_signals": ["string"],
  "learning": {
    "what_we_learned": "string",
    "confidence": "HIGH|MEDIUM|LOW"
  },
  "problems": ["string"],
  "next_content": {
    "action": "string",
    "direction": "string",
    "angle": "string",
    "cta": "string",
    "success_metric": "string"
  },
  "next_action": {
    "type": "string",
    "reason": "string"
  },
  "priority": "HIGH|MEDIUM|LOW"
}

All explanations must be in Thai.

DATA:
${JSON.stringify(data)}
`;

  try {
    const result = await ai.run(MODEL, {
      messages: [
        {
          role: "system",
          content:
            "Return only valid JSON. Do not explain. Do not use markdown."
        },
        {
          role: "user",
          content: prompt
        }
      ],

      response_format: {
        type: "json_object"
      },

      chat_template_kwargs: {
        enable_thinking: false
      },

      max_tokens: 768,
      temperature: 0
    });

    return parseResponse(result);
  } catch (error) {
    return {
      parsed: null,
      debug: {
        error: error?.message || String(error)
      }
    };
  }
}

async function buildData(db, measurement) {
  const content = await loadContent(
    db,
    measurement.content_id
  );

  const metrics = buildMetrics(measurement);
  const funnel = buildFunnel(metrics);
  const conversion = buildConversion(metrics);

  const attribution = safeJson(
    measurement.attribution,
    {}
  );

  const learningSignal = safeJson(
    measurement.learning_signal,
    {}
  );

  const diagnostic = safeJson(
    measurement.diagnostic,
    {}
  );

  const deterministicLearning =
    buildDeterministicLearning(metrics);

  return {
    measurement: {
      id: measurement.id,
      content_id: measurement.content_id,
      content_title: measurement.content_title,
      measurement_start:
        measurement.measurement_start,
      measured_at: measurement.measured_at,
      status: measurement.status,
      attribution_model:
        measurement.attribution_model ||
        measurement.attribution_mode ||
        null
    },

    content: content
      ? {
          id: content.id,
          title: content.title,
          status: content.status,
          objective: content.objective,
          attention_type: content.attention_type,
          market_keyword: content.market_keyword,
          angle: content.angle,
          cta: content.cta
        }
      : null,

    metrics,

    funnel,

    conversion,

    attribution,

    learning_signal: learningSignal,

    diagnostic,

    deterministic_learning: deterministicLearning
  };
}

async function analyze(context) {
  const db = context.env.DB;

  if (!db) {
    throw new Error(
      "D1 binding DB not found"
    );
  }

  const measurementId =
    getMeasurementId(context.request);

  const measurement =
    await loadExactMeasurement(
      db,
      measurementId
    );

  const data =
    await buildData(
      db,
      measurement
    );

  const aiResult =
    await callAI(
      context.env.AI,
      data
    );

  const analysis =
    aiResult.parsed ||
    fallbackAnalysis(data);

  return {
    measurement_id: measurement.id,
    content_id: measurement.content_id,

    status: aiResult.parsed
      ? "AI_ANALYZED"
      : "FALLBACK_ANALYZED",

    model: MODEL,

    analysis,

    metrics: data.metrics,

    funnel: data.funnel,

    conversion: data.conversion,

    attribution: data.attribution,

    learning_signal:
      data.learning_signal,

    diagnostic: data.diagnostic,

    debug: aiResult.parsed
      ? {
          ai_called: true,
          response_text_received:
            aiResult.debug?.content_length > 0,
          parsed_json: true,
          provider_status:
            "AI_RESPONSE_PARSED"
        }
      : {
          ai_called: true,
          response_text_received:
            aiResult.debug?.content_length > 0,
          parsed_json: false,
          provider_status:
            "AI_RESPONSE_NOT_PARSED",
          error:
            aiResult.debug?.error || null
        }
  };
}

async function saveLearning(
  db,
  measurement,
  result
) {
  const runId = uid();
  const insightId = uid();

  const inputData = {
    measurement: {
      id: measurement.id,
      content_id: measurement.content_id,
      content_title:
        measurement.content_title,
      measurement_start:
        measurement.measurement_start,
      measured_at:
        measurement.measured_at
    },

    metrics: result.metrics,

    funnel: result.funnel,

    conversion: result.conversion,

    attribution:
      result.attribution,

    learning_signal:
      result.learning_signal,

    diagnostic:
      result.diagnostic
  };

  const outputData = {
    analysis: result.analysis,

    status: result.status,

    winner_decision:
      "NOT_DECLARED_IN_LEARNING_AI_V1.10"
  };

  /*
   * LIVE ai_runs schema:
   * id
   * customer_id
   * run_type
   * model
   * input_data
   * output_data
   * status
   * tokens_used
   * created_at
   */

  await db
    .prepare(`
      INSERT INTO ai_runs (
        id,
        customer_id,
        run_type,
        model,
        input_data,
        output_data,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      runId,
      null,
      "LEARNING",
      MODEL,
      JSON.stringify(inputData),
      JSON.stringify(outputData),
      "COMPLETED"
    )
    .run();

  /*
   * IMPORTANT:
   * Live ai_insights schema does NOT have agent_name.
   *
   * Therefore DO NOT insert agent_name.
   *
   * We link the insight to this Learning AI run through run_id.
   */

  const insightText =
    result.analysis?.summary ||
    result.analysis?.learning
      ?.what_we_learned ||
    "Learning analysis completed";

  const priority =
    result.analysis?.priority ||
    "MEDIUM";

  const evidence = {
    measurement_id: measurement.id,
    content_id: measurement.content_id,
    metrics: result.metrics,
    funnel: result.funnel,
    conversion: result.conversion,
    learning_signal:
      result.learning_signal
  };

  await db
    .prepare(`
      INSERT INTO ai_insights (
        id,
        run_id,
        title,
        insight,
        priority,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(
      insightId,
      runId,
      "CONTENT_LEARNING",
      insightText,
      priority,
      "ACTIVE"
    )
    .run();

  return {
    run_id: runId,
    insight_id: insightId
  };
}

async function handle(context) {
  const db = context.env.DB;

  if (!db) {
    return json(
      {
        success: false,
        layer: LAYER,
        error:
          "D1 binding DB not found"
      },
      500
    );
  }

  const result =
    await analyze(context);

  const method =
    context.request.method;

  /*
   * GET = PREVIEW
   * POST = EXECUTE / SAVE
   */

  if (method === "GET") {
    return json({
      success: true,
      layer: LAYER,
      mode: "preview",

      status: result.status,

      measurement_id:
        result.measurement_id,

      content_id:
        result.content_id,

      model: result.model,

      metrics: result.metrics,

      funnel: result.funnel,

      conversion:
        result.conversion,

      attribution:
        result.attribution,

      learning_signal:
        result.learning_signal,

      diagnostic:
        result.diagnostic,

      ai: {
        status: result.status,
        model: result.model,
        analysis:
          result.analysis,
        debug:
          result.debug,
        run_id: null,
        insight_id: null
      },

      winner_decision:
        "NOT_DECLARED_IN_LEARNING_AI_V1.10",

      next_step:
        "POST the same measurement_id to save AI Run and AI Insight."
    });
  }

  if (method === "POST") {
    const measurementId =
      getMeasurementId(
        context.request
      );

    let body = {};

    try {
      body =
        await context.request.json();
    } catch (_) {}

    const finalMeasurementId =
      measurementId ||
      body?.measurement_id ||
      body?.id ||
      null;

    if (!finalMeasurementId) {
      return json(
        {
          success: false,
          layer: LAYER,
          error:
            "measurement_id is required"
        },
        400
      );
    }

    /*
     * Re-run using the exact ID from
     * query/body so execute can never
     * accidentally save another measurement.
     */

    const executeUrl =
      new URL(
        context.request.url
      );

    executeUrl.searchParams.set(
      "measurement_id",
      finalMeasurementId
    );

    const originalRequest =
      context.request;

    const executeContext = {
      ...context,
      request: new Request(
        executeUrl.toString(),
        {
          method: "GET",
          headers:
            originalRequest.headers
        }
      )
    };

    const execution =
      await analyze(
        executeContext
      );

    const measurement =
      await loadExactMeasurement(
        db,
        finalMeasurementId
      );

    const saved =
      await saveLearning(
        db,
        measurement,
        execution
      );

    return json({
      success: true,

      layer: LAYER,

      mode: "execute",

      status: "AI_ANALYZED",

      measurement_id:
        execution.measurement_id,

      content_id:
        execution.content_id,

      model: MODEL,

      metrics:
        execution.metrics,

      funnel:
        execution.funnel,

      conversion:
        execution.conversion,

      attribution:
        execution.attribution,

      learning_signal:
        execution.learning_signal,

      diagnostic:
        execution.diagnostic,

      ai: {
        status:
          execution.status,

        model: MODEL,

        analysis:
          execution.analysis,

        debug:
          execution.debug,

        run_id:
          saved.run_id,

        insight_id:
          saved.insight_id
      },

      winner_decision:
        "NOT_DECLARED_IN_LEARNING_AI_V1.10",

      next_step:
        "Learning saved. Send the new learning run into Decision Engine."
    });
  }

  return json(
    {
      success: false,
      layer: LAYER,
      error:
        "Method not allowed"
    },
    405
  );
}

export async function onRequestGet(
  context
) {
  try {
    return await handle(context);
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
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
    return await handle(context);
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}
