export async function onRequest(context) {
  const { request, env } = context;

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

  const method = request.method.toUpperCase();

  if (method !== "GET" && method !== "POST") {
    return json({
      success: false,
      error: "Method not allowed"
    }, 405);
  }

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
    /*
     * ---------------------------------------------------------
     * 1. Load latest Learning Feedback
     * ---------------------------------------------------------
     */

    const learningResult = await env.DB.prepare(`
      SELECT *
      FROM learning_feedback
      ORDER BY created_at DESC
      LIMIT 1
    `).all();

    let learning = learningResult.results?.[0] || null;

    /*
     * If Learning Feedback has not been saved yet,
     * calculate a fresh Learning result from /api/learning logic.
     */

    if (!learning) {
      const measurementResult = await env.DB.prepare(`
        SELECT *
        FROM content_measurements
        ORDER BY measured_at DESC, created_at DESC
        LIMIT 1
      `).all();

      const measurement = measurementResult.results?.[0] || null;

      if (!measurement) {
        return json({
          success: true,
          layer: "LEARNING_AI_V1",
          mode,
          status: "WAITING",
          message: "No Content Measurement available for AI analysis.",
          learning: null,
          ai: null
        });
      }

      learning = buildLearningFromMeasurement(measurement);
    }

    /*
     * ---------------------------------------------------------
     * 2. Load related Content
     * ---------------------------------------------------------
     */

    let content = null;

    if (learning.content_id) {
      const contentResult = await env.DB.prepare(`
        SELECT *
        FROM content_engine
        WHERE id = ?
        LIMIT 1
      `).bind(learning.content_id).all();

      content = contentResult.results?.[0] || null;
    }

    /*
     * ---------------------------------------------------------
     * 3. Load latest Measurement
     * ---------------------------------------------------------
     */

    const measurementResult = await env.DB.prepare(`
      SELECT *
      FROM content_measurements
      ORDER BY measured_at DESC, created_at DESC
      LIMIT 1
    `).all();

    const measurement = measurementResult.results?.[0] || null;

    /*
     * ---------------------------------------------------------
     * 4. Normalize metrics
     * ---------------------------------------------------------
     */

    const metrics = {
      attention: Number(measurement?.attention || 0),
      product_views: Number(measurement?.product_views || 0),
      clicks: Number(measurement?.clicks || 0),
      engagements: Number(measurement?.engagements || 0),
      customers: Number(measurement?.customers || 0),
      orders: Number(measurement?.orders || 0),
      revenue: Number(measurement?.revenue || 0)
    };

    const conversion = {
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

    /*
     * ---------------------------------------------------------
     * 5. Prepare AI input
     * ---------------------------------------------------------
     */

    const aiInput = {
      system: {
        role: "TATO Coffee Intelligence OS",
        layer: "LEARNING_AI_V1",
        objective:
          "Analyze learning signals from measured Content and recommend the next Content or growth action.",
        rules: [
          "Use only supplied evidence.",
          "Do not invent traffic, customers, orders, revenue, or market facts.",
          "Separate observed facts from recommendations.",
          "Do not declare a winner without sufficient evidence.",
          "Prefer measurable next actions.",
          "Keep recommendations practical for a small business."
        ]
      },

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
            cta: content.cta,
            content_text: content.content_text
          }
        : null,

      measurement: measurement
        ? {
            id: measurement.id,
            status: measurement.status,
            attribution_mode: measurement.attribution_mode,
            measurement_start: measurement.measurement_start,
            measured_at: measurement.measured_at
          }
        : null,

      metrics,

      conversion
    };

    /*
     * ---------------------------------------------------------
     * 6. AI Prompt
     * ---------------------------------------------------------
     */

    const prompt = `
You are the Learning Intelligence layer of TATO Coffee Intelligence OS.

Analyze the supplied Learning, Content Measurement, metrics and conversion data.

Return ONLY valid JSON.

Required JSON structure:

{
  "summary": "short factual summary",
  "observed_signals": [
    "fact based only on supplied data"
  ],
  "learning": {
    "what_we_learned": "what the data currently tells us",
    "confidence": "LOW | MEDIUM | HIGH"
  },
  "problems": [
    "problem supported by data"
  ],
  "next_content": {
    "action": "CREATE | IMPROVE | DISTRIBUTE | WAIT",
    "direction": "specific direction",
    "angle": "recommended angle",
    "cta": "recommended CTA",
    "success_metric": "metric to measure"
  },
  "next_action": {
    "type": "CONTENT | DISTRIBUTION | CTA | OFFER | MEASUREMENT | WAIT",
    "reason": "why this action follows from the evidence"
  },
  "priority": "LOW | MEDIUM | HIGH"
}

Important:
- If all metrics are zero, say there is not enough behavioral evidence.
- Do not claim the Content is successful.
- Do not claim the Content is a winner.
- Do not invent external market information.
- Recommendations must follow the evidence.

DATA:

${JSON.stringify(aiInput, null, 2)}
`;

    /*
     * ---------------------------------------------------------
     * 7. Run Workers AI
     * ---------------------------------------------------------
     */

    const aiResponse = await env.AI.run(
      "@cf/zai-org/glm-4.7-flash",
      {
        messages: [
          {
            role: "system",
            content:
              "You are a precise business intelligence analyst. Return valid JSON only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        reasoning_effort: "low",
        max_completion_tokens: 1800,
        temperature: 0.3
      }
    );

    /*
     * ---------------------------------------------------------
     * 8. Parse AI response
     * ---------------------------------------------------------
     */

    const rawOutput = extractAIText(aiResponse);

    const ai = parseAIJson(rawOutput);

    /*
     * ---------------------------------------------------------
     * 9. Preview mode
     * ---------------------------------------------------------
     */

    if (mode === "preview") {
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
          raw: rawOutput,
          analysis: ai
        },

        next_step:
          "Review AI learning analysis before connecting it to Action Engine."
      });
    }

    /*
     * ---------------------------------------------------------
     * 10. Execute mode
     * ---------------------------------------------------------
     */

    const runId = crypto.randomUUID();

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
      JSON.stringify(aiInput),
      JSON.stringify(ai),
      "COMPLETED",
      null
    ).run();

    /*
     * ---------------------------------------------------------
     * 11. Save AI Insight
     * ---------------------------------------------------------
     */

    const insightId = crypto.randomUUID();

    const insightTitle =
      ai.summary ||
      ai.learning?.what_we_learned ||
      learning.title ||
      "Learning AI Insight";

    const insightContent = JSON.stringify({
      learning,
      metrics,
      conversion,
      analysis: ai
    });

    const priority =
      ai.priority === "HIGH"
        ? "HIGH"
        : ai.priority === "MEDIUM"
          ? "MEDIUM"
          : "LOW";

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
      insightTitle,
      insightContent,
      Number(learning.score || 0),
      priority,
      "NEW"
    ).run();

    return json({
      success: true,
      layer: "LEARNING_AI_V1",
      mode,
      status: "COMPLETED",

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
        run_id: runId,
        insight_id: insightId,
        analysis: ai
      },

      next_step:
        "Connect Learning AI output to Decision and Action Engine."
    });

  } catch (error) {
    return json({
      success: false,
      layer: "LEARNING_AI_V1",
      error: error.message || String(error)
    }, 500);
  }
}


