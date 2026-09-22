export async function onRequest(context) {
  const { request, env } = context;

  if (!env.DB) {
    return json({
      success: false,
      layer: "LEARNING_AI_V1",
      error: "D1 binding DB not found"
    }, 500);
  }

  if (!env.AI) {
    return json({
      success: false,
      layer: "LEARNING_AI_V1",
      error: "Workers AI binding AI not found"
    }, 500);
  }

  const method = request.method.toUpperCase();

  let mode = "preview";

  if (method === "POST") {
    try {
      const body = await request.json();
      mode = body?.mode || "preview";
    } catch {
      mode = "preview";
    }
  }

  try {
    const learning = await getLearning(env.DB);

    if (!learning) {
      return json({
        success: true,
        layer: "LEARNING_AI_V1",
        mode,
        status: "WAITING",
        message: "ยังไม่มี Learning data สำหรับวิเคราะห์",
        ai: null,
        next_step: "Run Learning Feedback Loop first."
      });
    }

    const content = await getContent(env.DB, learning.content_id);

    const metrics = normalizeMetrics(learning);
    const conversion = normalizeConversion(learning);

    const input = {
      learning: {
        signal_type: learning.signal_type,
        title: learning.title,
        finding: learning.finding,
        recommendation: learning.recommendation,
        score: Number(learning.score || 0)
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

    const systemPrompt = `
You are the Learning Intelligence layer of TATO Coffee Intelligence OS.

Analyze only the supplied data.

Rules:
- Do not invent external facts.
- Do not claim success or winner when metrics are zero.
- If all metrics are zero, explicitly say there is not enough behavioral evidence.
- Be concise.
- Return ONLY valid JSON.
- Do NOT explain your reasoning.
- Do NOT use markdown.
`;

    const userPrompt = `
Return this exact JSON structure:

{
  "summary": "short factual summary",
  "observed_signals": ["fact 1", "fact 2"],
  "learning": {
    "what_we_learned": "what the data actually tells us",
    "confidence": "LOW|MEDIUM|HIGH"
  },
  "problems": ["problem 1"],
  "next_content": {
    "action": "CREATE|IMPROVE|DISTRIBUTE|WAIT",
    "direction": "next content direction",
    "angle": "content angle",
    "cta": "CTA",
    "success_metric": "metric to watch"
  },
  "next_action": {
    "type": "DISTRIBUTE|MEASURE|IMPROVE|WAIT",
    "reason": "short reason"
  },
  "priority": "LOW|MEDIUM|HIGH"
}

DATA:
${JSON.stringify(input)}
`;

    const aiResponse = await env.AI.run(
      "@cf/zai-org/glm-4.7-flash",
      {
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
      }
    );

    const rawContent = extractContent(aiResponse);

    let analysis = parseJson(rawContent);

    /*
     * If the model still returns no usable content,
     * create a deterministic fallback from the actual data.
     */
    if (!analysis) {
      analysis = buildFallbackAnalysis(
        learning,
        content,
        metrics,
        conversion
      );
    }

    const aiStatus = rawContent
      ? "AI_ANALYZED"
      : "FALLBACK_ANALYZED";

    let runId = null;
    let insightId = null;

    if (
      method === "POST" &&
      (mode === "execute" || mode === "save")
    ) {
      runId = crypto.randomUUID();

      await env.DB.prepare(`
        INSERT INTO ai_runs (
          id,
          customer_id,
          run_type,
          model,
          input_data,
          output_data,
          status,
          tokens_used
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        runId,
        null,
        "LEARNING_ANALYSIS",
        "@cf/zai-org/glm-4.7-flash",
        JSON.stringify(input),
        JSON.stringify(analysis),
        aiStatus,
        Number(aiResponse?.usage?.total_tokens || 0)
      ).run();

      insightId = crypto.randomUUID();

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
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        insightId,
        null,
        runId,
        "LEARNING",
        analysis.summary || learning.title,
        JSON.stringify(analysis),
        Number(learning.score || 0),
        analysis.priority || "LOW",
        "NEW"
      ).run();
    }

    return json({
      success: true,
      layer: "LEARNING_AI_V1",
      mode,
      status: "ANALYZED",

      learning: {
        signal_type: learning.signal_type,
        title: learning.title,
        finding: learning.finding,
        score: Number(learning.score || 0)
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
        status: aiStatus,
        model: "@cf/zai-org/glm-4.7-flash",
        analysis,
        run_id: runId,
        insight_id: insightId
      },

      next_step:
        method === "POST" &&
        (mode === "execute" || mode === "save")
          ? "AI Learning Insight saved. Next: connect AI → Action Engine."
          : "AI Learning analysis ready for review."
    });

  } catch (error) {
    return json({
      success: false,
      layer: "LEARNING_AI_V1",
      error: error.message || String(error)
    }, 500);
  }
}


/* =========================================================
   LEARNING
========================================================= */

async function getLearning(DB) {
  try {
    const result = await DB.prepare(`
      SELECT *
      FROM learning_feedback
      ORDER BY created_at DESC
      LIMIT 1
    `).all();

    if (result.results?.[0]) {
      return normalizeLearning(result.results[0]);
    }
  } catch {
    // Table may not have a saved learning row yet.
  }

  const measurementResult = await DB.prepare(`
    SELECT *
    FROM content_measurements
    ORDER BY measured_at DESC, created_at DESC
    LIMIT 1
  `).all();

  const measurement = measurementResult.results?.[0];

  if (!measurement) {
    return null;
  }

  const metrics = normalizeMetrics(measurement);

  let signalType = "INSUFFICIENT_DATA";
  let title = "ข้อมูลยังไม่เพียงพอ";
  let finding = "มีข้อมูลบางส่วนแต่ยังไม่สามารถระบุ Pattern ที่ชัดเจนได้";
  let recommendation = "เก็บข้อมูลเพิ่มก่อนปรับ Content";
  let score = 30;

  if (
    metrics.attention === 0 &&
    metrics.product_views === 0 &&
    metrics.clicks === 0 &&
    metrics.engagements === 0 &&
    metrics.customers === 0 &&
    metrics.orders === 0 &&
    metrics.revenue === 0
  ) {
    signalType = "NO_TRAFFIC";
    title = "ยังไม่มี Traffic";
    finding = "ยังไม่พบกิจกรรมที่ใช้เรียนรู้จาก Content";
    recommendation = "เผยแพร่ Content และรอข้อมูลพฤติกรรมก่อนตัดสินผล";
    score = 20;
  }

  return {
    id: null,
    content_id: measurement.content_id || null,
    measurement_id: measurement.id || null,
    signal_type: signalType,
    title,
    finding,
    recommendation,
    score,
    status: "LEARNED",
    metrics,
    conversion: normalizeConversion(measurement)
  };
}


function normalizeLearning(row) {
  return {
    ...row,
    score: Number(row.score || 0)
  };
}


/* =========================================================
   CONTENT
========================================================= */

async function getContent(DB, contentId) {
  if (!contentId) return null;

  const result = await DB.prepare(`
    SELECT *
    FROM content_engine
    WHERE id = ?
    LIMIT 1
  `).bind(contentId).all();

  return result.results?.[0] || null;
}


/* =========================================================
   METRICS
========================================================= */

function normalizeMetrics(source) {
  return {
    attention: Number(source.attention || 0),
    product_views: Number(source.product_views || 0),
    clicks: Number(source.clicks || 0),
    engagements: Number(source.engagements || 0),
    customers: Number(source.customers || 0),
    orders: Number(source.orders || 0),
    revenue: Number(source.revenue || 0)
  };
}


function normalizeConversion(source) {
  const metrics = normalizeMetrics(source);

  const rate = (a, b) => {
    if (!b || b <= 0) return 0;
    return Number(((a / b) * 100).toFixed(2));
  };

  return {
    attention_to_view: rate(
      metrics.product_views,
      metrics.attention
    ),
    view_to_click: rate(
      metrics.clicks,
      metrics.product_views
    ),
    click_to_customer: rate(
      metrics.customers,
      metrics.clicks
    ),
    customer_to_order: rate(
      metrics.orders,
      metrics.customers
    ),
    engagement_to_order: rate(
      metrics.orders,
      metrics.engagements
    )
  };
}


/* =========================================================
   AI RESPONSE PARSER
========================================================= */

function extractContent(response) {
  if (!response) return null;

  if (typeof response === "string") {
    return response;
  }

  if (typeof response.response === "string") {
    return response.response;
  }

  if (typeof response.content === "string") {
    return response.content;
  }

  if (Array.isArray(response.content)) {
    return response.content
      .map(item => {
        if (typeof item === "string") return item;
        return item?.text || item?.content || "";
      })
      .join("")
      .trim();
  }

  if (response.choices?.[0]?.message?.content) {
    return response.choices[0].message.content;
  }

  return null;
}


function parseJson(value) {
  if (!value) return null;

  if (typeof value === "object") {
    return value;
  }

  let text = String(value).trim();

  if (!text) return null;

  text = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(text);
  } catch {
    // Try extracting the first JSON object.
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start >= 0 && end > start) {
    try {
      return JSON.parse(
        text.slice(start, end + 1)
      );
    } catch {
      return null;
    }
  }

  return null;
}


/* =========================================================
   DETERMINISTIC FALLBACK
========================================================= */

function buildFallbackAnalysis(
  learning,
  content,
  metrics,
  conversion
) {
  const noTraffic =
    metrics.attention === 0 &&
    metrics.product_views === 0 &&
    metrics.clicks === 0 &&
    metrics.engagements === 0 &&
    metrics.customers === 0 &&
    metrics.orders === 0 &&
    metrics.revenue === 0;

  if (noTraffic) {
    return {
      summary:
        "ยังไม่มีข้อมูลพฤติกรรมจาก Content จึงยังประเมินประสิทธิภาพไม่ได้",

      observed_signals: [
        "Learning signal คือ NO_TRAFFIC",
        "Metrics ทั้งหมดยังเป็น 0",
        "ยังไม่มีข้อมูล Conversion"
      ],

      learning: {
        what_we_learned:
          "ยังไม่มี behavioral evidence เพียงพอสำหรับตัดสิน Content",
        confidence: "LOW"
      },

      problems: [
        "ยังไม่มี Traffic",
        "ยังไม่มีข้อมูลสำหรับวัด Conversion"
      ],

      next_content: {
        action:
          content?.status === "READY_TO_PUBLISH"
            ? "DISTRIBUTE"
            : "WAIT",
        direction:
          "เผยแพร่ Content ปัจจุบันเพื่อสร้าง Traffic และเก็บข้อมูลพฤติกรรม",
        angle:
          content?.angle || "ใช้ Angle เดิมเพื่อสร้างข้อมูลชุดแรก",
        cta:
          content?.cta || "ดูรายละเอียดและทดลอง TATO",
        success_metric:
          "Product Views"
      },

      next_action: {
        type: "DISTRIBUTE",
        reason:
          "Content พร้อมเผยแพร่ แต่ยังไม่มีข้อมูลพฤติกรรมสำหรับการเรียนรู้"
      },

      priority: "LOW"
    };
  }

  return {
    summary:
      "มีข้อมูลพฤติกรรมบางส่วน แต่ยังควรเก็บข้อมูลเพิ่มก่อนปรับ Content",

    observed_signals: [
      `Attention: ${metrics.attention}`,
      `Product Views: ${metrics.product_views}`,
      `Clicks: ${metrics.clicks}`,
      `Orders: ${metrics.orders}`
    ],

    learning: {
      what_we_learned:
        "เริ่มมี behavioral data แต่ยังต้องติดตาม Conversion เพิ่ม",
      confidence: "LOW"
    },

    problems: [
      "ข้อมูลยังมีปริมาณจำกัด",
      "ยังไม่ควรสรุป Content winner"
    ],

    next_content: {
      action: "WAIT",
      direction:
        "เก็บข้อมูลเพิ่มเติมจาก Content ปัจจุบัน",
      angle:
        content?.angle || "",
      cta:
        content?.cta || "",
      success_metric:
        "Clicks"
    },

    next_action: {
      type: "MEASURE",
      reason:
        "ต้องเก็บข้อมูลเพิ่มก่อนตัดสินใจปรับ Content"
    },

    priority: "MEDIUM"
  };
}


/* =========================================================
   JSON RESPONSE
========================================================= */

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
