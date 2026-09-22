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

    const limit = 20;

    // =========================================================
    // 1. CORE DATA
    // =========================================================

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

    // =========================================================
    // 2. ATTENTION INTELLIGENCE
    // =========================================================

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

    const attentionEventTypes = [
      "view",
      "page_view",
      "product_view",
      "click",
      "engagement",
      "interest"
    ];

    const attentionEvents = behaviorRows.filter(row =>
      attentionEventTypes.includes(
        String(row.event_type || "").toLowerCase()
      )
    );

    const attentionTotal = attentionEvents.reduce(
      (sum, row) => sum + Number(row.total || 0),
      0
    );

    // =========================================================
    // 3. PRODUCT ATTENTION
    // =========================================================

    const productAttention = await env.DB.prepare(`
      SELECT
        product_id,
        COUNT(*) AS events
      FROM behavior_events
      WHERE product_id IS NOT NULL
        AND product_id != ''
      GROUP BY product_id
      ORDER BY events DESC
      LIMIT ?
    `)
      .bind(limit)
      .all();

    const productAttentionRows =
      productAttention.results || [];

    // =========================================================
    // 4. MARKET INTELLIGENCE
    // =========================================================

    const marketRows = latestMarket.results || [];

    const marketDemand = marketRows.filter(row =>
      ["demand", "interest", "trend", "intent"].includes(
        String(row.signal_type || "").toLowerCase()
      )
    );

    const strongestMarketSignal =
      marketRows.length > 0
        ? marketRows.reduce((best, current) => {
            const currentScore = Number(current.score || 0);
            const bestScore = Number(best?.score || 0);

            return currentScore > bestScore
              ? current
              : best;
          }, marketRows[0])
        : null;

    // =========================================================
    // 5. SALES INTELLIGENCE
    // =========================================================

    const revenue =
      Number(ordersSummary?.revenue || 0);

    const orders =
      Number(ordersSummary?.orders || 0);

    const averageOrderValue =
      orders > 0
        ? revenue / orders
        : 0;

    // =========================================================
    // 6. CUSTOMER INTELLIGENCE
    // =========================================================

    const customers =
      Number(customersCount?.total || 0);

    const customerOrderStats =
      await env.DB.prepare(`
        SELECT
          customer_id,
          COUNT(*) AS orders,
          COALESCE(SUM(amount), 0) AS revenue
        FROM orders
        WHERE customer_id IS NOT NULL
        GROUP BY customer_id
        ORDER BY revenue DESC
        LIMIT ?
      `)
        .bind(limit)
        .all();

    const customerRows =
      customerOrderStats.results || [];

    // =========================================================
    // 7. BUILD REAL INTELLIGENCE INSIGHTS
    // =========================================================

    const insights = [];

    if (attentionTotal > 0) {
      const topAttention =
        attentionEvents[0];

      insights.push({
        insight_type: "ATTENTION",
        title: "Customer Attention Detected",
        content:
          `พบ Attention ${attentionTotal} ครั้ง ` +
          `โดยพฤติกรรมที่เด่นที่สุดคือ ${topAttention?.event_type || "unknown"} ` +
          `จำนวน ${topAttention?.total || 0} ครั้ง`,
        score: Math.min(
          100,
          50 + attentionTotal * 10
        ),
        priority:
          attentionTotal >= 3
            ? "HIGH"
            : "MEDIUM"
      });
    }

    if (productAttentionRows.length > 0) {
      const topProduct =
        productAttentionRows[0];

      insights.push({
        insight_type: "PRODUCT_ATTENTION",
        title: "Product Receiving Attention",
        content:
          `Product ${topProduct.product_id} ` +
          `ได้รับความสนใจ ${topProduct.events} events`,
        score: Math.min(
          100,
          50 + Number(topProduct.events) * 10
        ),
        priority: "HIGH"
      });
    }

    if (strongestMarketSignal) {
      insights.push({
        insight_type: "MARKET_DEMAND",
        title: "Market Demand Signal Detected",
        content:
          `ตลาดส่งสัญญาณเกี่ยวกับ "${strongestMarketSignal.keyword || "unknown"}" ` +
          `จาก ${strongestMarketSignal.source || "unknown"} ` +
          `ด้วย score ${Number(strongestMarketSignal.score || 0)}`,
        score: Number(
          strongestMarketSignal.score || 0
        ),
        priority:
          Number(strongestMarketSignal.score || 0) >= 70
            ? "HIGH"
            : "MEDIUM"
      });
    }

    if (orders > 0) {
      insights.push({
        insight_type: "SALES",
        title: "Sales Activity Detected",
        content:
          `มี ${orders} order ` +
          `สร้างรายได้ ${revenue.toFixed(2)} THB ` +
          `และ Average Order Value ${averageOrderValue.toFixed(2)} THB`,
        score: Math.min(
          100,
          50 + orders * 10
        ),
        priority: "HIGH"
      });
    }

    if (
      attentionTotal > 0 &&
      marketRows.length > 0
    ) {
      insights.push({
        insight_type: "DEMAND_ALIGNMENT",
        title: "Attention + Market Demand Alignment",
        content:
          `พบทั้ง Customer Attention และ Market Signal ` +
          `พร้อมกัน — ควรนำข้อมูลทั้งสองด้านไปสร้าง Offer หรือ Content ที่ตอบ Demand`,
        score: 90,
        priority: "HIGH"
      });
    }

    if (
      attentionTotal > 0 &&
      orders === 0
    ) {
      insights.push({
        insight_type: "CONVERSION_GAP",
        title: "Attention Without Conversion",
        content:
          `ระบบพบ Attention ${attentionTotal} ครั้ง ` +
          `แต่ยังไม่มี Order ที่เชื่อมกับพฤติกรรมชุดนี้ ` +
          `ควรทดสอบ Offer หรือ CTA เพื่อเปลี่ยน Attention เป็น Conversion`,
        score: 85,
        priority: "HIGH"
      });
    }

    // =========================================================
    // 8. SAVE NEW INSIGHTS TO D1
    // =========================================================

    for (const insight of insights) {
      const existing = await env.DB.prepare(`
        SELECT id
        FROM ai_insights
        WHERE insight_type = ?
          AND title = ?
        ORDER BY created_at DESC
        LIMIT 1
      `)
        .bind(
          insight.insight_type,
          insight.title
        )
        .first();

      if (!existing) {
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
            `intel-${Date.now()}-${Math.random()
              .toString(36)
              .slice(2, 8)}`,
            null,
            null,
            insight.insight_type,
            insight.title,
            insight.content,
            insight.score,
            insight.priority,
            "NEW",
            new Date().toISOString()
          )
          .run();
      }
    }

    // =========================================================
    // 9. DECISION ENGINE V2
    // =========================================================

    const decisions = [];

    if (attentionTotal > 0) {
      decisions.push({
        type: "ATTENTION",
        priority: "HIGH",
        title: "Attention Signal Detected",
        action:
          "วิเคราะห์สิ่งที่ลูกค้าสนใจและสร้าง Content / Offer",
        reason:
          `พบ Attention ${attentionTotal} ครั้ง`,
        status: "READY"
      });
    }

    if (strongestMarketSignal) {
      decisions.push({
        type: "MARKET",
        priority:
          Number(strongestMarketSignal.score || 0) >= 70
            ? "HIGH"
            : "MEDIUM",
        title: "Market Demand Detected",
        action:
          "สร้างข้อเสนอให้ตรงกับ Market Signal",
        reason:
          `${strongestMarketSignal.keyword || "market"} score ${Number(
            strongestMarketSignal.score || 0
          )}`,
        status: "READY"
      });
    }

    if (attentionTotal > 0 && orders === 0) {
      decisions.push({
        type: "CONVERSION",
        priority: "HIGH",
        title: "Attention → Conversion Gap",
        action:
          "สร้าง CTA / Offer เพื่อเปลี่ยน Attention เป็น Order",
        reason:
          "มี Attention แต่ยังไม่มี Conversion",
        status: "READY"
      });
    }

    if (customers > 0) {
      decisions.push({
        type: "CUSTOMER",
        priority: "MEDIUM",
        title: "Customer Data Available",
        action:
          "แบ่งกลุ่มลูกค้าตามพฤติกรรมและมูลค่า",
        reason:
          `มีลูกค้า ${customers} รายการ`,
        status: "READY"
      });
    }

    if (!decisions.length) {
      decisions.push({
        type: "DATA_COLLECTION",
        priority: "MEDIUM",
        title: "Collect More Data",
        action:
          "เก็บ Behavior และ Market Signals เพิ่ม",
        reason:
          "ข้อมูลยังไม่เพียงพอสำหรับ Decision",
        status: "WAITING_DATA"
      });
    }

    // =========================================================
    // 10. ACTION ENGINE V2
    // =========================================================

    const actions = decisions.map(decision => {
      switch (decision.type) {
        case "ATTENTION":
          return {
            action_type: "CONTENT",
            title:
              "สร้าง Content จาก Attention",
            description:
              "นำสิ่งที่ลูกค้ากำลังสนใจมาสร้าง Content หรือ Offer",
            priority: decision.priority,
            status: "READY",
            source: "ATTENTION"
          };

        case "MARKET":
          return {
            action_type: "MARKET_RESPONSE",
            title:
              "ตอบสนองต่อ Market Demand",
            description:
              "สร้างข้อเสนอที่ตรงกับ Demand Signal",
            priority: decision.priority,
            status: "READY",
            source: "MARKET"
          };

        case "CONVERSION":
          return {
            action_type: "CONVERSION",
            title:
              "เปลี่ยน Attention เป็น Conversion",
            description:
              "ทดสอบ CTA / Offer เพื่อเปลี่ยนความสนใจเป็น Order",
            priority: "HIGH",
            status: "READY",
            source: "ATTENTION"
          };

        case "CUSTOMER":
          return {
            action_type: "CUSTOMER_SEGMENT",
            title:
              "แบ่งกลุ่มลูกค้า",
            description:
              "จัดกลุ่มลูกค้าตามพฤติกรรมและมูลค่า",
            priority: decision.priority,
            status: "READY",
            source: "CUSTOMER"
          };

        default:
          return {
            action_type: "DATA_COLLECTION",
            title:
              "เก็บข้อมูลเพิ่ม",
            description:
              "เพิ่มข้อมูลก่อนสร้าง Action",
            priority: decision.priority,
            status: "WAITING_DATA",
            source: "DATA_COLLECTION"
          };
      }
    });

    // =========================================================
    // 11. FINAL RESPONSE
    // =========================================================

    return Response.json({
      success: true,

      generated_at:
        new Date().toISOString(),

      system: {
        status: "LIVE",
        database: "D1",
        layer: "INTELLIGENCE_V2"
      },

      kpis: {
        customers,
        products: Number(
          productsCount?.total || 0
        ),
        orders,
        revenue,
        average_order_value: averageOrderValue,
        behavior_events: Number(
          behaviorCount?.total || 0
        ),
        market_signals: Number(
          marketCount?.total || 0
        ),
        ai_runs: Number(
          aiRunsCount?.total || 0
        ),
        ai_insights: Number(
          aiInsightsCount?.total || 0
        ) + insights.length,
        workflows: Number(
          workflowsCount?.total || 0
        )
      },

      intelligence: {
        attention: {
          total: attentionTotal,
          event_types: behaviorRows,
          products: productAttentionRows
        },

        market: {
          total: marketRows.length,
          demand_signals: marketDemand,
          strongest_signal: strongestMarketSignal
        },

        sales: {
          orders,
          revenue,
          average_order_value: averageOrderValue
        },

        customers: {
          total: customers,
          purchasing_customers:
            customerRows.length
        },

        insights
      },

      decisions,

      actions,

      automation: {
        workflows:
          latestWorkflows.results || []
      },

      latest: {
        orders:
          latestOrders.results || [],
        behavior:
          latestBehavior.results || [],
        market:
          latestMarket.results || [],
        ai_runs:
          latestAIRuns.results || [],
        ai_insights:
          latestInsights.results || []
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
