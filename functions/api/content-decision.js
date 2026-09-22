/*
============================================================
TATO OS
CONTENT DECISION ENGINE V1
============================================================

FLOW

ATTENTION
    ↓
MARKET
    ↓
CONTENT
    ↓
DECISION
    ↓
PUBLISH_CONTENT
    ↓
CONTENT ENGINE

GET  /api/content-decision
     = วิเคราะห์ + แสดง Decision ล่าสุด

POST /api/content-decision
     mode=execute
     = Execute Decision และสร้าง Content จริง
============================================================
*/

const json = (data, status = 200) => {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
};

const ATTENTION_TYPES = [
  "view",
  "page_view",
  "product_view",
  "click",
  "engagement",
  "interest"
];

function getAttentionEvents(events) {
  return events.filter(event =>
    ATTENTION_TYPES.includes(
      String(event.event_type || "").toLowerCase()
    )
  );
}

function buildDecision({
  attention,
  market,
  content,
  sales,
  customers
}) {
  let attentionScore = 0;
  let marketScore = 0;
  let contentScore = 0;
  let salesScore = 0;
  let customerScore = 0;

  if (attention.length > 0) {
    attentionScore = 10;
  }

  if (market.length > 0) {
    const topMarket = [...market]
      .sort(
        (a, b) =>
          Number(b.score || 0) -
          Number(a.score || 0)
      )[0];

    const score = Number(topMarket?.score || 0);

    if (score >= 80) {
      marketScore = 30;
    } else if (score >= 50) {
      marketScore = 20;
    } else if (score > 0) {
      marketScore = 10;
    }
  }

  if (content.length > 0) {
    contentScore = 20;
  }

  if (sales.orders > 0) {
    salesScore = 10;
  }

  if (customers > 0) {
    customerScore = 10;
  }

  const total =
    attentionScore +
    marketScore +
    contentScore +
    salesScore +
    customerScore;

  let type = "WAIT";
  let priority = "LOW";
  let recommendedAction = "รอข้อมูลเพิ่มเติม";
  let reason = "ยังไม่มีสัญญาณเพียงพอ";
  let status = "WAITING_DATA";

  if (
    attention.length > 0 &&
    market.length > 0 &&
    content.length > 0
  ) {
    type = "PUBLISH_CONTENT";
    priority = "HIGH";
    recommendedAction =
      "นำ Content ที่สร้างแล้วไปเผยแพร่และติดตาม Attention";
    reason =
      "พบ Customer Attention และ Market Demand พร้อมมี Content ที่สร้างเสร็จแล้ว";
    status = "READY";
  } else if (
    attention.length > 0 &&
    market.length > 0
  ) {
    type = "CREATE_CONTENT";
    priority = "HIGH";
    recommendedAction =
      "สร้าง Content จาก Attention + Market Demand";
    reason =
      "พบ Customer Attention และ Market Demand แต่ยังไม่มี Content";
    status = "READY";
  } else if (attention.length > 0) {
    type = "CREATE_CONTENT";
    priority = "MEDIUM";
    recommendedAction =
      "สร้าง Content จาก Customer Attention";
    reason =
      "พบ Customer Attention แต่ยังไม่มี Market Demand ที่ชัดเจน";
    status = "READY";
  } else if (market.length > 0) {
    type = "MARKET_RESPONSE";
    priority = "MEDIUM";
    recommendedAction =
      "สร้าง Content หรือ Offer จาก Market Demand";
    reason =
      "พบ Market Demand แต่ยังไม่มี Customer Attention";
    status = "READY";
  }

  return {
    type,
    priority,
    score: total,
    recommended_action: recommendedAction,
    reason,
    status
  };
}

async function loadData(env) {
  const [
    behaviorResult,
    marketResult,
    contentResult,
    ordersResult,
    customersResult
  ] = await Promise.all([
    env.DB.prepare(`
      SELECT *
      FROM behavior_events
      ORDER BY created_at DESC
      LIMIT 100
    `).all(),

    env.DB.prepare(`
      SELECT *
      FROM market_signals
      ORDER BY detected_at DESC
      LIMIT 100
    `).all(),

    env.DB.prepare(`
      SELECT *
      FROM content_engine
      ORDER BY created_at DESC
      LIMIT 100
    `).all(),

    env.DB.prepare(`
      SELECT *
      FROM orders
      ORDER BY created_at DESC
      LIMIT 100
    `).all(),

    env.DB.prepare(`
      SELECT *
      FROM customers
      ORDER BY created_at DESC
      LIMIT 100
    `).all()
  ]);

  return {
    behavior:
      behaviorResult.results || [],

    market:
      marketResult.results || [],

    content:
      contentResult.results || [],

    orders:
      ordersResult.results || [],

    customers:
      customersResult.results || []
  };
}