/*
 * ============================================================
 * Helpers
 * ============================================================
 */

function rate(a, b) {
  if (!b || b <= 0) return 0;
  return Number(((a / b) * 100).toFixed(2));
}


function extractAIText(response) {
  if (!response) return "";

  if (typeof response === "string") {
    return response;
  }

  if (typeof response.response === "string") {
    return response.response;
  }

  if (Array.isArray(response.response)) {
    return response.response
      .map(x => {
        if (typeof x === "string") return x;
        if (x?.text) return x.text;
        if (x?.content) return x.content;
        return "";
      })
      .join("");
  }

  if (typeof response.content === "string") {
    return response.content;
  }

  if (Array.isArray(response.content)) {
    return response.content
      .map(x => {
        if (typeof x === "string") return x;
        if (x?.text) return x.text;
        return "";
      })
      .join("");
  }

  return JSON.stringify(response);
}


function parseAIJson(text) {
  if (!text) {
    return {
      summary: "AI returned no text.",
      observed_signals: [],
      learning: {
        what_we_learned: "No AI analysis available.",
        confidence: "LOW"
      },
      problems: [],
      next_content: {
        action: "WAIT",
        direction: "Wait for more data.",
        angle: "",
        cta: "",
        success_metric: "Traffic and conversion"
      },
      next_action: {
        type: "WAIT",
        reason: "No AI output was available."
      },
      priority: "LOW"
    };
  }

  let cleaned = text.trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(
          cleaned.slice(start, end + 1)
        );
      } catch {}
    }

    return {
      summary: cleaned.slice(0, 500),
      observed_signals: [],
      learning: {
        what_we_learned: cleaned.slice(0, 1000),
        confidence: "LOW"
      },
      problems: [],
      next_content: {
        action: "WAIT",
        direction: "AI output requires review.",
        angle: "",
        cta: "",
        success_metric: "More behavioral data"
      },
      next_action: {
        type: "WAIT",
        reason: "AI response was not valid JSON."
      },
      priority: "LOW"
    };
  }
}


