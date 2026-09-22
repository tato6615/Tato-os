```javascript
export async function onRequest(context) {
  const { request, env } = context;

  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };

  if (!env.DB) {
    return new Response(JSON.stringify({
      success: false,
      error: "D1 binding DB not found"
    }), { status: 500, headers });
  }

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });

  const uid = () =>
    crypto.randomUUID();

  const safeNum = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const first = async (sql, ...params) => {
    const result = await env.DB.prepare(sql).bind(...params).first();
    return result || null;
  };

  const all = async (sql, ...params) => {
    const result = await env.DB.prepare(sql).bind(...params).all();
    return result?.results || [];
  };

  try {
    const url = new URL(request.url);

    let mode = "preview";

    if (request.method === "POST") {
      try {
        const body = await request.json();
        mode = body?.mode || "preview";
      } catch {
        mode = "preview";
      }
    }

    if (request.method !== "GET" && request.method !== "POST") {
      return json({
        success: false,
        error: "Method not allowed"
      }, 405);
    }

    /*
     * ------------------------------------------------------------
     * LEARNING / FEEDBACK LOOP V1
     * ------------------------------------------------------------
     * DATA
     *   ↓
     * MEASUREMENT
     *   ↓
     * LEARNING
     *   ↓
     * FEEDBACK
     *
     * V1 does NOT automatically declare a WINNER.
     * It identifies what the system learned from measured signals.
     * ------------------------------------------------------------
     */

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS learning_feedback (
        id TEXT PRIMARY KEY,
        content_id TEXT,
        measurement_id TEXT,
        signal_type TEXT,
        title TEXT,
        finding TEXT,
        recommendation TEXT,
        score REAL,
        status TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // ------------------------------------------------------------
    // 1. Latest measurement
    // ------------------------------------------------------------

    let measurement = await first(`
      SELECT *
      FROM content_measurements
      ORDER BY measured_at DESC
      LIMIT 1
    `);

    // ------------------------------------------------------------
    // 2. If no measurement exists, return safely
    // ------------------------------------------------------------

    if (!measurement) {
      return json({
        success: true,
        layer: "LEARNING_FEEDBACK_LOOP_V1",
        mode,
        learning: {
          status: "NO_MEASUREMENT",
          signal_type: "INSUFFICIENT_DATA",
          title: "ยังไม่มีข้อมูลสำหรับเรียนรู้",
          finding: "ยังไม่มี Content Measurement ให้ระบบนำมาวิเคราะห์",
          recommendation: "รอให้ Content Measurement V1 ทำงานก่อน"
        },
        winner_decision: "NOT_DECLARED_IN_V1",
        next_step: "Run Content Measurement and collect traffic/behavior data."
      });
    }

    // ------------------------------------------------------------
    // 3. Load related content
    // ------------------------------------------------------------

    let content = null;

    if (measurement.content_id) {
      content = await first(`
        SELECT *
        FROM content_engine
        WHERE id = ?
        LIMIT 1
      `, measurement.content_id);
    }

    // ------------------------------------------------------------
    // 4. Parse measured metrics
    // ------------------------------------------------------------

    const attention = safeNum(measurement.attention);
    const productViews = safeNum(measurement.product_views);
    const clicks = safeNum(measurement.clicks);
    const engagements = safeNum(measurement.engagements);
    const customers = safeNum(measurement.customers);
    const orders = safeNum(measurement.orders);
    const revenue = safeNum(measurement.revenue);

    // ------------------------------------------------------------
    // 5. Calculate conversion signals
    // ------------------------------------------------------------

    const viewToClick =
      productViews > 0 ? clicks / productViews : 0;

    const clickToCustomer =
      clicks > 0 ? customers / clicks : 0;

    const customerToOrder =
      customers > 0 ? orders / customers : 0;

    const engagementToOrder =
      engagements > 0 ? orders / engagements : 0;

    // ------------------------------------------------------------
    // 6. Determine learning signal
    // ------------------------------------------------------------

    let signalType = "INSUFFICIENT_DATA";
    let title = "ข้อมูลยังไม่เพียงพอ";
    let finding = "ยังมีข้อมูลไม่มากพอสำหรับสรุปประสิทธิภาพ";
    let recommendation = "เก็บ Attention, Traffic และ Conversion ต่อ";
    let score = 0;
    let status = "LEARNING";

    if (
      orders > 0 &&
      revenue > 0
    ) {
      signalType = "REVENUE_SIGNAL";
      title = "Content มีสัญญาณสร้างรายได้";
      finding =
        `พบ ${orders} order และรายได้ ฿${revenue.toFixed(2)} หลังเริ่มวัดผล`;
      recommendation =
        "เก็บรูปแบบ Content นี้ไว้เป็น Conversion Pattern และนำไปทดสอบซ้ำ";
      score = 100;
      status = "POSITIVE";
    }

    else if (orders > 0) {
      signalType = "CONVERSION_SIGNAL";
      title = "Content มีสัญญาณ Conversion";
      finding =
        `พบ ${orders} order จากข้อมูลหลังเริ่มวัดผล`;
      recommendation =
        "ติดตาม Revenue ต่อ และเก็บ Pattern ของ Content นี้ไว้เรียนรู้";
      score = 90;
      status = "POSITIVE";
    }

    else if (
      customers > 0 &&
      orders === 0
    ) {
      signalType = "LOW_PURCHASE_CONVERSION";
      title = "มีลูกค้าแต่ยังไม่เกิดการซื้อ";
      finding =
        `พบลูกค้า ${customers} ราย แต่ยังไม่มี order`;
      recommendation =
        "ปรับ CTA, ข้อเสนอ และขั้นตอนจากความสนใจไปสู่การซื้อ";
      score = 55;
      status = "NEEDS_IMPROVEMENT";
    }

    else if (
      clicks > 0 &&
      customers === 0
    ) {
      signalType = "LOW_LEAD_CONVERSION";
      title = "มี Click แต่ยังไม่เปลี่ยนเป็นลูกค้า";
      finding =
        `พบ ${clicks} click แต่ยังไม่มีลูกค้า`;
      recommendation =
        "ตรวจ CTA และ Landing/Offer หลัง Click เพื่อเพิ่มการเปลี่ยนเป็นลูกค้า";
      score = 50;
      status = "NEEDS_IMPROVEMENT";
    }

    else if (
      engagements > 0 &&
      clicks === 0
    ) {
      signalType = "ENGAGEMENT_NO_CLICK";
      title = "มี Engagement แต่ยังไม่เกิด Click";
      finding =
        `พบ Engagement ${engagements} ครั้ง แต่ยังไม่มี Click`;
      recommendation =
        "รักษา Topic/Angle ที่ดึงความสนใจไว้ แต่ปรับ CTA ให้ชัดขึ้น";
      score = 45;
      status = "NEEDS_IMPROVEMENT";
    }

    else if (
      productViews > 0 &&
      clicks === 0
    ) {
      signalType = "LOW_CTA_RESPONSE";
      title = "มี Traffic แต่ CTA ยังไม่ตอบสนอง";
      finding =
        `พบ Product View ${productViews} ครั้ง แต่ยังไม่มี Click`;
      recommendation =
        "ทดสอบ CTA, Hook และข้อเสนอใหม่";
      score = 40;
      status = "NEEDS_IMPROVEMENT";
    }

    else if (
      attention > 0 &&
      productViews === 0
    ) {
      signalType = "ATTENTION_NO_TRAFFIC";
      title = "มี Attention แต่ยังไม่เกิด Traffic";
      finding =
        `พบ Attention ${attention} ครั้ง แต่ยังไม่มี Product View`;
      recommendation =
        "เพิ่มเส้นทางจาก Content ไปยัง Product/Landing";
      score = 35;
      status = "NEEDS_IMPROVEMENT";
    }

    else if (
      attention === 0 &&
      productViews === 0 &&
      clicks === 0 &&
      engagements === 0
    ) {
      signalType = "NO_TRAFFIC";
      title = "ยังไม่มี Traffic";
      finding =
        "ยังไม่พบ Attention, View, Click หรือ Engagement หลังเริ่มวัดผล";
      recommendation =
        "ยังไม่ควรตัดสิน Content ให้เพิ่ม Traffic ก่อน";
      score = 10;
      status = "WAITING";
    }

    // ------------------------------------------------------------
    // 7. Build learning object
    // ------------------------------------------------------------

    const learning = {
      status,
      signal_type: signalType,
      title,
      finding,
      recommendation,
      score
    };

    // ------------------------------------------------------------
    // 8. Extra pattern signals
    // ------------------------------------------------------------

    const patterns = [];

    if (attention > 0) {
      patterns.push({
        type: "ATTENTION_PRESENT",
        value: attention,
        meaning: "มีสัญญาณความสนใจ"
      });
    }

    if (productViews > 0) {
      patterns.push({
        type: "TRAFFIC_PRESENT",
        value: productViews,
        meaning: "มี Traffic ไปยัง Product"
      });
    }

    if (clicks > 0) {
      patterns.push({
        type: "CLICK_PRESENT",
        value: clicks,
        meaning: "มีการตอบสนองต่อ CTA"
      });
    }

    if (engagements > 0) {
      patterns.push({
        type: "ENGAGEMENT_PRESENT",
        value: engagements,
        meaning: "มี Engagement"
      });
    }

    if (customers > 0) {
      patterns.push({
        type: "CUSTOMER_PRESENT",
        value: customers,
        meaning: "เกิด Customer"
      });
    }

    if (orders > 0) {
      patterns.push({
        type: "ORDER_PRESENT",
        value: orders,
        meaning: "เกิด Conversion"
      });
    }

    if (revenue > 0) {
      patterns.push({
        type: "REVENUE_PRESENT",
        value: revenue,
        meaning: "เกิด Revenue"
      });
    }

    // ------------------------------------------------------------
    // 9. Save learning result
    // ------------------------------------------------------------

    let feedbackId = null;

    if (mode === "learn" || mode === "execute") {
      feedbackId = uid();

      await env.DB.prepare(`
        INSERT INTO learning_feedback (
          id,
          content_id,
          measurement_id,
          signal_type,
          title,
          finding,
          recommendation,
          score,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        feedbackId,
        measurement.content_id || null,
        measurement.id || null,
        signalType,
        title,
        finding,
        recommendation,
        score,
        status
      ).run();
    }

    // ------------------------------------------------------------
    // 10. Winner decision
    // ------------------------------------------------------------

    let winnerDecision = "NOT_DECLARED_IN_V1";

    /*
     * V1 deliberately avoids automatically declaring WINNER.
     *
     * A future version should compare:
     * - multiple content pieces
     * - normalized traffic
     * - conversion rate
     * - revenue
     * - time window
     *
     * before declaring a true winner.
     */

    // ------------------------------------------------------------
    // 11. Next learning action
    // ------------------------------------------------------------

    let nextStep =
      "Continue collecting measurement data.";

    if (signalType === "REVENUE_SIGNAL") {
      nextStep =
        "Capture this Content Pattern and test a variation.";
    }

    else if (signalType === "CONVERSION_SIGNAL") {
      nextStep =
        "Continue measurement and collect revenue data.";
    }

    else if (
      signalType === "LOW_PURCHASE_CONVERSION"
    ) {
      nextStep =
        "Improve offer/CTA and measure again.";
    }

    else if (
      signalType === "LOW_LEAD_CONVERSION"
    ) {
      nextStep =
        "Improve landing/offer after click and measure again.";
    }

    else if (
      signalType === "LOW_CTA_RESPONSE" ||
      signalType === "ENGAGEMENT_NO_CLICK"
    ) {
      nextStep =
        "Create a CTA variation and measure again.";
    }

    else if (
      signalType === "NO_TRAFFIC"
    ) {
      nextStep =
        "Wait for traffic before changing the Content.";
    }

    // ------------------------------------------------------------
    // 12. Final response
    // ------------------------------------------------------------

    return json({
      success: true,
      layer: "LEARNING_FEEDBACK_LOOP_V1",
      mode,

      learning: {
        ...learning,
        feedback_id: feedbackId
      },

      content: content ? {
        id: content.id,
        title: content.title,
        status: content.status,
        objective: content.objective,
        attention_type: content.attention_type,
        market_keyword: content.market_keyword,
        angle: content.angle,
        cta: content.cta
      } : null,

      measurement: {
        id: measurement.id,
        measured_at: measurement.measured_at,
        measurement_start: measurement.measurement_start,
        attribution_mode: measurement.attribution_mode,
        status: measurement.status
      },

      metrics: {
        attention,
        product_views: productViews,
        clicks,
        engagements,
        customers,
        orders,
        revenue
      },

      conversion: {
        view_to_click: Number(viewToClick.toFixed(4)),
        click_to_customer: Number(clickToCustomer.toFixed(4)),
        customer_to_order: Number(customerToOrder.toFixed(4)),
        engagement_to_order: Number(engagementToOrder.toFixed(4))
      },

      patterns,

      winner_decision: winnerDecision,

      next_step: nextStep
    });

  } catch (error) {
    return json({
      success: false,
      layer: "LEARNING_FEEDBACK_LOOP_V1",
      error: error?.message || String(error)
    }, 500);
  }
}
```
