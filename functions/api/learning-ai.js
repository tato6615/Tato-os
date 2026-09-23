````javascript
// TATO-OS
// Learning AI V1.1
// Learning Feedback -> Workers AI -> Structured Learning Insight

export async function onRequestGet(context) {
  return handleRequest(context, "preview");
}

export async function onRequestPost(context) {
  let body = {};

  try {
    body = await context.request.json();
  } catch (_) {
    body = {};
  }

  return handleRequest(context, body.mode || "preview");
}

async function handleRequest(context, mode) {
  const { env } = context;

  if (!env.DB) {
    return json({
      success: false,
      error: "D1 binding DB not found"
    }, 500);
  }

  if (!env.AI) {
    return json({
      success: false,
      error: "Workers AI binding AI not found"
    }, 500);
  }

  try {
    const learning = await getLearning(env.DB);
    const content = await getContent(env.DB, learning?.content_id);

    const metrics = normalizeMetrics(learning);
    const conversion = normalizeConversion(learning);

    const input = {
      learning: {
        signal_type: learning?.signal_type || "UNKNOWN",
        title: learning?.title || "",
        finding: learning?.finding || "",
        score: Number(learning?.score || 0)
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
      conversion
    };

    const aiResult = await runAI(env.AI, input);

    if (mode === "execute" || mode === "save") {
      const saved = await saveLearningAI(
        env.DB,
        input,
        aiResult
      );

      return json({
        success: true,
        layer: "LEARNING_AI_V1",
        mode,
        status: "ANALYZED",
        learning: input.learning,
        content: input.content,
        metrics,
        conversion,
        ai: {
          ...aiResult,
          run_id: saved.run_id,
          insight_id: saved.insight_id
        },
        next_step: "Learning AI analysis saved. Ready for AI → Action Engine."
      });
    }

    return json({
      success: true,
      layer: "LEARNING_AI_V1",
      mode: "preview",
      status: "ANALYZED",
      learning: input.learning,
      content: input.content,
      metrics,
      conversion,
      ai: aiResult,
      next_step: "AI Learning analysis ready for review."
    });

  } catch (error) {
    return json({
      success: false,
      layer: "LEARNING_AI_V1",
      error: error?.message || String(error)
    }, 500);
  }
}

async function getLearning(DB) {
  try {
    const result = await DB.prepare(`
      SELECT
        id,
        content_id,
        signal_type,
        title,
        finding,
        recommendation,
        score,
        status,
        created_at
      FROM learning_feedback
      ORDER BY created_at DESC
      LIMIT 1
    `).first();

    if (result) {
      return result;
    }
  } catch (_) {
    // Fallback to content measurements below.
  }

  try {
    const result = await DB.prepare(`
      SELECT
        id,
        content_id,
        status,
        measured_at,
        metrics,
        learning_signal
      FROM content_measurements
      ORDER BY measured_at DESC
      LIMIT 1
    `).first();

    if (!result) {
      return null;
    }

    const metrics = parseJSON(result.metrics);
    const signal = parseJSON(result.learning_signal);

    let signalType = "NO_DATA";
    let title = "ยังไม่มีข้อมูล";
    let finding = "ยังไม่มีข้อมูลเพียงพอสำหรับการเรียนรู้";
    let score = 0;

    if (signal?.has_conversion) {
      signalType = "CONVERSION";
      title = "พบ Conversion";
      finding = "Content มีข้อมูลการเปลี่ยนเป็นคำสั่งซื้อ";
      score = 90;
    } else if (signal?.has_customer) {
      signalType = "CUSTOMER";
      title = "พบ Customer";
      finding = "Content มีข้อมูลลูกค้า";
      score = 70;
    } else if (signal?.has_engagement) {
      signalType = "ENGAGEMENT";
      title = "พบ Engagement";
      finding = "Content มี Engagement";
      score = 55;
    } else if (signal?.has_traffic) {
      signalType = "TRAFFIC";
      title = "พบ Traffic";
      finding = "Content เริ่มมี Traffic";
      score = 40;
    } else {
      signalType = "NO_TRAFFIC";
      title = "ยังไม่มี Traffic";
      finding = "ยังไม่พบกิจกรรมที่ใช้เรียนรู้จาก Content";
      score = 20;
    }

    return {
      id: null,
      content_id: result.content_id,
      signal_type: signalType,
      title,
      finding,
      recommendation: "เก็บข้อมูลพฤติกรรมต่อเนื่องก่อนตัดสินผล",
      score,
      status: "LEARNED",
      metrics
    };
  } catch (_) {
    return null;
  }
}

async function getContent(DB, contentId) {
  try {
    if (contentId) {
      const row = await DB.prepare(`
        SELECT
          id,
          source,
          status,
          title,
          objective,
          attention_type,
          market_keyword,
          angle,
          direction,
          cta,
          content_text,
          created_at
        FROM content_engine
        WHERE id = ?
        LIMIT 1
      `)
        .bind(contentId)
        .first();

      if (row) return row;
    }

    return await DB.prepare(`
      SELECT
        id,
        source,
        status,
        title,
        objective,
        attention_type,
        market_keyword,
        angle,
        direction,
        cta,
        content_text,
        created_at
      FROM content_engine
      ORDER BY created_at DESC
      LIMIT 1
    `).first();
  } catch (_) {
    return null;
  }
}

function normalizeMetrics(learning) {
  const source = learning?.metrics || {};

  return {
    attention: number(source.attention),
    product_views: number(source.product_views),
    clicks: number(source.clicks),
    engagements: number(source.engagements),
    customers: number(source.customers),
    orders: number(source.orders),
    revenue: number(source.revenue)
  };
}

function normalizeConversion(learning) {
  const source = learning?.conversion || {};

  return {
    attention_to_view: number(source.attention_to_view),
    view_to_click: number(source.view_to_click),
    click_to_customer: number(source.click_to_customer),
    customer_to_order: number(source.customer_to_order),
    engagement_to_order: number(source.engagement_to_order)
  };
}

async function runAI(AI, input) {
  const model = "@cf/zai-org/glm-4.7-flash";

  const systemPrompt = `
You are the Learning Intelligence engine for TATO Coffee.

Analyze the supplied learning and content data.

Return ONLY valid JSON.
Do not explain your reasoning.
Do not use markdown.
Do not add text before or after JSON.

Required JSON schema:
{
  "summary": "string",
  "observed_signals": ["string"],
  "learning": {
    "what_we_learned": "string",
    "confidence": "LOW|MEDIUM|HIGH"
  },
  "problems": ["string"],
  "next_content": {
    "action": "DISTRIBUTE|OPTIMIZE|CREATE|WAIT",
    "direction": "string",
    "angle": "string",
    "cta": "string",
    "success_metric": "string"
  },
  "next_action": {
    "type": "DISTRIBUTE|OPTIMIZE|CREATE|WAIT",
    "reason": "string"
  },
  "priority": "LOW|MEDIUM|HIGH"
}
`.trim();

  const userPrompt = JSON.stringify(input);

  let response;

  try {
    response = await AI.run(model, {
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      reasoning_effort: "low",
      max_completion_tokens: 900,
      temperature: 0.2,
      response_format: {
        type: "json_object"
      }
    });
  } catch (error) {
    return {
      status: "FALLBACK_ANALYZED",
      model,
      analysis: fallbackAnalysis(input),
      error: error?.message || String(error),
      run_id: null,
      insight_id: null
    };
  }

  const content = extractContent(response);
  const parsed = parseAIJSON(content);

  if (!parsed) {
    return {
      status: "FALLBACK_ANALYZED",
      model,
      analysis: fallbackAnalysis(input),
      raw_response: response,
      run_id: null,
      insight_id: null
    };
  }

  return {
    status: "AI_ANALYZED",
    model,
    analysis: parsed,
    run_id: null,
    insight_id: null
  };
}

function extractContent(response) {
  if (!response) return "";

  if (typeof response === "string") {
    return response;
  }

  const choices = response.choices;

  if (Array.isArray(choices) && choices.length > 0) {
    const message = choices[0]?.message;

    if (typeof message?.content === "string") {
      return message.content;
    }

    if (Array.isArray(message?.content)) {
      return message.content
        .map(item => {
          if (typeof item === "string") return item;
          return item?.text || item?.content || "";
        })
        .join("");
    }

    if (typeof choices[0]?.text === "string") {
      return choices[0].text;
    }
  }

  if (typeof response.response === "string") {
    return response.response;
  }

  if (Array.isArray(response.response)) {
    return response.response
      .map(item => item?.text || item?.content || String(item))
      .join("");
  }

  return "";
}

function parseAIJSON(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  let text = value.trim();

  if (text.startsWith("```")) {
    text = text
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
  }

  try {
    return JSON.parse(text);
  } catch (_) {}

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (_) {}
  }

  return null;
}