function buildLearningFromMeasurement(measurement) {
  const metrics = {
    attention: Number(measurement.attention || 0),
    product_views: Number(measurement.product_views || 0),
    clicks: Number(measurement.clicks || 0),
    engagements: Number(measurement.engagements || 0),
    customers: Number(measurement.customers || 0),
    orders: Number(measurement.orders || 0),
    revenue: Number(measurement.revenue || 0)
  };

  if (metrics.orders > 0 && metrics.revenue > 0) {
    return {
      content_id: measurement.content_id || null,
      measurement_id: measurement.id || null,
      signal_type: "REVENUE_SIGNAL",
      title: "Content มีสัญญาณรายได้",
      finding:
        `พบ ${metrics.orders} order และรายได้ ${metrics.revenue}`,
      recommendation:
        "ติดตามรูปแบบ Content และพฤติกรรมก่อนซื้อ",
      score: 100
    };
  }

  if (metrics.orders > 0) {
    return {
      content_id: measurement.content_id || null,
      measurement_id: measurement.id || null,
      signal_type: "CONVERSION_SIGNAL",
      title: "เกิด Conversion",
      finding:
        `พบ ${metrics.orders} order`,
      recommendation:
        "วิเคราะห์เส้นทาง Conversion",
      score: 90
    };
  }

  if (metrics.customers > 0 && metrics.orders === 0) {
    return {
      content_id: measurement.content_id || null,
      measurement_id: measurement.id || null,
      signal_type: "LOW_PURCHASE_CONVERSION",
      title: "มี Customer แต่ยังไม่เกิดการซื้อ",
      finding:
        `มี customer ${metrics.customers} ราย แต่ยังไม่มี order`,
      recommendation:
        "ปรับ Offer หรือ CTA",
      score: 70
    };
  }

  if (metrics.clicks > 0 && metrics.customers === 0) {
    return {
      content_id: measurement.content_id || null,
      measurement_id: measurement.id || null,
      signal_type: "LOW_LEAD_CONVERSION",
      title: "มี Click แต่ยังไม่มี Customer",
      finding:
        `พบ ${metrics.clicks} clicks`,
      recommendation:
        "ตรวจสอบ Landing Page และข้อเสนอ",
      score: 65
    };
  }

  if (metrics.engagements > 0 && metrics.clicks === 0) {
    return {
      content_id: measurement.content_id || null,
      measurement_id: measurement.id || null,
      signal_type: "ENGAGEMENT_NO_CLICK",
      title: "มี Engagement แต่ยังไม่มี Click",
      finding:
        `มี engagement ${metrics.engagements} ครั้ง`,
      recommendation:
        "ปรับ CTA",
      score: 60
    };
  }

  if (metrics.product_views > 0 && metrics.clicks === 0) {
    return {
      content_id: measurement.content_id || null,
      measurement_id: measurement.id || null,
      signal_type: "LOW_CTA_RESPONSE",
      title: "มี Product View แต่ยังไม่มี Click",
      finding:
        `มี product view ${metrics.product_views} ครั้ง`,
      recommendation:
        "ทดสอบ CTA หรือ Offer",
      score: 55
    };
  }

  if (metrics.attention > 0 && metrics.product_views === 0) {
    return {
      content_id: measurement.content_id || null,
      measurement_id: measurement.id || null,
      signal_type: "ATTENTION_NO_TRAFFIC",
      title: "มี Attention แต่ยังไม่มี Traffic",
      finding:
        `พบ attention ${metrics.attention} ครั้ง`,
      recommendation:
        "เพิ่ม Distribution",
      score: 45
    };
  }

  return {
    content_id: measurement.content_id || null,
    measurement_id: measurement.id || null,
    signal_type: "NO_TRAFFIC",
    title: "ยังไม่มี Traffic",
    finding:
      "ยังไม่พบกิจกรรมที่ใช้เรียนรู้จาก Content",
    recommendation:
      "เผยแพร่ Content และรอข้อมูลพฤติกรรม",
    score: 20
  };
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
