// TATO-OS
// Market Test Measurement V1.1
// Route:
//   GET  /api/market-test-measurement
//   GET  /api/market-test-measurement/start?distribution_id=...
//   POST /api/market-test-measurement
//   POST /api/market-test-measurement/event
//
// Purpose:
// Connect Market Test Distribution to the existing Measurement V2.3.
// This layer does NOT create fake behavior.
// Real behavior events must come from real market activity.

const ENGINE = "MARKET_TEST_MEASUREMENT_V1";
const VERSION = "1.1";

const ALLOWED_EVENTS = [
  "content_view",
  "content_click",
  "engagement",
  "product_view",
  "order_created",
  "payment_completed",
  "revenue_recorded",
];

const ATTENTION_EVENTS = [
  "content_view",
  "content_click",
];

const INTEREST_EVENTS = [
  "engagement",
  "product_view",
];

const PURCHASE_EVENTS = [
  "order_created",
  "payment_completed",
];

const REVENUE_EVENTS = [
  "revenue_recorded",
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "Content-Type",
    },
  });
}

function now() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function safeJsonParse(value) {
  if (!value) return {};

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function getColumns(db, table) {
  const result = await db
    .prepare(`PRAGMA table_info(${table})`)
    .all();

  return (result.results || []).map((row) => row.name);
}

async function ensureTables(db) {
  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS market_test_measurements (
        id TEXT PRIMARY KEY,
        distribution_id TEXT NOT NULL,
        market_test_id TEXT,
        measurement_engine TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
    .run();

  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS market_test_event_links (
        id TEXT PRIMARY KEY,
        measurement_id TEXT NOT NULL,
        market_test_id TEXT,
        distribution_id TEXT,
        behavior_event_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
    .run();
}

async function getDistribution(db, distributionId) {
  const result = await db
    .prepare(`
      SELECT *
      FROM market_test_distributions
      WHERE id = ?
      LIMIT 1
    `)
    .bind(distributionId)
    .all();

  return result.results?.[0] || null;
}

async function getMeasurement(db, measurementId) {
  const result = await db
    .prepare(`
      SELECT *
      FROM market_test_measurements
      WHERE id = ?
      LIMIT 1
    `)
    .bind(measurementId)
    .all();

  return result.results?.[0] || null;
}

async function getExistingMeasurement(db, distributionId) {
  const result = await db
    .prepare(`
      SELECT *
      FROM market_test_measurements
      WHERE distribution_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .bind(distributionId)
    .all();

  return result.results?.[0] || null;
}

async function createMeasurement(db, distribution) {
  const existing = await getExistingMeasurement(
    db,
    distribution.id
  );

  if (existing) {
    return {
      created: false,
      duplicate: true,
      measurement: existing,
    };
  }

  const measurementId = makeId("measurement");
  const timestamp = now();

  await db
    .prepare(`
      INSERT INTO market_test_measurements
      (
        id,
        distribution_id,
        market_test_id,
        measurement_engine,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      measurementId,
      distribution.id,
      distribution.market_test_id || null,
      "MEASUREMENT_V2.3",
      "COLLECTING",
      timestamp,
      timestamp
    )
    .run();

  return {
    created: true,
    duplicate: false,
    measurement: {
      id: measurementId,
      distribution_id: distribution.id,
      market_test_id: distribution.market_test_id || null,
      measurement_engine: "MEASUREMENT_V2.3",
      status: "COLLECTING",
      created_at: timestamp,
      updated_at: timestamp,
    },
  };
}

function measurementContract() {
  return {
    required_events: ALLOWED_EVENTS,
    attention_events: ATTENTION_EVENTS,
    interest_events: INTEREST_EVENTS,
    purchase_events: PURCHASE_EVENTS,
    revenue_events: REVENUE_EVENTS,
    measurement_engine: "MEASUREMENT_V2.3",
  };
}

function guardrails() {
  return {
    invents_behavior: false,
    invents_attention: false,
    invents_purchase: false,
    invents_revenue: false,
    declares_winner: false,
    changes_strategy: false,
    executes_action: false,
    publishes_content: false,
    spends_money: false,
    automatic_scaling: false,
  };
}

async function getEventLinks(db, measurementId = null) {
  let query = `
    SELECT *
    FROM market_test_event_links
  `;

  const params = [];

  if (measurementId) {
    query += `
      WHERE measurement_id = ?
    `;
    params.push(measurementId);
  }

  query += `
    ORDER BY created_at DESC
    LIMIT 500
  `;

  const result = await db
    .prepare(query)
    .bind(...params)
    .all();

  return result.results || [];
}

async function getMeasurements(db) {
  const result = await db
    .prepare(`
      SELECT *
      FROM market_test_measurements
      ORDER BY created_at DESC
      LIMIT 100
    `)
    .all();

  return result.results || [];
}

async function getDistributions(db) {
  const result = await db
    .prepare(`
      SELECT *
      FROM market_test_distributions
      ORDER BY created_at DESC
      LIMIT 100
    `)
    .all();

  return result.results || [];
}

async function getStatus(db) {
  await ensureTables(db);

  const distributions = await getDistributions(db);
  const measurements = await getMeasurements(db);
  const eventLinks = await getEventLinks(db);

  const readyDistributions = distributions.filter(
    (item) =>
      item.status === "READY_FOR_MEASUREMENT" ||
      item.status === "MEASUREMENT_ACTIVE"
  );

  return {
    success: true,
    engine: ENGINE,
    version: VERSION,
    timestamp: now(),
    state:
      measurements.length > 0
        ? "MEASUREMENT_ACTIVE"
        : readyDistributions.length > 0
        ? "READY_TO_START_MEASUREMENT"
        : "WAITING_FOR_DISTRIBUTION",
    summary: {
      distributions: distributions.length,
      ready_distributions: readyDistributions.length,
      measurements: measurements.length,
      linked_behavior_events: eventLinks.length,
    },
    distributions,
    measurements,
    event_links: eventLinks,
    measurement_contract: measurementContract(),
    guardrails: guardrails(),
    data_integrity: {
      measurement_persistence: "D1",
      distribution_traceability: true,
      market_test_traceability: true,
      execution_traceability: true,
      approval_traceability: true,
      decision_traceability: true,
      behavior_event_attribution: true,
      real_event_required: true,
    },
    contract: {
      current_layer: ENGINE,
      version: VERSION,
      previous_layer: "MARKET_TEST_DISTRIBUTION_V1",
      next_layer: "MEASUREMENT_V2.3",
      real_behavior_required: true,
      revenue_confirmation_required: true,
    },
  };
}

async function startMeasurement(db, distributionId) {
  await ensureTables(db);

  if (!distributionId) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "distribution_id_required",
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
        error: "distribution_not_found",
        distribution_id: distributionId,
      },
      404
    );
  }

  if (
    distribution.status !== "READY_FOR_MEASUREMENT" &&
    distribution.status !== "MEASUREMENT_ACTIVE"
  ) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "distribution_not_ready_for_measurement",
        distribution: {
          id: distribution.id,
          status: distribution.status,
        },
      },
      409
    );
  }

  const result = await createMeasurement(
    db,
    distribution
  );

  if (!result.created) {
    return json({
      success: true,
      engine: ENGINE,
      version: VERSION,
      state: "MEASUREMENT_ACTIVE",
      created: false,
      duplicate: true,
      measurement: result.measurement,
      contract: measurementContract(),
      guardrails: guardrails(),
    });
  }

  const timestamp = now();

  await db
    .prepare(`
      UPDATE market_test_distributions
      SET
        status = ?,
        updated_at = ?
      WHERE id = ?
    `)
    .bind(
      "MEASUREMENT_ACTIVE",
      timestamp,
      distribution.id
    )
    .run();

  return json({
    success: true,
    engine: ENGINE,
    version: VERSION,
    state: "MEASUREMENT_ACTIVE",
    created: true,
    measurement: result.measurement,
    distribution: {
      id: distribution.id,
      market_test_id: distribution.market_test_id,
      status: "MEASUREMENT_ACTIVE",
    },
    contract: measurementContract(),
    guardrails: guardrails(),
    handoff: {
      previous_layer: "MARKET_TEST_DISTRIBUTION_V1",
      current_layer: ENGINE,
      next_layer: "MEASUREMENT_V2.3",
      ready: true,
    },
  });
}

