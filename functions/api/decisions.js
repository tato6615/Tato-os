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


// =============================================================
// CONTENT DECISION ENGINE V1
// =============================================================

async function buildContentDecision(env) {

  // -----------------------------------------------------------
  // 1. ATTENTION
  // -----------------------------------------------------------

  const behaviorResult = await env.DB
    .prepare(`
      SELECT
        event_type,
        page,
        product_id,
        COUNT(*) AS total
      FROM behavior_events
      WHERE event_type IN (
        'view',
        'page_view',
        'product_view',
        'click',
        'engagement',
        'interest'
      )
      GROUP BY event_type, page, product_id
      ORDER BY total DESC
      LIMIT 50
    `)
    .all();


  const behavior =
    behaviorResult.results || [];


  const attentionTotal =
    behavior.reduce(
      (sum, row) =>
        sum + Number(row.total || 0),
      0
    );


  const topAttention =
    behavior[0] || null;


  // -----------------------------------------------------------
  // 2. MARKET
  // -----------------------------------------------------------

  const marketResult = await env.DB
    .prepare(`
      SELECT
        id,
        source,
        signal_type,
        keyword,
        title,
        content,
        url,
        score,
        metadata,
        detected_at
      FROM market_signals
      ORDER BY score DESC, detected_at DESC
      LIMIT 20
    `)
    .all();


  const market =
    marketResult.results || [];


  const topMarket =
    market[0] || null;


  const marketScore =
    Number(topMarket?.score || 0);


  // -----------------------------------------------------------
  // 3. SALES
  // -----------------------------------------------------------

  const salesResult = await env.DB
    .prepare(`
      SELECT
        COUNT(*) AS orders,
        COALESCE(SUM(amount), 0) AS revenue
      FROM orders
      WHERE status IS NULL
         OR LOWER(status) IN (
           'paid',
           'completed',
           'success',
           'successful'
         )
    `)
    .first();


  const orders =
    Number(salesResult?.orders || 0);


  const revenue =
    Number(salesResult?.revenue || 0);


  // -----------------------------------------------------------
  // 4. CUSTOMERS
  // -----------------------------------------------------------

  const customerResult = await env.DB
    .prepare(`
      SELECT COUNT(*) AS total
      FROM customers
    `)
    .first();


  const customers =
    Number(customerResult?.total || 0);


  // -----------------------------------------------------------
  // 5. AI INSIGHTS
  // -----------------------------------------------------------

  const insightResult = await env.DB
    .prepare(`
      SELECT
        id,
        insight_type,
        title,
        content,
        score,
        priority,
        status,
        created_at
      FROM ai_insights
      ORDER BY created_at DESC
      LIMIT 10
    `)
    .all();


  const insights =
    insightResult.results || [];


  // -----------------------------------------------------------
  // 6. CONTENT
  // -----------------------------------------------------------

  const contentResult = await env.DB
    .prepare(`
      SELECT
        id,
        source,
        status,
        title,
        objective,
        attention_type,
        market_keyword,
        angle,
        direction,
        cta,
        content_text,
        created_at
      FROM content_engine
      ORDER BY created_at DESC
      LIMIT 20
    `)
    .all();


  const contents =
    contentResult.results || [];


  const generatedContent =
    contents.filter(
      item =>
        String(item.status || "")
          .toUpperCase() === "GENERATED"
    );


  const latestContent =
    generatedContent[0] ||
    contents[0] ||
    null;


  // -----------------------------------------------------------
  // 7. DECISION SCORE
  // -----------------------------------------------------------

  let attentionPoints = 0;
  let marketPoints = 0;
  let contentPoints = 0;
  let salesPoints = 0;
  let customerPoints = 0;


  // ATTENTION: max 40
  if (attentionTotal > 0) {
    attentionPoints = Math.min(
      attentionTotal * 10,
      40
    );
  }


  // MARKET: max 30
  if (marketScore >= 80) {
    marketPoints = 30;
  } else if (marketScore >= 60) {
    marketPoints = 24;
  } else if (marketScore >= 40) {
    marketPoints = 18;
  } else if (marketScore > 0) {
    marketPoints = 10;
  }


  // CONTENT READY: max 20
  if (generatedContent.length > 0) {
    contentPoints = 20;
  } else if (contents.length > 0) {
    contentPoints = 10;
  }


  // SALES: max 10
  if (orders > 0) {
    salesPoints = 10;
  }


  // CUSTOMER: max 10
  if (customers > 0) {
    customerPoints = 10;
  }


  const totalScore =
    attentionPoints +
    marketPoints +
    contentPoints +
    salesPoints +
    customerPoints;


  // -----------------------------------------------------------
  // 8. DECISION LEVEL
  // -----------------------------------------------------------

  let priority = "LOW";

  if (totalScore >= 80) {
    priority = "HIGH";
  } else if (totalScore >= 50) {
    priority = "MEDIUM";
  }


  // -----------------------------------------------------------
  // 9. DECISION TYPE
  // -----------------------------------------------------------

  let decisionType =
    "COLLECT_MORE_DATA";

  let recommendedAction =
    "เก็บข้อมูลเพิ่มก่อนสร้าง Content";

  let reason =
    "ข้อมูลยังไม่เพียงพอสำหรับตัดสินใจ";


  if (
    latestContent &&
    attentionTotal > 0 &&
    marketScore >= 60
  ) {

    decisionType =
      "PUBLISH_CONTENT";

    recommendedAction =
      "นำ Content ที่สร้างแล้วไปเผยแพร่และติดตาม Attention";

    reason =
      "พบ Customer Attention และ Market Demand พร้อมมี Content ที่สร้างเสร็จแล้ว";

  } else if (
    attentionTotal > 0 &&
    marketScore >= 60
  ) {

    decisionType =
      "GENERATE_CONTENT";

    recommendedAction =
      "สร้าง Content จาก Attention + Market Demand";

    reason =
      "พบ Attention และ Market Demand แต่ยังไม่มี Content พร้อมใช้";

  } else if (
    attentionTotal > 0
  ) {

    decisionType =
      "EXPLORE_ATTENTION";

    recommendedAction =
      "สร้าง Content เพื่อทดสอบความสนใจของลูกค้า";

    reason =
      "ระบบพบ Customer Attention แต่ Market Demand ยังไม่ชัด";

  } else if (
    marketScore >= 60
  ) {

    decisionType =
      "TEST_MARKET";

    recommendedAction =
      "สร้าง Content ทดสอบ Market Demand";

    reason =
      "ระบบพบ Market Demand แต่ยังไม่มี Customer Attention เพียงพอ";

  } else if (
    orders > 0
  ) {

    decisionType =
      "OPTIMIZE_SALES";

    recommendedAction =
      "นำข้อมูลการซื้อไปสร้าง Content สำหรับเพิ่ม Conversion";

    reason =
      "มี Sales Data แล้ว ควรนำพฤติกรรมการซื้อมาใช้ต่อยอด";

  }


  // -----------------------------------------------------------
  // 10. CONTENT RECOMMENDATION
  // -----------------------------------------------------------

  let contentRecommendation = null;


  if (latestContent) {

    contentRecommendation = {
      id: latestContent.id,
      title: latestContent.title,
      status: latestContent.status,
      attention_type:
        latestContent.attention_type,
      market_keyword:
        latestContent.market_keyword,
      cta: latestContent.cta
    };

  }


  // -----------------------------------------------------------
  // 11. SCORE BREAKDOWN
  // -----------------------------------------------------------

  const scoreBreakdown = {
    attention: attentionPoints,
    market: marketPoints,
    content: contentPoints,
    sales: salesPoints,
    customers: customerPoints,
    total: totalScore
  };


  // -----------------------------------------------------------
  // 12. RETURN DECISION
  // -----------------------------------------------------------

  return {
    decision: {
      type: decisionType,
      priority,
      score: totalScore,
      recommended_action: recommendedAction,
      reason,
      status: "READY"
    },

    score_breakdown: scoreBreakdown,

    content_recommendation:
      contentRecommendation,

    signals: {
      attention: {
        total: attentionTotal,
        top: topAttention
      },

      market: {
        total: market.length,
        top: topMarket,
        score: marketScore
      },

      sales: {
        orders,
        revenue
      },

      customers,

      ai_insights: insights.length,

      content: {
        total: contents.length,
        generated: generatedContent.length
      }
    },

    generated_at:
      new Date().toISOString()
  };
}


// =============================================================
// GET
// =============================================================

export async function onRequestGet(context) {

  try {

    if (!context.env.DB) {
      return json(
        {
          success: false,
          error:
            "D1 database binding DB not found"
        },
        500
      );
    }


    const result =
      await buildContentDecision(
        context.env
      );


    return json({
      success: true,
      layer: "CONTENT_DECISION_ENGINE_V1",
      ...result
    });


  } catch (error) {

    return json(
      {
        success: false,
        error: error.message
      },
      500
    );
  }
}


// =============================================================
// POST
// =============================================================

export async function onRequestPost(context) {

  try {

    if (!context.env.DB) {
      return json(
        {
          success: false,
          error:
            "D1 database binding DB not found"
        },
        500
      );
    }


    const result =
      await buildContentDecision(
        context.env
      );


    return json({
      success: true,
      layer: "CONTENT_DECISION_ENGINE_V1",
      ...result
    });


  } catch (error) {

    return json(
      {
        success: false,
        error: error.message
      },
      500
    );
  }
}
