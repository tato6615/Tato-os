export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return Response.json(
        {
          success: false,
          error: "D1 database binding DB not found"
        },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 20, 100);

    // ---------------------------------------------------------
    // CUSTOMER SIGNALS
    // ---------------------------------------------------------
    const customers = await env.DB.prepare(`
      SELECT *
      FROM customers
      ORDER BY created_at DESC
      LIMIT ?
    `)
      .bind(limit)
      .all();

    // ---------------------------------------------------------
    // BEHAVIOR SIGNALS
    // ---------------------------------------------------------
    const behavior = await env.DB.prepare(`
      SELECT
        event_type,
        COUNT(*) AS total
      FROM behavior_events
      GROUP BY event_type
      ORDER BY total DESC
      LIMIT ?
    `)
      .bind(limit)
      .all();

    // ---------------------------------------------------------
    // MARKET SIGNALS
    // ---------------------------------------------------------
    const market = await env.DB.prepare(`
      SELECT *
      FROM market_signals
      ORDER BY created_at DESC
      LIMIT ?
    `)
      .bind(limit)
      .all();

    // ---------------------------------------------------------
    // EXISTING AI INSIGHTS
    // ---------------------------------------------------------
    const insights = await env.DB.prepare(`
      SELECT *
      FROM ai_insights
      ORDER BY created_at DESC
      LIMIT ?
    `)
      .bind(limit)
      .all();

    const decisions = [];

    // =========================================================
    // RULE 1 — HIGH CUSTOMER ATTENTION
    // =========================================================
    const behaviorRows = behavior.results || [];

    const attentionEvents = behaviorRows.filter(row =>
      [
        "view",
        "page_view",
        "product_view",
        "click",
        "engagement",
        "interest"
      ].includes(String(row.event_type).toLowerCase())
    );

    const attentionTotal = attentionEvents.reduce(
      (sum, row) => sum + Number(row.total || 0),
      0
    );

    if (attentionTotal > 0) {
      decisions.push({
        type: "ATTENTION",
        priority: "HIGH",
        action: "สร้างคอนเทนต์หรือข้อเสนอที่ต่อยอดจากสิ่งที่ลูกค้ากำลังสนใจ",
        reason: `พบ Attention Signal จำนวน ${attentionTotal} ครั้ง`,
        status: "READY"
      });
    }

    // =========================================================
    // RULE 2 — MARKET SIGNAL
    // =========================================================
    if ((market.results || []).length > 0) {
      decisions.push({
        type: "MARKET",
        priority: "HIGH",
        action: "ตรวจสอบ Market Signals ล่าสุดและนำหัวข้อที่มี Demand ไปสร้างข้อเสนอ",
        reason: `พบ Market Signals ${market.results.length} รายการ`,
        status: "READY"
      });
    }

    // =========================================================
    // RULE 3 — CUSTOMER BASE
    // =========================================================
    if ((customers.results || []).length > 0) {
      decisions.push({
        type: "CUSTOMER",
        priority: "MEDIUM",
        action: "แบ่งกลุ่มลูกค้าตามพฤติกรรมและระดับความสนใจ เพื่อทำข้อเสนอเฉพาะกลุ่ม",
        reason: `มีข้อมูลลูกค้า ${customers.results.length} รายการ`,
        status: "READY"
      });
    }

    // =========================================================
    // RULE 4 — AI INSIGHTS
    // =========================================================
    if ((insights.results || []).length > 0) {
      decisions.push({
        type: "AI_INSIGHT",
        priority: "HIGH",
        action: "นำ AI Insight ล่าสุดไปตรวจสอบและเปลี่ยนเป็น Action ที่วัดผลได้",
        reason: `มี AI Insights ${insights.results.length} รายการ`,
        status: "READY"
      });
    }

    // =========================================================
    // FALLBACK
    // =========================================================
    if (decisions.length === 0) {
      decisions.push({
        type: "DATA_COLLECTION",
        priority: "MEDIUM",
        action: "เก็บ Behavior และ Market Signals เพิ่มก่อนสร้าง Decision",
        reason: "ระบบยังมีข้อมูลไม่เพียงพอสำหรับ Decision ที่เชื่อถือได้",
        status: "WAITING_DATA"
      });
    }

    // =========================================================
    // SAVE DECISION LOG
    // =========================================================
    const generatedAt = new Date().toISOString();

    return Response.json({
      success: true,

      layer: "DECISION",

      decisions,

      source: {
        customers: customers.results || [],
        behavior: behavior.results || [],
        market: market.results || [],
        insights: insights.results || []
      },

      generated_at: generatedAt
    });
  }

  catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}
