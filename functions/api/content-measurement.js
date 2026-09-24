```javascript
// TATO-OS
// Content Measurement Engine V2.2
// Route: /api/content-measurement

const LAYER = "CONTENT_MEASUREMENT_ENGINE_V2.2";
const ATTRIBUTION_MODE = "CONTENT_ATTRIBUTION_V2";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const ATTENTION_WEIGHTS = {
  content_view: 1,
  content_click: 3,
  product_view: 4,
  engagement: 5
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: HEADERS
  });
}

function id() {
  return crypto.randomUUID();
}

function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

function s(value) {
  return value == null ? "" : String(value);
}

function normalizeEventType(value) {
  return s(value).trim().toLowerCase();
}

function eventContentId(row) {
  if (!row) return null;

  if (row.content_id) {
    return s(row.content_id);
  }

  try {
    const metadata =
      typeof row.metadata === "string"
        ? JSON.parse(row.metadata)
        : row.metadata;

    return metadata?.content_id
      ? s(metadata.content_id)
      : null;
  } catch (_) {
    return null;
  }
}

function eventSessionId(row) {
  return row?.session_id ? s(row.session_id) : null;
}

function eventCreatedAt(row) {
  if (!row?.created_at) return 0;

  const time = new Date(row.created_at).getTime();

  return Number.isFinite(time) ? time : 0;
}

function calculateAttentionScore(events) {
  let score = 0;

  for (const event of events) {
    const type = normalizeEventType(event.event_type);

    if (type === "content_view") {
      score += ATTENTION_WEIGHTS.content_view;
    } else if (type === "content_click") {
      score += ATTENTION_WEIGHTS.content_click;
    } else if (type === "product_view") {
      score += ATTENTION_WEIGHTS.product_view;
    } else if (
      type === "engagement" ||
      type === "like" ||
      type === "comment" ||
      type === "share"
    ) {
      score += ATTENTION_WEIGHTS.engagement;
    }
  }

  return score;
}

function buildAttentionBreakdown(events) {
  const counts = {
    content_view: 0,
    content_click: 0,
    product_view: 0,
    engagement: 0
  };

  for (const event of events) {
    const type = normalizeEventType(event.event_type);

    if (type === "content_view") {
      counts.content_view++;
    } else if (type === "content_click") {
      counts.content_click++;
    } else if (type === "product_view") {
      counts.product_view++;
    } else if (
      type === "engagement" ||
      type === "like" ||
      type === "comment" ||
      type === "share"
    ) {
      counts.engagement++;
    }
  }

  const scores = {
    content_view:
      counts.content_view * ATTENTION_WEIGHTS.content_view,

    content_click:
      counts.content_click * ATTENTION_WEIGHTS.content_click,

    product_view:
      counts.product_view * ATTENTION_WEIGHTS.product_view,

    engagement:
      counts.engagement * ATTENTION_WEIGHTS.engagement
  };

  return {
    counts,
    weights: ATTENTION_WEIGHTS,
    scores,
    total_attention:
      scores.content_view +
      scores.content_click +
      scores.product_view +
      scores.engagement
  };
}

async function ensureTable(db) {
  const sql = `
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
  `;

  await db.prepare(sql).run();
}

async function getContent(db, requestedContentId = null) {
  try {
    if (requestedContentId) {
      return await db
        .prepare(`
          SELECT *
          FROM content_engine
          WHERE id = ?
          LIMIT 1
        `)
        .bind(requestedContentId)
        .first();
    }

    return await db
      .prepare(`
        SELECT *
        FROM content_engine
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .first();
  } catch (_) {
    return null;
  }
}

async function getMeasurementStart(db, contentId) {
  try {
    const row = await db
      .prepare(`
        SELECT *
        FROM content_decision_runs
        WHERE content_id = ?
        ORDER BY created_at ASC
        LIMIT 1
      `)
      .bind(contentId)
      .first();

    if (row?.created_at) {
      return row.created_at;
    }
  } catch (_) {}

  return "1970-01-01T00:00:00.000Z";
}

async function getBehaviorEvents(db, measurementStart) {
  try {
    const result = await db
      .prepare(`
        SELECT *
        FROM behavior_events
        WHERE created_at >= ?
        ORDER BY created_at ASC
      `)
      .bind(measurementStart)
      .all();

    return result.results || [];
  } catch (_) {
    return [];
  }
}

