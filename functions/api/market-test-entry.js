// TATO-OS
// Real Market Test Entry V1.0
//
// Purpose:
// Market Test → Real Customer Behavior → Measurement V2.3
//
// This layer DOES:
// - accept real market-test behavior events
// - verify distribution
// - verify active measurement session
// - write compatible behavior_events
// - create market_test_event_links
// - preserve traceability
//
// This layer DOES NOT:
// - invent behavior
// - invent attention
// - invent purchases
// - invent revenue
// - declare winners
// - change strategy
// - publish content
// - spend money
// - execute actions

const ENGINE = "REAL_MARKET_TEST_ENTRY_V1";
const VERSION = "1.0";

const MEASUREMENT_ENGINE = "MEASUREMENT_V2.3";

const ALLOWED_EVENTS = new Set([
  "content_view",
  "content_click",
  "engagement",
  "product_view",
  "order_created",
  "payment_completed",
  "revenue_recorded",
]);

const ATTENTION_EVENTS = new Set([
  "content_view",
  "content_click",
]);

const INTEREST_EVENTS = new Set([
  "engagement",
  "product_view",
]);

const PURCHASE_EVENTS = new Set([
  "order_created",
  "payment_completed",
]);

const REVENUE_EVENTS = new Set([
  "revenue_recorded",
]);

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "content-type": "application/json; charset=UTF-8",
      },
    }
  );
}

function now() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

