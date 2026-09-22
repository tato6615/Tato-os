export async function onRequestGet(context) {
  const { env } = context;

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

    const limit = 10;

    const [
      customersCount,
      productsCount,
      ordersSummary,
      behaviorCount,
      marketCount,
      aiRunsCount,
      aiInsightsCount,
      workflowsCount,
      latestOrders,
      latestBehavior,
      latestMarket,
      latestInsights,
      latestAIRuns,
      latestWorkflows
    ] = await Promise.all([
      env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM customers
      `).first(),

      env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM products
      `).first(),

      env.DB.prepare(`
        SELECT
          COUNT(*) AS orders,
          COALESCE(SUM(amount), 0) AS revenue
        FROM orders
      `).first(),

      env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM behavior_events
      `).first(),

      env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM market_signals
      `).first(),

      env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM ai_runs
      `).first(),

      env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM ai_insights
      `).first(),

      env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM workflows
      `).first(),

      env.DB.prepare(`
        SELECT *
        FROM orders
        ORDER BY created_at DESC
        LIMIT ?
      `)
        .bind(limit)
        .all(),

      env.DB.prepare(`
        SELECT *
        FROM behavior_events
        ORDER BY created_at DESC
        LIMIT ?
      `)
        .bind(limit)
        .all(),

      env.DB.prepare(`
        SELECT *
        FROM market_signals
        ORDER BY detected_at DESC
        LIMIT ?
      `)
        .bind(limit)
        .all(),

      env.DB.prepare(`
        SELECT *
        FROM ai_insights
        ORDER BY created_at DESC
        LIMIT ?
      `)
        .bind(limit)
        .all(),

      env.DB.prepare(`
        SELECT *
        FROM ai_runs
        ORDER BY created_at DESC
        LIMIT ?
      `)
        .bind(limit)
        .all(),

      env.DB.prepare(`
        SELECT *
        FROM workflows
        ORDER BY created_at DESC
        LIMIT ?
      `)
        .bind(limit)
        .all()
    ]);

    const behaviorTypes = await env.DB.prepare(`
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

    const behaviorRows = behaviorTypes.results || [];

    const attentionEvents = behaviorRows.filter(row =>
      [
        "view",
        "page_view",
        "product_view",
        "click",
        "engagement",
        "interest"
      ].includes(
        String(row.event_type || "").toLowerCase()
      )
    );

    const attentionTotal = attentionEvents.reduce(
      (sum, row) => sum + Number(row.total || 0),
      0
    );

    const decisions = [];

    if (attentionTotal > 0) {
      decisions.push({
        type: "ATTENTION",
        priority: "HIGH",
        title: "Attention Signal Detected",
        action: "สร้าง Content หรือ Offer จากสิ่งที่ผู้ใช้กำลังสนใจ",
        reason: `พบ Attention Signal ${attentionTotal} ครั้ง`,
        status: "READY"
      });
    }

    if ((latestMarket.results || []).length > 0) {
      decisions.push({
        type: "MARKET",
        priority: "HIGH",
        title: "Market Demand Detected",
        action: "ตรวจสอบ Market Signal ล่าสุดและสร้างข้อเสนอที่ตอบ Demand",
        reason: `พบ Market Signals ${latestMarket.results.length} รายการ`,
        status: "READY"
      });
    }

    if (Number(customersCount?.total || 0) > 0) {
      decisions.push({
        type: "CUSTOMER",
        priority: "MEDIUM",
        title: "Customer Data Available",
        action: "แบ่งกลุ่มลูกค้าตามพฤติกรรมและระดับความสนใจ",
        reason: `มีลูกค้า ${customersCount.total} รายการ`,
        status: "READY"
      });
    }

    if (Number(aiInsightsCount?.total || 0) > 0) {
      decisions.push({
        type: "AI_INSIGHT",
        priority: "HIGH",
        title: "AI Insight Available",
        action: "นำ AI Insight ล่าสุดไปตรวจสอบและเปลี่ยนเป็น Action",
        reason: `มี AI Insights ${aiInsightsCount.total} รายการ`,
        status: "READY"
      });
    }

    if (!decisions.length) {
      decisions.push({
        type: "DATA_COLLECTION",
        priority: "MEDIUM",
        title: "Collect More Data",
        action: "เก็บ Behavior และ Market Signals เพิ่ม",
        reason: "ข้อมูลยังไม่เพียงพอสำหรับ Decision",
        status: "WAITING_DATA"
      });
    }

    const actions = decisions.map(decision => {
      switch (String(decision.type).toUpperCase()) {
        case "ATTENTION":
          return {
            action_type: "CONTENT",
            title: "สร้าง Content จาก Attention Signal",
            description: "นำสิ่งที่ผู้ใช้สนใจมาสร้าง Content หรือ Offer",
            priority: decision.priority,
            status: "READY",
            source: "ATTENTION"
          };

        case "MARKET":
          return {
            action_type: "MARKET_RESPONSE",
            title: "ตอบสนองต่อ Market Signal",
            description: "นำ Demand ที่พบมาสร้างข้อเสนอหรือ Content",
            priority: decision.priority,
            status: "READY",
            source: "MARKET"
          };

        case "CUSTOMER":
          return {
            action_type: "CUSTOMER_SEGMENT",
            title: "แบ่งกลุ่มลูกค้า",
            description: "จัดกลุ่มลูกค้าตามพฤติกรรมเพื่อทำข้อเสนอเฉพาะกลุ่ม",
            priority: decision.priority,
            status: "READY",
            source: "CUSTOMER"
          };

        case "AI_INSIGHT":
          return {
            action_type: "AI_ACTION",
            title: "เปลี่ยน AI Insight เป็น Action",
            description: "ตรวจสอบ Insight และสร้าง Action ที่วัดผลได้",
            priority: decision.priority,
            status: "READY",
            source: "AI_INSIGHT"
          };

        default:
          return {
            action_type: "DATA_COLLECTION",
            title: "เก็บข้อมูลเพิ่ม",
            description: "เพิ่มข้อมูลก่อนสร้าง Action",
            priority: decision.priority,
            status: "WAITING_DATA",
            source: "DATA_COLLECTION"
          };
      }
    });

    return Response.json({
      success: true,

      generated_at: new Date().toISOString(),

      system: {
        status: "LIVE",
        database: "D1",
        layer: "COMMAND_CENTER"
      },

      kpis: {
        customers: Number(customersCount?.total || 0),
        products: Number(productsCount?.total || 0),
        orders: Number(ordersSummary?.orders || 0),
        revenue: Number(ordersSummary?.revenue || 0),
        behavior_events: Number(behaviorCount?.total || 0),
        market_signals: Number(marketCount?.total || 0),
        ai_runs: Number(aiRunsCount?.total || 0),
        ai_insights: Number(aiInsightsCount?.total || 0),
        workflows: Number(workflowsCount?.total || 0)
      },

      intelligence: {
        attention: {
          total: attentionTotal,
          events: behaviorRows
        },

        behavior: latestBehavior.results || [],

        market: latestMarket.results || [],

        ai_insights: latestInsights.results || []
      },

      decisions,

      actions,

      automation: {
        workflows: latestWorkflows.results || []
      },

      latest: {
        orders: latestOrders.results || [],
        ai_runs: latestAIRuns.results || []
      }
    });

  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}
