```javascript
export async function onRequest(context) {
  const { request, env } = context;

  try {
    const method = request.method.toUpperCase();

    // =========================================================
    // DATABASE
    // =========================================================

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS content_measurements (
        id TEXT PRIMARY KEY,
        content_id TEXT,
        measurement_start TEXT,
        measurement_end TEXT,
        attention_events INTEGER DEFAULT 0,
        product_views INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        engagements INTEGER DEFAULT 0,
        customers INTEGER DEFAULT 0,
        orders INTEGER DEFAULT 0,
        revenue REAL DEFAULT 0,
        score INTEGER DEFAULT 0,
        status TEXT,
        measurement_type TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // =========================================================
    // HELPERS
    // =========================================================

    const now = new Date().toISOString();

    function safeJson(value, fallback = {}) {
      try {
        if (!value) return fallback;
        if (typeof value === "object") return value;
        return JSON.parse(value);
      } catch {
        return fallback;
      }
    }

    function normalizeRows(result) {
      return result?.results || [];
    }

    function getNumber(value) {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }

    function getContentIdFromDecisionRun(row) {
      const output = safeJson(row?.output_data, {});
      const input = safeJson(row?.input_data, {});

      return (
        output?.content?.id ||
        output?.content_recommendation?.id ||
        output?.result?.content?.id ||
        input?.content_id ||
        null
      );
    }

    // =========================================================
    // LOAD CONTENT
    // =========================================================

    const contentResult = await env.DB.prepare(`
      SELECT *
      FROM content_engine
      ORDER BY created_at DESC
    `).all();

    const contents = normalizeRows(contentResult);

    // =========================================================
    // GET LATEST PUBLISH DECISION TIME
    // =========================================================

    let decisionRuns = [];

    try {
      const result = await env.DB.prepare(`
        SELECT *
        FROM content_decision_runs
        ORDER BY created_at DESC
        LIMIT 100
      `).all();

      decisionRuns = normalizeRows(result);
    } catch {
      decisionRuns = [];
    }

    function getMeasurementStart(contentId, contentCreatedAt) {
      for (const run of decisionRuns) {
        const runContentId = getContentIdFromDecisionRun(run);

        if (
          runContentId === contentId &&
          run.created_at
        ) {
          return run.created_at;
        }
      }

      return contentCreatedAt || now;
    }

    // =========================================================
    // MEASURE ONE CONTENT
    // =========================================================

    async function measureContent(content) {
      const contentId = content.id;
      const startTime = getMeasurementStart(
        contentId,
        content.created_at
      );

      // -------------------------------------------------------
      // BEHAVIOR
      // -------------------------------------------------------

      const behaviorResult = await env.DB.prepare(`
        SELECT event_type, COUNT(*) AS total
        FROM behavior_events
        WHERE created_at >= ?
        GROUP BY event_type
      `).bind(startTime).all();

      const behaviorRows = normalizeRows(behaviorResult);

      let attentionEvents = 0;
      let productViews = 0;
      let clicks = 0;
      let engagements = 0;

      for (const row of behaviorRows) {
        const type = String(row.event_type || "").toLowerCase();
        const total = getNumber(row.total);

        attentionEvents += total;

        if (
          type.includes("product_view") ||
          type === "view_product"
        ) {
          productViews += total;
        }

        if (
          type.includes("click") ||
          type.includes("cta")
        ) {
          clicks += total;
        }

        if (
          type.includes("like") ||
          type.includes("comment") ||
          type.includes("share") ||
          type.includes("engagement")
        ) {
          engagements += total;
        }
      }

      // -------------------------------------------------------
      // CUSTOMERS
      // -------------------------------------------------------

      const customerResult = await env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM customers
        WHERE created_at >= ?
      `).bind(startTime).first();

      const customers = getNumber(customerResult?.total);

      // -------------------------------------------------------
      // SALES
      // -------------------------------------------------------

      const salesResult = await env.DB.prepare(`
        SELECT
          COUNT(*) AS orders,
          COALESCE(SUM(amount), 0) AS revenue
        FROM orders
        WHERE created_at >= ?
          AND (
            status IS NULL
            OR LOWER(status) NOT IN ('cancelled', 'canceled', 'failed')
          )
      `).bind(startTime).first();

      const orders = getNumber(salesResult?.orders);
      const revenue = getNumber(salesResult?.revenue);

      // -------------------------------------------------------
      // SCORE
      // -------------------------------------------------------

      let score = 0;

      if (attentionEvents > 0) score += 20;
      if (productViews > 0) score += 20;
      if (clicks > 0) score += 15;
      if (engagements > 0) score += 15;
      if (customers > 0) score += 10;
      if (orders > 0) score += 20;

      score = Math.min(score, 100);

      // -------------------------------------------------------
      // STATUS
      // -------------------------------------------------------

      let status = "WAITING_FOR_TRAFFIC";

      if (attentionEvents > 0 || productViews > 0) {
        status = "MEASURED";
      }

      if (orders > 0) {
        status = "CONVERTING";
      }

      // IMPORTANT:
      // Do not declare WINNER in V1.
      // We need more real-world data before automatic classification.

      return {
        content_id: contentId,
        title: content.title,
        content_status: content.status,
        measurement_start: startTime,
        measurement_end: now,

        metrics: {
          attention_events: attentionEvents,
          product_views: productViews,
          clicks,
          engagements,
          customers,
          orders,
          revenue
        },

        score,

        status,

        interpretation:
          status === "CONVERTING"
            ? "Content มีสัญญาณ Conversion จากข้อมูลปัจจุบัน"
            : status === "MEASURED"
              ? "Content เริ่มสร้าง Attention แล้ว ต้องติดตาม Conversion ต่อ"
              : "ยังไม่มี Traffic หลังช่วงเริ่มวัดผล ต้องรอข้อมูลเพิ่ม",

        next_step:
          status === "CONVERTING"
            ? "เก็บข้อมูลต่อเพื่อเรียนรู้ว่า Content นี้สร้างยอดขายได้อย่างไร"
            : status === "MEASURED"
              ? "ติดตาม Click → Product View → Customer → Order"
              : "เผยแพร่ Content แล้วส่ง Traffic เข้าระบบก่อนวัดผล"
      };
    }

    // =========================================================
    // GET = PREVIEW
    // =========================================================

    if (method === "GET") {
      const measurements = [];

      for (const content of contents) {
        measurements.push(await measureContent(content));
      }

      const latest = measurements[0] || null;

      return new Response(
        JSON.stringify(
          {
            success: true,
            layer: "CONTENT_MEASUREMENT_ENGINE_V1",
            mode: "preview",

            measurement: latest,

            contents: measurements,

            funnel: {
              publish: latest?.content_status || null,
              attention: latest?.metrics?.attention_events || 0,
              product_views: latest?.metrics?.product_views || 0,
              clicks: latest?.metrics?.clicks || 0,
              customers: latest?.metrics?.customers || 0,
              orders: latest?.metrics?.orders || 0,
              revenue: latest?.metrics?.revenue || 0
            }
          },
          null,
          2
        ),
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }

    // =========================================================
    // POST
    // =========================================================

    if (method === "POST") {
      let body = {};

      try {
        body = await request.json();
      } catch {
        body = {};
      }

      const mode = body.mode || "measure";
      const requestedContentId = body.content_id || null;

      let selectedContents = contents;

      if (requestedContentId) {
        selectedContents = contents.filter(
          item => item.id === requestedContentId
        );
      }

      if (selectedContents.length === 0) {
        return new Response(
          JSON.stringify(
            {
              success: false,
              layer: "CONTENT_MEASUREMENT_ENGINE_V1",
              error: "CONTENT_NOT_FOUND"
            },
            null,
            2
          ),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json; charset=utf-8"
            }
          }
        );
      }

      const measurements = [];

      for (const content of selectedContents) {
        const measurement = await measureContent(content);

        // -----------------------------------------------------
        // SAVE MEASUREMENT
        // -----------------------------------------------------

        const measurementId = crypto.randomUUID();

        await env.DB.prepare(`
          INSERT INTO content_measurements (
            id,
            content_id,
            measurement_start,
            measurement_end,
            attention_events,
            product_views,
            clicks,
            engagements,
            customers,
            orders,
            revenue,
            score,
            status,
            measurement_type
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          measurementId,
          measurement.content_id,
          measurement.measurement_start,
          measurement.measurement_end,
          measurement.metrics.attention_events,
          measurement.metrics.product_views,
          measurement.metrics.clicks,
          measurement.metrics.engagements,
          measurement.metrics.customers,
          measurement.metrics.orders,
          measurement.metrics.revenue,
          measurement.score,
          measurement.status,
          "CONTENT_MEASUREMENT_V1"
        ).run();

        measurements.push({
          ...measurement,
          measurement_id: measurementId
        });
      }

      // -------------------------------------------------------
      // SUMMARY
      // -------------------------------------------------------

      const totalAttention = measurements.reduce(
        (sum, item) => sum + item.metrics.attention_events,
        0
      );

      const totalProductViews = measurements.reduce(
        (sum, item) => sum + item.metrics.product_views,
        0
      );

      const totalClicks = measurements.reduce(
        (sum, item) => sum + item.metrics.clicks,
        0
      );

      const totalCustomers = measurements.reduce(
        (sum, item) => sum + item.metrics.customers,
        0
      );

      const totalOrders = measurements.reduce(
        (sum, item) => sum + item.metrics.orders,
        0
      );

      const totalRevenue = measurements.reduce(
        (sum, item) => sum + item.metrics.revenue,
        0
      );

      return new Response(
        JSON.stringify(
          {
            success: true,
            layer: "CONTENT_MEASUREMENT_ENGINE_V1",
            mode,

            execution: {
              id: crypto.randomUUID(),
              status: "COMPLETED",
              started_at: now,
              completed_at: new Date().toISOString()
            },

            measurements,

            summary: {
              contents_measured: measurements.length,
              attention_events: totalAttention,
              product_views: totalProductViews,
              clicks: totalClicks,
              customers: totalCustomers,
              orders: totalOrders,
              revenue: totalRevenue
            },

            funnel: {
              publish: measurements.length,
              attention: totalAttention,
              product_views: totalProductViews,
              clicks: totalClicks,
              customers: totalCustomers,
              orders: totalOrders,
              revenue: totalRevenue
            },

            next_layer:
              "LEARNING_FEEDBACK_LOOP_V1"
          },
          null,
          2
        ),
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }

    return new Response(
      JSON.stringify(
        {
          success: false,
          error: "METHOD_NOT_ALLOWED"
        },
        null,
        2
      ),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify(
        {
          success: false,
          layer: "CONTENT_MEASUREMENT_ENGINE_V1",
          error: error.message
        },
        null,
        2
      ),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      }
    );
  }
}
```
