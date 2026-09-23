````javascript
// TATO-OS
// Learning AI V1.2
// Route: /api/learning-ai
//
// GET  /api/learning-ai
//      -> preview AI learning analysis
//
// POST /api/learning-ai
//      body: {"mode":"preview"}
//      body: {"mode":"execute"}
//
// POST execute:
//      - creates ai_runs
//      - creates ai_insights
//
// IMPORTANT:
//      This file intentionally exports explicit GET/POST handlers
//      so Cloudflare Pages Functions routes the endpoint correctly.

const MODEL = "@cf/zai-org/glm-4.7-flash";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: JSON_HEADERS
    }
  );
}

function makeId() {
  return crypto.randomUUID();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function text(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeObject(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value;
}

/**
 * Extract text from the different response shapes that
 * Workers AI / OpenAI-compatible responses may return.
 */
function extractAIText(response) {
  if (!response) return null;

  if (typeof response === "string") {
    return response.trim() || null;
  }

  // Direct response
  if (typeof response.response === "string") {
    return response.response.trim() || null;
  }

  // Nested result
  if (
    response.result &&
    typeof response.result.response === "string"
  ) {
    return response.result.response.trim() || null;
  }

  // Direct content
  if (typeof response.content === "string") {
    return response.content.trim() || null;
  }

  if (Array.isArray(response.content)) {
    const result = response.content
      .map(item => {
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

    if (result) return result;
  }

  // OpenAI-compatible response
  const choice = response?.choices?.[0];

  if (choice?.message) {
    const content = choice.message.content;

    if (typeof content === "string") {
      return content.trim() || null;
    }

    if (Array.isArray(content)) {
      const result = content
        .map(item => {
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

      if (result) return result;
    }
  }

  // Some model responses may expose output text.
  if (typeof response.output_text === "string") {
    return response.output_text.trim() || null;
  }

  return null;
}

/**
 * Extract JSON from AI text.
 * Handles:
 * - pure JSON
 * - ```json ... ```
 * - text surrounding JSON
 */
function parseAIJSON(raw) {
  if (!raw || typeof raw !== "string") {
    return null;
  }

  let value = raw.trim();

  // Remove markdown code fence
  value = value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Direct JSON
  try {
    const parsed = JSON.parse(value);

    if (
      parsed &&
      typeof parsed === "object"
    ) {
      return parsed;
    }
  } catch (_) {}

  // Find first JSON object
  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");

  if (
    first !== -1 &&
    last !== -1 &&
    last > first
  ) {
    const candidate =
      value.slice(first, last + 1);

    try {
      const parsed = JSON.parse(candidate);

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

function fallbackAnalysis({
  learning,
  content,
  metrics,
  conversion
}) {
  const hasTraffic =
    num(metrics.product_views) > 0 ||
    num(metrics.clicks) > 0 ||
    num(metrics.engagements) > 0;

  const hasCustomer =
    num(metrics.customers) > 0;

  const hasOrder =
    num(metrics.orders) > 0;

  let action = "DISTRIBUTE";
  let direction =
    "เผยแพร่ Content ปัจจุบันเพื่อสร้าง Traffic และเก็บข้อมูลพฤติกรรม";

  let successMetric = "Product Views";
  let priority = "LOW";

  if (hasOrder) {
    action = "SCALE";
    direction =
      "วิเคราะห์รูปแบบของ Content ที่นำไปสู่การสั่งซื้อและนำรูปแบบนั้นไปสร้าง Content ถัดไป";
    successMetric = "Orders";
    priority = "HIGH";
  } else if (hasCustomer) {
    action = "OPTIMIZE";
    direction =
      "ปรับ Content และ CTA เพื่อเปลี่ยนความสนใจให้กลายเป็นลูกค้า";
    successMetric = "Customers";
    priority = "MEDIUM";
  } else if (hasTraffic) {
    action = "OPTIMIZE";
    direction =
      "วิเคราะห์ Attention และ Engagement ที่เกิดขึ้น แล้วปรับ Content เพื่อเพิ่ม Conversion";
    successMetric = "Engagements";
    priority = "MEDIUM";
  }

  return {
    summary: hasTraffic
      ? "พบกิจกรรมจาก Content แล้ว แต่ยังต้องเก็บข้อมูลเพิ่มเพื่อเรียนรู้รูปแบบ Conversion"
      : "ยังไม่มีข้อมูลพฤติกรรมจาก Content จึงยังประเมินประสิทธิภาพไม่ได้",

    observed_signals: [
      `Learning signal คือ ${text(learning.signal_type || "UNKNOWN")}`,
      `Metrics: Product Views ${num(metrics.product_views)}, Clicks ${num(metrics.clicks)}, Engagements ${num(metrics.engagements)}`,
      `Customers ${num(metrics.customers)}, Orders ${num(metrics.orders)}, Revenue ${num(metrics.revenue)}`
    ],

    learning: {
      what_we_learned: hasOrder
        ? "Content มีหลักฐานเชื่อมโยงกับ Conversion แล้ว"
        : hasCustomer
          ? "Content เริ่มสร้าง Customer signal แต่ยังต้องเพิ่มข้อมูลการซื้อ"
          : hasTraffic
            ? "Content เริ่มสร้างพฤติกรรม แต่ยังไม่มีหลักฐาน Conversion เพียงพอ"
            : "ยังไม่มี behavioral evidence เพียงพอสำหรับตัดสิน Content",

      confidence: hasOrder
        ? "HIGH"
        : hasCustomer || hasTraffic
          ? "MEDIUM"
          : "LOW"
    },

    problems: hasOrder
      ? []
      : hasTraffic
        ? [
            "ยังไม่มี Conversion เพียงพอสำหรับสรุปผล",
            "ต้องเก็บข้อมูลต่อเพื่อดูความสัมพันธ์ระหว่าง Attention กับ Sales"
          ]
        : [
            "ยังไม่มี Traffic",
            "ยังไม่มีข้อมูลสำหรับวัด Conversion"
          ],

    next_content: {
      action,
      direction,
      angle:
        content?.angle ||
        "ใช้ความสนใจของลูกค้าเชื่อมกับสิ่งที่ตลาดกำลังสนใจ",
      cta:
        content?.cta ||
        "ดูรายละเอียดและทดลอง TATO",
      success_metric: successMetric
    },

    next_action: {
      type: action,
      reason: hasOrder
        ? "พบ Conversion แล้ว จึงควรเรียนรู้และขยายรูปแบบที่สร้างผลลัพธ์"
        : hasCustomer
          ? "พบ Customer signal แต่ยังต้องเพิ่ม Conversion"
          : hasTraffic
            ? "มี Traffic แล้ว ควรปรับเพื่อเพิ่ม Conversion"
            : "Content พร้อมเผยแพร่ แต่ยังไม่มีข้อมูลพฤติกรรมสำหรับการเรียนรู้"
    },

    priority
  };
}

async function ensureTables(db) {
  await db.prepare(`
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

  await db.prepare(`
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
}

async function loadLearning(db) {
  // Preferred source: Learning Feedback Loop
  try {
    const result = await db.prepare(`
      SELECT *
      FROM learning_feedback
      ORDER BY created_at DESC
      LIMIT 1
    `).first();

    if (result) {
      return result;
    }
  } catch (_) {
    // Table may not exist in an older deployment.
  }

  // Fallback to Content Measurement
  try {
    const result = await db.prepare(`
      SELECT
        id,
        status,
        measurement_start,
        measured_at,
        attribution_mode
      FROM content_measurements
      ORDER BY measured_at DESC
      LIMIT 1
    `).first();

    if (result) {
      return {
        id: result.id,
        signal_type:
          result.status === "WAITING_FOR_TRAFFIC"
            ? "NO_TRAFFIC"
            : "MEASUREMENT",
        title:
          result.status === "WAITING_FOR_TRAFFIC"
            ? "ยังไม่มี Traffic"
            : "Content Measurement",
        finding:
          result.status === "WAITING_FOR_TRAFFIC"
            ? "ยังไม่พบกิจกรรมที่ใช้เรียนรู้จาก Content"
            : "มีข้อมูลจาก Content Measurement",
        score:
          result.status === "WAITING_FOR_TRAFFIC"
            ? 20
            : 50,
        measurement_start:
          result.measurement_start,
        measured_at:
          result.measured_at,
        attribution_mode:
          result.attribution_mode
      };
    }
  } catch (_) {}

  return {
    id: null,
    signal_type: "NO_TRAFFIC",
    title: "ยังไม่มี Traffic",
    finding:
      "ยังไม่พบกิจกรรมที่ใช้เรียนรู้จาก Content",
    score: 20
  };
}

async function loadContent(db) {
  try {
    const row = await db.prepare(`
      SELECT *
      FROM content_engine
      ORDER BY created_at DESC
      LIMIT 1
    `).first();

    return row || null;
  } catch (_) {
    return null;
  }
}

async function loadMetrics(db, learning) {
  const start =
    learning?.measurement_start ||
    learning?.created_at ||
    "1970-01-01T00:00:00.000Z";

  const metrics = {
    attention: 0,
    product_views: 0,
    clicks: 0,
    engagements: 0,
    customers: 0,
    orders: 0,
    revenue: 0
  };

  // Behavior
  try {
    const rows = await db.prepare(`
      SELECT event_type, COUNT(*) AS total
      FROM behavior_events
      WHERE created_at >= ?
      GROUP BY event_type
    `)
      .bind(start)
      .all();

    for (const row of rows.results || []) {
      const event = text(row.event_type).toLowerCase();
      const total = num(row.total);

      if (
        event.includes("attention") ||
        event === "product_view" ||
        event === "view"
      ) {
        metrics.attention += total;
      }

      if (
        event === "product_view" ||
        event === "view" ||
        event === "page_view"
      ) {
        metrics.product_views += total;
      }

      if (
        event.includes("click")
      ) {
        metrics.clicks += total;
      }

      if (
        event.includes("engagement") ||
        event.includes("like") ||
        event.includes("comment") ||
        event.includes("share")
      ) {
        metrics.engagements += total;
      }
    }
  } catch (_) {}

  // Customers
  try {
    const row = await db.prepare(`
      SELECT COUNT(*) AS total
      FROM customers
      WHERE created_at >= ?
    `)
      .bind(start)
      .first();

    metrics.customers = num(row?.total);
  } catch (_) {
    try {
      const row = await db.prepare(`
        SELECT COUNT(*) AS total
        FROM customers
      `).first();

      metrics.customers = num(row?.total);
    } catch (_) {}
  }

  // Orders + revenue
  try {
    const row = await db.prepare(`
      SELECT
        COUNT(*) AS orders,
        COALESCE(SUM(amount), 0) AS revenue
      FROM orders
      WHERE created_at >= ?
    `)
      .bind(start)
      .first();

    metrics.orders = num(row?.orders);
    metrics.revenue = num(row?.revenue);
  } catch (_) {}

  return metrics;
}

function calculateConversion(metrics) {
  const safeRate = (a, b) => {
    if (!b || b <= 0) return 0;
    return Number(((a / b) * 100).toFixed(2));
  };

  return {
    attention_to_view:
      safeRate(
        num(metrics.product_views),
        num(metrics.attention)
      ),

    view_to_click:
      safeRate(
        num(metrics.clicks),
        num(metrics.product_views)
      ),

    click_to_customer:
      safeRate(
        num(metrics.customers),
        num(metrics.clicks)
      ),

    customer_to_order:
      safeRate(
        num(metrics.orders),
        num(metrics.customers)
      ),

    engagement_to_order:
      safeRate(
        num(metrics.orders),
        num(metrics.engagements)
      )
  };
}

function buildPrompt({
  learning,
  content,
  metrics,
  conversion
}) {
  return `
Analyze the TATO Coffee Content learning data.

Return ONLY valid JSON.
Do not explain your reasoning.
Do not use markdown.
Do not wrap JSON in code fences.

INPUT

Learning:
${JSON.stringify(learning)}

Content:
${JSON.stringify({
  id: content?.id || null,
  title: content?.title || null,
  status: content?.status || null,
  objective: content?.objective || null,
  attention_type: content?.attention_type || null,
  market_keyword: content?.market_keyword || null,
  angle: content?.angle || null,
  cta: content?.cta || null
})}

Metrics:
${JSON.stringify(metrics)}

Conversion:
${JSON.stringify(conversion)}

Return exactly this structure:

{
  "summary": "short Thai summary",
  "observed_signals": [
    "signal 1",
    "signal 2",
    "signal 3"
  ],
  "learning": {
    "what_we_learned": "what the data teaches us",
    "confidence": "LOW"
  },
  "problems": [
    "problem 1"
  ],
  "next_content": {
    "action": "DISTRIBUTE",
    "direction": "next content direction",
    "angle": "content angle",
    "cta": "CTA",
    "success_metric": "Product Views"
  },
  "next_action": {
    "type": "DISTRIBUTE",
    "reason": "why"
  },
  "priority": "LOW"
}

Allowed next_content.action:
DISTRIBUTE, OPTIMIZE, SCALE, WAIT

Allowed next_action.type:
DISTRIBUTE, OPTIMIZE, SCALE, WAIT

Allowed priority:
LOW, MEDIUM, HIGH

Use Thai language for the actual analysis.
`;
}

async function runAI(env, prompt) {
  const request = {
    messages: [
      {
        role: "system",
        content:
          "You are the Learning Intelligence layer of TATO Coffee OS. Return concise valid JSON only. Never output reasoning."
      },
      {
        role: "user",
        content: prompt
      }
    ],

    reasoning_effort: "low",

    max_completion_tokens: 1200,

    temperature: 0.1,

    response_format: {
      type: "json_object"
    }
  };

  // GLM-4.7-Flash is officially available through env.AI.run()
  // and supports response_format / JSON mode.
  return await env.AI.run(
    MODEL,
    request
  );
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

  await ensureTables(env.DB);

  const learning =
    await loadLearning(env.DB);

  const content =
    await loadContent(env.DB);

  const metrics =
    await loadMetrics(
      env.DB,
      learning
    );

  const conversion =
    calculateConversion(metrics);

  const prompt =
    buildPrompt({
      learning,
      content,
      metrics,
      conversion
    });

  let rawAI = null;
  let aiText = null;
  let analysis = null;
  let aiStatus = "FALLBACK_ANALYZED";
  let aiError = null;

  try {
    rawAI = await runAI(
      env,
      prompt
    );

    aiText =
      extractAIText(rawAI);

    analysis =
      parseAIJSON(aiText);

    if (analysis) {
      aiStatus = "AI_ANALYZED";
    }
  } catch (error) {
    aiError =
      error?.message ||
      String(error);
  }

  // Deterministic fallback keeps the system operational
  // even when model output is malformed or empty.
  if (!analysis) {
    analysis =
      fallbackAnalysis({
        learning,
        content,
        metrics,
        conversion
      });
  }

  return {
    learning,
    content,
    metrics,
    conversion,
    ai: {
      status: aiStatus,
      model: MODEL,
      analysis,
      run_id: null,
      insight_id: null,

      // Only useful for debugging; does not expose
      // secrets or bindings.
      debug: {
        ai_called: !!rawAI,
        response_text_received: !!aiText,
        parsed_json: !!parseAIJSON(aiText),
        error: aiError
      }
    }
  };
}

async function execute(env, result) {
  const runId = makeId();
  const insightId = makeId();
  const createdAt =
    new Date().toISOString();

  const inputData = JSON.stringify({
    learning: result.learning,
    content: result.content,
    metrics: result.metrics,
    conversion: result.conversion
  });

  const outputData =
    JSON.stringify(result.ai.analysis);

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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      runId,
      null,
      "LEARNING_ANALYSIS",
      MODEL,
      inputData,
      outputData,
      result.ai.status,
      null,
      createdAt
    )
    .run();

  const priority =
    text(
      result.ai.analysis?.priority
    ).toUpperCase() || "LOW";

  const score =
    priority === "HIGH"
      ? 90
      : priority === "MEDIUM"
        ? 60
        : 30;

  const title =
    text(
      result.ai.analysis?.summary
    ) ||
    "Learning AI Analysis";

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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      insightId,
      null,
      runId,
      "LEARNING",
      title,
      outputData,
      score,
      priority,
      "NEW",
      createdAt
    )
    .run();

  result.ai.run_id = runId;
  result.ai.insight_id =
    insightId;

  return result;
}

/**
 * GET /api/learning-ai
 */
export async function onRequestGet(context) {
  try {
    const result =
      await analyze(context.env);

    return json({
      success: true,
      layer: "LEARNING_AI_V1",
      mode: "preview",
      status: "ANALYZED",

      learning: result.learning,

      content: result.content
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

      next_step:
        result.ai.status ===
        "AI_ANALYZED"
          ? "AI Learning analysis ready. Run POST execute to save the AI run and insight."
          : "AI response was not parsed as JSON. Deterministic fallback analysis is available."
    });
  } catch (error) {
    return json(
      {
        success: false,
        layer: "LEARNING_AI_V1",
        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}

/**
 * POST /api/learning-ai
 *
 * {"mode":"preview"}
 * {"mode":"execute"}
 */
export async function onRequestPost(context) {
  try {
    let body = {};

    try {
      body =
        await context.request.json();
    } catch (_) {
      body = {};
    }

    const mode =
      body?.mode || "preview";

    const result =
      await analyze(context.env);

    if (mode === "execute") {
      const executed =
        await execute(
          context.env,
          result
        );

      return json({
        success: true,
        layer: "LEARNING_AI_V1",
        mode: "execute",
        status: "EXECUTED",

        learning:
          executed.learning,

        content:
          executed.content
            ? {
                id:
                  executed.content.id,
                title:
                  executed.content.title,
                status:
                  executed.content.status
              }
            : null,

        metrics:
          executed.metrics,

        conversion:
          executed.conversion,

        ai: executed.ai,

        next_step:
          "AI Learning saved. Next stage: connect AI Learning output to Action Engine."
      });
    }

    return json({
      success: true,
      layer: "LEARNING_AI_V1",
      mode: "preview",
      status: "ANALYZED",

      learning:
        result.learning,

      content:
        result.content
          ? {
              id: result.content.id,
              title: result.content.title,
              status: result.content.status
            }
          : null,

      metrics:
        result.metrics,

      conversion:
        result.conversion,

      ai:
        result.ai,

      next_step:
        result.ai.status ===
        "AI_ANALYZED"
          ? "AI Learning analysis ready. Run POST execute to save."
          : "Fallback analysis returned. Check ai.debug in this response."
    });

  } catch (error) {
    return json(
      {
        success: false,
        layer: "LEARNING_AI_V1",
        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}
````
