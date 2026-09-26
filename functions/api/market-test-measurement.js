// TATO-OS
// Market Test Measurement V1.1.1
// Route: /api/market-test-measurement
//
// Purpose:
// Connect Market Test Distribution to Measurement V2.3.
// No fake behavior.
// No fake attention.
// No fake purchase.
// No fake revenue.

const ENGINE = "MARKET_TEST_MEASUREMENT_V1";
const VERSION = "1.1.1";

const ALLOWED_EVENTS = [
  "content_view",
  "content_click",
  "engagement",
  "product_view",
  "order_created",
  "payment_completed",
  "revenue_recorded"
];

function response(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    }
  );
}

function errorResponse(error, extra = {}) {
  return response(
    {
      success: false,
      engine: ENGINE,
      version: VERSION,
      error: String(error?.message || error),
      ...extra
    },
    500
  );
}

function id(prefix) {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function timestamp() {
  return new Date().toISOString();
}

async function tableExists(db, table) {
  const result = await db
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
       AND name = ?
       LIMIT 1`
    )
    .bind(table)
    .all();

  return !!(
    result &&
    result.results &&
    result.results.length
  );
}

async function ensureMeasurementTables(db) {
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
  const exists = await tableExists(
    db,
    "market_test_distributions"
  );

  if (!exists) {
    throw new Error(
      "D1 table market_test_distributions does not exist"
    );
  }

  const result = await db
    .prepare(`
      SELECT *
      FROM market_test_distributions
      WHERE id = ?
      LIMIT 1
    `)
    .bind(distributionId)
    .all();

  return result.results &&
    result.results.length
    ? result.results[0]
    : null;
}

async function getStatus(db) {
  await ensureMeasurementTables(db);

  const distributionTableExists =
    await tableExists(
      db,
      "market_test_distributions"
    );

  if (!distributionTableExists) {
    return response({
      success: true,
      engine: ENGINE,
      version: VERSION,
      state: "WAITING_FOR_DISTRIBUTION_TABLE",
      summary: {
        distributions: 0,
        ready_distributions: 0,
        measurements: 0,
        linked_behavior_events: 0
      },
      database: {
        binding: "DB",
        connected: true,
        market_test_distributions: false
      }
    });
  }

  const distributionsResult = await db
    .prepare(`
      SELECT *
      FROM market_test_distributions
      ORDER BY created_at DESC
      LIMIT 100
    `)
    .all();

  const measurementsResult = await db
    .prepare(`
      SELECT *
      FROM market_test_measurements
      ORDER BY created_at DESC
      LIMIT 100
    `)
    .all();

  const linksResult = await db
    .prepare(`
      SELECT *
      FROM market_test_event_links
      ORDER BY created_at DESC
      LIMIT 500
    `)
    .all();

  const distributions =
    distributionsResult.results || [];

  const measurements =
    measurementsResult.results || [];

  const links =
    linksResult.results || [];

  const ready = distributions.filter(
    item =>
      item.status === "READY_FOR_MEASUREMENT" ||
      item.status === "MEASUREMENT_ACTIVE"
  );

  return response({
    success: true,
    engine: ENGINE,
    version: VERSION,
    timestamp: timestamp(),

    state:
      measurements.length > 0
        ? "MEASUREMENT_ACTIVE"
        : ready.length > 0
        ? "READY_TO_START_MEASUREMENT"
        : "WAITING_FOR_DISTRIBUTION",

    summary: {
      distributions: distributions.length,
      ready_distributions: ready.length,
      measurements: measurements.length,
      linked_behavior_events: links.length
    },

    distributions,
    measurements,
    event_links: links,

    measurement_contract: {
      required_events: ALLOWED_EVENTS,
      attention_events: [
        "content_view",
        "content_click"
      ],
      interest_events: [
        "engagement",
        "product_view"
      ],
      purchase_events: [
        "order_created",
        "payment_completed"
      ],
      revenue_events: [
        "revenue_recorded"
      ],
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
      spends_money: false
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

async function startMeasurement(
  db,
  distributionId
) {
  if (!distributionId) {
    return response(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "distribution_id_required"
      },
      400
    );
  }

  await ensureMeasurementTables(db);

  const distribution =
    await getDistribution(
      db,
      distributionId
    );

  if (!distribution) {
    return response(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "distribution_not_found",
        distribution_id: distributionId
      },
      404
    );
  }

  if (
    distribution.status !==
      "READY_FOR_MEASUREMENT" &&
    distribution.status !==
      "MEASUREMENT_ACTIVE"
  ) {
    return response(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "distribution_not_ready_for_measurement",
        distribution: {
          id: distribution.id,
          status: distribution.status
        }
      },
      409
    );
  }

  const existingResult = await db
    .prepare(`
      SELECT *
      FROM market_test_measurements
      WHERE distribution_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .bind(distribution.id)
    .all();

  const existing =
    existingResult.results &&
    existingResult.results.length
      ? existingResult.results[0]
      : null;

  if (existing) {
    return response({
      success: true,
      engine: ENGINE,
      version: VERSION,
      state: "MEASUREMENT_ACTIVE",
      created: false,
      duplicate: true,
      measurement: existing
    });
  }

  const measurementId =
    id("measurement");

  const now = timestamp();

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
      now,
      now
    )
    .run();

  await db
    .prepare(`
      UPDATE market_test_distributions
      SET status = ?, updated_at = ?
      WHERE id = ?
    `)
    .bind(
      "MEASUREMENT_ACTIVE",
      now,
      distribution.id
    )
    .run();

  return response({
    success: true,
    engine: ENGINE,
    version: VERSION,
    state: "MEASUREMENT_ACTIVE",
    created: true,

    measurement: {
      id: measurementId,
      distribution_id: distribution.id,
      market_test_id:
        distribution.market_test_id || null,
      measurement_engine:
        "MEASUREMENT_V2.3",
      status: "COLLECTING",
      created_at: now,
      updated_at: now
    },

    distribution: {
      id: distribution.id,
      market_test_id:
        distribution.market_test_id || null,
      status: "MEASUREMENT_ACTIVE"
    },

    handoff: {
      previous_layer:
        "MARKET_TEST_DISTRIBUTION_V1",
      current_layer: ENGINE,
      next_layer: "MEASUREMENT_V2.3",
      ready: true
    }
  });
}

