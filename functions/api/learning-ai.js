// TATO-OS
// Learning AI V1.8
// Full replacement

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

function pct(a, b) {
  return b > 0
    ? Math.round((a / b) * 10000) / 100
    : 0;
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
    WHERE event_type IN (
      'click',
      'cta_click',
      'product_click'
    )
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
      recommendation:
        "วิเคราะห์องค์ประกอบของ Content ที่นำไปสู่การซื้อและนำไปทำซ้ำ",
      score: 100,
      status: "LEARNED"
    };
  } else if (metrics.customers > 0) {
    learning = {
      signal_type: "CUSTOMER",
      title: "เกิด Customer Signal",
      finding: "พบลูกค้าใหม่ แต่ยังไม่พบคำสั่งซื้อ",
      recommendation:
        "ติดตาม Customer Journey และปรับ CTA เพื่อเพิ่ม Conversion",
      score: 75,
      status: "LEARNED"
    };
  } else if (metrics.engagements > 0) {
    learning = {
      signal_type: "ENGAGEMENT",
      title: "เกิด Engagement",
      finding: "Content เริ่มสร้าง Engagement",
      recommendation:
        "ทดลองต่อยอดมุม Content เดิมและติดตาม Product View",
      score: 60,
      status: "LEARNED"
    };
  } else if (
    metrics.product_views > 0 ||
    metrics.clicks > 0
  ) {
    learning = {
      signal_type: "TRAFFIC",
      title: "เกิด Traffic",
      finding: "เริ่มมีพฤติกรรมเข้าชมหรือคลิก",
      recommendation:
        "เก็บข้อมูลต่อและปรับ CTA เพื่อเพิ่ม Conversion",
      score: 45,
      status: "LEARNED"
    };
  } else {
    learning = {
      signal_type: "NO_TRAFFIC",
      title: "ยังไม่มี Traffic",
      finding:
        "ยังไม่พบกิจกรรมที่ใช้เรียนรู้จาก Content",
      recommendation:
        "เผยแพร่ Content และรอข้อมูลพฤติกรรมก่อนตัดสินผล",
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
      ),
      engagement_to_order: pct(
        metrics.orders,
        metrics.engagements
      )
    },

    learning
  };
}

function fallback(data) {
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
      confidence:
        data.metrics.orders > 0
          ? "HIGH"
          : data.metrics.product_views > 0
            ? "MEDIUM"
            : "LOW"
    },

    problems:
      data.metrics.attention === 0
        ? ["ยังไม่มี Traffic"]
        : data.metrics.orders === 0
          ? ["ยังไม่มี Conversion"]
          : [],

    next_content: {
      action:
        data.metrics.orders > 0
          ? "ITERATE"
          : "DISTRIBUTE",

      direction: data.learning.recommendation,

      angle: data.content?.angle || "",

      cta: data.content?.cta || "",

      success_metric:
        data.metrics.orders > 0
          ? "Revenue"
          : "Product Views"
    },

    next_action: {
      type:
        data.metrics.orders > 0
          ? "ITERATE"
          : "DISTRIBUTE",

      reason: data.learning.recommendation
    },

    priority:
      data.metrics.orders > 0
        ? "HIGH"
        : data.metrics.product_views > 0
          ? "MEDIUM"
          : "LOW"
  };
}

function normalizeContent(content) {
  if (content === null || content === undefined) {
    return null;
  }

  if (typeof content === "string") {
    const text = content.trim();

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {}

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start >= 0 && end > start) {
      try {
        return JSON.parse(
          text.slice(start, end + 1)
        );
      } catch {}
    }

    return null;
  }

  if (typeof content === "object") {
    return content;
  }

  return null;
}

function extractContent(result) {
  if (!result) {
    return {
      content: null,
      debug: {
        result_type: "null",
        keys: [],
        reason: "AI returned no result"
      }
    };
  }

  const choices =
    Array.isArray(result?.choices)
      ? result.choices
      : Array.isArray(result?.response?.choices)
        ? result.response.choices
        : Array.isArray(result?.result?.choices)
          ? result.result.choices
          : Array.isArray(
              result?.result?.response?.choices
            )
            ? result.result.response.choices
            : [];

  const choice = choices[0];

  let rawContent = null;

  if (choice?.message) {
    rawContent = choice.message.content;
  }

  if (
    rawContent === null ||
    rawContent === undefined
  ) {
    rawContent = choice?.text;
  }

  if (
    rawContent === null ||
    rawContent === undefined
  ) {
    rawContent = result?.output_text;
  }

  if (
    rawContent === null ||
    rawContent === undefined
  ) {
    rawContent = result?.response;
  }

  const parsed = normalizeContent(
    rawContent
  );

  return {
    content: parsed,

    debug: {
      result_type: typeof result,

      keys:
        typeof result === "object"
          ? Object.keys(result)
          : [],

      choice_count: choices.length,

      has_direct_choices:
        Array.isArray(result?.choices),

      has_response_choices:
        Array.isArray(
          result?.response?.choices
        ),

      finish_reason:
        choice?.finish_reason || null,

      raw_content_type:
        typeof rawContent,

      content_type:
        typeof rawContent === "object"
          ? "object"
          : typeof rawContent,

      content_length:
        typeof rawContent === "string"
          ? rawContent.length
          : 0
    }
  };
}

async function callAI(ai, data) {
  if (!ai) {
    return {
      content: null,
      debug: {
        error: "AI binding not found"
      }
    };
  }

  if (typeof ai.run !== "function") {
    return {
      content: null,
      debug: {
        error:
          "AI binding exists but ai.run is not a function"
      }
    };
  }

  const prompt = `
Analyze TATO Coffee learning data.

Return ONLY valid JSON.
No markdown.
No explanation.

Required JSON structure:

{
  "summary": "...",
  "observed_signals": [],
  "learning": {
    "what_we_learned": "...",
    "confidence": "LOW"
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
  "priority": "LOW"
}

DATA:
${JSON.stringify(data)}
`;

  try {
    const result = await ai.run(
      MODEL,
      {
        messages: [
          {
            role: "system",
            content:
              "Return only valid JSON. Do not use markdown."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 700,
        temperature: 0
      }
    );

    return extractContent(result);

  } catch (error) {
    return {
      content: null,
      debug: {
        error:
          error?.message ||
          String(error)
      }
    };
  }
}

async function handle(context) {
  const db = context.env.DB;

  if (!db) {
    return {
      success: false,
      error: "D1 binding DB not found"
    };
  }

  await ensureTables(db);

  const data = await loadData(db);

  const aiResult = await callAI(
    context.env.AI,
    data
  );

  const analysis =
    aiResult.content ||
    fallback(data);

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
      status:
        aiResult.content
          ? "AI_ANALYZED"
          : "FALLBACK_ANALYZED",

      model: MODEL,

      analysis,

      debug:
        aiResult.content
          ? null
          : aiResult.debug || null,

      run_id: null,

      insight_id: null
    },

    next_step:
      "AI Learning analysis ready for review."
  };
}

export async function onRequestGet(context) {
  try {
    return json(
      await handle(context)
    );
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
    const result =
      await handle(context);

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
