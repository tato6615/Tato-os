// TATO-OS
// Market Test Measurement V1.1
//
// Route:
// GET  /api/market-test-measurement
// GET  /api/market-test-measurement/start?distribution_id=...
// POST /api/market-test-measurement
// POST /api/market-test-measurement/event
//
// Purpose:
// Connect READY_FOR_MEASUREMENT distribution
// to existing Measurement V2.3.
//
// V1.1 change:
// Added browser-safe GET /start endpoint.
// This avoids requiring Safari/iPad to send POST bodies.
//
// Guardrails:
// - Does NOT invent behavior
// - Does NOT invent attention
// - Does NOT invent purchase
// - Does NOT invent revenue
// - Does NOT declare winner
// - Does NOT change strategy
// - Does NOT execute actions
// - Does NOT publish content
// - Does NOT spend money

const ENGINE = "MARKET_TEST_MEASUREMENT_V1";
const VERSION = "1.1";

const REQUIRED_EVENTS = [
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
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

function normalize(value) {
  return String(value || "").trim();
}

async function ensureTables(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS market_test_measurements (
      id TEXT PRIMARY KEY,
      distribution_id TEXT NOT NULL,
      market_test_id TEXT,
      measurement_engine TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS market_test_event_links (
      id TEXT PRIMARY KEY,
      measurement_id TEXT NOT NULL,
      distribution_id TEXT NOT NULL,
      market_test_id TEXT,
      behavior_event_id TEXT,
      event_type TEXT NOT NULL,
      stage TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run();
}

async function getColumns(db, table) {
  const result = await db
    .prepare(`PRAGMA table_info(${table})`)
    .all();

  return (result.results || []).map(row => row.name);
}

function stageForEvent(eventType) {
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

async function getDistribution(db, distributionId) {
  return await db
    .prepare(`
      SELECT *
      FROM market_test_distributions
      WHERE id = ?
      LIMIT 1
    `)
    .bind(distributionId)
    .first();
}

async function getMeasurement(db, distributionId) {
  return await db
    .prepare(`
      SELECT *
      FROM market_test_measurements
      WHERE distribution_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .bind(distributionId)
    .first();
}

async function createMeasurement(db, distribution) {
  const existing = await getMeasurement(
    db,
    distribution.id
  );

  if (existing) {
    return {
      created: false,
      measurement: existing
    };
  }

  const id = makeId("measurement");
  const timestamp = now();

  await db.prepare(`
    INSERT INTO market_test_measurements (
      id,
      distribution_id,
      market_test_id,
      measurement_engine,
      status,
      started_at,
      updated_at,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    distribution.id,
    distribution.market_test_id || null,
    "MEASUREMENT_V2.3",
    "COLLECTING",
    timestamp,
    timestamp,
    timestamp
  ).run();

  const measurement = await db
    .prepare(`
      SELECT *
      FROM market_test_measurements
      WHERE id = ?
      LIMIT 1
    `)
    .bind(id)
    .first();

  return {
    created: true,
    measurement
  };
}

async function startMeasurement(db, distributionId) {
  if (!distributionId) {
    return json({
      success: false,
      engine: ENGINE,
      version: VERSION,
      error: "distribution_id_required"
    }, 400);
  }

  await ensureTables(db);

  const distribution = await getDistribution(
    db,
    distributionId
  );

  if (!distribution) {
    return json({
      success: false,
      engine: ENGINE,
      version: VERSION,
      error: "distribution_not_found",
      distribution_id: distributionId
    }, 404);
  }

  if (
    distribution.status !== "READY_FOR_MEASUREMENT" &&
    distribution.status !== "MEASUREMENT_ACTIVE"
  ) {
    return json({
      success: false,
      engine: ENGINE,
      version: VERSION,
      error: "distribution_not_ready_for_measurement",
      distribution_status: distribution.status,
      distribution_id: distributionId
    }, 409);
  }

  const result = await createMeasurement(
    db,
    distribution
  );

  return json({
    success: true,
    engine: ENGINE,
    version: VERSION,
    operation: "START_MEASUREMENT",
    state: "MEASUREMENT_ACTIVE",
    created: result.created,

    measurement: result.measurement,

    distribution: {
      id: distribution.id,
      market_test_id: distribution.market_test_id,
      market_theme: distribution.market_theme,
      opportunity_type: distribution.opportunity_type,
      channel: distribution.channel,
      entry_point: distribution.entry_point,
      status: distribution.status
    },

    measurement_contract: {
      measurement_engine: "MEASUREMENT_V2.3",
      required_events: REQUIRED_EVENTS,
      attention_events: ATTENTION_EVENTS,
      interest_events: INTEREST_EVENTS,
      purchase_events: PURCHASE_EVENTS,
      revenue_events: REVENUE_EVENTS,
      real_behavior_required: true,
      revenue_confirmation_required: true
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

    next: "REAL_BEHAVIOR_EVENT_REQUIRED"
  });
}

async function getStatus(db) {
  await ensureTables(db);

  const distributions = await db.prepare(`
    SELECT *
    FROM market_test_distributions
    ORDER BY created_at DESC
  `).all();

  const measurements = await db.prepare(`
    SELECT *
    FROM market_test_measurements
    ORDER BY created_at DESC
  `).all();

  const eventLinks = await db.prepare(`
    SELECT *
    FROM market_test_event_links
    ORDER BY created_at DESC
  `).all();

  const distributionRows =
    distributions.results || [];

  const measurementRows =
    measurements.results || [];

  const eventLinkRows =
    eventLinks.results || [];

  const readyDistributions =
    distributionRows.filter(row =>
      row.status === "READY_FOR_MEASUREMENT" ||
      row.status === "MEASUREMENT_ACTIVE"
    );

  return json({
    success: true,
    engine: ENGINE,
    version: VERSION,
    timestamp: now(),

    state:
      measurementRows.length > 0
        ? "MEASUREMENT_ACTIVE"
        : readyDistributions.length > 0
          ? "READY_TO_START_MEASUREMENT"
          : "WAITING_FOR_DISTRIBUTION",

    summary: {
      distributions: distributionRows.length,
      ready_distributions: readyDistributions.length,
      measurements: measurementRows.length,
      linked_behavior_events: eventLinkRows.length
    },

    distributions: distributionRows,
    measurements: measurementRows,
    event_links: eventLinkRows,

    measurement_contract: {
      required_events: REQUIRED_EVENTS,
      attention_events: ATTENTION_EVENTS,
      interest_events: INTEREST_EVENTS,
      purchase_events: PURCHASE_EVENTS,
      revenue_events: REVENUE_EVENTS,
      measurement_engine: "MEASUREMENT_V2.3"
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

    contract: {
      current_layer: ENGINE,
      version: VERSION,
      previous_layer: "MARKET_TEST_DISTRIBUTION_V1",
      next_layer: "MEASUREMENT_V2.3",
      real_behavior_required: true,
      revenue_confirmation_required: true
    }
  });
}

async function createBehaviorEvent(
  db,
  measurement,
  eventType,
  payload
) {
  if (!REQUIRED_EVENTS.includes(eventType)) {
    return json({
      success: false,
      engine: ENGINE,
      version: VERSION,
      error: "invalid_event_type",
      allowed_events: REQUIRED_EVENTS
    }, 400);
  }

  const behaviorColumns =
    await getColumns(db, "behavior_events");

  const behaviorEventId =
    makeId("behavior");

  const timestamp = now();

  const values = {
    id: behaviorEventId,

    event_type: eventType,

    created_at: timestamp,

    metadata: JSON.stringify({
      source: ENGINE,
      measurement_id: measurement.id,
      distribution_id: measurement.distribution_id,
      market_test_id: measurement.market_test_id,
      real_event: true,
      payload: payload || {}
    })
  };

  const usableColumns =
    Object.keys(values).filter(column =>
      behaviorColumns.includes(column)
    );

  if (!usableColumns.includes("event_type")) {
    return json({
      success: false,
      engine: ENGINE,
      version: VERSION,
      error: "behavior_events_schema_missing_event_type",
      detected_columns: behaviorColumns
    }, 500);
  }

  const placeholders =
    usableColumns.map(() => "?").join(", ");

  const bindValues =
    usableColumns.map(column =>
      values[column]
    );

  await db.prepare(`
    INSERT INTO behavior_events (
      ${usableColumns.join(", ")}
    )
    VALUES (${placeholders})
  `).bind(...bindValues).run();

  const linkId =
    makeId("event-link");

  const stage =
    stageForEvent(eventType);

  await db.prepare(`
    INSERT INTO market_test_event_links (
      id,
      measurement_id,
      distribution_id,
      market_test_id,
      behavior_event_id,
      event_type,
      stage,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    linkId,
    measurement.id,
    measurement.distribution_id,
    measurement.market_test_id || null,
    behaviorEventId,
    eventType,
    stage,
    timestamp
  ).run();

  return json({
    success: true,
    engine: ENGINE,
    version: VERSION,
    operation: "RECORD_REAL_BEHAVIOR_EVENT",
    state: "EVENT_RECORDED",
    measurement_id: measurement.id,
    distribution_id: measurement.distribution_id,
    market_test_id: measurement.market_test_id,
    behavior_event_id: behaviorEventId,
    event_type: eventType,
    stage,
    real_event: true,
    next: "MEASUREMENT_V2.3"
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);

    // Browser-safe measurement start.
    //
    // Example:
    //
    // /api/market-test-measurement/start
    // ?distribution_id=distribution-...
    //
    if (
      url.pathname.endsWith("/start")
    ) {
      const distributionId =
        normalize(
          url.searchParams.get(
            "distribution_id"
          )
        );

      return await startMeasurement(
        env.DB,
        distributionId
      );
    }

    return await getStatus(env.DB);

  } catch (error) {
    return json({
      success: false,
      engine: ENGINE,
      version: VERSION,
      error: error.message || String(error)
    }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);

    const body =
      await request.json().catch(() => ({}));

    // Real behavior event endpoint.
    if (
      url.pathname.endsWith("/event")
    ) {
      const measurementId =
        normalize(
          body.measurement_id
        );

      const eventType =
        normalize(
          body.event_type
        );

      if (!measurementId) {
        return json({
          success: false,
          engine: ENGINE,
          version: VERSION,
          error: "measurement_id_required"
        }, 400);
      }

      await ensureTables(env.DB);

      const measurement =
        await env.DB.prepare(`
          SELECT *
          FROM market_test_measurements
          WHERE id = ?
          LIMIT 1
        `)
        .bind(measurementId)
        .first();

      if (!measurement) {
        return json({
          success: false,
          engine: ENGINE,
          version: VERSION,
          error: "measurement_not_found",
          measurement_id: measurementId
        }, 404);
      }

      return await createBehaviorEvent(
        env.DB,
        measurement,
        eventType,
        body.payload || {}
      );
    }

    // Original POST start contract remains supported.
    const distributionId =
      normalize(
        body.distribution_id
      );

    return await startMeasurement(
      env.DB,
      distributionId
    );

  } catch (error) {
    return json({
      success: false,
      engine: ENGINE,
      version: VERSION,
      error: error.message || String(error)
    }, 500);
  }
}