function getContentEvents(events, contentId) {
  return events.filter(event => {
    return eventContentId(event) === s(contentId);
  });
}

function getClicks(events) {
  return events.filter(event => {
    return normalizeEventType(event.event_type) === "content_click";
  });
}

function isAfterClick(event, click) {
  const eventTime = eventCreatedAt(event);
  const clickTime = eventCreatedAt(click);

  if (!eventTime || !clickTime) {
    return false;
  }

  const eventSession = eventSessionId(event);
  const clickSession = eventSessionId(click);

  if (!eventSession || !clickSession) {
    return false;
  }

  return (
    eventSession === clickSession &&
    eventTime >= clickTime
  );
}

function getDownstreamEvents(allEvents, clicks) {
  if (!clicks.length) {
    return [];
  }

  return allEvents.filter(event => {
    return clicks.some(click => {
      return isAfterClick(event, click);
    });
  });
}

function uniqueValues(values) {
  return [
    ...new Set(
      values
        .filter(value => value != null && s(value) !== "")
        .map(value => s(value))
    )
  ];
}

function getCustomerIdsFromEvents(events) {
  const ids = [];

  for (const event of events) {
    const type = normalizeEventType(event.event_type);

    if (
      type === "customer" ||
      type === "customer_created" ||
      type === "lead_created"
    ) {
      if (event.customer_id) {
        ids.push(event.customer_id);
      }
    }
  }

  return uniqueValues(ids);
}

async function getCustomerIds(db, downstreamEvents, clicks) {
  const eventCustomerIds =
    getCustomerIdsFromEvents(downstreamEvents);

  if (eventCustomerIds.length) {
    return eventCustomerIds;
  }

  const clickSessions = uniqueValues(
    clicks.map(event => eventSessionId(event))
  );

  if (!clickSessions.length) {
    return [];
  }

  try {
    const placeholders = clickSessions
      .map(() => "?")
      .join(",");

    const result = await db
      .prepare(`
        SELECT id
        FROM customers
        WHERE session_id IN (${placeholders})
      `)
      .bind(...clickSessions)
      .all();

    return uniqueValues(
      (result.results || []).map(row => row.id)
    );
  } catch (_) {
    return [];
  }
}

async function getOrders(db, customerIds, measurementStart) {
  if (!customerIds.length) {
    return {
      orders: 0,
      revenue: 0
    };
  }

  try {
    const placeholders = customerIds
      .map(() => "?")
      .join(",");

    const row = await db
      .prepare(`
        SELECT
          COUNT(*) AS orders,
          COALESCE(SUM(amount), 0) AS revenue
        FROM orders
        WHERE customer_id IN (${placeholders})
          AND created_at >= ?
      `)
      .bind(...customerIds, measurementStart)
      .first();

    return {
      orders: n(row?.orders),
      revenue: n(row?.revenue)
    };
  } catch (_) {
    return {
      orders: 0,
      revenue: 0
    };
  }
}

function rate(a, b) {
  return b > 0
    ? Number(((a / b) * 100).toFixed(2))
    : 0;
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
    metrics.clicks > 0 ||
    metrics.product_views > 0 ||
    metrics.engagements > 0
  ) {
    return "MEASURED";
  }

  return "WAITING_FOR_TRAFFIC";
}

