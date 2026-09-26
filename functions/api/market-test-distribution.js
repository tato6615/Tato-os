// TATO-OS
// Market Test Measurement Integration V1.0
// Route: /api/market-test-measurement
//
// Pipeline:
//
// Market Test Distribution
//        ↓
// Market Test Measurement
//        ↓
// Real Behavior Event
//        ↓
// behavior_events
//        ↓
// Measurement V2.3
//
// V1 DOES:
// - read READY_FOR_MEASUREMENT distributions
// - create a measurement session for a market test
// - accept real behavior events
// - preserve market-test attribution
// - write events into behavior_events when compatible columns exist
// - maintain an attribution table for traceability
// - summarize observed events
//
// V1 DOES NOT:
// - invent traffic
// - invent attention
// - invent purchases
// - invent revenue
// - declare a winner
// - change strategy
// - execute actions
// - publish content
// - spend money

const ENGINE = "MARKET_TEST_MEASUREMENT_V1";
const VERSION = "1.0";

const PREVIOUS_LAYER = "MARKET_TEST_DISTRIBUTION_V1";
const NEXT_LAYER = "MEASUREMENT_V2.3";

const READY_DISTRIBUTION_STATUS = "READY_FOR_MEASUREMENT";

const ALLOWED_EVENTS = [
  "content_view",
  "content_click",
  "engagement",
  "product_view",
  "order_created",
  "payment_completed",
  "revenue_recorded"
];

const ATTENTION_EVENTS = [
  "content_view",
  "content_click"
];

const INTEREST_EVENTS = [
  "engagement",
  "product_view"
];

const PURCHASE_EVENTS = [
  "order_created",
  "payment_completed"
];

const REVENUE_EVENTS = [
  "revenue_recorded"
];

function now() {
  return new Date().toISOString();
}

function json(data, status) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status: status || 200,
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    }
  );
}

