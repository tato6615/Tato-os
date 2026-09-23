```javascript
// functions/api/content-measurement.js
// TATO OS — Content Measurement Engine V2
//
// Purpose:
// CONTENT → VIEW → CLICK → PRODUCT VIEW → ENGAGEMENT → CUSTOMER → ORDER → REVENUE
//
// V2:
// - Measures activity belonging to a specific content_id
// - Uses content_view/content_click metadata for attribution
// - Uses the same session_id after content_click for downstream behavior
// - Attributes customers from downstream behavior
// - Attributes orders/revenue to customers reached through the content
// - Does NOT automatically declare a WINNER

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
  if (
    typeof crypto !== "undefined" &&
    crypto.randomUUID
  ) {
    return crypto.randomUUID();
  }

  return String(Date.now()) + "-" +
    Math.random().toString(36).slice(2);
};

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safeString(value) {
  return value == null ? "" : String(value);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function ensureTable(db) {
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS content_measurements (" +
    "id TEXT PRIMARY KEY," +
    "content_id TEXT," +
    "measured_at TEXT," +
    "measurement_start TEXT," +

    "attention INTEGER DEFAULT 0," +
    "product_views INTEGER DEFAULT 0," +
    "clicks INTEGER DEFAULT 0," +
    "engagements INTEGER DEFAULT 0," +

    "customers INTEGER DEFAULT 0," +
    "orders INTEGER DEFAULT 0," +
    "revenue REAL DEFAULT 0," +

    "attention_to_view REAL DEFAULT 0," +
    "view_to_click REAL DEFAULT 0," +
    "click_to_customer REAL DEFAULT 0," +
    "customer_to_order REAL DEFAULT 0," +

    "status TEXT," +
    "attribution_mode TEXT," +

    "created_at TEXT" +
    ")"
  ).run();
}

async function getContent(db, contentId) {
  if (contentId) {
    return await db
      .prepare(
        "SELECT * " +
        "FROM content_engine " +
        "WHERE id = ? " +
        "LIMIT 1"
      )
      .bind(contentId)
      .first();
  }

  return await db
    .prepare(
      "SELECT * " +
      "FROM content_engine " +
      "WHERE status IN (" +
      "'READY_TO_PUBLISH'," +
      "'PUBLISHED'," +
      "'GENERATED'," +
      "'TEST'," +
      "'WINNER'," +
      "'REUSE'" +
      ") " +
      "ORDER BY created_at DESC " +
      "LIMIT 1"
    )
    .first();
}

async function getMeasurementStart(db, content) {
  if (!content) {
    return now();
  }

  try {
    const table = await db
      .prepare(
        "SELECT name " +
        "FROM sqlite_master " +
        "WHERE type = 'table' " +
        "AND name = 'content_decision_runs' " +
        "LIMIT 1"
      )
      .first();

    if (table) {
      const rows = await db
        .prepare(
          "SELECT * " +
          "FROM content_decision_runs " +
          "ORDER BY created_at DESC " +
          "LIMIT 30"
        )
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
    // Fall back below.
  }

  return content.created_at || now();
}

async function getContentViews(db, start, contentId) {
  try {
    const rows = await db
      .prepare(
        "SELECT " +
        "id, " +
        "session_id, " +
        "customer_id, " +
        "created_at, " +
        "metadata " +
        "FROM behavior_events " +
        "WHERE created_at >= ? " +
        "AND event_type = 'content_view' " +
        "ORDER BY created_at ASC"
      )
      .bind(start)
      .all();

    return (rows.results || []).filter((row) => {
      try {
        const metadata = JSON.parse(
          row.metadata || "{}"
        );

        return metadata.content_id === contentId;
      } catch (error) {
        return false;
      }
    });
  } catch (error) {
    return [];
  }
}

async function getContentClicks(db, start, contentId) {
  try {
    const rows = await db
      .prepare(
        "SELECT " +
        "id, " +
        "session_id, " +
        "customer_id, " +
        "created_at, " +
        "metadata " +
        "FROM behavior_events " +
        "WHERE created_at >= ? " +
        "AND event_type = 'content_click' " +
        "ORDER BY created_at ASC"
      )
      .bind(start)
      .all();

    return (rows.results || []).filter((row) => {
      try {
        const metadata = JSON.parse(
          row.metadata || "{}"
        );

        return metadata.content_id === contentId;
      } catch (error) {
        return false;
      }
    });
  } catch (error) {
    return [];
  }
}

async function getDownstreamEvents(db, clickRows) {
  if (!clickRows.length) {
    return [];
  }

  const sessions = unique(
    clickRows
      .map((row) => row.session_id)
      .filter(Boolean)
  );

  if (!sessions.length) {
    return [];
  }

  const placeholders = sessions
    .map(() => "?")
    .join(",");

  try {
    const rows = await db
      .prepare(
        "SELECT " +
        "id, " +
        "session_id, " +
        "customer_id, " +
        "event_type, " +
        "product_id, " +
        "page, " +
        "metadata, " +
        "created_at " +
        "FROM behavior_events " +
        "WHERE session_id IN (" +
        placeholders +
        ") " +
        "ORDER BY created_at ASC"
      )
      .bind(...sessions)
      .all();

    return rows.results || [];
  } catch (error) {
    return [];
  }
}

function eventIsAfterClick(event, clickRows) {
  if (!event.session_id) {
    return false;
  }

  const eventTime = new Date(
    event.created_at
  ).getTime();

  return clickRows.some((click) => {
    if (
      click.session_id !==
      event.session_id
    ) {
      return false;
    }

    const clickTime = new Date(
      click.created_at
    ).getTime();

    return (
      Number.isFinite(eventTime) &&
      Number.isFinite(clickTime) &&
      eventTime >= clickTime
    );
  });
}

async function getAttributedCustomers(
  downstreamEvents,
  clickRows
) {
  const customers = [];

  for (const event of downstreamEvents) {
    if (!event.customer_id) {
      continue;
    }

    if (
      !eventIsAfterClick(
        event,
        clickRows
      )
    ) {
      continue;
    }

    customers.push(event.customer_id);
  }

  return unique(customers);
}

async function getAttributedOrders(
  db,
  customerIds,
  clickRows
) {
  if (
    !customerIds.length ||
    !clickRows.length
  ) {
    return {
      orders: 0,
      revenue: 0
    };
  }

  const placeholders = customerIds
    .map(() => "?")
    .join(",");

  const earliestClick = clickRows
    .map((row) => row.created_at)
    .filter(Boolean)
    .sort()[0];

  if (!earliestClick) {
    return {
      orders: 0,
      revenue: 0
    };
  }

  try {
    const result = await db
      .prepare(
        "SELECT " +
        "COUNT(*) AS total, " +
        "COALESCE(SUM(amount), 0) AS revenue " +
        "FROM orders " +
        "WHERE customer_id IN (" +
        placeholders +
        ") " +
        "AND created_at >= ? " +
        "AND (" +
        "status IS NULL " +
        "OR LOWER(status) NOT IN (" +
        "'cancelled'," +
        "'canceled'," +
        "'failed'," +
        "'refunded'" +
        ")" +
        ")"
      )
      .bind(
        ...customerIds,
        earliestClick
      )
      .first();

    return {
      orders: safeNumber(
        result?.total
      ),
      revenue: safeNumber(
        result?.revenue
      )
    };
  } catch (error) {
    return {
      orders: 0,
      revenue: 0
    };
  }
}

function calculateRate(
  numerator,
  denominator
) {
  if (!denominator) {
    return 0;
  }

  return Number(
    (
      (numerator / denominator) *
      100
    ).toFixed(2)
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
      attention_to_view:
        calculateRate(
          metrics.product_views,
          metrics.attention
        ),

      view_to_click:
        calculateRate(
          metrics.clicks,
          metrics.product_views
        ),

      click_to_customer:
        calculateRate(
          metrics.customers,
          metrics.clicks
        ),

      customer_to_order:
        calculateRate(
          metrics.orders,
          metrics.customers
        )
    }
  };
}

async function runMeasurement(
  db,
  contentId = null
) {
  await ensureTable(db);

  const content =
    await getContent(
      db,
      contentId
    );

  if (!content) {
    return {
      success: false,
      layer:
        "CONTENT_MEASUREMENT_ENGINE_V2",
      error:
        "No measurable content found."
    };
  }

  const measurementStart =
    await getMeasurementStart(
      db,
      content
    );

  const contentViews =
    await getContentViews(
      db,
      measurementStart,
      content.id
    );

  const contentClicks =
    await getContentClicks(
      db,
      measurementStart,
      content.id
    );

  const downstreamEvents =
    await getDownstreamEvents(
      db,
      contentClicks
    );

  const attributedDownstreamEvents =
    downstreamEvents.filter(
      (event) =>
        eventIsAfterClick(
          event,
          contentClicks
        )
    );

  const productViews =
    attributedDownstreamEvents.filter(
      (event) =>
        event.event_type ===
        "product_view"
    );

  const engagements =
    attributedDownstreamEvents.filter(
      (event) =>
        event.event_type ===
          "engagement" ||
        event.event_type ===
          "content_engagement" ||
        event.event_type ===
          "share" ||
        event.event_type ===
          "save" ||
        event.event_type ===
          "comment" ||
        event.event_type ===
          "like"
    );

  const attributedCustomers =
    await getAttributedCustomers(
      attributedDownstreamEvents,
      contentClicks
    );

  const orderData =
    await getAttributedOrders(
      db,
      attributedCustomers,
      contentClicks
    );

  const metrics = {
    attention:
      contentViews.length,

    product_views:
      productViews.length,

    clicks:
      contentClicks.length,

    engagements:
      engagements.length,

    customers:
      attributedCustomers.length,

    orders:
      orderData.orders,

    revenue:
      orderData.revenue
  };

  const calculated =
    buildMeasurement(
      metrics
    );

  const status =
    determineStatus(
      metrics
    );

  const measuredAt = now();
  const measurementId = id();

  await db
    .prepare(
      "INSERT INTO content_measurements (" +
      "id, " +
      "content_id, " +
      "measured_at, " +
      "measurement_start, " +

      "attention, " +
      "product_views, " +
      "clicks, " +
      "engagements, " +

      "customers, " +
      "orders, " +
      "revenue, " +

      "attention_to_view, " +
      "view_to_click, " +
      "click_to_customer, " +
      "customer_to_order, " +

      "status, " +
      "attribution_mode, " +
      "created_at" +
      ") " +

      "VALUES (" +
      "?, ?, ?, ?, " +
      "?, ?, ?, ?, " +
      "?, ?, ?, " +
      "?, ?, ?, ?, " +
      "?, ?, ?" +
      ")"
    )
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

      calculated.funnel
        .attention_to_view,

      calculated.funnel
        .view_to_click,

      calculated.funnel
        .click_to_customer,

      calculated.funnel
        .customer_to_order,

      status,
      "CONTENT_ATTRIBUTION_V2",
      measuredAt
    )
    .run();

  return {
    success: true,
    layer:
      "CONTENT_MEASUREMENT_ENGINE_V2",
    mode: "measure",

    measurement: {
      id: measurementId,
      status: status,
      measured_at: measuredAt,
      measurement_start:
        measurementStart,

      attribution_mode:
        "CONTENT_ATTRIBUTION_V2",

      note:
        "Metrics are attributed to this content using content_id and downstream session behavior after content_click."
    },

    content: {
      id: content.id,
      title: content.title || "",
      status: content.status || "",
      objective:
        content.objective || "",
      attention_type:
        content.attention_type || "",
      market_keyword:
        content.market_keyword || "",
      angle:
        content.angle || "",
      cta:
        content.cta || ""
    },

    metrics: calculated,

    attribution: {
      content_views:
        contentViews.length,

      content_clicks:
        contentClicks.length,

      downstream_sessions:
        unique(
          contentClicks
            .map(
              (row) =>
                row.session_id
            )
            .filter(Boolean)
        ).length,

      attributed_product_views:
        productViews.length,

      attributed_engagements:
        engagements.length,

      attributed_customers:
        attributedCustomers.length,

      attributed_orders:
        orderData.orders
    },

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
          ? "Continue collecting attributed behavior before deciding content performance."
          : "Wait for content traffic or behavior.",

    winner_decision:
      "NOT_DECLARED_IN_V2"
  };
}

async function previewMeasurement(
  db,
  contentId
) {
  const content =
    await getContent(
      db,
      contentId
    );

  if (!content) {
    return json(
      {
        success: false,
        layer:
          "CONTENT_MEASUREMENT_ENGINE_V2",
        mode: "preview",
        error:
          "No measurable content found."
      },
      404
    );
  }

  const measurementStart =
    await getMeasurementStart(
      db,
      content
    );

  return json({
    success: true,
    layer:
      "CONTENT_MEASUREMENT_ENGINE_V2",
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
      "CONTENT_ATTRIBUTION_V2",

    attribution_path: [
      "content_view",
      "content_click",
      "same_session_behavior",
      "customer",
      "order",
      "revenue"
    ],

    winner_decision:
      "NOT_DECLARED_IN_V2"
  });
}

export async function onRequestGet(
  context
) {
  try {
    const {
      env,
      request
    } = context;

    if (!env?.DB) {
      return json(
        {
          success: false,
          layer:
            "CONTENT_MEASUREMENT_ENGINE_V2",
          error:
            "D1 binding DB is not available."
        },
        500
      );
    }

    const url =
      new URL(request.url);

    const contentId =
      url.searchParams.get(
        "content_id"
      ) ||
      url.searchParams.get("id") ||
      null;

    const mode =
      url.searchParams.get(
        "mode"
      ) ||
      "measure";

    if (mode === "preview") {
      return await previewMeasurement(
        env.DB,
        contentId
      );
    }

    const result =
      await runMeasurement(
        env.DB,
        contentId
      );

    return json(result);
  } catch (error) {
    return json(
      {
        success: false,
        layer:
          "CONTENT_MEASUREMENT_ENGINE_V2",
        error: safeString(
          error?.message || error
        )
      },
      500
    );
  }
}

export async function onRequestPost(
  context
) {
  try {
    const {
      env,
      request
    } = context;

    if (!env?.DB) {
      return json(
        {
          success: false,
          layer:
            "CONTENT_MEASUREMENT_ENGINE_V2",
          error:
            "D1 binding DB is not available."
        },
        500
      );
    }

    let body = {};

    try {
      body =
        await request.json();
    } catch (error) {
      body = {};
    }

    const mode =
      body?.mode ||
      "measure";

    if (
      mode !== "measure" &&
      mode !== "preview"
    ) {
      return json(
        {
          success: false,
          layer:
            "CONTENT_MEASUREMENT_ENGINE_V2",
          error:
            "Invalid mode. Use 'measure' or 'preview'."
        },
        400
      );
    }

    const contentId =
      body?.content_id ||
      null;

    if (mode === "preview") {
      return await previewMeasurement(
        env.DB,
        contentId
      );
    }

    const result =
      await runMeasurement(
        env.DB,
        contentId
      );

    return json(result);
  } catch (error) {
    return json(
      {
        success: false,
        layer:
          "CONTENT_MEASUREMENT_ENGINE_V2",
        error: safeString(
          error?.message || error
        )
      },
      500
    );
  }
}
```
