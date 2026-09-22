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
    const type = body.type || "overview";
    const limit = Math.min(Number(body.limit) || 50, 200);

    let result = {};

    if (type === "overview") {
      const [
        customers,
        products,
        orders,
        behavior,
        marketSignals,
        aiInsights
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
          SELECT COUNT(*) AS total
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
          FROM ai_insights
        `).first()
      ]);

      result = {
        customers: Number(customers?.total || 0),
        products: Number(products?.total || 0),
        orders: Number(orders?.total || 0),
        behavior_events: Number(behavior?.total || 0),
        market_signals: Number(marketSignals?.total || 0),
        ai_insights: Number(aiInsights?.total || 0)
      };
    }

    else if (type === "behavior") {
      const data = await env.DB.prepare(`
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

      result = {
        events: data.results || []
      };
    }

    else if (type === "market") {
      const data = await env.DB.prepare(`
        SELECT *
        FROM market_signals
        ORDER BY detected_at DESC
        LIMIT ?
      `)
        .bind(limit)
        .all();

      result = {
        signals: data.results || []
      };
    }

    else if (type === "sales") {
      const data = await env.DB.prepare(`
        SELECT
          COUNT(*) AS orders,
          COALESCE(SUM(amount), 0) AS revenue
        FROM orders
      `).first();

      result = {
        orders: Number(data?.orders || 0),
        revenue: Number(data?.revenue || 0)
      };
    }

    else if (type === "customers") {
      const data = await env.DB.prepare(`
        SELECT *
        FROM customers
        ORDER BY created_at DESC
        LIMIT ?
      `)
        .bind(limit)
        .all();

      result = {
        customers: data.results || []
      };
    }

    else if (type === "insights") {
      const data = await env.DB.prepare(`
        SELECT *
        FROM ai_insights
        ORDER BY created_at DESC
        LIMIT ?
      `)
        .bind(limit)
        .all();

      result = {
        insights: data.results || []
      };
    }

    else if (type === "full") {
      const [
        customers,
        products,
        orders,
        behavior,
        market,
        insights
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
            COUNT(*) AS total_orders,
            COALESCE(SUM(amount), 0) AS revenue
          FROM orders
        `).first(),

        env.DB.prepare(`
          SELECT
            event_type,
            COUNT(*) AS total
          FROM behavior_events
          GROUP BY event_type
          ORDER BY total DESC
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
          .all()
      ]);

      result = {
        customers: Number(customers?.total || 0),

        products: Number(products?.total || 0),

        sales: {
          orders: Number(orders?.total_orders || 0),
          revenue: Number(orders?.revenue || 0)
        },

        behavior: behavior?.results || [],

        market: market?.results || [],

        insights: insights?.results || []
      };
    }

    else {
      return Response.json(
        {
          success: false,
          error: `Unknown intelligence type: ${type}`
        },
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      intelligence: result,
      generated_at: new Date().toISOString()
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