function getTopMarket(market) {
  return [...market]
    .sort(
      (a, b) =>
        Number(b.score || 0) -
        Number(a.score || 0)
    )[0] || null;
}

function getLatestUsableContent(content) {
  return content.find(item => {
    const status =
      String(item.status || "").toUpperCase();

    return [
      "GENERATED",
      "CREATE",
      "TEST",
      "WINNER",
      "REUSE"
    ].includes(status);
  }) || null;
}

function buildContentDecision(data) {
  const attention =
    getAttentionEvents(data.behavior);

  const topMarket =
    getTopMarket(data.market);

  const usableContent =
    getLatestUsableContent(data.content);

  const sales = {
    orders: data.orders.length,

    revenue: data.orders.reduce(
      (sum, order) => {
        const amount =
          Number(order.amount || 0);

        return sum +
          (Number.isFinite(amount)
            ? amount
            : 0);
      },
      0
    )
  };

  const decision = buildDecision({
    attention,
    market: data.market,
    content: usableContent
      ? [usableContent]
      : [],
    sales,
    customers: data.customers.length
  });

  const topAttention = attention.length
    ? attention.reduce((acc, event) => {
        const type =
          event.event_type || "unknown";

        acc[type] =
          (acc[type] || 0) + 1;

        return acc;
      }, {})
    : {};

  const topAttentionEntry =
    Object.entries(topAttention)
      .sort((a, b) => b[1] - a[1])[0] ||
    null;

  return {
    decision,

    score_breakdown: {
      attention:
        attention.length > 0 ? 10 : 0,

      market:
        data.market.length > 0
          ? Number(topMarket?.score || 0) >= 80
            ? 30
            : Number(topMarket?.score || 0) >= 50
              ? 20
              : 10
          : 0,

      content:
        usableContent ? 20 : 0,

      sales:
        sales.orders > 0 ? 10 : 0,

      customers:
        data.customers.length > 0 ? 10 : 0,

      total: decision.score
    },

    content_recommendation:
      usableContent
        ? {
            id: usableContent.id,
            title: usableContent.title,
            status: usableContent.status,
            attention_type:
              usableContent.attention_type,
            market_keyword:
              usableContent.market_keyword,
            cta: usableContent.cta
          }
        : null,

    signals: {
      attention: {
        total: attention.length,

        top: topAttentionEntry
          ? {
              event_type:
                topAttentionEntry[0],

              total:
                topAttentionEntry[1]
            }
          : null
      },

      market: {
        total: data.market.length,

        top: topMarket
          ? {
              id: topMarket.id,
              keyword: topMarket.keyword,
              title: topMarket.title,
              score:
                Number(topMarket.score || 0),
              source: topMarket.source
            }
          : null
      },

      sales,

      customers:
        data.customers.length,

      content:
        data.content.length
    }
  };
}

/*
============================================================
GET
============================================================

เปิด URL ได้เลย

/api/content-decision

ใช้ดู Decision ปัจจุบัน
============================================================
*/

export async function onRequestGet(context) {
  const { env } = context;

  try {
    if (!env.DB) {
      return json(
        {
          success: false,
          error:
            "D1 database binding DB not found"
        },
        500
      );
    }

    const data =
      await loadData(env);

    const result =
      buildContentDecision(data);

    return json({
      success: true,

      layer:
        "CONTENT_DECISION_ENGINE_V1",

      mode: "preview",

      ...result,

      generated_at:
        new Date().toISOString()
    });

  } catch (error) {
    return json(
      {
        success: false,
        layer:
          "CONTENT_DECISION_ENGINE_V1",
        error: error.message
      },
      500
    );
  }
}

