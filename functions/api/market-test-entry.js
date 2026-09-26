```javascript
// TATO-OS
// Real Market Test Entry V1.0
//
// Route:
// /api/market-test-entry
//
// Flow:
// Market Test
// -> Real Customer
// -> Real Behavior
// -> Measurement V2.3
//
// No fake events.
// No strategy change.
// No automatic execution.

const ENGINE = "REAL_MARKET_TEST_ENTRY_V1";
const VERSION = "1.0";
const MEASUREMENT_ENGINE = "MEASUREMENT_V2.3";

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

function json(data, status) {
  if (status === undefined) {
    status = 200;
  }

  return new Response(
    JSON.stringify(data, null, 2),
    {
      status: status,
      headers: {
        "content-type": "application/json; charset=UTF-8",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "Content-Type"
      }
    }
  );
}

function now() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return (
    prefix +
    "-" +
    Date.now() +
    "-" +
    crypto.randomUUID().slice(0, 8)
  );
}

async function tableExists(db, tableName) {
  const result = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
    )
    .bind(tableName)
    .first();

  return !!result;
}

async function getColumns(db, tableName) {
  const result = await db
    .prepare("PRAGMA table_info(" + tableName + ")")
    .all();

  return result.results || [];
}

function hasColumn(columns, name) {
  return columns.some(function (column) {
    return column.name === name;
  });
}

function getEventStage(eventType) {
  if (ATTENTION_EVENTS.includes(eventType)) {
    return "ATTENTION";
  }

  if (INTEREST_EVENTS.includes(eventType)) {
    return "INTEREST";
  }

  if (PURCHASE_EVENTS.includes(eventType)) {
    return "PURCHASE";
  }

  if (REVENUE_EVENTS.includes(eventType)) {
    return "REVENUE";
  }

  return "UNKNOWN";
}

async function ensureLinkTable(db) {
  const exists = await tableExists(db, "market_test_event_links");
  if (!exists) {
    await db.prepare(
      "CREATE TABLE market_test_event_links (" +
      "id TEXT PRIMARY KEY," +
      "measurement_id TEXT NOT NULL," +
      "distribution_id TEXT NOT NULL," +
      "market_test_id TEXT NOT NULL," +
      "behavior_event_id TEXT NOT NULL," +
      "event_type TEXT NOT NULL," +
      "event_stage TEXT NOT NULL," +
      "created_at TEXT NOT NULL)"
    ).run();
    return;
  }

  const columns = await getColumns(db, "market_test_event_links");
  if (!hasColumn(columns, "event_stage")) {
    await db.prepare(
      "ALTER TABLE market_test_event_links ADD COLUMN event_stage TEXT"
    ).run();
  }
}

async function getDistribution(db, distributionId) {
  const exists = await tableExists(
    db,
    "market_test_distributions"
  );

  if (!exists) {
    return null;
  }

  return await db
    .prepare(
      "SELECT * FROM market_test_distributions " +
      "WHERE id = ? LIMIT 1"
    )
    .bind(distributionId)
    .first();
}

async function getActiveMeasurement(
  db,
  distributionId
) {
  const exists = await tableExists(
    db,
    "market_test_measurements"
  );

  if (!exists) {
    return null;
  }

  return await db
    .prepare(
      "SELECT * FROM market_test_measurements " +
      "WHERE distribution_id = ? " +
      "AND status = 'COLLECTING' " +
      "ORDER BY created_at DESC LIMIT 1"
    )
    .bind(distributionId)
    .first();
}

function buildBehaviorValues(
  columns,
  eventId,
  eventType,
  timestamp,
  distribution,
  measurement,
  requestData
) {
  const values = {};

  function set(name, value) {
    if (
      hasColumn(columns, name) &&
      value !== undefined
    ) {
      values[name] = value;
    }
  }

  set("id", eventId);
  set("event_type", eventType);
  set("created_at", timestamp);
  set("updated_at", timestamp);

  set(
    "measurement_id",
    measurement.id
  );

  set(
    "distribution_id",
    distribution.id
  );

  set(
    "market_test_id",
    distribution.market_test_id
  );

  if (
    requestData.content_id !== undefined
  ) {
    set(
      "content_id",
      requestData.content_id
    );
  }

  set(
    "source",
    requestData.source ||
      "REAL_MARKET_TEST"
  );

  set(
    "source_type",
    "REAL_MARKET_TEST"
  );

  if (
    requestData.metadata !== undefined
  ) {
    set(
      "metadata",
      typeof requestData.metadata === "string"
        ? requestData.metadata
        : JSON.stringify(
            requestData.metadata
          )
    );
  }

  if (
    requestData.revenue !== undefined
  ) {
    set(
      "revenue",
      requestData.revenue
    );
  }

  if (
    requestData.order_id !== undefined
  ) {
    set(
      "order_id",
      requestData.order_id
    );
  }

  if (
    requestData.customer_id !== undefined
  ) {
    set(
      "customer_id",
      requestData.customer_id
    );
  }

  return values;
}

function findMissingRequiredColumns(
  columns,
  values
) {
  const missing = [];

  columns.forEach(function (column) {
    const required =
      column.notnull === 1 &&
      column.pk !== 1 &&
      column.dflt_value === null;

    if (
      required &&
      !(column.name in values)
    ) {
      missing.push(column.name);
    }
  });

  return missing;
}

async function insertBehaviorEvent(
  db,
  distribution,
  measurement,
  eventType,
  requestData
) {
  const exists = await tableExists(
    db,
    "behavior_events"
  );

  if (!exists) {
    throw new Error(
      "behavior_events table does not exist"
    );
  }

  const columns = await getColumns(
    db,
    "behavior_events"
  );

  const eventId = makeId("behavior");
  const timestamp = now();

  const values = buildBehaviorValues(
    columns,
    eventId,
    eventType,
    timestamp,
    distribution,
    measurement,
    requestData
  );

  const missing =
    findMissingRequiredColumns(
      columns,
      values
    );

  if (missing.length > 0) {
    throw new Error(
      "behavior_events required columns missing: " +
      missing.join(", ")
    );
  }

  const names = Object.keys(values);

  if (names.length === 0) {
    throw new Error(
      "No compatible behavior_events columns found"
    );
  }

  const placeholders = names
    .map(function () {
      return "?";
    })
    .join(", ");

  const sql =
    "INSERT INTO behavior_events (" +
    names.join(", ") +
    ") VALUES (" +
    placeholders +
    ")";

  const params = names.map(function (name) {
    return values[name];
  });

  await db
    .prepare(sql)
    .bind.apply(
      db.prepare(sql),
      params
    )
    .run();

  return {
    id: eventId,
    event_type: eventType,
    created_at: timestamp
  };
}

async function createEventLink(
  db,
  distribution,
  measurement,
  behaviorEvent
) {
  await ensureLinkTable(db);

  const columns = await getColumns(
    db,
    "market_test_event_links"
  );

  const values = {};
  function set(name, value) {
    if (hasColumn(columns, name) && value !== undefined) {
      values[name] = value;
    }
  }

  set("id", makeId("event-link"));
  set("measurement_id", measurement.id);
  set("distribution_id", distribution.id);
  set("market_test_id", distribution.market_test_id);
  set("behavior_event_id", behaviorEvent.id);
  set("event_type", behaviorEvent.event_type);
  set("event_stage", getEventStage(behaviorEvent.event_type));
  set("created_at", now());

  const names = Object.keys(values);
  const placeholders = names.map(function () { return "?"; }).join(", ");
  const params = names.map(function (name) { return values[name]; });

  if (names.length === 0) {
    throw new Error("No compatible market_test_event_links columns found");
  }

  const statement = db.prepare(
    "INSERT INTO market_test_event_links (" +
    names.join(", ") +
    ") VALUES (" +
    placeholders +
    ")"
  );

  await statement.bind.apply(statement, params).run();

  return {
    id: values.id,
    measurement_id: values.measurement_id,
    distribution_id: values.distribution_id,
    behavior_event_id: values.behavior_event_id,
    event_type: values.event_type,
    event_stage: values.event_stage || null,
    created_at: values.created_at
  };
}
async function updateMeasurementTimestamp(
  db,
  measurementId
) {
  const exists = await tableExists(
    db,
    "market_test_measurements"
  );

  if (!exists) {
    return;
  }

  const columns = await getColumns(
    db,
    "market_test_measurements"
  );

  if (
    !hasColumn(columns, "updated_at")
  ) {
    return;
  }

  await db
    .prepare(
      "UPDATE market_test_measurements " +
      "SET updated_at = ? " +
      "WHERE id = ?"
    )
    .bind(
      now(),
      measurementId
    )
    .run();
}

async function handleStatus(db) {
  const distributionTable =
    await tableExists(
      db,
      "market_test_distributions"
    );

  if (!distributionTable) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "market_test_distributions table does not exist"
      },
      500
    );
  }

  const distributionResult =
    await db
      .prepare(
        "SELECT * FROM market_test_distributions " +
        "ORDER BY created_at DESC LIMIT 20"
      )
      .all();

  const distributions =
    distributionResult.results || [];

  let measurements = [];

  const measurementTable =
    await tableExists(
      db,
      "market_test_measurements"
    );

  if (measurementTable) {
    const measurementResult =
      await db
        .prepare(
          "SELECT * FROM market_test_measurements " +
          "ORDER BY created_at DESC LIMIT 20"
        )
        .all();

    measurements =
      measurementResult.results || [];
  }

  return json({
    success: true,
    engine: ENGINE,
    version: VERSION,
    timestamp: now(),
    state:
      "REAL_MARKET_TEST_ENTRY_READY",

    summary: {
      distributions:
        distributions.length,

      measurements:
        measurements.length,

      collecting_measurements:
        measurements.filter(function (
          item
        ) {
          return item.status === "COLLECTING";
        }).length
    },

    measurement_engine:
      MEASUREMENT_ENGINE,

    allowed_events:
      ALLOWED_EVENTS,

    stages: {
      attention:
        ATTENTION_EVENTS,

      interest:
        INTEREST_EVENTS,

      purchase:
        PURCHASE_EVENTS,

      revenue:
        REVENUE_EVENTS
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
      previous_layer:
        "MARKET_TEST_MEASUREMENT_V1",

      current_layer:
        ENGINE,

      next_layer:
        "MEASUREMENT_V2.3",

      real_behavior_required: true,

      real_customer_required: true
    }
  });
}

async function handlePost(
  request,
  env
) {
  const db = env.DB;

  if (!db) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "D1 binding env.DB is not available"
      },
      500
    );
  }

  let body;

  try {
    body = await request.json();
  } catch (error) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "Request body must be valid JSON"
      },
      400
    );
  }

  const distributionId =
    body.distribution_id;

  const eventType =
    body.event_type;

  if (!distributionId) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "distribution_id is required"
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
        error:
          "event_type is required"
      },
      400
    );
  }

  if (
    !ALLOWED_EVENTS.includes(
      eventType
    )
  ) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "Unsupported event_type: " +
          eventType,
        allowed_events:
          ALLOWED_EVENTS
      },
      400
    );
  }

  const distribution =
    await getDistribution(
      db,
      distributionId
    );

  if (!distribution) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "Distribution not found",
        distribution_id:
          distributionId
      },
      404
    );
  }

  const measurement =
    await getActiveMeasurement(
      db,
      distributionId
    );

  if (!measurement) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "No active measurement session found",
        distribution_id:
          distributionId,
        expected_status:
          "COLLECTING"
      },
      409
    );
  }

  const behaviorEvent =
    await insertBehaviorEvent(
      db,
      distribution,
      measurement,
      eventType,
      body
    );

  const eventLink =
    await createEventLink(
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
    state:
      "REAL_BEHAVIOR_RECORDED",

    measurement: {
      id: measurement.id,
      distribution_id:
        measurement.distribution_id,
      market_test_id:
        measurement.market_test_id,
      measurement_engine:
        MEASUREMENT_ENGINE,
      status:
        measurement.status
    },

    behavior_event:
      behaviorEvent,

    event_link:
      eventLink,

    handoff: {
      previous_layer:
        ENGINE,

      current_layer:
        ENGINE,

      next_layer:
        "MEASUREMENT_V2.3",

      ready: true
    },

    guardrails: {
      real_event_required: true,
      event_created_by_system:
        false,
      invents_behavior: false,
      invents_attention: false,
      invents_purchase: false,
      invents_revenue: false,
      declares_winner: false,
      changes_strategy: false,
      executes_action: false
    }
  });
}

export async function onRequest(
  context
) {
  try {
    const request =
      context.request;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "Content-Type"
        }
      });
    }

    const env =
      context.env;

    if (request.method === "GET") {
      return await handleStatus(
        env.DB
      );
    }

    if (request.method === "POST") {
      return await handlePost(
        request,
        env
      );
    }

    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "Method not allowed"
      },
      405
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
```