function randomId(prefix) {
  return (
    prefix +
    "-" +
    Date.now().toString() +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

function safeString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function safeNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return number;
}

async function ensureTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS market_test_measurements (
      id TEXT PRIMARY KEY,
      market_test_id TEXT NOT NULL,
      distribution_id TEXT NOT NULL,
      market_theme TEXT,
      opportunity_type TEXT,
      status TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS market_test_event_links (
      id TEXT PRIMARY KEY,
      market_test_id TEXT NOT NULL,
      distribution_id TEXT NOT NULL,
      measurement_id TEXT NOT NULL,
      behavior_event_id TEXT,
      event_type TEXT NOT NULL,
      customer_id TEXT,
      product_id TEXT,
      content_id TEXT,
      revenue_amount REAL,
      source TEXT,
      created_at TEXT
    )
  `).run();
}

async function getDistributions(env) {
  const result = await env.DB.prepare(`
    SELECT *
    FROM market_test_distributions
    ORDER BY rowid DESC
  `).all();

  return result.results || [];
}

async function getMeasurements(env) {
  const result = await env.DB.prepare(`
    SELECT *
    FROM market_test_measurements
    ORDER BY rowid DESC
  `).all();

  return result.results || [];
}

async function getEventLinks(env) {
  const result = await env.DB.prepare(`
    SELECT *
    FROM market_test_event_links
    ORDER BY rowid DESC
  `).all();

  return result.results || [];
}

async function findDistribution(env, distributionId) {
  const result = await env.DB.prepare(`
    SELECT *
    FROM market_test_distributions
    WHERE id = ?
    LIMIT 1
  `)
    .bind(distributionId)
    .all();

  if (
    !result.results ||
    result.results.length === 0
  ) {
    return null;
  }

  return result.results[0];
}

async function findMeasurementByDistribution(
  env,
  distributionId
) {
  const result = await env.DB.prepare(`
    SELECT *
    FROM market_test_measurements
    WHERE distribution_id = ?
    ORDER BY rowid DESC
    LIMIT 1
  `)
    .bind(distributionId)
    .all();

  if (
    !result.results ||
    result.results.length === 0
  ) {
    return null;
  }

  return result.results[0];
}

async function getBehaviorSchema(env) {
  const result = await env.DB
    .prepare(
      "PRAGMA table_info(behavior_events)"
    )
    .all();

  const columns = result.results || [];

  return columns.map(function (column) {
    return column.name;
  });
}

function hasColumn(columns, name) {
  return columns.indexOf(name) !== -1;
}

function buildBehaviorInsert(
  columns,
  event
) {
  const values = [];
  const insertColumns = [];
  const placeholders = [];

  function add(column, value) {
    if (!hasColumn(columns, column)) {
      return;
    }

    insertColumns.push(column);
    placeholders.push("?");
    values.push(value);
  }

  add("id", event.behaviorEventId);
  add("event_id", event.behaviorEventId);
  add("event_type", event.eventType);
  add("customer_id", event.customerId);
  add("product_id", event.productId);
  add("content_id", event.contentId);
  add("revenue", event.revenueAmount);
  add("revenue_amount", event.revenueAmount);
  add("source", event.source);
  add("created_at", event.createdAt);
  add("timestamp", event.createdAt);
  add("metadata", event.metadata);

  if (insertColumns.length === 0) {
    return null;
  }

  return {
    sql:
      "INSERT INTO behavior_events (" +
      insertColumns.join(", ") +
      ") VALUES (" +
      placeholders.join(", ") +
      ")",

    values: values
  };
}

async function insertBehaviorEvent(
  env,
  event
) {
  const columns =
    await getBehaviorSchema(env);

  const statement =
    buildBehaviorInsert(
      columns,
      event
    );

  if (!statement) {
    return {
      inserted: false,
      reason:
        "NO_COMPATIBLE_BEHAVIOR_EVENT_COLUMNS",
      columns: columns
    };
  }

  try {
    await env.DB
      .prepare(statement.sql)
      .bind.apply(
        env.DB.prepare(statement.sql),
        statement.values
      )
      .run();

    return {
      inserted: true,
      columns_used:
        statement.sql
          .replace(
            "INSERT INTO behavior_events (",
            ""
          )
          .split(") VALUES")[0]
          .split(", ")
    };
  } catch (error) {
    return {
      inserted: false,
      reason:
        error && error.message
          ? error.message
          : String(error),
      columns: columns
    };
  }
}

function eventStage(eventType) {
  if (
    ATTENTION_EVENTS.indexOf(eventType) !== -1
  ) {
    return "ATTENTION";
  }

  if (
    INTEREST_EVENTS.indexOf(eventType) !== -1
  ) {
    return "INTEREST";
  }

  if (
    PURCHASE_EVENTS.indexOf(eventType) !== -1
  ) {
    return "PURCHASE";
  }

  if (
    REVENUE_EVENTS.indexOf(eventType) !== -1
  ) {
    return "REVENUE";
  }

  return "UNKNOWN";
}

function calculateSummary(links) {
  const counts = {
    content_view: 0,
    content_click: 0,
    engagement: 0,
    product_view: 0,
    order_created: 0,
    payment_completed: 0,
    revenue_recorded: 0
  };

  let revenue = 0;

  links.forEach(function (item) {
    if (
      Object.prototype.hasOwnProperty.call(
        counts,
        item.event_type
      )
    ) {
      counts[item.event_type] += 1;
    }

    if (
      item.event_type === "revenue_recorded" &&
      item.revenue_amount !== null &&
      item.revenue_amount !== undefined
    ) {
      const amount =
        Number(item.revenue_amount);

      if (Number.isFinite(amount)) {
        revenue += amount;
      }
    }
  });

  return {
    attention: {
      content_view:
        counts.content_view,
      content_click:
        counts.content_click
    },

    interest: {
      engagement:
        counts.engagement,
      product_view:
        counts.product_view
    },

    purchase: {
      order_created:
        counts.order_created,
      payment_completed:
        counts.payment_completed
    },

    revenue: {
      revenue_recorded:
        counts.revenue_recorded,
      observed_revenue:
        revenue
    },

    total_events:
      links.length
  };
}

async function createMeasurement(
  env,
  distribution
) {
  const existing =
    await findMeasurementByDistribution(
      env,
      distribution.id
    );

  if (existing) {
    return {
      duplicate: true,
      measurement: existing
    };
  }

  const id =
    randomId("measurement");

  const timestamp = now();

  await env.DB.prepare(`
    INSERT INTO market_test_measurements (
      id,
      market_test_id,
      distribution_id,
      market_theme,
      opportunity_type,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      id,
      distribution.market_test_id,
      distribution.id,
      distribution.market_theme || null,
      distribution.opportunity_type || null,
      "COLLECTING",
      timestamp,
      timestamp
    )
    .run();

  return {
    duplicate: false,

    measurement: {
      id: id,
      market_test_id:
        distribution.market_test_id,
      distribution_id:
        distribution.id,
      market_theme:
        distribution.market_theme || null,
      opportunity_type:
        distribution.opportunity_type || null,
      status: "COLLECTING",
      created_at: timestamp,
      updated_at: timestamp
    }
  };
}

async function handleGet(env) {
  await ensureTables(env);

  const distributions =
    await getDistributions(env);

  const measurements =
    await getMeasurements(env);

  const eventLinks =
    await getEventLinks(env);

  const ready =
    distributions.filter(
      function (item) {
        return (
          item.status ===
            READY_DISTRIBUTION_STATUS ||
          item.tracking_status === "READY"
        );
      }
    );

  const measurementSummaries =
    measurements.map(
      function (measurement) {
        const links =
          eventLinks.filter(
            function (event) {
              return (
                event.measurement_id ===
                measurement.id
              );
            }
          );

        return {
          measurement: measurement,
          observed: calculateSummary(
            links
          )
        };
      }
    );

  return json({
    success: true,

    engine: ENGINE,
    version: VERSION,
    timestamp: now(),

    state:
      measurements.length > 0
        ? "MEASUREMENT_ACTIVE"
        : ready.length > 0
          ? "READY_TO_START_MEASUREMENT"
          : "WAITING_FOR_DISTRIBUTION",

    summary: {
      distributions:
        distributions.length,

      ready_distributions:
        ready.length,

      measurements:
        measurements.length,

      linked_behavior_events:
        eventLinks.length
    },

    distributions:
      distributions,

    measurements:
      measurementSummaries,

    event_links:
      eventLinks,

    measurement_contract: {
      required_events:
        ALLOWED_EVENTS,

      attention_events:
        ATTENTION_EVENTS,

      interest_events:
        INTEREST_EVENTS,

      purchase_events:
        PURCHASE_EVENTS,

      revenue_events:
        REVENUE_EVENTS,

      measurement_engine:
        "MEASUREMENT_V2.3"
    },

    guardrails: {
      invents_behavior: false,
      invents_attention: false,
      invents_purchase: false,
      invents_revenue: false,
      declares_winner: false,
      changes_strategy: false,
      executes_action: false,
      publishes_content: false,
      spends_money: false,
      automatic_scaling: false
    },

    data_integrity: {
      measurement_persistence: "D1",
      distribution_traceability: true,
      market_test_traceability: true,
      execution_traceability: true,
      approval_traceability: true,
      decision_traceability: true,
      behavior_event_attribution: true,
      real_event_required: true
    },

    contract: {
      current_layer: ENGINE,
      version: VERSION,
      previous_layer: PREVIOUS_LAYER,
      next_layer: NEXT_LAYER,
      real_behavior_required: true,
      revenue_confirmation_required: true
    }
  });
}

async function handlePost(
  request,
  env
) {
  await ensureTables(env);

  let body;

  try {
    body = await request.json();
  } catch (error) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "INVALID_JSON"
      },
      400
    );
  }

  const distributionId =
    safeString(
      body.distribution_id
    );

  if (!distributionId) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "distribution_id_required"
      },
      400
    );
  }

  const distribution =
    await findDistribution(
      env,
      distributionId
    );

  if (!distribution) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "DISTRIBUTION_NOT_FOUND",
        distribution_id:
          distributionId
      },
      404
    );
  }

  if (
    distribution.status !==
      READY_DISTRIBUTION_STATUS &&
    distribution.tracking_status !==
      "READY"
  ) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "DISTRIBUTION_NOT_READY_FOR_MEASUREMENT",

        distribution_id:
          distributionId,

        current_status:
          distribution.status,

        required_status:
          READY_DISTRIBUTION_STATUS
      },
      409
    );
  }

  const result =
    await createMeasurement(
      env,
      distribution
    );

  if (result.duplicate) {
    return json({
      success: true,

      engine: ENGINE,
      version: VERSION,
      timestamp: now(),

      state:
        "MEASUREMENT_ALREADY_EXISTS",

      measurement:
        result.measurement,

      handoff: {
        ready: true,
        next_layer:
          NEXT_LAYER,

        reason:
          "A measurement session already exists for this distribution."
      },

      guardrails: {
        invents_behavior: false,
        invents_attention: false,
        invents_purchase: false,
        invents_revenue: false
      }
    });
  }

  return json({
    success: true,

    engine: ENGINE,
    version: VERSION,
    timestamp: now(),

    state:
      "MEASUREMENT_ACTIVE",

    distribution: {
      id:
        distribution.id,

      market_test_id:
        distribution.market_test_id,

      execution_id:
        distribution.execution_id || null,

      action_id:
        distribution.action_id || null,

      approval_id:
        distribution.approval_id || null,

      decision_id:
        distribution.decision_id || null,

      market_theme:
        distribution.market_theme || null,

      opportunity_type:
        distribution.opportunity_type || null
    },

    measurement:
      result.measurement,

    event_ingestion: {
      enabled: true,
      real_event_required: true,
      allowed_events:
        ALLOWED_EVENTS,

      attribution:
        "MARKET_TEST_EVENT_LINK"
    },

    handoff: {
      ready: true,
      next_layer:
        NEXT_LAYER,

      reason:
        "Measurement is active and waiting for real customer behavior."
    },

    guardrails: {
      invents_behavior: false,
      invents_attention: false,
      invents_purchase: false,
      invents_revenue: false,
      declares_winner: false,
      changes_strategy: false,
      executes_action: false,
      publishes_content: false,
      spends_money: false
    },

    contract: {
      current_layer: ENGINE,
      version: VERSION,
      previous_layer:
        PREVIOUS_LAYER,
      next_layer:
        NEXT_LAYER,

      measurement_engine:
        "MEASUREMENT_V2.3",

      real_behavior_required: true
    }
  });
}

