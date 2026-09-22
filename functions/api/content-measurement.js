// functions/api/content-measurement.js
// TATO OS — Content Measurement Engine V1
//
// Purpose:
// DATA → CONTENT → ATTENTION → BEHAVIOR → SALES
//
// V1 measures aggregate behavior after content becomes active.
// It does NOT automatically declare a WINNER.
// True attribution will be improved in the Learning / Feedback Loop stage.

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

const now = () => new Date().toISOString();

const id = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safeString(value) {
  return value == null ? "" : String(value);
}

async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS content_measurements (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      measured_at TEXT,
      measurement_start TEXT,

      attention INTEGER DEFAULT 0,
      product_views INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      engagements INTEGER DEFAULT 0,

      customers INTEGER DEFAULT 0,
      orders INTEGER DEFAULT 0,
      revenue REAL DEFAULT 0,

      attention_to_view REAL DEFAULT 0,
      view_to_click REAL DEFAULT 0,
      click_to_customer REAL DEFAULT 0,
      customer_to_order REAL DEFAULT 0,

      status TEXT,
      attribution_mode TEXT,

      created_at TEXT
    )
  `).run();
}

async function getContent(db, contentId) {
  if (contentId) {
    return await db
      .prepare(`
        SELECT *
        FROM content_engine
        WHERE id = ?
        LIMIT 1
      `)
      .bind(contentId)
      .first();
  }

  return await db
    .prepare(`
      SELECT *
      FROM content_engine
      WHERE status IN (
        'READY_TO_PUBLISH',
        'PUBLISHED',
        'GENERATED',
        'TEST',
        'WINNER',
        'REUSE'
      )
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .first();
}