/*
============================================================
POST EXECUTE
============================================================

mode=execute

เมื่อ Decision เป็น PUBLISH_CONTENT
ระบบจะบันทึก Decision Run
และเปลี่ยน Content เป็น READY_TO_PUBLISH
============================================================
*/

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return json(
        {
          success: false,
          error:
            "D1 database binding DB not found"
        },
        500
      );
    }

    const body =
      await request.json().catch(
        () => ({})
      );

    const mode =
      String(
        body.mode || "preview"
      ).toLowerCase();

    const data =
      await loadData(env);

    const result =
      buildContentDecision(data);

    if (mode === "preview") {
      return json({
        success: true,
        layer:
          "CONTENT_DECISION_ENGINE_V1",
        mode: "preview",
        ...result
      });
    }

    if (mode !== "execute") {
      return json(
        {
          success: false,
          error:
            `Unknown mode: ${mode}`
        },
        400
      );
    }

    /*
    ========================================================
    CREATE DECISION RUN TABLE
    ========================================================
    */

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS content_decision_runs (
        id TEXT PRIMARY KEY,
        decision_type TEXT NOT NULL,
        priority TEXT,
        score REAL,
        status TEXT NOT NULL,
        input_data TEXT,
        output_data TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT
      )
    `).run();

    const runId =
      crypto.randomUUID();

    const startedAt =
      new Date().toISOString();

    let execution = {
      action:
        result.decision.type,

      status:
        "WAITING",

      message:
        result.decision.recommended_action
    };

    /*
    ========================================================
    PUBLISH CONTENT
    ========================================================
    */

    if (
      result.decision.type ===
      "PUBLISH_CONTENT"
    ) {
      const content =
        result.content_recommendation;

      if (!content) {
        execution = {
          action: "PUBLISH_CONTENT",
          status: "FAILED",
          message:
            "ไม่พบ Content สำหรับ Publish"
        };
      } else {

        await env.DB.prepare(`
          UPDATE content_engine
          SET status = ?
          WHERE id = ?
        `)
          .bind(
            "READY_TO_PUBLISH",
            content.id
          )
          .run();

        execution = {
          action:
            "PUBLISH_CONTENT",

          status:
            "READY_TO_PUBLISH",

          content: {
            id: content.id,
            title: content.title,
            previous_status:
              content.status,
            new_status:
              "READY_TO_PUBLISH"
          },

          next_step:
            "เผยแพร่ Content และเริ่มติดตาม Attention"
        };
      }
    }

    /*
    ========================================================
    CREATE CONTENT
    ========================================================
    */

    else if (
      result.decision.type ===
      "CREATE_CONTENT"
    ) {
      execution = {
        action:
          "CREATE_CONTENT",

        status:
          "READY",

        message:
          "ส่ง Decision ไปยัง Content Engine เพื่อสร้าง Content"
      };
    }

    /*
    ========================================================
    MARKET RESPONSE
    ========================================================
    */

    else if (
      result.decision.type ===
      "MARKET_RESPONSE"
    ) {
      execution = {
        action:
          "MARKET_RESPONSE",

        status:
          "READY",

        message:
          "ส่ง Market Demand ไปยัง Content / Offer Engine"
      };
    }

    /*
    ========================================================
    WAIT
    ========================================================
    */

    else {
      execution = {
        action:
          "WAIT",

        status:
          "WAITING_DATA",

        message:
          "ยังไม่มีสัญญาณเพียงพอสำหรับ Action"
      };
    }

    const completedAt =
      new Date().toISOString();

    await env.DB.prepare(`
      INSERT INTO content_decision_runs
      (
        id,
        decision_type,
        priority,
        score,
        status,
        input_data,
        output_data,
        created_at,
        completed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        runId,
        result.decision.type,
        result.decision.priority,
        result.decision.score,
        execution.status,
        JSON.stringify({
          attention:
            result.signals.attention,
          market:
            result.signals.market,
          sales:
            result.signals.sales,
          customers:
            result.signals.customers,
          content:
            result.signals.content
        }),
        JSON.stringify(execution),
        startedAt,
        completedAt
      )
      .run();

    return json({
      success: true,

      layer:
        "CONTENT_DECISION_ENGINE_V1",

      mode: "execute",

      decision:
        result.decision,

      execution: {
        id: runId,

        status:
          execution.status,

        started_at:
          startedAt,

        completed_at:
          completedAt
      },

      result: execution,

      score_breakdown:
        result.score_breakdown,

      content_recommendation:
        result.content_recommendation
    });

  } catch (error) {
    return json(
      {
        success: false,
        layer:
          "CONTENT_DECISION_ENGINE_V1",
        error: error.message
      },
      500
    );
  }
}