async function createBehaviorEvent(
  db,
  measurement,
  distribution,
  eventType,
  payload
) {
  if (!ALLOWED_EVENTS.includes(eventType)) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "invalid_event_type",
        allowed_events: ALLOWED_EVENTS,
      },
      400
    );
  }

  const columns = await getColumns(
    db,
    "behavior_events"
  );

  if (!columns.length) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "behavior_events_schema_not_available",
      },
      500
    );
  }

  const eventId = makeId("behavior");
  const timestamp = now();

  const values = {};

  if (columns.includes("id")) {
    values.id = eventId;
  }

  if (columns.includes("event_type")) {
    values.event_type = eventType;
  }

  if (columns.includes("created_at")) {
    values.created_at = timestamp;
  }

  if (columns.includes("occurred_at")) {
    values.occurred_at = timestamp;
  }

  if (columns.includes("timestamp")) {
    values.timestamp = timestamp;
  }

  if (columns.includes("source")) {
    values.source = ENGINE;
  }

  if (columns.includes("content_id")) {
    values.content_id =
      payload.content_id ||
      distribution.market_test_id ||
      null;
  }

  if (columns.includes("product_id")) {
    values.product_id =
      payload.product_id || null;
  }

  if (columns.includes("customer_id")) {
    values.customer_id =
      payload.customer_id || null;
  }

  if (columns.includes("session_id")) {
    values.session_id =
      payload.session_id || null;
  }

  if (columns.includes("value")) {
    values.value =
      payload.value !== undefined
        ? payload.value
        : null;
  }

  if (columns.includes("metadata")) {
    values.metadata = JSON.stringify({
      market_test_id:
        distribution.market_test_id || null,
      distribution_id: distribution.id,
      measurement_id: measurement.id,
      event_type: eventType,
      source: ENGINE,
      real_event_required: true,
      payload,
    });
  }

  const usableEntries = Object.entries(
    values
  ).filter(([key, value]) => {
    return columns.includes(key) && value !== undefined;
  });

  if (!usableEntries.length) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "no_compatible_behavior_event_columns",
      },
      500
    );
  }

  const columnNames = usableEntries
    .map(([key]) => key)
    .join(", ");

  const placeholders = usableEntries
    .map(() => "?")
    .join(", ");

  const bindValues = usableEntries.map(
    ([, value]) => value
  );

  await db
    .prepare(`
      INSERT INTO behavior_events
      (${columnNames})
      VALUES (${placeholders})
    `)
    .bind(...bindValues)
    .run();

  return {
    eventId,
    timestamp,
    eventType,
  };
}

