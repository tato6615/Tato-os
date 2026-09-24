```javascript
// TATO-OS
// Content Measurement Engine V2.2
// Route: /api/content-measurement
//
// FLOW:
// ATTENTION → CONTENT VIEW → CLICK → DOWNSTREAM BEHAVIOR
// → CUSTOMER → ORDER → REVENUE
//
// V2.2:
// - CONTENT_ATTRIBUTION_V2 only
// - Content-specific measurement
// - Session-based downstream attribution
// - Behavioral Attention Score
// - Attention is NOT equal to content_view count
// - Diagnostic output
// - Never declares WINNER
//
// ATTENTION SCORE:
//
// content_view        = 1
// content_click       = 3
// product_view        = 4
// engagement          = 5
// customer            = 10
// order               = 20
//
// IMPORTANT:
// - Content events are identified by metadata.content_id
// - Downstream events must occur in the same session
// - Downstream events must occur at or after the content click
// - Customer/order signals are attributed only through that path
// - Legacy measurements are never used

const LAYER = "CONTENT_MEASUREMENT_ENGINE_V2.2";
const ATTRIBUTION_MODE = "CONTENT_ATTRIBUTION_V2";

const ATTENTION_WEIGHTS = {
  content_view: 1,
  content_click: 3,
  product_view: 4,
  engagement: 5,
  customer: 10,
  order: 20
};

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: HEADERS
    }
  );
}

function now() {
  return new Date().toISOString();
}

function makeId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return (
    String(Date.now()) +
    "-" +
    Math.random().toString(36).slice(2)
  );
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value) {
  return value == null ? "" : String(value);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function eventType(event) {
  return str(event?.event_type).toLowerCase();
}

function isEngagementEvent(event) {
  const type = eventType(event);

  return (
    type === "engagement" ||
    type === "content_engagement" ||
    type === "share" ||
    type === "save" ||
    type === "comment" ||
    type === "like"
  );
}

function isValidDate(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time);
}

function isAtOrAfter(eventTime, referenceTime) {
  if (
    !isValidDate(eventTime) ||
    !isValidDate(referenceTime)
  ) {
    return false;
  }

  return (
    new Date(eventTime).getTime() >=
    new Date(referenceTime).getTime()
  );
}

async function ensureTable(db) {
  await db
    .prepare(
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
    )
    .run();
}

async function getContent(db, requestedId) {
  if (requestedId) {
    return await db
      .prepare(
        "SELECT * FROM content_engine " +
        "WHERE id = ? " +
        "LIMIT 1"
      )
      .bind(requestedId)
      .first();
  }

  return await db
    .prepare(
      "SELECT * FROM content_engine " +
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
        "SELECT name FROM sqlite_master " +
        "WHERE type = 'table' " +
        "AND name = 'content_decision_runs' " +
        "LIMIT 1"
      )
      .first();

    if (table) {
      const rows = await db
        .prepare(
          "SELECT * FROM content_decision_runs " +
          "ORDER BY created_at DESC " +
          "LIMIT 50"
        )
        .all();

      for (const row of rows.results || []) {
        const raw = JSON.stringify(row);

        if (
          raw.includes(str(content.id)) ||
          raw.includes(str(content.title))
        ) {
          return (
            row.created_at ||
            row.started_at ||
            row.executed_at ||
            content.created_at ||
            now()
          );
        }
      }
    }
  } catch (_) {}

  return content.created_at || now();
}

async function getContentEvents(
  db,
  eventTypeValue,
  start,
  contentId
) {
  try {
    const result = await db
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
        "WHERE created_at >= ? " +
        "AND event_type = ? " +
        "ORDER BY created_at ASC"
      )
      .bind(start, eventTypeValue)
      .all();

    return (result.results || []).filter((row) => {
      try {
        const metadata = JSON.parse(
          row.metadata || "{}"
        );

        return (
          str(metadata.content_id) ===
          str(contentId)
        );
      } catch (_) {
        return false;
      }
    });
  } catch (_) {
    return [];
  }
}

async function getDownstreamEvents(
  db,
  clickRows
) {
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
    const result = await db
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

    return result.results || [];
  } catch (_) {
    return [];
  }
}

function isAfterClick(event, clicks) {
  if (!event?.session_id) {
    return false;
  }

  const eventTime =
    new Date(event.created_at).getTime();

  if (!Number.isFinite(eventTime)) {
    return false;
  }

  return clicks.some((click) => {
    if (
      click.session_id !==
      event.session_id
    ) {
      return false;
    }

    const clickTime =
      new Date(click.created_at).getTime();

    if (!Number.isFinite(clickTime)) {
      return false;
    }

    return eventTime >= clickTime;
  });
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

function getUniqueCustomerIds(events) {
  return unique(
    events
      .map((event) => event.customer_id)
      .filter(Boolean)
  );
}

async function getAttributedCustomers(
  downstream,
  clicks
) {
  const ids = [];

  for (const event of downstream) {
    if (!event.customer_id) {
      continue;
    }

    if (
      !isAfterClick(
        event,
        clicks
      )
    ) {
      continue;
    }

    ids.push(event.customer_id);
  }

  return unique(ids);
}

async function getOrders(
  db,
  customerIds,
  clicks
) {
  if (
    !customerIds.length ||
    !clicks.length
  ) {
    return {
      orders: 0,
      revenue: 0
    };
  }

  const placeholders =
    customerIds
      .map(() => "?")
      .join(",");

  const clickTimes = clicks
    .map((row) => row.created_at)
    .filter(Boolean)
    .sort();

  const earliestClick =
    clickTimes[0];

  if (!earliestClick) {
    return {
      orders: 0,
      revenue: 0
    };
  }

  try {
    const row = await db
      .prepare(
        "SELECT " +
        "COUNT(*) AS orders, " +
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
      orders: num(row?.orders),
      revenue: num(row?.revenue)
    };
  } catch (_) {
    return {
      orders: 0,
      revenue: 0
    };
  }
}

function calculateAttentionScore({
  views,
  clicks,
  productViews,
  engagements,
  customers,
  orders
}) {
  return (
    views.length *
      ATTENTION_WEIGHTS.content_view +

    clicks.length *
      ATTENTION_WEIGHTS.content_click +

    productViews.length *
      ATTENTION_WEIGHTS.product_view +

    engagements.length *
      ATTENTION_WEIGHTS.engagement +

    customers.length *
      ATTENTION_WEIGHTS.customer +

    orders *
      ATTENTION_WEIGHTS.order
  );
}

function buildAttentionBreakdown({
  views,
  clicks,
  productViews,
  engagements,
  customers,
  orders
}) {
  return {
    content_view: {
      count: views.length,
      weight:
        ATTENTION_WEIGHTS.content_view,
      score:
        views.length *
        ATTENTION_WEIGHTS.content_view
    },

    content_click: {
      count: clicks.length,
      weight:
        ATTENTION_WEIGHTS.content_click,
      score:
        clicks.length *
        ATTENTION_WEIGHTS.content_click
    },

    product_view: {
      count: productViews.length,
      weight:
        ATTENTION_WEIGHTS.product_view,
      score:
        productViews.length *
        ATTENTION_WEIGHTS.product_view
    },

    engagement: {
      count: engagements.length,
      weight:
        ATTENTION_WEIGHTS.engagement,
      score:
        engagements.length *
        ATTENTION_WEIGHTS.engagement
    },

    customer: {
      count: customers.length,
      weight:
        ATTENTION_WEIGHTS.customer,
      score:
        customers.length *
        ATTENTION_WEIGHTS.customer
    },

    order: {
      count: orders,
      weight:
        ATTENTION_WEIGHTS.order,
      score:
        orders *
        ATTENTION_WEIGHTS.order
    }
  };
}

async function measure(
  db,
  requestedContentId
) {
  await ensureTable(db);

  const content =
    await getContent(
      db,
      requestedContentId
    );

  if (!content) {
    return {
      success: false,
      layer: LAYER,
      error:
        "No measurable content found."
    };
  }

  const start =
    await getMeasurementStart(
      db,
      content
    );

  const views =
    await getContentEvents(
      db,
      "content_view",
      start,
      content.id
    );

  const clicks =
    await getContentEvents(
      db,
      "content_click",
      start,
      content.id
    );

  const downstream =
    await getDownstreamEvents(
      db,
      clicks
    );

  const attributed =
    downstream.filter(
      (event) =>
        isAfterClick(
          event,
          clicks
        )
    );

  const productViews =
    attributed.filter(
      (event) =>
        eventType(event) ===
        "product_view"
    );

  const engagements =
    attributed.filter(
      (event) =>
        isEngagementEvent(event)
    );

  const customers =
    await getAttributedCustomers(
      attributed,
      clicks
    );

  const orderData =
    await getOrders(
      db,
      customers,
      clicks
    );

  const metricsBeforeAttention = {
    product_views:
      productViews.length,

    clicks:
      clicks.length,

    engagements:
      engagements.length,

    customers:
      customers.length,

    orders:
      orderData.orders
  };

  const attention =
    calculateAttentionScore({
      views,
      clicks,
      productViews,
      engagements,
      customers,
      orders:
        orderData.orders
    });

  const metrics = {
    attention,

    product_views:
      productViews.length,

    clicks:
      clicks.length,

    engagements:
      engagements.length,

    customers:
      customers.length,

    orders:
      orderData.orders,

    revenue:
      orderData.revenue
  };

  const funnel = {
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
  };

  const status =
    determineStatus(metrics);

  const measuredAt = now();
  const measurementId = makeId();

  await db
    .prepare(
      "INSERT INTO content_measurements (" +
      "id, content_id, measured_at, " +
      "measurement_start, attention, " +
      "product_views, clicks, engagements, " +
      "customers, orders, revenue, " +
      "attention_to_view, view_to_click, " +
      "click_to_customer, customer_to_order, " +
      "status, attribution_mode, created_at" +
      ") VALUES (" +
      "?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, " +
      "?, ?, ?, ?, ?, ?, ?" +
      ")"
    )
    .bind(
      measurementId,
      content.id,
      measuredAt,
      start,
      metrics.attention,
      metrics.product_views,
      metrics.clicks,
      metrics.engagements,
      metrics.customers,
      metrics.orders,
      metrics.revenue,
      funnel.attention_to_view,
      funnel.view_to_click,
      funnel.click_to_customer,
      funnel.customer_to_order,
      status,
      ATTRIBUTION_MODE,
      measuredAt
    )
    .run();

  const attentionBreakdown =
    buildAttentionBreakdown({
      views,
      clicks,
      productViews,
      engagements,
      customers,
      orders:
        orderData.orders
    });

  return {
    success: true,
    layer: LAYER,
    mode: "measure",

    measurement: {
      id: measurementId,
      content_id: content.id,
      status,
      measured_at: measuredAt,
      measurement_start: start,
      attribution_mode:
        ATTRIBUTION_MODE
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

    metrics,

    attention: {
      score:
        metrics.attention,

      definition:
        "Behavioral Attention Score",

      weights:
        ATTENTION_WEIGHTS,

      breakdown:
        attentionBreakdown
    },

    funnel,

    attribution: {
      content_views:
        views.length,

      content_clicks:
        clicks.length,

      click_sessions:
        unique(
          clicks
            .map(
              (row) =>
                row.session_id
            )
            .filter(Boolean)
        ).length,

      downstream_events:
        attributed.length,

      attributed_product_views:
        productViews.length,

      attributed_engagements:
        engagements.length,

      attributed_customers:
        customers.length,

      attributed_orders:
        orderData.orders
    },

    diagnostic: {
      measurement_source:
        "content_engine",

      content_id_used:
        content.id,

      measurement_start:
        start,

      attention_definition:
        "Weighted behavioral signal, not content_view count",

      attention_weights:
        ATTENTION_WEIGHTS,

      attention_formula:
        "content_view*1 + content_click*3 + product_view*4 + engagement*5 + customer*10 + order*20",

      view_query:
        "content_view + metadata.content_id",

      click_query:
        "content_click + metadata.content_id",

      downstream_query:
        "same session after content_click",

      product_view_attribution:
        "product_view must occur in the same click session at or after content_click",

      customer_attribution:
        "customer_id from downstream behavior",

      order_attribution:
        "attributed customer_id after earliest content click",

      attribution_mode_written:
        ATTRIBUTION_MODE,

      legacy_measurements_used:
        false,

      raw_event_counts: {
        content_view:
          views.length,

        content_click:
          clicks.length,

        attributed_product_view:
          productViews.length,

        attributed_engagement:
          engagements.length,

        attributed_customer:
          customers.length,

        attributed_order:
          orderData.orders
      },

      metrics_before_attention:
        metricsBeforeAttention
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

    winner_decision:
      "NOT_DECLARED_IN_V2.2",

    next_step:
      "Send this CONTENT_ATTRIBUTION_V2 measurement to Learning AI V1.5."
  };
}

async function preview(
  db,
  requestedContentId
) {
  const content =
    await getContent(
      db,
      requestedContentId
    );

  if (!content) {
    return json(
      {
        success: false,
        layer: LAYER,
        mode: "preview",
        error:
          "No measurable content found."
      },
      404
    );
  }

  const start =
    await getMeasurementStart(
      db,
      content
    );

  return json({
    success: true,
    layer: LAYER,
    mode: "preview",

    content: {
      id: content.id,
      title: content.title || "",
      status: content.status || "",
      created_at:
        content.created_at || null
    },

    measurement_start:
      start,

    attribution_mode:
      ATTRIBUTION_MODE,

    attention_definition:
      "Behavioral Attention Score",

    attention_weights:
      ATTENTION_WEIGHTS,

    attention_formula:
      "content_view*1 + content_click*3 + product_view*4 + engagement*5 + customer*10 + order*20",

    attribution_path: [
      "content_view",
      "content_click",
      "same_session_behavior",
      "customer",
      "order",
      "revenue"
    ],

    diagnostic: {
      source:
        "content_measurement_engine_v2.2",

      legacy_measurements:
        "ignored by Learning AI V1.5",

      measurement_created:
        false,

      winner_decision:
        "NOT_DECLARED_IN_V2.2"
    },

    winner_decision:
      "NOT_DECLARED_IN_V2.2"
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
          layer: LAYER,
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
      ) || "measure";

    if (mode === "preview") {
      return await preview(
        env.DB,
        contentId
      );
    }

    return json(
      await measure(
        env.DB,
        contentId
      )
    );
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        error:
          error?.message ||
          String(error)
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
          layer: LAYER,
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
    } catch (_) {
      body = {};
    }

    const mode =
      body?.mode || "measure";

    const contentId =
      body?.content_id ||
      null;

    if (mode === "preview") {
      return await preview(
        env.DB,
        contentId
      );
    }

    if (mode !== "measure") {
      return json(
        {
          success: false,
          layer: LAYER,
          error:
            "Invalid mode. Use 'measure' or 'preview'."
        },
        400
      );
    }

    return json(
      await measure(
        env.DB,
        contentId
      )
    );
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}
```
