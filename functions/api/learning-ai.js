const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const LAYER = "LEARNING_AI_V1.10";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}

function safeJsonParse(value, fallback = {}) {
  if (value === null || value === undefined) return fallback;

  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeConfidence(value) {
  const v = String(value || "").toUpperCase();

  if (v === "HIGH") return "HIGH";
  if (v === "MEDIUM") return "MEDIUM";
  return "LOW";
}

function confidenceScore(confidence) {
  if (confidence === "HIGH") return 0.9;
  if (confidence === "MEDIUM") return 0.6;
  return 0.3;
}

function normalizePriority(value) {
  const v = String(value || "").toUpperCase();

  if (v === "HIGH") return "HIGH";
  if (v === "LOW") return "LOW";
  return "MEDIUM";
}

function extractAIText(result) {
  if (!result) return "";

  if (typeof result === "string") return result;

  if (typeof result.response === "string") {
    return result.response;
  }

  if (result.response && typeof result.response === "object") {
    return JSON.stringify(result.response);
  }

  if (typeof result.result === "string") {
    return result.result;
  }

  if (result.result && typeof result.result === "object") {
    if (typeof result.result.response === "string") {
      return result.result.response;
    }

    return JSON.stringify(result.result);
  }

  return JSON.stringify(result);
}

function parseAIJson(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {}

  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");

  if (first >= 0 && last > first) {
    try {
      return JSON.parse(cleaned.slice(first, last + 1));
    } catch {}
  }

  return null;
}

function buildFallback(measurement, content) {
  const metrics = {
    attention: Number(measurement.attention || 0),
    product_views: Number(measurement.product_views || 0),
    clicks: Number(measurement.clicks || 0),
    engagements: Number(measurement.engagements || 0),
    customers: Number(measurement.customers || 0),
    orders: Number(measurement.orders || 0),
    revenue: Number(measurement.revenue || 0)
  };

  const observed = [];
  const problems = [];

  if (metrics.attention > 0) {
    observed.push(`มี Attention ${metrics.attention} ครั้ง`);
  }

  if (metrics.clicks > 0) {
    observed.push(`มี Click ${metrics.clicks} ครั้ง`);
  }

  if (metrics.product_views > 0) {
    observed.push(`มี Product View ${metrics.product_views} ครั้ง`);
  }

  if (metrics.engagements > 0) {
    observed.push(`มี Engagement ${metrics.engagements} ครั้ง`);
  }

  if (metrics.customers > 0) {
    observed.push(`มี Customer ${metrics.customers} ราย`);
  }

  if (metrics.orders > 0) {
    observed.push(`มี Order ${metrics.orders} รายการ`);
  }

  if (metrics.revenue > 0) {
    observed.push(`มี Revenue ${metrics.revenue} บาท`);
  }

  if (metrics.product_views === 0) {
    problems.push("ยังไม่มี Product View");
  }

  if (metrics.engagements === 0) {
    problems.push("ยังไม่มี Engagement");
  }

  if (metrics.customers === 0) {
    problems.push("ยังไม่มี Customer");
  }

  if (metrics.orders === 0) {
    problems.push("ยังไม่มี Order");
  }

  if (metrics.revenue === 0) {
    problems.push("ยังไม่มี Revenue");
  }

  let whatWeLearned = "ยังมีข้อมูลไม่เพียงพอสำหรับสรุปผลลัพธ์เชิง Conversion";

  if (metrics.attention > 0 && metrics.clicks > 0 && metrics.product_views === 0) {
    whatWeLearned =
      "Content สามารถสร้าง Attention และ Click ได้ แต่ยังไม่สามารถพาผู้ใช้ไปถึง Product View";
  } else if (metrics.attention > 0 && metrics.clicks === 0) {
    whatWeLearned =
      "Content สามารถสร้าง Attention ได้ แต่ยังไม่เกิด Click ต่อ";
  } else if (metrics.product_views > 0 && metrics.orders === 0) {
    whatWeLearned =
      "Content สามารถพาผู้ใช้ไปถึง Product View แต่ยังไม่เกิด Order";
  } else if (metrics.orders > 0 || metrics.revenue > 0) {
    whatWeLearned =
      "Content มีสัญญาณปลายทางจาก Customer หรือ Conversion";
  }

  return {
    summary: `การวัดผล Content "${content?.title || "ไม่ระบุ"}"`,
    observed_signals: observed,
    learning: {
      what_we_learned: whatWeLearned,
      confidence: "LOW"
    },
    problems,
    next_content: {
      action: "OPTIMIZE",
      direction: "ปรับปรุง Content จากข้อมูล Measurement",
      angle: content?.angle || "ปรับข้อความให้สอดคล้องกับความสนใจของผู้ชม",
      cta: content?.cta || "ดูรายละเอียดและทดลอง TATO",
      success_metric: "Product Views และ Conversion"
    },
    next_action: {
      type: "OPTIMIZE",
      reason: "เก็บข้อมูลและปรับปรุง Content จากสัญญาณที่เกิดขึ้นจริง"
    },
    priority: "MEDIUM"
  };
}

async function loadMeasurement(env, measurementId) {
  if (!measurementId) {
    throw new Error("measurement_id is required");
  }

  const result = await env.DB.prepare(`
    SELECT *
    FROM content_measurements
    WHERE id = ?
    LIMIT 1
  `)
    .bind(measurementId)
    .first();

  if (!result) {
    throw new Error(`Measurement not found: ${measurementId}`);
  }

  return result;
}

async function loadContent(env, contentId) {
  if (!contentId) return null;

  const result = await env.DB.prepare(`
    SELECT *
    FROM content_engine
    WHERE id = ?
    LIMIT 1
  `)
    .bind(contentId)
    .first();

  return result || null;
}

function buildPrompt(measurement, content) {
  const metrics = {
    attention: Number(measurement.attention || 0),
    product_views: Number(measurement.product_views || 0),
    clicks: Number(measurement.clicks || 0),
    engagements: Number(measurement.engagements || 0),
    customers: Number(measurement.customers || 0),
    orders: Number(measurement.orders || 0),
    revenue: Number(measurement.revenue || 0)
  };

  const funnel = safeJsonParse(measurement.funnel, {});
  const attribution = safeJsonParse(measurement.attribution, {});
  const diagnostic = safeJsonParse(measurement.diagnostic, {});
  const learningSignal = safeJsonParse(
    measurement.learning_signal,
    {}
  );

  return `
คุณคือ Learning AI ของ TATO Coffee Intelligence OS

หน้าที่:
วิเคราะห์ "Measurement ที่เกิดขึ้นจริง" และเปลี่ยนเป็น Learning
เพื่อใช้เป็นข้อมูลให้ Decision Engine ในขั้นตอนถัดไป

กฎสำคัญ:
1. ใช้ข้อมูล Measurement จริงเป็นหลัก
2. ห้ามสร้างตัวเลขขึ้นเอง
3. ห้ามประกาศ Winner
4. ห้ามสรุปว่า Content ดีหรือแย่แบบไม่มีหลักฐาน
5. ถ้าข้อมูลยังไม่พอ ให้ระบุว่า confidence ต่ำ
6. แยกสิ่งที่พบจากสิ่งที่ควรทำ
7. Next Action ต้องสอดคล้องกับข้อมูล
8. อย่าเปลี่ยนกลยุทธ์ใหญ่เพียงเพราะข้อมูลชุดเดียว
9. ให้ความสำคัญกับเส้นทาง Attention → Click → Product View → Customer → Order → Revenue

CONTENT
${JSON.stringify(content || {}, null, 2)}

MEASUREMENT
${JSON.stringify({
  id: measurement.id,
  content_id: measurement.content_id,
  status: measurement.status,
  measured_at: measurement.measured_at,
  measurement_start: measurement.measurement_start,
  metrics,
  funnel,
  attribution,
  diagnostic,
  learning_signal
}, null, 2)}

ตอบเป็น JSON เท่านั้น ตาม schema นี้:

{
  "summary": "สรุปสั้นๆ",
  "observed_signals": [
    "สิ่งที่เกิดขึ้นจริง"
  ],
  "learning": {
    "what_we_learned": "สิ่งที่เรียนรู้",
    "confidence": "LOW|MEDIUM|HIGH"
  },
  "problems": [
    "ปัญหาที่พบจากข้อมูลจริง"
  ],
  "next_content": {
    "action": "OPTIMIZE|CONTINUE|CHANGE_ANGLE|CHANGE_CTA|HOLD",
    "direction": "ทิศทาง",
    "angle": "มุม Content ถัดไป",
    "cta": "CTA",
    "success_metric": "Metric ที่ควรติดตาม"
  },
  "next_action": {
    "type": "ชื่อ Action",
    "reason": "เหตุผล"
  },
  "priority": "LOW|MEDIUM|HIGH"
}
`;
}

async function runAI(env, prompt) {
  if (!env.AI || typeof env.AI.run !== "function") {
    throw new Error("Cloudflare AI binding is not available");
  }

  const result = await env.AI.run(MODEL, {
    messages: [
      {
        role: "system",
        content:
          "You are a precise business learning AI. Return valid JSON only."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    response_format: {
      type: "json_object"
    }
  });

  const responseText = extractAIText(result);

  if (!responseText) {
    throw new Error("AI returned empty response");
  }

  const parsed = parseAIJson(responseText);

  if (!parsed) {
    throw new Error("AI response could not be parsed as JSON");
  }

  return {
    parsed,
    responseText
  };
}

async function saveLearning(env, measurement, analysis, aiMeta) {
  const runId = crypto.randomUUID();
  const insightId = crypto.randomUUID();

  const confidence = normalizeConfidence(
    analysis?.learning?.confidence
  );

  const priority = normalizePriority(analysis?.priority);

  const inputData = {
    measurement: {
      id: measurement.id,
      content_id: measurement.content_id
    }
  };

  const outputData = {
    layer: LAYER,
    measurement_id: measurement.id,
    content_id: measurement.content_id,
    analysis,
    ai: aiMeta
  };

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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `)
    .bind(
      runId,
      null,
      "LEARNING",
      MODEL,
      JSON.stringify(inputData),
      JSON.stringify(outputData),
      "COMPLETED",
      null
    )
    .run();

  const insightContent = {
    layer: LAYER,
    measurement_id: measurement.id,
    content_id: measurement.content_id,
    summary: analysis?.summary || "",
    observed_signals: analysis?.observed_signals || [],
    learning: analysis?.learning || {},
    problems: analysis?.problems || [],
    next_content: analysis?.next_content || {},
    next_action: analysis?.next_action || {},
    winner_decision: "NOT_DECLARED_IN_LEARNING_AI_V1.10"
  };

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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `)
    .bind(
      insightId,
      null,
      runId,
      "LEARNING",
      "CONTENT_LEARNING",
      JSON.stringify(insightContent),
      confidenceScore(confidence),
      priority,
      "ACTIVE"
    )
    .run();

  return {
    runId,
    insightId,
    confidence,
    priority
  };
}

async function handle(request, env) {
  const url = new URL(request.url);

  let body = {};

  if (request.method === "POST") {
    try {
      body = await request.json();
    } catch {
      body = {};
    }
  }

  const measurementId =
    url.searchParams.get("measurement_id") ||
    body.measurement_id ||
    "d610ae06-8331-4feb-a180-f9cd0abbed9d";

  const mode = request.method === "POST" ? "execute" : "preview";

  const measurement = await loadMeasurement(
    env,
    measurementId
  );

  const content = await loadContent(
    env,
    measurement.content_id
  );

  const prompt = buildPrompt(
    measurement,
    content
  );

  let analysis;
  let aiCalled = false;
  let responseText = "";
  let parsedJson = false;
  let aiError = null;

  try {
    const ai = await runAI(env, prompt);

    analysis = ai.parsed;
    responseText = ai.responseText;
    aiCalled = true;
    parsedJson = true;
  } catch (error) {
    aiError = String(error?.message || error);
    analysis = buildFallback(
      measurement,
      content
    );
  }

  const confidence = normalizeConfidence(
    analysis?.learning?.confidence
  );

  const priority = normalizePriority(
    analysis?.priority
  );

  const result = {
    success: true,
    layer: LAYER,
    mode,
    status: "AI_ANALYZED",

    measurement: {
      id: measurement.id,
      content_id: measurement.content_id,
      status: measurement.status,
      measured_at: measurement.measured_at,
      measurement_start: measurement.measurement_start
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

    metrics: {
      attention: Number(measurement.attention || 0),
      product_views: Number(
        measurement.product_views || 0
      ),
      clicks: Number(measurement.clicks || 0),
      engagements: Number(
        measurement.engagements || 0
      ),
      customers: Number(
        measurement.customers || 0
      ),
      orders: Number(
        measurement.orders || 0
      ),
      revenue: Number(
        measurement.revenue || 0
      )
    },

    funnel: safeJsonParse(
      measurement.funnel,
      {}
    ),

    attribution: safeJsonParse(
      measurement.attribution,
      {}
    ),

    diagnostic: safeJsonParse(
      measurement.diagnostic,
      {}
    ),

    learning_signal: safeJsonParse(
      measurement.learning_signal,
      {}
    ),

    analysis,

    ai: {
      model: MODEL,
      ai_called: aiCalled,
      response_text_received:
        Boolean(responseText),
      parsed_json: parsedJson,
      error: aiError,
      provider_status: aiCalled
        ? "AI_RESPONSE_PARSED"
        : "FALLBACK_USED"
    },

    winner_decision:
      "NOT_DECLARED_IN_LEARNING_AI_V1.10",

    run_id: null,
    insight_id: null
  };

  if (mode === "execute") {
    const saved = await saveLearning(
      env,
      measurement,
      analysis,
      {
        model: MODEL,
        ai_called: aiCalled,
        parsed_json: parsedJson,
        provider_status: aiCalled
          ? "AI_RESPONSE_PARSED"
          : "FALLBACK_USED",
        error: aiError
      }
    );

    result.run_id = saved.runId;
    result.insight_id = saved.insightId;
    result.confidence = saved.confidence;
    result.priority = saved.priority;
    result.status = "AI_ANALYZED_AND_SAVED";
  }

  return result;
}

export async function onRequestGet(context) {
  try {
    const result = await handle(
      context.request,
      context.env
    );

    return json(result);
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        error: String(
          error?.message || error
        )
      },
      500
    );
  }
}

export async function onRequestPost(context) {
  try {
    const result = await handle(
      context.request,
      context.env
    );

    return json(result);
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        error: String(
          error?.message || error
        )
      },
      500
    );
  }
}