async function tableExists(db, tableName) {
  const result = await db
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
       AND name = ?`
    )
    .bind(tableName)
    .first();

  return !!result;
}

async function getColumns(db, tableName) {
  const result = await db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all();

  return result.results || [];
}

function columnMap(columns) {
  const map = new Map();

  for (const column of columns) {
    map.set(column.name, column);
  }

  return map;
}

function hasColumn(columns, name) {
  return columns.some((column) => column.name === name);
}

function requiredColumnsMissing(columns, values) {
  const missing = [];

  for (const column of columns) {
    const required =
      column.notnull === 1 &&
      column.pk !== 1 &&
      column.dflt_value === null;

    if (required && !(column.name in values)) {
      missing.push(column.name);
    }
  }

  return missing;
}

async function ensureLinkTable(db) {
  await db
    .prepare(
      `
      CREATE TABLE IF NOT EXISTS market_test_event_links (
        id TEXT PRIMARY KEY,
        measurement_id TEXT NOT NULL,
        distribution_id TEXT NOT NULL,
        market_test_id TEXT NOT NULL,
        behavior_event_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_stage TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
      `
    )
    .run();
}

function getEventStage(eventType) {
  if (ATTENTION_EVENTS.has(eventType)) {
    return "ATTENTION";
  }

  if (INTEREST_EVENTS.has(eventType)) {
    return "INTEREST";
  }

  if (PURCHASE_EVENTS.has(eventType)) {
    return "PURCHASE";
  }

  if (REVENUE_EVENTS.has(eventType)) {
    return "REVENUE";
  }

  return "UNKNOWN";
}

async function getActiveMeasurement(db, distributionId) {
  if (!(await tableExists(db, "market_test_measurements"))) {
    return null;
  }

  return await db
    .prepare(
      `
      SELECT *
      FROM market_test_measurements
      WHERE distribution_id = ?
      AND status = 'COLLECTING'
      ORDER BY created_at DESC
      LIMIT 1
      `
    )
    .bind(distributionId)
    .first();
}

async function getDistribution(db, distributionId) {
  if (!(await tableExists(db, "market_test_distributions"))) {
    return null;
  }

  return await db
    .prepare(
      `
      SELECT *
      FROM market_test_distributions
      WHERE id = ?
      LIMIT 1
      `
    )
    .bind(distributionId)
    .first();
}

function buildBehaviorValues({
  columns,
  eventId,
  eventType,
  timestamp,
  distribution,
  measurement,
  requestData,
}) {
  const values = {};

  const set = (name, value) => {
    if (hasColumn(columns, name) && value !== undefined) {
      values[name] = value;
    }
  };

  set("id", eventId);
  set("event_type", eventType);
  set("created_at", timestamp);
  set("updated_at", timestamp);

  set("measurement_id", measurement.id);
  set("distribution_id", distribution.id);
  set("market_test_id", distribution.market_test_id);

  set("content_id", requestData.content_id || null);
  set("source", requestData.source || "REAL_MARKET_TEST");
  set("source_type", "REAL_MARKET_TEST");

  if (requestData.metadata !== undefined) {
    set(
      "metadata",
      typeof requestData.metadata === "string"
        ? requestData.metadata
        : JSON.stringify(requestData.metadata)
    );
  }

  if (requestData.revenue !== undefined) {
    set("revenue", requestData.revenue);
  }

  if (requestData.order_id !== undefined) {
    set("order_id", requestData.order_id);
  }

  if (requestData.customer_id !== undefined) {
    set("customer_id", requestData.customer_id);
  }

  return values;
}

async function insertBehaviorEvent(
  db,
  distribution,
  measurement,
  eventType,
  requestData
) {
  if (!(await tableExists(db, "behavior_events"))) {
    throw new Error("behavior_events table does not exist");
  }

  const columns = await getColumns(db, "behavior_events");

  const eventId = makeId("behavior");
  const timestamp = now();

  const values = buildBehaviorValues({
    columns,
    eventId,
    eventType,
    timestamp,
    distribution,
    measurement,
    requestData,
  });

  const missing = requiredColumnsMissing(columns, values);

  if (missing.length > 0) {
    throw new Error(
      `behavior_events required columns missing: ${missing.join(", ")}`
    );
  }

  const names = Object.keys(values);

  const placeholders = names.map(() => "?").join(", ");

  const sql = `
    INSERT INTO behavior_events
    (${names.join(", ")})
    VALUES
    (${placeholders})
  `;

  const params = names.map((name) => values[name]);

  await db
    .prepare(sql)
    .bind(...params)
    .run();

  return {
    id: eventId,
    event_type: eventType,
    created_at: timestamp,
  };
}

async function createEventLink(
  db,
  distribution,
  measurement,
  behaviorEvent
) {
  await ensureLinkTable(db);

  const id = makeId("event-link");
  const timestamp = now();
  const stage = getEventStage(behaviorEvent.event_type);

  await db
    .prepare(
      `
      INSERT INTO market_test_event_links (
        id,
        measurement_id,
        distribution_id,
        market_test_id,
        behavior_event_id,
        event_type,
        event_stage,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .bind(
      id,
      measurement.id,
      distribution.id,
      distribution.market_test_id,
      behaviorEvent.id,
      behaviorEvent.event_type,
      stage,
      timestamp
    )
    .run();

  return {
    id,
    measurement_id: measurement.id,
    distribution_id: distribution.id,
    behavior_event_id: behaviorEvent.id,
    event_type: behaviorEvent.event_type,
    event_stage: stage,
    created_at: timestamp,
  };
}

async function updateMeasurementTimestamp(db, measurementId) {
  if (
    !(await tableExists(db, "market_test_measurements"))
  ) {
    return;
  }

  const columns = await getColumns(
    db,
    "market_test_measurements"
  );

  if (!hasColumn(columns, "updated_at")) {
    return;
  }

  await db
    .prepare(
      `
      UPDATE market_test_measurements
      SET updated_at = ?
      WHERE id = ?
      `
    )
    .bind(now(), measurementId)
    .run();
}

async function handleStatus(db) {
  const distributions = (
    await db
      .prepare(
        `
        SELECT *
        FROM market_test_distributions
        ORDER BY created_at DESC
        LIMIT 20
        `
      )
      .all()
  ).results || [];

  let measurements = [];

  if (await tableExists(db, "market_test_measurements")) {
    measurements = (
      await db
        .prepare(
          `
          SELECT *
          FROM market_test_measurements
          ORDER BY created_at DESC
          LIMIT 20
          `
        )
        .all()
    ).results || [];
  }

  return json({
    success: true,
    engine: ENGINE,
    version: VERSION,
    timestamp: now(),

    state: "REAL_MARKET_TEST_ENTRY_READY",

    summary: {
      distributions: distributions.length,
      measurements: measurements.length,
      collecting_measurements: measurements.filter(
        (item) => item.status === "COLLECTING"
      ).length,
    },

    measurement_engine: MEASUREMENT_ENGINE,

    allowed_events: Array.from(ALLOWED_EVENTS),

    stages: {
      attention: Array.from(ATTENTION_EVENTS),
      interest: Array.from(INTEREST_EVENTS),
      purchase: Array.from(PURCHASE_EVENTS),
      revenue: Array.from(REVENUE_EVENTS),
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
    },

    contract: {
      previous_layer: "MARKET_TEST_MEASUREMENT_V1",
      current_layer: ENGINE,
      next_layer: MEASUREMENT_V2.3,
      real_behavior_required: true,
      real_customer_required: true,
    },
  });
}

async function handlePost(request, env) {
  const db = env.DB;

  if (!db) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "D1 binding env.DB is not available",
      },
      500
    );
  }

  const body = await request.json();

  const distributionId = body.distribution_id;
  const eventType = body.event_type;

  if (!distributionId) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "distribution_id is required",
      },
      400
    );
  }

  if (!eventType) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "event_type is required",
      },
      400
    );
  }

  if (!ALLOWED_EVENTS.has(eventType)) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: `Unsupported event_type: ${eventType}`,
        allowed_events: Array.from(ALLOWED_EVENTS),
      },
      400
    );
  }

  const distribution = await getDistribution(
    db,
    distributionId
  );

  if (!distribution) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "Distribution not found",
        distribution_id: distributionId,
      },
      404
    );
  }

  const measurement = await getActiveMeasurement(
    db,
    distributionId
  );

  if (!measurement) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "No active measurement session found",
        distribution_id: distributionId,
        expected_status: "COLLECTING",
      },
      409
    );
  }

  // Real event only.
  // The caller must explicitly provide the event.
  const behaviorEvent = await insertBehaviorEvent(
    db,
    distribution,
    measurement,
    eventType,
    body
  );

  const eventLink = await createEventLink(
    db,
    distribution,
    measurement,
    behaviorEvent
  );

  await updateMeasurementTimestamp(
    db,
    measurement.id
  );

  return json({
    success: true,
    engine: ENGINE,
    version: VERSION,
    timestamp: now(),

    state: "REAL_BEHAVIOR_RECORDED",

    measurement: {
      id: measurement.id,
      distribution_id: measurement.distribution_id,
      market_test_id: measurement.market_test_id,
      measurement_engine: MEASUREMENT_ENGINE,
      status: measurement.status,
    },

    behavior_event: behaviorEvent,

    event_link: eventLink,

    handoff: {
      previous_layer: ENGINE,
      current_layer: ENGINE,
      next_layer: MEASUREMENT_ENGINE,
      ready: true,
    },

    guardrails: {
      real_event_required: true,
      event_created_by_system: false,
      invents_behavior: false,
      invents_attention: false,
      invents_purchase: false,
      invents_revenue: false,
      declares_winner: false,
      changes_strategy: false,
      executes_action: false,
    },
  });
}

export async function onRequest(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);

    if (request.method === "GET") {
      return await handleStatus(env.DB);
    }

    if (request.method === "POST") {
      return await handlePost(request, env);
    }

    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "Method not allowed",
      },
      405
    );
  } catch (error) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: error?.message || String(error),
      },
      500
    );
  }
}
