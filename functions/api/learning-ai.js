// TATO-OS
// Learning AI V1.5
// Safe Cloudflare Pages Functions version

const MODEL = "@cf/zai-org/glm-4.7-flash";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function percentage(a, b) {
  return b > 0 ? Math.round((a / b) * 10000) / 100 : 0;
}

async function ensureTables(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS learning_signals (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      signal_type TEXT,
      title TEXT,
      finding TEXT,
      recommendation TEXT,
      score REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

async function loadData(db) {
  const content = await db.prepare(`
    SELECT *
    FROM content_engine
    ORDER BY datetime(created_at) DESC
    LIMIT 1
  `).first();

  if (!content) {
    return {
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
      learning: {
        signal_type: "NO_CONTENT",
        title: "ยังไม่มี Content",
        finding: "ยังไม่มี Content สำหรับวิเคราะห์",
        recommendation: "สร้าง Content ก่อนเริ่ม Learning",
        score: 0,
        status: "LEARNED"
      }
    };
  }

  const start = content.created_at;

  const attention = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM behavior_events
    WHERE created_at >= ?
  `).bind(start).first();

  const views = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM behavior_events
    WHERE event_type = 'product_view'
      AND created_at >= ?
  `).bind(start).first();

  const clicks = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM behavior_events
    WHERE event_type IN ('click', 'cta_click', 'product_click')
      AND created_at >= ?
  `).bind(start).first();

  const engagements = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM behavior_events
    WHERE event_type IN (
      'engagement',
      'like',
      'comment',
      'share',
      'save'
    )
      AND created_at >= ?
  `).bind(start).first();

  const customers = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM customers
    WHERE created_at >= ?
  `).bind(start).first();

  const sales = await db.prepare(`
    SELECT
      COUNT(*) AS orders,
      COALESCE(SUM(amount), 0) AS revenue
    FROM orders
    WHERE created_at >= ?
  `).bind(start).first();

  const metrics = {
    attention: num(attention?.total),
    product_views: num(views?.total),
    clicks: num(clicks?.total),
    engagements: num(engagements?.total),
    customers: num(customers?.total),
    orders: num(sales?.orders),
    revenue: num(sales?.revenue)
  };

  let learning;

  if (metrics.orders > 0) {
    learning = {
      signal_type: "CONVERSION",
      title: "เกิด Conversion",
      finding: "พบคำสั่งซื้อหลังช่วงเริ่มวัดผล",
      recommendation: "วิเคราะห์องค์ประกอบของ Content ที่นำไปสู่การซื้อและนำไปทำซ้ำ",
      score: 100,
      status: "LEARNED"
    };
  } else if (metrics.customers > 0) {
    learning = {
      signal_type: "CUSTOMER",
      title: "เกิด Customer Signal",
      finding: "พบลูกค้าใหม่ แต่ยังไม่พบคำสั่งซื้อ",
      recommendation: "ติดตาม Customer Journey และปรับ CTA เพื่อเพิ่ม Conversion",
      score: 75,
      status: "LEARNED"
    };
  } else if (metrics.engagements > 0) {
    learning = {
      signal_type: "ENGAGEMENT",
      title: "เกิด Engagement",
      finding: "Content เริ่มสร้าง Engagement",
      recommendation: "ทดลองต่อยอดมุม Content เดิมและติดตาม Product View",
      score: 60,
      status: "LEARNED"
    };
  } else if (metrics.product_views > 0 || metrics.clicks > 0) {
    learning = {
      signal_type: "TRAFFIC",
      title: "เกิด Traffic",
      finding: "เริ่มมีพฤติกรรมเข้าชมหรือคลิก",
      recommendation: "เก็บข้อมูลต่อและปรับ CTA เพื่อเพิ่ม Conversion",
      score: 45,
      status: "LEARNED"
    };
  } else {
    learning = {
      signal_type: "NO_TRAFFIC",
      title: "ยังไม่มี Traffic",
      finding: "ยังไม่พบกิจกรรมที่ใช้เรียนรู้จาก Content",
      recommendation: "เผยแพร่ Content และรอข้อมูลพฤติกรรมก่อนตัดสินผล",
      score: 20,
      status: "LEARNED"
    };
  }

  return {
    content: {
      id: content.id,
      title: content.title,
      status: content.status,
      objective: content.objective,
      attention_type: content.attention_type,
      market_keyword: content.market_keyword,
      angle: content.angle,
      cta: content.cta
    },
    metrics,
    conversion: {
      attention_to_view: percentage(
        metrics.product_views,
        metrics.attention
      ),
      view_to_click: percentage(
        metrics.clicks,
        metrics.product_views
      ),
      click_to_customer: percentage(
        metrics.customers,
        metrics.clicks
      ),
      customer_to_order: percentage(
        metrics.orders,
        metrics.customers
      ),
      engagement_to_order: percentage(
        metrics.orders,
        metrics.engagements
      )
    },
    learning
  };
}

function fallbackAnalysis(data) {
  return {
    summary: data.learning.finding,
    observed_signals: [
      `Learning signal คือ ${data.learning.signal_type}`,
      `Attention ${data.metrics.attention}`,
      `Product Views ${data.metrics.product_views}`,
      `Clicks ${data.metrics.clicks}`,
      `Engagements ${data.metrics.engagements}`,
      `Customers ${data.metrics.customers}`,
      `Orders ${data.metrics.orders}`,
      `Revenue ${data.metrics.revenue}`
    ],
    learning: {
      what_we_learned: data.learning.finding,
      confidence: data.metrics.orders > 0
        ? "HIGH"
        : data.metrics.product_views > 0
          ? "MEDIUM"
          : "LOW"
    },
    problems: data.metrics.attention === 0
      ? ["ยังไม่มี Traffic"]
      : data.metrics.orders === 0
        ? ["ยังไม่มี Conversion"]
        : [],
    next_content: {
      action: data.metrics.orders > 0
        ? "ITERATE"
        : "DISTRIBUTE",
      direction: data.learning.recommendation,
      angle: data.content?.angle || "",
      cta: data.content?.cta || "",
      success_metric: data.metrics.orders > 0
        ? "Revenue"
        : "Product Views"
    },
    next_action: {
      type: data.metrics.orders > 0
        ? "ITERATE"
        : "DISTRIBUTE",
      reason: data.learning.recommendation
    },
    priority: data.metrics.orders > 0
      ? "HIGH"
      : data.metrics.product_views > 0
        ? "MEDIUM"
        : "LOW"
  };
}

function extractAIContent(result) {
  if (!result) {
    return null;
  }

  let content = null;

  if (typeof result === "string") {
    content = result;
  } else if (
    result.result &&
    result.result.response &&
    result.result.response.choices &&
    result.result.response.choices[0] &&
    result.result.response.choices[0].message
  ) {
    content =
      result.result.response.choices[0].message.content;
  } else if (
    result.response &&
    result.response.choices &&
    result.response.choices[0] &&
    result.response.choices[0].message
  ) {
    content =
      result.response.choices[0].message.content;
  }

  if (typeof content !== "string") {
    return null;
  }

  const trimmed = content.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {}

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start >= 0 && end > start) {
    try {
      return JSON.parse(
        trimmed.slice(start, end + 1)
      );
    } catch {}
  }

  return null;
}

async function callAI(ai, data) {
  if (!ai) {
    return null;
  }

  if (typeof ai.run !== "function") {
    return null;
  }

  const prompt = `
Analyze TATO Coffee learning data.

Return ONLY valid JSON.
No markdown.
No explanation outside JSON.

JSON structure:
{
  "summary": "Thai summary",
  "observed_signals": ["Thai signal"],
  "learning": {
    "what_we_learned": "Thai",
    "confidence": "LOW|MEDIUM|HIGH"
  },
  "problems": ["Thai problem"],
  "next_content": {
    "action": "DISTRIBUTE|ITERATE|CREATE_NEW|HOLD",
    "direction": "Thai",
    "angle": "Thai",
    "cta": "Thai",
    "success_metric": "Attention|Product Views|Clicks|Customers|Orders|Revenue"
  },
  "next_action": {
    "type": "DISTRIBUTE|ITERATE|CREATE_NEW|HOLD",
    "reason": "Thai"
  },
  "priority": "LOW|MEDIUM|HIGH"
}

DATA:
${JSON.stringify(data)}
`;

  try {
    const result = await ai.run(MODEL, {
      messages: [
        {
          role: "system",
          content:
            "Return only compact valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      reasoning_effort: "low",
      max_completion_tokens: 256,
      temperature: 0,
      response_format: {
        type: "json_object"
      }
    });

    return extractAIContent(result);
  } catch {
    return null;
  }
}

async function handle(context) {
  const db = context.env.DB;

  if (!db) {
    return json(
      {
        success: false,
        error: "D1 binding DB not found"
      },
      500
    );
  }

  await ensureTables(db);

  const data = await loadData(db);

  const fallback = fallbackAnalysis(data);

  let aiAnalysis = null;

  if (context.env.AI) {
    aiAnalysis = await callAI(
      context.env.AI,
      data
    );
  }

  return {
    success: true,
    layer: "LEARNING_AI_V1",
    mode: "preview",
    status: "ANALYZED",
    learning: data.learning,
    content: data.content,
    metrics: data.metrics,
    conversion: data.conversion,
    ai: {
      status: aiAnalysis
        ? "AI_ANALYZED"
        : "FALLBACK_ANALYZED",
      model: MODEL,
      analysis: aiAnalysis || fallback,
      run_id: null,
      insight_id: null
    },
    next_step:
      "AI Learning analysis ready for review."
  };
}

export async function onRequestGet(context) {
  try {
    return json(await handle(context));
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

export async function onRequestPost(context) {
  try {
    const result = await handle(context);

    return json({
      ...result,
      mode: "execute"
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
