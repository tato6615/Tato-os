export async function onRequest(context) {
  const { request, env } = context;

  if (!env.DB) {
    return json({
      success: false,
      error: "D1 binding DB not found"
    }, 500);
  }

  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  let mode = "preview";

  if (method === "POST") {
    try {
      const body = await request.json();
      mode = body?.mode || "preview";
    } catch {
      mode = "preview";
    }
  }

  try {
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

    const measurementResult = await env.DB.prepare(`
      SELECT *
      FROM content_measurements
      ORDER BY measured_at DESC, created_at DESC
      LIMIT 1
    `).all();

    const measurement = measurementResult.results?.[0] || null;

    if (!measurement) {
      return json({
        success: true,
        layer: "LEARNING_FEEDBACK_LOOP_V1",
        mode,
        learning: {
          signal_type: "NO_MEASUREMENT",
          title: "ยังไม่มีข้อมูลสำหรับเรียนรู้",
          finding: "ยังไม่มี Content Measurement ให้ระบบวิเคราะห์",
          recommendation: "รอให้ Content Measurement เกิดขึ้นก่อน",
          score: 0,
          status: "WAITING"
        },
        content: null,
        measurement: null,
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
        patterns: [],
        winner_decision: "NOT_DECLARED_IN_V1",
        next_step: "Wait for Content Measurement data."
      });
    }

    let content = null;

    if (measurement.content_id) {
      const contentResult = await env.DB.prepare(`
        SELECT *
        FROM content_engine
        WHERE id = ?
        LIMIT 1
      `).bind(measurement.content_id).all();

      content = contentResult.results?.[0] || null;
    }

    const metrics = {
      attention: Number(measurement.attention || 0),
      product_views: Number(measurement.product_views || 0),
      clicks: Number(measurement.clicks || 0),
      engagements: Number(measurement.engagements || 0),
      customers: Number(measurement.customers || 0),
      orders: Number(measurement.orders || 0),
      revenue: Number(measurement.revenue || 0)
    };

    const safeRate = (a, b) => {
      if (!b || b <= 0) return 0;
      return Number(((a / b) * 100).toFixed(2));
    };

    const conversion = {
      attention_to_view: safeRate(
        metrics.product_views,
        metrics.attention
      ),
      view_to_click: safeRate(
        metrics.clicks,
        metrics.product_views
      ),
      click_to_customer: safeRate(
        metrics.customers,
        metrics.clicks
      ),
      customer_to_order: safeRate(
        metrics.orders,
        metrics.customers
      ),
      engagement_to_order: safeRate(
        metrics.orders,
        metrics.engagements
      )
    };

    const patterns = [];

    if (metrics.orders > 0 && metrics.revenue > 0) {
      patterns.push({
        signal_type: "REVENUE_SIGNAL",
        title: "Content มีสัญญาณรายได้",
        finding: `พบ ${metrics.orders} order และรายได้ ${metrics.revenue}`,
        recommendation: "ติดตามรูปแบบ Content และพฤติกรรมก่อนซื้อ เพื่อใช้สร้าง Content รอบถัดไป",
        score: 100
      });
    }

    if (metrics.orders > 0) {
      patterns.push({
        signal_type: "CONVERSION_SIGNAL",
        title: "เกิด Conversion",
        finding: `มีลูกค้าเปลี่ยนเป็นคำสั่งซื้อ ${metrics.orders} รายการ`,
        recommendation: "เก็บโครงสร้าง Content, CTA และเส้นทางพฤติกรรมนี้ไว้เป็น Learning Signal",
        score: 90
      });
    }

    if (metrics.customers > 0 && metrics.orders === 0) {
      patterns.push({
        signal_type: "LOW_PURCHASE_CONVERSION",
        title: "มีลูกค้าแต่ยังไม่เกิดการซื้อ",
        finding: `มีลูกค้า ${metrics.customers} ราย แต่ยังไม่มี order`,
        recommendation: "ปรับข้อเสนอหรือ CTA เพื่อพาลูกค้าจากความสนใจไปสู่การซื้อ",
        score: 70
      });
    }

    if (metrics.clicks > 0 && metrics.customers === 0) {
      patterns.push({
        signal_type: "LOW_LEAD_CONVERSION",
        title: "มี Click แต่ยังไม่เกิด Customer",
        finding: `พบ ${metrics.clicks} clicks แต่ยังไม่มี customer`,
        recommendation: "ตรวจสอบ Landing Page, ข้อเสนอ และขั้นตอนหลัง Click",
        score: 65
      });
    }

    if (metrics.engagements > 0 && metrics.clicks === 0) {
      patterns.push({
        signal_type: "ENGAGEMENT_NO_CLICK",
        title: "มี Engagement แต่ยังไม่มี Click",
        finding: `มี engagement ${metrics.engagements} ครั้ง แต่ไม่มี click`,
        recommendation: "ทดลอง CTA ที่ชัดขึ้นและเชื่อมโยงกับความสนใจที่ตรวจพบ",
        score: 60
      });
    }

    if (metrics.product_views > 0 && metrics.clicks === 0) {
      patterns.push({
        signal_type: "LOW_CTA_RESPONSE",
        title: "มี Product View แต่ยังไม่มี Click",
        finding: `มี product view ${metrics.product_views} ครั้ง แต่ยังไม่มี click`,
        recommendation: "ทดสอบ CTA, offer หรือข้อความที่เชื่อม Product View กับ Action",
        score: 55
      });
    }

    if (metrics.attention > 0 && metrics.product_views === 0) {
      patterns.push({
        signal_type: "ATTENTION_NO_TRAFFIC",
        title: "มี Attention แต่ยังไม่มี Traffic",
        finding: `พบ attention ${metrics.attention} ครั้ง แต่ยังไม่มี product view`,
        recommendation: "เพิ่ม Distribution และเชื่อม Attention ไปยังหน้า Content หรือ Product",
        score: 45
      });
    }

    if (
      metrics.attention === 0 &&
      metrics.product_views === 0 &&
      metrics.clicks === 0 &&
      metrics.engagements === 0 &&
      metrics.customers === 0 &&
      metrics.orders === 0
    ) {
      patterns.push({
        signal_type: "NO_TRAFFIC",
        title: "ยังไม่มี Traffic",
        finding: "ยังไม่พบกิจกรรมที่ใช้เรียนรู้จาก Content",
        recommendation: "เผยแพร่ Content และรอข้อมูลพฤติกรรมก่อนตัดสินผล",
        score: 20
      });
    }

    if (patterns.length === 0) {
      patterns.push({
        signal_type: "INSUFFICIENT_DATA",
        title: "ข้อมูลยังไม่เพียงพอ",
        finding: "มีข้อมูลบางส่วนแต่ยังไม่สามารถระบุ Pattern ที่ชัดเจนได้",
        recommendation: "เก็บข้อมูลเพิ่มก่อนปรับ Content",
        score: 30
      });
    }

    const primary = patterns[0];

    const learning = {
      signal_type: primary.signal_type,
      title: primary.title,
      finding: primary.finding,
      recommendation: primary.recommendation,
      score: primary.score,
      status: "LEARNED"
    };

    let feedbackId = null;

    if (
      method === "POST" &&
      (mode === "learn" || mode === "execute")
    ) {
      feedbackId = crypto.randomUUID();

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
        learning.signal_type,
        learning.title,
        learning.finding,
        learning.recommendation,
        learning.score,
        learning.status
      ).run();
    }

    let nextStep = "Continue collecting behavior and conversion data.";

    if (learning.signal_type === "REVENUE_SIGNAL") {
      nextStep = "Use this pattern as a learning signal for the next Content cycle.";
    } else if (learning.signal_type === "CONVERSION_SIGNAL") {
      nextStep = "Analyze the conversion path and reuse successful patterns.";
    } else if (learning.signal_type === "LOW_PURCHASE_CONVERSION") {
      nextStep = "Improve offer or CTA, then measure again.";
    } else if (learning.signal_type === "LOW_LEAD_CONVERSION") {
      nextStep = "Improve the post-click experience, then measure again.";
    } else if (learning.signal_type === "ENGAGEMENT_NO_CLICK") {
      nextStep = "Improve CTA and measure the next Content cycle.";
    } else if (learning.signal_type === "LOW_CTA_RESPONSE") {
      nextStep = "Test a stronger CTA or offer.";
    } else if (learning.signal_type === "ATTENTION_NO_TRAFFIC") {
      nextStep = "Increase distribution and continue measurement.";
    } else if (learning.signal_type === "NO_TRAFFIC") {
      nextStep = "Wait for traffic, behavior, or sales data.";
    }

    return json({
      success: true,
      layer: "LEARNING_FEEDBACK_LOOP_V1",
      mode,
      learning: {
        ...learning,
        id: feedbackId
      },
      content: content
        ? {
            id: content.id,
            title: content.title,
            status: content.status,
            objective: content.objective,
            attention_type: content.attention_type,
            market_keyword: content.market_keyword,
            angle: content.angle,
            cta: content.cta
          }
        : null,
      measurement: {
        id: measurement.id,
        status: measurement.status,
        measured_at: measurement.measured_at,
        measurement_start: measurement.measurement_start,
        attribution_mode: measurement.attribution_mode
      },
      metrics,
      conversion,
      patterns,
      winner_decision: "NOT_DECLARED_IN_V1",
      next_step: nextStep
    });

  } catch (error) {
    return json({
      success: false,
      layer: "LEARNING_FEEDBACK_LOOP_V1",
      error: error.message || String(error)
    }, 500);
  }
}

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}