async function recordEvent(
  db,
  body
) {
  const measurementId =
    body.measurement_id;

  const eventType =
    body.event_type;

  if (!measurementId) {
    return response(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "measurement_id_required"
      },
      400
    );
  }

  if (!ALLOWED_EVENTS.includes(eventType)) {
    return response(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "invalid_event_type",
        allowed_events: ALLOWED_EVENTS
      },
      400
    );
  }

  await ensureMeasurementTables(db);

  const measurementResult =
    await db
      .prepare(`
        SELECT *
        FROM market_test_measurements
        WHERE id = ?
        LIMIT 1
      `)
      .bind(measurementId)
      .all();

  const measurement =
    measurementResult.results &&
    measurementResult.results.length
      ? measurementResult.results[0]
      : null;

  if (!measurement) {
    return response(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "measurement_not_found"
      },
      404
    );
  }

  const distribution =
    await getDistribution(
      db,
      measurement.distribution_id
    );

  if (!distribution) {
    return response(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "distribution_not_found"
      },
      404
    );
  }

  /*
   * Real-event integration will be completed
   * through Measurement V2.3.
   *
   * This layer deliberately does NOT invent
   * behavior events.
   */

  return response({
    success: true,
    engine: ENGINE,
    version: VERSION,
    state: "EVENT_READY_FOR_MEASUREMENT_V2_3",

    measurement_id: measurement.id,
    distribution_id: distribution.id,
    market_test_id:
      distribution.market_test_id || null,

    event_type: eventType,

    handoff: {
      current_layer: ENGINE,
      next_layer: "MEASUREMENT_V2.3",
      ready: true
    },

    guardrails: {
      real_event_required: true,
      invented_event: false,
      invented_attention: false,
      invented_purchase: false,
      invented_revenue: false
    }
  });
}

export async function onRequest(context) {
  try {
    const request = context.request;
    const env = context.env;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods":
            "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type"
        }
      });
    }

    if (!env) {
      return response(
        {
          success: false,
          engine: ENGINE,
          version: VERSION,
          error: "context_env_missing"
        },
        500
      );
    }

    const db = env.DB;

    if (!db) {
      return response(
        {
          success: false,
          engine: ENGINE,
          version: VERSION,
          error:
            "D1 binding DB not available"
        },
        500
      );
    }

    const url =
      new URL(request.url);

    const pathname =
      url.pathname;

    if (request.method === "GET") {
      if (
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

      return await getStatus(db);
    }

    if (request.method === "POST") {
      let body = {};

      try {
        body = await request.json();
      } catch {
        body = {};
      }

      if (
        pathname.endsWith(
          "/market-test-measurement/event"
        )
      ) {
        return await recordEvent(
          db,
          body
        );
      }

      return await startMeasurement(
        db,
        body.distribution_id
      );
    }

    return response(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "method_not_allowed"
      },
      405
    );
  } catch (error) {
    console.error(
      "[MARKET_TEST_MEASUREMENT_V1.1.1]",
      error
    );

    return errorResponse(error);
  }
}