function fallbackAnalysis(input) {
  const learning = input.learning || {};
  const metrics = input.metrics || {};
  const content = input.content || {};

  const hasTraffic =
    metrics.product_views > 0 ||
    metrics.clicks > 0 ||
    metrics.engagements > 0;

  const hasConversion =
    metrics.customers > 0 ||
    metrics.orders > 0 ||
    metrics.revenue > 0;

  if (hasConversion) {
    return {
      summary: "Content มีสัญญาณ Conversion แล้ว",
      observed_signals: [
        `Orders: ${metrics.orders}`,
        `Customers: ${metrics.customers}`,
        `Revenue: ${metrics.revenue}`
      ],
      learning: {
        what_we_learned: "Content มีหลักฐานว่าความสนใจสามารถนำไปสู่ Conversion",
        confidence: "MEDIUM"
      },
      problems: [],
      next_content: {
        action: "OPTIMIZE",
        direction: content.direction || "ปรับ Content โดยรักษาองค์ประกอบที่สัมพันธ์กับ Conversion",
        angle: content.angle || "",
        cta: content.cta || "ดูรายละเอียดและทดลอง TATO",
        success_metric: "Orders"
      },
      next_action: {
        type: "OPTIMIZE",
        reason: "มี Conversion แล้ว ควรเพิ่มประสิทธิภาพจากข้อมูลที่เกิดขึ้นจริง"
      },
      priority: "HIGH"
    };
  }

  if (hasTraffic) {
    return {
      summary: "Content เริ่มมี Traffic แต่ยังไม่มี Conversion เพียงพอ",
      observed_signals: [
        `Product Views: ${metrics.product_views}`,
        `Clicks: ${metrics.clicks}`,
        `Engagements: ${metrics.engagements}`
      ],
      learning: {
        what_we_learned: "มีความสนใจเริ่มต้น แต่ยังต้องเก็บข้อมูลต่อเพื่อประเมินการเปลี่ยนเป็นลูกค้า",
        confidence: "MEDIUM"
      },
      problems: [
        "ยังไม่มี Conversion เพียงพอ"
      ],
      next_content: {
        action: "OPTIMIZE",
        direction: content.direction || "ปรับ CTA และเนื้อหาให้พาผู้สนใจไปยังขั้นถัดไป",
        angle: content.angle || "",
        cta: content.cta || "ดูรายละเอียดและทดลอง TATO",
        success_metric: "Customers"
      },
      next_action: {
        type: "OPTIMIZE",
        reason: "มี Traffic แล้ว ควรเพิ่มการเก็บ Conversion"
      },
      priority: "MEDIUM"
    };
  }

  return {
    summary: "ยังไม่มีข้อมูลพฤติกรรมจาก Content จึงยังประเมินประสิทธิภาพไม่ได้",
    observed_signals: [
      `Learning signal คือ ${learning.signal_type || "NO_DATA"}`,
      "Metrics ทั้งหมดยังไม่มีสัญญาณที่เพียงพอ",
      "ยังไม่มีข้อมูล Conversion"
    ],
    learning: {
      what_we_learned: "ยังไม่มี behavioral evidence เพียงพอสำหรับตัดสิน Content",
      confidence: "LOW"
    },
    problems: [
      "ยังไม่มี Traffic",
      "ยังไม่มีข้อมูลสำหรับวัด Conversion"
    ],
    next_content: {
      action: "DISTRIBUTE",
      direction: content.direction || "เผยแพร่ Content ปัจจุบันเพื่อสร้าง Traffic และเก็บข้อมูลพฤติกรรม",
      angle: content.angle || "",
      cta: content.cta || "ดูรายละเอียดและทดลอง TATO",
      success_metric: "Product Views"
    },
    next_action: {
      type: "DISTRIBUTE",
      reason: "Content พร้อมเผยแพร่ แต่ยังไม่มีข้อมูลพฤติกรรมสำหรับการเรียนรู้"
    },
    priority: "LOW"
  };
}

async function saveLearningAI(DB, input, aiResult) {
  const runId = crypto.randomUUID();
  const insightId = crypto.randomUUID();

  await DB.prepare(`
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

  await DB.prepare(`
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

  const now = new Date().toISOString();

  await DB.prepare(`
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
      aiResult.model || "@cf/zai-org/glm-4.7-flash",
      JSON.stringify(input),
      JSON.stringify(aiResult.analysis || {}),
      aiResult.status || "ANALYZED",
      null,
      now
    )
    .run();

  const analysis = aiResult.analysis || {};

  await DB.prepare(`
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
      analysis.summary || "Learning AI Analysis",
      JSON.stringify(analysis),
      Number(input.learning?.score || 0),
      analysis.priority || "LOW",
      "NEW",
      now
    )
    .run();

  return {
    run_id: runId,
    insight_id: insightId
  };
}

function parseJSON(value) {
  if (!value) return {};

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (_) {
    return {};
  }
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}
````