async function getMeasurementStart(db, content) {
  if (!content) {
    return now();
  }

  /*
   * Try to use the latest Content Decision execution
   * related to this content.
   *
   * Because previous versions may have slightly different
   * schemas, this is intentionally defensive.
   */

  try {
    const table = await db
      .prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'content_decision_runs'
        LIMIT 1
      `)
      .first();

    if (table) {
      const rows = await db
        .prepare(`
          SELECT *
          FROM content_decision_runs
          ORDER BY created_at DESC
          LIMIT 20
        `)
        .all();

      for (const row of rows.results || []) {
        const raw = JSON.stringify(row);

        if (
          raw.includes(safeString(content.id)) ||
          raw.includes(safeString(content.title))
        ) {
          if (row.created_at) {
            return row.created_at;
          }

          if (row.started_at) {
            return row.started_at;
          }

          if (row.executed_at) {
            return row.executed_at;
          }
        }
      }
    }
  } catch (error) {
    // Fall back to content creation time.
  }

  return content.created_at || now();
}

async function measureAttention(db, start) {
  try {
    const result = await db
      .prepare(`
        SELECT COUNT(*) AS total
        FROM behavior_events
        WHERE created_at >= ?
          AND event_type IN (
            'product_view',
            'click',
            'cta_click',
            'engagement',
            'content_view',
            'content_click',
            'content_engagement'
          )
      `)
      .bind(start)
      .first();

    return safeNumber(result?.total);
  } catch (error) {
    return 0;
  }
}

async function measureProductViews(db, start, content) {
  try {
    if (content?.product_id) {
      const result = await db
        .prepare(`
          SELECT COUNT(*) AS total
          FROM behavior_events
          WHERE created_at >= ?
            AND product_id = ?
            AND event_type = 'product_view'
        `)
        .bind(start, content.product_id)
        .first();

      return safeNumber(result?.total);
    }

    const result = await db
      .prepare(`
        SELECT COUNT(*) AS total
        FROM behavior_events
        WHERE created_at >= ?
          AND event_type = 'product_view'
      `)
      .bind(start)
      .first();

    return safeNumber(result?.total);
  } catch (error) {
    return 0;
  }
}

async function measureClicks(db, start) {
  try {
    const result = await db
      .prepare(`
        SELECT COUNT(*) AS total
        FROM behavior_events
        WHERE created_at >= ?
          AND event_type IN (
            'click',
            'cta_click',
            'content_click',
            'button_click'
          )
      `)
      .bind(start)
      .first();

    return safeNumber(result?.total);
  } catch (error) {
    return 0;
  }
}

async function measureEngagements(db, start) {
  try {
    const result = await db
      .prepare(`
        SELECT COUNT(*) AS total
        FROM behavior_events
        WHERE created_at >= ?
          AND event_type IN (
            'engagement',
            'content_engagement',
            'share',
            'save',
            'comment',
            'like'
          )
      `)
      .bind(start)
      .first();

    return safeNumber(result?.total);
  } catch (error) {
    return 0;
  }
}

async function measureCustomers(db, start) {
  try {
    const result = await db
      .prepare(`
        SELECT COUNT(*) AS total
        FROM customers
        WHERE created_at >= ?
      `)
      .bind(start)
      .first();

    return safeNumber(result?.total);
  } catch (error) {
    return 0;
  }
}

async function measureOrders(db, start) {
  try {
    const result = await db
      .prepare(`
        SELECT
          COUNT(*) AS total,
          COALESCE(SUM(amount), 0) AS revenue
        FROM orders
        WHERE created_at >= ?
          AND (
            status IS NULL
            OR LOWER(status) NOT IN (
              'cancelled',
              'canceled',
              'failed',
              'refunded'
            )
          )
      `)
      .bind(start)
      .first();

    return {
      orders: safeNumber(result?.total),
      revenue: safeNumber(result?.revenue)
    };
  } catch (error) {
    return {
      orders: 0,
      revenue: 0
    };
  }
}

function calculateRate(numerator, denominator) {
  if (!denominator) return 0;

  return Number(
    ((numerator / denominator) * 100).toFixed(2)
  );
}

function determineStatus(metrics) {
  if (
    metrics.orders > 0 &&
    metrics.revenue > 0
  ) {
    return "CONVERTING";
  }

  if (
    metrics.attention > 0 ||
    metrics.product_views > 0 ||
    metrics.clicks > 0 ||
    metrics.engagements > 0 ||
    metrics.customers > 0
  ) {
    return "MEASURED";
  }

  return "WAITING_FOR_TRAFFIC";
}

function buildMeasurement(metrics) {
  return {
    attention: metrics.attention,
    product_views: metrics.product_views,
    clicks: metrics.clicks,
    engagements: metrics.engagements,
    customers: metrics.customers,
    orders: metrics.orders,
    revenue: metrics.revenue,

    funnel: {
      attention_to_view: calculateRate(
        metrics.product_views,
        metrics.attention
      ),

      view_to_click: calculateRate(
        metrics.clicks,
        metrics.product_views
      ),

      click_to_customer: calculateRate(
        metrics.customers,
        metrics.clicks
      ),

      customer_to_order: calculateRate(
        metrics.orders,
        metrics.customers
      )
    }
  };
}

async function runMeasurement(db, contentId = null) {
  await ensureTable(db);

  const content = await getContent(db, contentId);

  if (!content) {
    return {
      success: false,
      layer: "CONTENT_MEASUREMENT_ENGINE_V1",
      error: "No measurable content found.",
      hint:
        "Create or generate content first, then run measurement again."
    };
  }

  const measurementStart = await getMeasurementStart(
    db,
    content
  );

  const [
    attention,
    productViews,
    clicks,
    engagements,
    customers,
    orderData
  ] = await Promise.all([
    measureAttention(db, measurementStart),
    measureProductViews(
      db,
      measurementStart,
      content
    ),
    measureClicks(db, measurementStart),
    measureEngagements(db, measurementStart),
    measureCustomers(db, measurementStart),
    measureOrders(db, measurementStart)
  ]);

  const metrics = {
    attention,
    product_views: productViews,
    clicks,
    engagements,
    customers,
    orders: orderData.orders,
    revenue: orderData.revenue
  };

  const calculated = buildMeasurement(metrics);

  const status = determineStatus(metrics);

  const measuredAt = now();

  const measurementId = id();

  await db
    .prepare(`
      INSERT INTO content_measurements (
        id,
        content_id,
        measured_at,
        measurement_start,

        attention,
        product_views,
        clicks,
        engagements,

        customers,
        orders,
        revenue,

        attention_to_view,
        view_to_click,
        click_to_customer,
        customer_to_order,

        status,
        attribution_mode,

        created_at
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,

        ?,
        ?,
        ?,
        ?,

        ?,
        ?,
        ?,

        ?,
        ?,
        ?,
        ?,

        ?,
        ?,

        ?
      )
    `)
    .bind(
      measurementId,
      content.id,
      measuredAt,
      measurementStart,

      metrics.attention,
      metrics.product_views,
      metrics.clicks,
      metrics.engagements,

      metrics.customers,
      metrics.orders,
      metrics.revenue,

      calculated.funnel.attention_to_view,
      calculated.funnel.view_to_click,
      calculated.funnel.click_to_customer,
      calculated.funnel.customer_to_order,

      status,
      "AGGREGATE_V1",

      measuredAt
    )
    .run();

  return {
    success: true,

    layer: "CONTENT_MEASUREMENT_ENGINE_V1",

    mode: "measure",

    measurement: {
      id: measurementId,
      status,
      measured_at: measuredAt,
      measurement_start: measurementStart,

      attribution_mode:
        "AGGREGATE_V1",

      note:
        "Metrics represent aggregate activity after the measurement start. They are not yet true content-level attribution."
    },

    content: {
      id: content.id,
      title: content.title || "",
      status: content.status || "",
      objective: content.objective || "",
      attention_type:
        content.attention_type || "",
      market_keyword:
        content.market_keyword || "",
      angle: content.angle || "",
      cta: content.cta || ""
    },

    metrics: calculated,

    learning_signal: {
      has_attention:
        metrics.attention > 0,

      has_traffic:
        metrics.product_views > 0 ||
        metrics.clicks > 0,

      has_engagement:
        metrics.engagements > 0,

      has_customer:
        metrics.customers > 0,

      has_conversion:
        metrics.orders > 0,

      revenue_generated:
        metrics.revenue > 0
    },

    next_step:
      status === "CONVERTING"
        ? "Send this result to the Learning / Feedback Loop."
        : status === "MEASURED"
          ? "Continue collecting traffic and behavior before deciding content performance."
          : "Wait for traffic, behavior, or sales data.",

    winner_decision:
      "NOT_DECLARED_IN_V1"
  };
}

export async function onRequestGet(context) {
  try {
    const { env, request } = context;

    if (!env?.DB) {
      return json(
        {
          success: false,
          layer: "CONTENT_MEASUREMENT_ENGINE_V1",
          error: "D1 binding DB is not available."
        },
        500
      );
    }

    const url = new URL(request.url);

    const contentId =
      url.searchParams.get("content_id") ||
      url.searchParams.get("id") ||
      null;

    const result = await runMeasurement(
      env.DB,
      contentId
    );

    return json(result);
  } catch (error) {
    return json(
      {
        success: false,
        layer: "CONTENT_MEASUREMENT_ENGINE_V1",
        error: safeString(error?.message || error)
      },
      500
    );
  }
}

export async function onRequestPost(context) {
  try {
    const { env, request } = context;

    if (!env?.DB) {
      return json(
        {
          success: false,
          layer: "CONTENT_MEASUREMENT_ENGINE_V1",
          error: "D1 binding DB is not available."
        },
        500
      );
    }

    let body = {};

    try {
      body = await request.json();
    } catch (error) {
      body = {};
    }

    const mode =
      body?.mode || "measure";

    if (
      mode !== "measure" &&
      mode !== "preview"
    ) {
      return json(
        {
          success: false,
          layer: "CONTENT_MEASUREMENT_ENGINE_V1",
          error:
            "Invalid mode. Use 'measure' or 'preview'."
        },
        400
      );
    }

    await ensureTable(env.DB);

    const contentId =
      body?.content_id ||
      null;

    const content = await getContent(
      env.DB,
      contentId
    );

    if (!content) {
      return json(
        {
          success: false,
          layer: "CONTENT_MEASUREMENT_ENGINE_V1",
          mode,
          error:
            "No measurable content found."
        },
        404
      );
    }

    if (mode === "preview") {
      const measurementStart =
        await getMeasurementStart(
          env.DB,
          content
        );

      return json({
        success: true,
        layer:
          "CONTENT_MEASUREMENT_ENGINE_V1",
        mode: "preview",

        content: {
          id: content.id,
          title: content.title || "",
          status: content.status || "",
          created_at:
            content.created_at || null
        },

        measurement_start:
          measurementStart,

        attribution_mode:
          "AGGREGATE_V1",

        metrics_to_measure: [
          "attention",
          "product_views",
          "clicks",
          "engagements",
          "customers",
          "orders",
          "revenue"
        ],

        winner_decision:
          "NOT_DECLARED_IN_V1"
      });
    }

    const result = await runMeasurement(
      env.DB,
      contentId
    );

    return json(result);
  } catch (error) {
    return json(
      {
        success: false,
        layer: "CONTENT_MEASUREMENT_ENGINE_V1",
        error: safeString(error?.message || error)
      },
      500
    );
  }
}