async function recordEvent(db, body) {
  await ensureTables(db);

  const measurementId =
    body.measurement_id;

  const eventType =
    body.event_type;

  if (!measurementId) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "measurement_id_required",
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
        error: "event_type_required",
      },
      400
    );
  }

  if (!ALLOWED_EVENTS.includes(eventType)) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "invalid_event_type",
        allowed_events: ALLOWED_EVENTS,
      },
      400
    );
  }

  const measurement = await getMeasurement(
    db,
    measurementId
  );

  if (!measurement) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "measurement_not_found",
      },
      404
    );
  }

  const distribution = await getDistribution(
    db,
    measurement.distribution_id
  );

  if (!distribution) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "distribution_not_found",
      },
      404
    );
  }

  if (measurement.status !== "COLLECTING") {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "measurement_not_collecting",
        status: measurement.status,
      },
      409
    );
  }

  const payload =
    body.payload &&
    typeof body.payload === "object"
      ? body.payload
      : {};

  /*
   * IMPORTANT:
   * This endpoint records ONLY a real event explicitly
   * submitted by the external market/test channel.
   *
   * It does not generate synthetic behavior.
   */

  const eventResult =
    await createBehaviorEvent(
      db,
      measurement,
      distribution,
      eventType,
      payload
    );

  if (eventResult instanceof Response) {
    return eventResult;
  }

  const linkId = makeId("event-link");

  await db
    .prepare(`
      INSERT INTO market_test_event_links
      (
        id,
        measurement_id,
        market_test_id,
        distribution_id,
        behavior_event_id,
        event_type,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      linkId,
      measurement.id,
      distribution.market_test_id ||
        null,
      distribution.id,
      eventResult.eventId,
      eventType,
      eventResult.timestamp
    )
    .run();

  return json({
    success: true,
    engine: ENGINE,
    version: VERSION,
    state: "EVENT_RECORDED",
    event: {
      id: eventResult.eventId,
      event_type: eventType,
      created_at: eventResult.timestamp,
    },
    attribution: {
      measurement_id: measurement.id,
      distribution_id: distribution.id,
      market_test_id:
        distribution.market_test_id || null,
      event_link_id: linkId,
    },
    handoff: {
      current_layer: ENGINE,
      next_layer: "MEASUREMENT_V2.3",
      ready: true,
    },
    guardrails: guardrails(),
  });
}

async function handlePost(request, db) {
  const url = new URL(request.url);

  const pathname = url.pathname;

  const body = await request
    .json()
    .catch(() => ({}));

  if (
    pathname.endsWith(
      "/market-test-measurement/event"
    )
  ) {
    return await recordEvent(db, body);
  }

  const distributionId =
    body.distribution_id;

  return await startMeasurement(
    db,
    distributionId
  );
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods":
          "GET,POST,OPTIONS",
        "access-control-allow-headers":
          "Content-Type",
      },
    });
  }

  const db = env.DB;

  if (!db) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "D1 binding DB not available",
      },
      500
    );
  }

  try {
    const url = new URL(request.url);
    const pathname = url.pathname;

    /*
     * Browser-safe route:
     *
     * GET
     * /api/market-test-measurement/start?distribution_id=...
     *
     * This exists because opening a URL in Safari sends GET,
     * not POST.
     */

    if (
      request.method === "GET" &&
      pathname.endsWith(
        "/market-test-measurement/start"
      )
    ) {
      const distributionId =
        url.searchParams.get(
          "distribution_id"
        );

      return await startMeasurement(
        db,
        distributionId
      );
    }

    if (request.method === "GET") {
      return await getStatus(db);
    }

    if (request.method === "POST") {
      return await handlePost(
        request,
        db
      );
    }

    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "method_not_allowed",
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
          error?.message ||
          String(error),
      },
      500
    );
  }
}
