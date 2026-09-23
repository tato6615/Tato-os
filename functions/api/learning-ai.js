// Learning AI V1.4
// Route: /api/learning-ai

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

function extractText(response) {
  if (!response) return null;

  if (typeof response === "string") {
    return response.trim() || null;
  }

  if (typeof response.response === "string") {
    return response.response.trim() || null;
  }

  if (
    response.result &&
    typeof response.result.response === "string"
  ) {
    return response.result.response.trim() || null;
  }

  if (typeof response.content === "string") {
    return response.content.trim() || null;
  }

  if (Array.isArray(response.content)) {
    const value = response.content
      .map(item => {
        if (typeof item === "string") return item;
        if (item && typeof item.text === "string") return item.text;
        if (item && typeof item.content === "string") return item.content;
        return "";
      })
      .join("\n")
      .trim();

    if (value) return value;
  }

  const message = response?.choices?.[0]?.message;

  if (message) {
    if (typeof message.content === "string") {
      return message.content.trim() || null;
    }

    if (Array.isArray(message.content)) {
      const value = message.content
        .map(item => {
          if (typeof item === "string") return item;
          if (item && typeof item.text === "string") return item.text;
          if (item && typeof item.content === "string") return item.content;
          return "";
        })
        .join("\n")
        .trim();

      if (value) return value;
    }
  }

  if (typeof response.output_text === "string") {
    return response.output_text.trim() || null;
  }

  return null;
}

function parseJSON(value) {
  if (!value) return null;

  const text = value
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

function normalizeAIResult(value, metrics, learning, content) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const allowedActions = [
    "DISTRIBUTE",
    "OPTIMIZE",
    "SCALE",
    "WAIT"
  ];

  const allowedPriority = [
    "LOW",
    "MEDIUM",
    "HIGH"
  ];

  const allowedConfidence = [
    "LOW",
    "MEDIUM",
    "HIGH"
  ];

  const actionValue =
    s(value?.next_content?.action).toUpperCase();

  const action =
    allowedActions.includes(actionValue)
      ? actionValue
      : "DISTRIBUTE";

  const priorityValue =
    s(value?.priority).toUpperCase();

  const priority =
    allowedPriority.includes(priorityValue)
      ? priorityValue
      : "LOW";

  const confidenceValue =
    s(value?.learning?.confidence).toUpperCase();

  const confidence =
    allowedConfidence.includes(confidenceValue)
      ? confidenceValue
      : "LOW";

  return {
    summary:
      s(value.summary) ||
      "ยังไม่มีข้อมูลเพียงพอสำหรับการวิเคราะห์",

    observed_signals:
      Array.isArray(value.observed_signals)
        ? value.observed_signals.slice(0, 5).map(s)
        : [],

    learning: {
      what_we_learned:
        s(value?.learning?.what_we_learned) ||
        "ยังไม่มี behavioral evidence เพียงพอ",

      confidence
    },

    problems:
      Array.isArray(value.problems)
        ? value.problems.slice(0, 5).map(s)
        : [],

    next_content: {
      action,

      direction:
        s(value?.next_content?.direction) ||
        "เผยแพร่ Content เพื่อสร้าง Traffic",

      angle:
        s(value?.next_content?.angle) ||
        content?.angle ||
        "เชื่อมความสนใจของลูกค้ากับความต้องการเรื่องกาแฟ",

      cta:
        s(value?.next_content?.cta) ||
        content?.cta ||
        "ดูรายละเอียดและทดลอง TATO",

      success_metric:
        s(value?.next_content?.success_metric) ||
        (
          n(metrics.orders) > 0
            ? "Orders"
            : n(metrics.customers) > 0
              ? "Customers"
              : n(metrics.product_views) > 0
                ? "Engagements"
                : "Product Views"
        )
    },

    next_action: {
      type: action,

      reason:
        s(value?.next_action?.reason) ||
        (
          action === "SCALE"
            ? "พบ Conversion แล้ว"
            : action === "OPTIMIZE"
              ? "พบพฤติกรรมแล้ว ควร Optimize"
              : action === "WAIT"
                ? "ยังมีข้อมูลไม่เพียงพอ"
                : "Content พร้อมสร้าง Traffic"
        )
    },

    priority
  };
}