async function measure(db, requestedContentId = null) {
  await ensureTable(db);

  const content =
    await getContent(db, requestedContentId);

  if (!content) {
    throw new Error(
      "No content found in content_engine"
    );
  }

  const contentId = s(content.id);

  const measurementStart =
    await getMeasurementStart(
      db,
      contentId
    );

  const allEvents =
    await getBehaviorEvents(
      db,
      measurementStart
    );

  const contentEvents =
    getContentEvents(
      allEvents,
      contentId
    );

  const clicks =
    getClicks(contentEvents);

  const downstreamEvents =
    getDownstreamEvents(
      allEvents,
      clicks
    );

  const productViews =
    downstreamEvents.filter(event => {
      return (
        normalizeEventType(event.event_type) ===
        "product_view"
      );
    });

  const engagements =
    contentEvents.filter(event => {
      const type =
        normalizeEventType(event.event_type);

      return (
        type === "engagement" ||
        type === "like" ||
        type === "comment" ||
        type === "share"
      );
    });

  const downstreamEngagements =
    downstreamEvents.filter(event => {
      const type =
        normalizeEventType(event.event_type);

      return (
        type === "engagement" ||
        type === "like" ||
        type === "comment" ||
        type === "share"
      );
    });

  const customerIds =
    await getCustomerIds(
      db,
      downstreamEvents,
      clicks
    );

  const orderData =
    await getOrders(
      db,
      customerIds,
      measurementStart
    );

  /*
   * ATTENTION V2.2
   *
   * content_view  = 1
   * content_click = 3
   * product_view  = 4
   * engagement    = 5
   *
   * Attention is a weighted behavioral score.
   */
  const attention =
    calculateAttentionScore(
      contentEvents
    );

  const attentionBreakdown =
    buildAttentionBreakdown(
      contentEvents
    );

  const metrics = {
    attention,
    product_views:
      productViews.length,
    clicks:
      clicks.length,
    engagements:
      engagements.length +
      downstreamEngagements.length,
    customers:
      customerIds.length,
    orders:
      orderData.orders,
    revenue:
      orderData.revenue
  };

  const conversions = {
    attention_to_view:
      rate(
        metrics.product_views,
        metrics.attention
      ),

    view_to_click:
      rate(
        metrics.clicks,
        metrics.product_views
      ),

    click_to_customer:
      rate(
        metrics.customers,
        metrics.clicks
      ),

    customer_to_order:
      rate(
        metrics.orders,
        metrics.customers
      )
  };

  const status =
    determineStatus(metrics);

  const measuredAt =
    new Date().toISOString();

  const measurementId =
    id();

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
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?
      )
    `)
    .bind(
      measurementId,
      contentId,
      measuredAt,
      measurementStart,
      metrics.attention,
      metrics.product_views,
      metrics.clicks,
      metrics.engagements,
      metrics.customers,
      metrics.orders,
      metrics.revenue,
      conversions.attention_to_view,
      conversions.view_to_click,
      conversions.click_to_customer,
      conversions.customer_to_order,
      status,
      ATTRIBUTION_MODE,
      measuredAt
    )
    .run();

  return {
    success: true,
    layer: LAYER,
    version: "2.2",

    content: {
      id: content.id,
      title: content.title || null,
      status: content.status || null
    },

    measurement: {
      id: measurementId,
      content_id: contentId,
      measured_at: measuredAt,
      measurement_start: measurementStart,
      attention: metrics.attention,
      product_views: metrics.product_views,
      clicks: metrics.clicks,
      engagements: metrics.engagements,
      customers: metrics.customers,
      orders: metrics.orders,
      revenue: metrics.revenue,
      attention_to_view:
        conversions.attention_to_view,
      view_to_click:
        conversions.view_to_click,
      click_to_customer:
        conversions.click_to_customer,
      customer_to_order:
        conversions.customer_to_order,
      status,
      attribution_mode:
        ATTRIBUTION_MODE
    },

    attention: {
      definition:
        "Weighted behavioral signal, not content_view count",

      formula:
        "content_view×1 + content_click×3 + product_view×4 + engagement×5",

      weights:
        ATTENTION_WEIGHTS,

      breakdown:
        attentionBreakdown
    },

    diagnostics: {
      total_behavior_events:
        allEvents.length,

      content_events:
        contentEvents.length,

      content_views:
        contentEvents.filter(
          event =>
            normalizeEventType(
              event.event_type
            ) === "content_view"
        ).length,

      content_clicks:
        clicks.length,

      downstream_events:
        downstreamEvents.length,

      attributed_product_views:
        productViews.length,

      attributed_customers:
        customerIds.length,

      attributed_orders:
        orderData.orders,

      attribution_mode:
        ATTRIBUTION_MODE,

      winner_decision:
        "NOT_DECLARED_IN_V2.2"
    }
  };
}

export async function onRequestGet(context) {
  try {
    const url =
      new URL(context.request.url);

    const contentId =
      url.searchParams.get(
        "content_id"
      );

    const result =
      await measure(
        context.env.DB,
        contentId
      );

    return json({
      ...result,
      mode: "preview"
    });
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

export async function onRequestPost(context) {
  try {
    let body = {};

    try {
      body =
        await context.request.json();
    } catch (_) {}

    const contentId =
      body?.content_id || null;

    const result =
      await measure(
        context.env.DB,
        contentId
      );

    return json({
      ...result,
      mode: "execute"
    });
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
