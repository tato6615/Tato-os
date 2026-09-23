// TATO-OS
// Learning AI V1.10
// Flow: Measurement -> Learning AI -> AI Run -> AI Insight
// Exact measurement-driven learning. No winner declaration.

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

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pct(a, b) {
  return b > 0 ? Math.round((a / b) * 10000) / 100 : 0;
}

function id() {
  return crypto.randomUUID();
}

function safeJSON(value, fallback = {}) {
  if (value == null) return fallback;

  if (typeof value === "object") return value;

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

async function loadMeasurement(db, measurementId) {
  if (!measurementId) {
    return {
      success: false,
      error: "measurement_id is required"
    };
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
    return {
      success: false,
      error: "Measurement not found",
      measurement_id: measurementId
    };
  }

  const content = await db
    .prepare(`
      SELECT *
      FROM content_engine
      WHERE id = ?
      LIMIT 1
    `)
    .bind(measurement.content_id)
    .first();

  const metrics = {
    attention: num(measurement.attention),
    product_views: num(measurement.product_views),
    clicks: num(measurement.clicks),
    engagements: num(measurement.engagements),
    customers: num(measurement.customers),
    orders: num(measurement.orders),
    revenue: num(measurement.revenue)
  };

  const funnel = {
    attention_to_view: pct(
      metrics.product_views,
      metrics.attention
    ),
    view_to_click: pct(
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
    )
  };

  const attribution = safeJSON(
    measurement.attribution,
    {}
  );

  const diagnostic = safeJSON(
    measurement.diagnostic,
    {}
  );

  const learningSignal = safeJSON(
    measurement.learning_signal,
    {}
  );

  return {
    success: true,

    measurement: {
      id: measurement.id,
      content_id: measurement.content_id,
      status: measurement.status,
      measured_at: measurement.measured_at,
      measurement_start: measurement.measurement_start,
      attribution_mode: measurement.attribution_mode
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
    attribution,
    diagnostic,
    learning_signal: learningSignal
  };
}

function deterministicLearning(data) {
  const m = data.metrics;

  if (m.revenue > 0 || m.orders > 0) {
    return {
      signal_type: "CONVERSION",
      finding:
        "พบคำสั่งซื้อหรือรายได้จาก Measurement นี้",
      confidence: "HIGH",
      recommendation:
        "วิเคราะห์เส้นทางที่นำไปสู่ Conversion และเก็บข้อมูลเพิ่มก่อนขยาย"
    };
  }

  if (m.customers > 0) {
    return {
      signal_type: "CUSTOMER",
      finding:
        "พบ Customer Signal แต่ยังไม่มี Conversion",
      confidence: "MEDIUM",
      recommendation:
        "ตรวจเส้นทางจาก Click ไป Customer และติดตาม Conversion ต่อ"
    };
  }

  if (m.engagements > 0) {
    return {
      signal_type: "ENGAGEMENT",
      finding:
        "Content สร้าง Engagement แต่ยังไม่มี Customer หรือ Conversion",
      confidence: "MEDIUM",
      recommendation:
        "ติดตาม Product View และ Customer ต่อ โดยยังไม่สรุปผู้ชนะ"
    };
  }

  if (m.product_views > 0) {
    return {
      signal_type: "PRODUCT_INTEREST",
      finding:
        "เกิด Product View แสดงว่ามีความสนใจในระดับสินค้า",
      confidence: "MEDIUM",
      recommendation:
        "ติดตาม Click, Customer และ Conversion ต่อ"
    };
  }

  if (m.clicks > 0) {
    return {
      signal_type: "TRAFFIC",
      finding:
        "Content สร้าง Click แต่ยังไม่เกิด Product View หรือ Conversion",
      confidence: "LOW",
      recommendation:
        "เก็บ Measurement เพิ่มและตรวจเส้นทางจาก Click ไป Product View"
    };
  }

  if (m.attention > 0) {
    return {
      signal_type: "ATTENTION",
      finding:
        "Content สร้าง Attention แต่ยังไม่เกิด downstream action",
      confidence: "LOW",
      recommendation:
        "เก็บ Behavior และ Measurement ต่อก่อนเปลี่ยนกลยุทธ์"
    };
  }

  return {
    signal_type: "NO_SIGNAL",
    finding:
      "ยังไม่มี Behavior Signal เพียงพอสำหรับการเรียนรู้",
    confidence: "LOW",
    recommendation:
      "รอข้อมูลเพิ่มเติมก่อนตัดสินใจ"
  };
}

function fallback(data) {
  const base = deterministicLearning(data);
  const m = data.metrics;

  return {
    summary: base.finding,

    observed_signals: [
      `attention: ${m.attention}`,
      `product_views: ${m.product_views}`,
      `clicks: ${m.clicks}`,
      `engagements: ${m.engagements}`,
      `customers: ${m.customers}`,
      `orders: ${m.orders}`,
      `revenue: ${m.revenue}`
    ],

    learning: {
      what_we_learned: base.finding,
      confidence: base.confidence
    },

    problems:
      m.revenue === 0 && m.orders === 0
        ? ["ยังไม่มี Conversion"]
        : [],

    next_content: {
      action:
        m.orders > 0
          ? "ITERATE"
          : "OBSERVE",

      direction: base.recommendation,

      angle:
        data.content?.angle || "",

      cta:
        data.content?.cta || "",

      success_metric:
        m.orders > 0
          ? "Revenue"
          : m.customers > 0
            ? "Customers"
            : m.product_views > 0
              ? "Product Views"
              : "Behavior Signal"
    },

    next_action: {
      type:
        m.orders > 0
          ? "ITERATE"
          : "CONTINUE_MEASUREMENT",

      reason: base.recommendation
    },

    priority:
      m.orders > 0
        ? "HIGH"
        : m.customers > 0 || m.product_views > 0
          ? "MEDIUM"
          : "LOW",

    winner_decision:
      "NOT_DECLARED_IN_LEARNING_AI_V1.10"
  };
}

function parseAIResponse(result) {
  const debug = {
    top_level_keys:
      result && typeof result === "object"
        ? Object.keys(result)
        : [],

    response_type:
      typeof result?.response,

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

  debug.content_length = content
    ? content.length
    : 0;

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
You are the Learning AI for TATO Coffee Intelligence OS.

Analyze ONLY the supplied Measurement.

Do not invent data.
Do not declare a winner.
Do not claim causality unless directly supported by the data.
Separate observed signals from interpretation.
If data is insufficient, say so.

Return ONLY valid JSON.

Required fields:

{
  "summary": "...",
  "observed_signals": [],
  "learning": {
    "what_we_learned": "...",
    "confidence": "LOW|MEDIUM|HIGH"
  },
  "problems": [],
  "next_content": {
    "action": "...",
    "direction": "...",
    "angle": "...",
    "cta": "...",
    "success_metric": "..."
  },
  "next_action": {
    "type": "...",
    "reason": "..."
  },
  "priority": "LOW|MEDIUM|HIGH"
}

Language: Thai.

MEASUREMENT DATA:
${JSON.stringify(data)}
`;

  try {
    const result = await ai.run(MODEL, {
      messages: [
        {
          role: "system",
          content:
            "Return only valid JSON. No markdown. No explanation."
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

      max_tokens: 700,
      temperature: 0
    });

    return parseAIResponse(result);
  } catch (error) {
    return {
      parsed: null,
      debug: {
        error:
          error?.message ||
          String(error)
      }
    };
  }
}

async function saveLearning(
  db,
  data,
  analysis
) {
  const runId = id();
  const insightId = id();

  const runInput = {
    measurement: data.measurement,
    content: data.content,
    metrics: data.metrics,
    funnel: data.funnel,
    attribution: data.attribution,
    diagnostic: data.diagnostic,
    learning_signal: data.learning_signal
  };

  const outputData = {
    analysis,
    layer: LAYER,
    winner_decision:
      "NOT_DECLARED_IN_LEARNING_AI_V1.10"
  };

  await db
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `)
    .bind(
      runId,
      null,
      "LEARNING",
      MODEL,
      JSON.stringify(runInput),
      JSON.stringify(outputData),
      "COMPLETED",
      null
    )
    .run();

  const summary =
    analysis?.summary ||
    analysis?.learning?.what_we_learned ||
    "Learning analysis completed";

  const priority =
    ["LOW", "MEDIUM", "HIGH"].includes(
      analysis?.priority
    )
      ? analysis.priority
      : "LOW";

  await db
    .prepare(`
      INSERT INTO ai_insights (
        id,
        run_id,
        agent_name,
        title,
        insight,
        priority,
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `)
    .bind(
      insightId,
      runId,
      "LEARNING_AI_V1.10",
      "CONTENT_LEARNING",
      summary,
      priority,
      "ACTIVE"
    )
    .run();

  return {
    run_id: runId,
    insight_id: insightId
  };
}

async function handle(context, mode) {
  const db = context.env.DB;

  if (!db) {
    return {
      success: false,
      layer: LAYER,
      error: "D1 binding DB not found"
    };
  }

  const measurementId =
    getMeasurementId(
      context.request
    );

  if (!measurementId) {
    return {
      success: false,
      layer: LAYER,
      error:
        "measurement_id is required",
      example:
        "/api/learning-ai?measurement_id=YOUR_MEASUREMENT_ID"
    };
  }

  const data =
    await loadMeasurement(
      db,
      measurementId
    );

  if (!data.success) {
    return {
      success: false,
      layer: LAYER,
      mode,
      error: data.error,
      measurement_id: measurementId
    };
  }

  const aiResult =
    await callAI(
      context.env.AI,
      data
    );

  const analysis =
    aiResult.parsed ||
    fallback(data);

  let saved = null;

  if (mode === "execute") {
    saved =
      await saveLearning(
        db,
        data,
        analysis
      );
  }

  return {
    success: true,

    layer: LAYER,

    mode,

    status:
      aiResult.parsed
        ? "AI_ANALYZED"
        : "FALLBACK_ANALYZED",

    measurement: data.measurement,

    content: data.content,

    metrics: data.metrics,

    funnel: data.funnel,

    attribution: data.attribution,

    learning_signal:
      data.learning_signal,

    ai: {
      status:
        aiResult.parsed
          ? "AI_RESPONSE_PARSED"
          : "FALLBACK_ANALYSIS",

      model: MODEL,

      analysis,

      parsed_json:
        Boolean(aiResult.parsed),

      debug:
        aiResult.parsed
          ? undefined
          : aiResult.debug,

      run_id:
        saved?.run_id || null,

      insight_id:
        saved?.insight_id || null
    },

    control: {
      exact_measurement:
        measurementId,

      winner_decision:
        "NOT_DECLARED_IN_LEARNING_AI_V1.10"
    },

    next_step:
      mode === "execute"
        ? "Send this Learning result to Decision Engine."
        : "Preview ready. POST to save AI Run and AI Insight."
  };
}

export async function onRequestGet(
  context
) {
  try {
    return json(
      await handle(
        context,
        "preview"
      )
    );
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
    return json(
      await handle(
        context,
        "execute"
      )
    );
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