function fallback(metrics, learning, content) {
  const traffic =
    n(metrics.product_views) > 0 ||
    n(metrics.clicks) > 0 ||
    n(metrics.engagements) > 0;

  const customer =
    n(metrics.customers) > 0;

  const order =
    n(metrics.orders) > 0;

  let action = "DISTRIBUTE";
  let priority = "LOW";
  let metric = "Product Views";

  if (order) {
    action = "SCALE";
    priority = "HIGH";
    metric = "Orders";
  } else if (customer) {
    action = "OPTIMIZE";
    priority = "MEDIUM";
    metric = "Customers";
  } else if (traffic) {
    action = "OPTIMIZE";
    priority = "MEDIUM";
    metric = "Engagements";
  }

  return {
    summary: traffic
      ? "พบพฤติกรรมจาก Content แล้ว แต่ยังต้องเก็บข้อมูลเพิ่ม"
      : "ยังไม่มีข้อมูลพฤติกรรมจาก Content จึงยังประเมินประสิทธิภาพไม่ได้",

    observed_signals: [
      `Learning signal คือ ${s(
        learning.signal_type || "NO_TRAFFIC"
      )}`,
      `Product Views ${n(metrics.product_views)}`,
      `Orders ${n(metrics.orders)}`
    ],

    learning: {
      what_we_learned: order
        ? "Content มีหลักฐานเชื่อมโยงกับ Conversion"
        : traffic
          ? "Content เริ่มสร้างพฤติกรรม แต่ยังไม่มีหลักฐาน Conversion เพียงพอ"
          : "ยังไม่มี behavioral evidence เพียงพอสำหรับตัดสิน Content",

      confidence: order
        ? "HIGH"
        : traffic
          ? "MEDIUM"
          : "LOW"
    },

    problems: order
      ? []
      : traffic
        ? ["ยังไม่มี Conversion เพียงพอ"]
        : [
            "ยังไม่มี Traffic",
            "ยังไม่มีข้อมูลสำหรับวัด Conversion"
          ],

    next_content: {
      action,

      direction: traffic
        ? "ปรับ Content จากพฤติกรรมที่เกิดขึ้นเพื่อเพิ่ม Conversion"
        : "เผยแพร่ Content ปัจจุบันเพื่อสร้าง Traffic",

      angle:
        content?.angle ||
        "เชื่อมความสนใจของลูกค้ากับความต้องการเรื่องกาแฟ",

      cta:
        content?.cta ||
        "ดูรายละเอียดและทดลอง TATO",

      success_metric: metric
    },

    next_action: {
      type: action,

      reason: order
        ? "พบ Conversion แล้ว"
        : traffic
          ? "มีพฤติกรรมแล้ว ควร Optimize"
          : "ยังไม่มี Traffic ควร Distribute"
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

async function getLearning(db) {
  try {
    const row = await db.prepare(`
      SELECT *
      FROM learning_feedback
      ORDER BY created_at DESC
      LIMIT 1
    `).first();

    if (row) return row;
  } catch (_) {}

  try {
    const row = await db.prepare(`
      SELECT *
      FROM content_measurements
      ORDER BY measured_at DESC
      LIMIT 1
    `).first();

    if (row) {
      return {
        id: row.id,

        signal_type:
          row.status === "WAITING_FOR_TRAFFIC"
            ? "NO_TRAFFIC"
            : "MEASUREMENT",

        title:
          row.status === "WAITING_FOR_TRAFFIC"
            ? "ยังไม่มี Traffic"
            : "Content Measurement",

        finding:
          row.status === "WAITING_FOR_TRAFFIC"
            ? "ยังไม่พบกิจกรรมที่ใช้เรียนรู้จาก Content"
            : "มีข้อมูลจาก Content Measurement",

        score:
          row.status === "WAITING_FOR_TRAFFIC"
            ? 20
            : 50,

        measurement_start:
          row.measurement_start
      };
    }
  } catch (_) {}

  return {
    id: null,
    signal_type: "NO_TRAFFIC",
    title: "ยังไม่มี Traffic",
    finding: "ยังไม่พบกิจกรรมที่ใช้เรียนรู้จาก Content",
    score: 20
  };
}

async function getContent(db) {
  try {
    return await db.prepare(`
      SELECT *
      FROM content_engine
      ORDER BY created_at DESC
      LIMIT 1
    `).first();
  } catch (_) {
    return null;
  }
}

async function getMetrics(db, learning) {
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

  try {
    const rows = await db.prepare(`
      SELECT
        event_type,
        COUNT(*) AS total
      FROM behavior_events
      WHERE created_at >= ?
      GROUP BY event_type
    `)
      .bind(start)
      .all();

    for (const row of rows.results || []) {
      const type =
        s(row.event_type).toLowerCase();

      const total =
        n(row.total);

      if (
        type === "product_view" ||
        type === "view" ||
        type === "page_view"
      ) {
        metrics.product_views += total;
        metrics.attention += total;
      }

      if (type.includes("click")) {
        metrics.clicks += total;
      }

      if (
        type.includes("engagement") ||
        type.includes("like") ||
        type.includes("comment") ||
        type.includes("share")
      ) {
        metrics.engagements += total;
      }
    }
  } catch (_) {}

  try {
    const row = await db.prepare(`
      SELECT COUNT(*) AS total
      FROM customers
      WHERE created_at >= ?
    `)
      .bind(start)
      .first();

    metrics.customers =
      n(row?.total);
  } catch (_) {}

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

    metrics.orders =
      n(row?.orders);

    metrics.revenue =
      n(row?.revenue);
  } catch (_) {}

  return metrics;
}

function conversions(m) {
  const rate = (a, b) =>
    b > 0
      ? Number(((a / b) * 100).toFixed(2))
      : 0;

  return {
    attention_to_view:
      rate(
        n(m.product_views),
        n(m.attention)
      ),

    view_to_click:
      rate(
        n(m.clicks),
        n(m.product_views)
      ),

    click_to_customer:
      rate(
        n(m.customers),
        n(m.clicks)
      ),

    customer_to_order:
      rate(
        n(m.orders),
        n(m.customers)
      ),

    engagement_to_order:
      rate(
        n(m.orders),
        n(m.engagements)
      )
  };
}

function prompt(learning, content, metrics, conversion) {
  return `
วิเคราะห์ Learning ของ TATO Coffee

ตอบ JSON เท่านั้น
ห้าม Markdown
ห้าม reasoning
ตอบสั้นมาก

Learning:
${JSON.stringify({
  signal_type: learning?.signal_type,
  title: learning?.title,
  score: learning?.score
})}

Content:
${JSON.stringify({
  title: content?.title,
  status: content?.status,
  angle: content?.angle,
  cta: content?.cta
})}

Metrics:
${JSON.stringify(metrics)}

Conversion:
${JSON.stringify(conversion)}

JSON:
{
  "summary": "สรุปสั้น",
  "observed_signals": ["สัญญาณ"],
  "learning": {
    "what_we_learned": "สิ่งที่เรียนรู้",
    "confidence": "LOW"
  },
  "problems": ["ปัญหา"],
  "next_content": {
    "action": "DISTRIBUTE",
    "direction": "ทิศทาง",
    "angle": "มุม",
    "cta": "CTA",
    "success_metric": "Product Views"
  },
  "next_action": {
    "type": "DISTRIBUTE",
    "reason": "เหตุผลสั้น"
  },
  "priority": "LOW"
}

Allowed:
DISTRIBUTE, OPTIMIZE, SCALE, WAIT
LOW, MEDIUM, HIGH
`.trim();
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
    await getLearning(env.DB);

  const content =
    await getContent(env.DB);

  const metrics =
    await getMetrics(
      env.DB,
      learning
    );

  const conversion =
    conversions(metrics);

  let aiStatus =
    "FALLBACK_ANALYZED";

  let aiText = null;
  let analysis = null;
  let aiError = null;
  let rawResponse = null;

  try {
    const response =
      await env.AI.run(
        MODEL,
        {
          messages: [
            {
              role: "system",
              content:
                "JSON only. No reasoning. Very short response."
            },
            {
              role: "user",
              content:
                prompt(
                  learning,
                  content,
                  metrics,
                  conversion
                )
            }
          ],

          reasoning_effort: "low",

          max_completion_tokens: 256,

          temperature: 0,

          response_format: {
            type: "json_object"
          }
        }
      );

    rawResponse =
      response;

    aiText =
      extractText(response);

    analysis =
      parseJSON(aiText);

    if (analysis) {
      analysis =
        normalizeAIResult(
          analysis,
          metrics,
          learning,
          content
        );
    }

    if (analysis) {
      aiStatus =
        "AI_ANALYZED";
    }
  } catch (error) {
    aiError =
      error?.message ||
      String(error);
  }

  if (!analysis) {
    analysis =
      fallback(
        metrics,
        learning,
        content
      );
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

      debug: {
        ai_called: true,

        response_text_received:
          !!aiText,

        parsed_json:
          aiStatus ===
          "AI_ANALYZED",

        finish_reason:
          rawResponse?.choices?.[0]
            ?.finish_reason ||
          null,

        error:
          aiError
      }
    }
  };
}

async function save(env, result) {
  const runId =
    id();

  const insightId =
    id();

  const now =
    new Date().toISOString();

  const input =
    JSON.stringify({
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
    JSON.stringify(
      result.ai.analysis
    );

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
      input,
      output,
      result.ai.status,
      null,
      now
    )
    .run();

  const priority =
    s(
      result.ai.analysis?.priority
    ).toUpperCase() ||
    "LOW";

  const score =
    priority === "HIGH"
      ? 90
      : priority === "MEDIUM"
        ? 60
        : 30;

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

  result.ai.run_id =
    runId;

  result.ai.insight_id =
    insightId;

  return result;
}

export async function onRequestGet(context) {
  try {
    const result =
      await analyze(
        context.env
      );

    return json({
      success: true,

      layer:
        "LEARNING_AI_V1",

      mode:
        "preview",

      status:
        "ANALYZED",

      learning:
        result.learning,

      content:
        result.content
          ? {
              id:
                result.content.id,

              title:
                result.content.title,

              status:
                result.content.status,

              objective:
                result.content.objective,

              attention_type:
                result.content.attention_type,

              market_keyword:
                result.content.market_keyword,

              angle:
                result.content.angle,

              cta:
                result.content.cta
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
          : "AI fallback analysis returned."
    });
  } catch (error) {
    return json(
      {
        success: false,
        layer:
          "LEARNING_AI_V1",
        error:
          error?.message ||
          String(error)
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
      body?.mode ||
      "preview";

    const result =
      await analyze(
        context.env
      );

    if (mode === "execute") {
      const saved =
        await save(
          context.env,
          result
        );

      return json({
        success: true,

        layer:
          "LEARNING_AI_V1",

        mode:
          "execute",

        status:
          "EXECUTED",

        learning:
          saved.learning,

        content:
          saved.content
            ? {
                id:
                  saved.content.id,

                title:
                  saved.content.title,

                status:
                  saved.content.status
              }
            : null,

        metrics:
          saved.metrics,

        conversion:
          saved.conversion,

        ai:
          saved.ai,

        next_step:
          "Learning AI saved. Next stage: AI → Action Engine."
      });
    }

    return json({
      success: true,

      layer:
        "LEARNING_AI_V1",

      mode:
        "preview",

      status:
        "ANALYZED",

      learning:
        result.learning,

      content:
        result.content
          ? {
              id:
                result.content.id,

              title:
                result.content.title,

              status:
                result.content.status
            }
          : null,

      metrics:
        result.metrics,

      conversion:
        result.conversion,

      ai:
        result.ai,

      next_step:
        "AI Learning analysis ready."
    });
  } catch (error) {
    return json(
      {
        success: false,

        layer:
          "LEARNING_AI_V1",

        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}
````