async function handleEventPost(
  request,
  env
) {
  await ensureTables(env);

  let body;

  try {
    body = await request.json();
  } catch (error) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "INVALID_JSON"
      },
      400
    );
  }

  const measurementId =
    safeString(
      body.measurement_id
    );

  const eventType =
    safeString(
      body.event_type
    );

  if (!measurementId) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "measurement_id_required"
      },
      400
    );
  }

  if (
    ALLOWED_EVENTS.indexOf(
      eventType
    ) === -1
  ) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "INVALID_EVENT_TYPE",

        allowed_events:
          ALLOWED_EVENTS
      },
      400
    );
  }

  const measurementResult =
    await env.DB.prepare(`
      SELECT *
      FROM market_test_measurements
      WHERE id = ?
      LIMIT 1
    `)
      .bind(measurementId)
      .all();

  if (
    !measurementResult.results ||
    measurementResult.results.length === 0
  ) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "MEASUREMENT_NOT_FOUND",
        measurement_id:
          measurementId
      },
      404
    );
  }

  const measurement =
    measurementResult.results[0];

  const behaviorEventId =
    randomId("behavior");

  const createdAt =
    safeString(
      body.created_at
    ) || now();

  const revenueAmount =
    safeNumber(
      body.revenue_amount
    );

  const metadataObject =
    body.metadata &&
    typeof body.metadata === "object"
      ? body.metadata
      : {};

  metadataObject.market_test_id =
    measurement.market_test_id;

  metadataObject.distribution_id =
    measurement.distribution_id;

  metadataObject.measurement_id =
    measurement.id;

  metadataObject.source =
    "MARKET_TEST_MEASUREMENT_V1";

  const behaviorEvent = {
    behaviorEventId:
      behaviorEventId,

    eventType:
      eventType,

    customerId:
      safeString(
        body.customer_id
      ) || null,

    productId:
      safeString(
        body.product_id
      ) || null,

    contentId:
      safeString(
        body.content_id
      ) || null,

    revenueAmount:
      revenueAmount,

    source:
      "MARKET_TEST",

    createdAt:
      createdAt,

    metadata:
      JSON.stringify(
        metadataObject
      )
  };

  const insertion =
    await insertBehaviorEvent(
      env,
      behaviorEvent
    );

  if (!insertion.inserted) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,

        error:
          "BEHAVIOR_EVENT_INSERT_FAILED",

        reason:
          insertion.reason,

        schema:
          insertion.columns,

        guardrails: {
          event_created: false,
          measurement_changed: false,
          invents_behavior: false
        }
      },
      500
    );
  }

  const linkId =
    randomId("event-link");

  await env.DB.prepare(`
    INSERT INTO market_test_event_links (
      id,
      market_test_id,
      distribution_id,
      measurement_id,
      behavior_event_id,
      event_type,
      customer_id,
      product_id,
      content_id,
      revenue_amount,
      source,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      linkId,
      measurement.market_test_id,
      measurement.distribution_id,
      measurement.id,
      behaviorEventId,
      eventType,
      behaviorEvent.customerId,
      behaviorEvent.productId,
      behaviorEvent.contentId,
      revenueAmount,
      "MARKET_TEST",
      createdAt
    )
    .run();

  const linksResult =
    await env.DB.prepare(`
      SELECT *
      FROM market_test_event_links
      WHERE measurement_id = ?
      ORDER BY rowid ASC
    `)
      .bind(measurement.id)
      .all();

  const links =
    linksResult.results || [];

  const summary =
    calculateSummary(links);

  await env.DB.prepare(`
    UPDATE market_test_measurements
    SET updated_at = ?
    WHERE id = ?
  `)
    .bind(
      now(),
      measurement.id
    )
    .run();

  return json({
    success: true,

    engine: ENGINE,
    version: VERSION,
    timestamp: now(),

    state:
      "EVENT_RECORDED",

    measurement: {
      id:
        measurement.id,

      market_test_id:
        measurement.market_test_id,

      distribution_id:
        measurement.distribution_id,

      status:
        measurement.status
    },

    event: {
      behavior_event_id:
        behaviorEventId,

      link_id:
        linkId,

      event_type:
        eventType,

      stage:
        eventStage(eventType),

      customer_id:
        behaviorEvent.customerId,

      product_id:
        behaviorEvent.productId,

      content_id:
        behaviorEvent.contentId,

      revenue_amount:
        revenueAmount
    },

    observed_summary:
      summary,

    measurement_handoff: {
      next_layer:
        "MEASUREMENT_V2.3",

      behavior_event_written:
        true,

      measurement_engine_reads_behavior_events:
        true
    },

    guardrails: {
      invents_behavior: false,
      invents_attention: false,
      invents_purchase: false,
      invents_revenue: false,
      declares_winner: false,
      changes_strategy: false,
      executes_action: false
    },

    data_integrity: {
      behavior_event_persistence:
        "D1",

      market_test_attribution:
        true,

      distribution_traceability:
        true,

      measurement_traceability:
        true,

      real_event_required:
        true
    }
  });
}

export async function onRequestGet(context) {
  try {
    return await handleGet(
      context.env
    );
  } catch (error) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          error && error.message
            ? error.message
            : String(error)
      },
      500
    );
  }
}

export async function onRequestPost(context) {
  try {
    const url =
      new URL(
        context.request.url
      );

    const pathname =
      url.pathname;

    if (
      pathname.endsWith(
        "/event"
      )
    ) {
      return await handleEventPost(
        context.request,
        context.env
      );
    }

    return await handlePost(
      context.request,
      context.env
    );
  } catch (error) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          error && error.message
            ? error.message
            : String(error)
      },
      500
    );
  }
}
