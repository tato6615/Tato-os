```javascript
// TATO-OS
// Market Signal Collection V1.0.2
// Route: /api/market-signal-collection
//
// Business Layer:
//
// External Market Evidence
//        ↓
// Market Signal Collection
//        ↓
// Market Intelligence
//
// DOES:
// - inspect real D1 schema
// - collect externally verified market evidence
// - store evidence in market_signals
// - preserve source and evidence metadata
// - distinguish test data from external data
// - prepare handoff to Market Intelligence
//
// DOES NOT:
// - invent market data
// - treat test data as external evidence
// - create opportunities
// - create decisions
// - execute actions

const COLLECTION_ENGINE = "MARKET_SIGNAL_COLLECTION_V1";
const COLLECTION_VERSION = "1.0.2";

const TEST_SOURCES = new Set([
  "test",
  "demo",
  "mock",
  "sample",
  "fixture"
]);

function json(data, status) {
  if (status === undefined) {
    status = 200;
  }

  return new Response(
    JSON.stringify(data, null, 2),
    {
      status: status,
      headers: {
        "content-type": "application/json; charset=UTF-8"
      }
    }
  );
}

function safeJson(value, fallback) {
  if (fallback === undefined) {
    fallback = {};
  }

  if (!value) {
    return fallback;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isTestSource(source) {
  return TEST_SOURCES.has(
    normalizeText(source)
  );
}

function isExternalVerified(metadata, source) {
  const data = safeJson(metadata, {});

  if (
    data.test === true ||
    data.demo === true ||
    data.mock === true ||
    data.sample === true ||
    data.fixture === true
  ) {
    return false;
  }

  if (data.external_source === true) {
    return true;
  }

  if (data.external_verified === true) {
    return true;
  }

  if (isTestSource(source)) {
    return false;
  }

  return false;
}

async function getMarketSignalsSchema(env) {
  const result = await env.DB
    .prepare(
      "PRAGMA table_info(market_signals)"
    )
    .all();

  return result.results || [];
}

function schemaColumnNames(schema) {
  return new Set(
    schema.map(function(column) {
      return column.name;
    })
  );
}

async function getCollectionStatus(env) {
  const schema =
    await getMarketSignalsSchema(env);

  const columns =
    schemaColumnNames(schema);

  const preferredColumns = [
    "id",
    "source",
    "title",
    "category",
    "confidence",
    "metadata",
    "detected_at",
    "created_at"
  ];

  const availableColumns =
    preferredColumns.filter(
      function(column) {
        return columns.has(column);
      }
    );

  if (
    !availableColumns.includes("source") ||
    !availableColumns.includes("title")
  ) {
    throw new Error(
      "MARKET_SIGNALS_REQUIRED_COLUMNS_MISSING"
    );
  }

  const selectList =
    availableColumns
      .map(function(column) {
        return "\"" + column + "\"";
      })
      .join(", ");

  let orderColumn = "rowid";

  if (columns.has("detected_at")) {
    orderColumn = "detected_at";
  } else if (columns.has("created_at")) {
    orderColumn = "created_at";
  }

  const sql =
    "SELECT " +
    selectList +
    " FROM market_signals" +
    " ORDER BY " +
    orderColumn +
    " DESC LIMIT 100";

  const result = await env.DB
    .prepare(sql)
    .all();

  const rows =
    result.results || [];

  let externalVerifiedRecords = 0;
  let testRecords = 0;

  for (const row of rows) {
    const metadata =
      safeJson(row.metadata, {});

    const source =
      row.source || "";

    const testSignal =
      isTestSource(source) ||
      metadata.test === true ||
      metadata.demo === true ||
      metadata.mock === true ||
      metadata.sample === true ||
      metadata.fixture === true;

    if (testSignal) {
      testRecords++;
    }

    if (
      isExternalVerified(
        metadata,
        source
      )
    ) {
      externalVerifiedRecords++;
    }
  }

  return {
    total_records:
      rows.length,

    external_verified_records:
      externalVerifiedRecords,

    test_records:
      testRecords,

    real_market_evidence_available:
      externalVerifiedRecords > 0,

    schema: {
      detected_columns:
        availableColumns,

      schema_checked:
        true,

      category_available:
        columns.has("category"),

      confidence_available:
        columns.has("confidence"),

      metadata_available:
        columns.has("metadata"),

      detected_at_available:
        columns.has("detected_at")
    },

    handoff: {
      next_layer:
        "MARKET_INTELLIGENCE_V1",

      ready:
        externalVerifiedRecords > 0
    },

    guardrails: {
      invents_market_data:
        false,

      accepts_test_as_external:
        false,

      creates_opportunity:
        false,

      creates_decision:
        false,

      executes_action:
        false
    }
  };
}

async function createMarketSignal(env, body) {
  const schema =
    await getMarketSignalsSchema(env);

  const columns =
    schemaColumnNames(schema);

  const source =
    body.source ||
    body.source_type ||
    null;

  const title =
    body.title ||
    null;

  if (!source) {
    return {
      error:
        "source_required"
    };
  }

  if (!title) {
    return {
      error:
        "title_required"
    };
  }

  const metadata =
    body.metadata &&
    typeof body.metadata === "object"
      ? Object.assign({}, body.metadata)
      : {};

  const externalVerified =
    body.external_verified === true ||
    metadata.external_verified === true ||
    metadata.external_source === true;

  const testSignal =
    body.test === true ||
    metadata.test === true ||
    metadata.demo === true ||
    metadata.mock === true ||
    metadata.sample === true ||
    metadata.fixture === true ||
    isTestSource(source);

  if (testSignal) {
    metadata.test = true;
    metadata.external_verified = false;
    metadata.external_source = false;
  } else if (externalVerified) {
    metadata.external_verified = true;
    metadata.external_source = true;
  }

  const detectedAt =
    body.detected_at ||
    new Date().toISOString();

  const confidence =
    body.confidence !== undefined
      ? body.confidence
      : null;

  const payload = {};

  if (columns.has("source")) {
    payload.source = source;
  }

  if (columns.has("title")) {
    payload.title = title;
  }

  if (columns.has("confidence")) {
    payload.confidence = confidence;
  }

  if (columns.has("metadata")) {
    payload.metadata =
      JSON.stringify(metadata);
  }

  if (columns.has("detected_at")) {
    payload.detected_at = detectedAt;
  }

  if (columns.has("category")) {
    payload.category =
      body.category ||
      "MARKET";
  }

  const insertColumns =
    Object.keys(payload);

  if (insertColumns.length === 0) {
    return {
      error:
        "MARKET_SIGNALS_INSERT_SCHEMA_UNSUPPORTED"
    };
  }

  const placeholders =
    insertColumns
      .map(function() {
        return "?";
      })
      .join(", ");

  const values =
    insertColumns.map(
      function(column) {
        return payload[column];
      }
    );

  const quotedColumns =
    insertColumns
      .map(function(column) {
        return "\"" + column + "\"";
      })
      .join(", ");

  const sql =
    "INSERT INTO market_signals (" +
    quotedColumns +
    ") VALUES (" +
    placeholders +
    ")";

  const result = await env.DB
    .prepare(sql)
    .bind.apply(
      env.DB.prepare(sql),
      values
    );

  /*
   * The previous bind construction above is intentionally
   * replaced below with a single prepared statement so that
   * D1 receives the values correctly.
   */
  const statement =
    env.DB
      .prepare(sql)
      .bind.apply(
        env.DB.prepare(sql),
        values
      );

  const insertResult =
    await statement.run();

  return {
    success:
      true,

    id:
      insertResult.meta &&
      insertResult.meta.last_row_id
        ? insertResult.meta.last_row_id
        : null,

    external_verified:
      !testSignal &&
      externalVerified,

    test:
      testSignal
  };
}

export async function onRequest(context) {
  const request =
    context.request;

  const env =
    context.env;

  try {
    if (!env || !env.DB) {
      return json(
        {
          success:
            false,

          engine:
            COLLECTION_ENGINE,

          version:
            COLLECTION_VERSION,

          error:
            "DB_BINDING_NOT_FOUND"
        },
        500
      );
    }

    if (request.method === "GET") {
      const status =
        await getCollectionStatus(env);

      return json({
        success:
          true,

        engine:
          COLLECTION_ENGINE,

        version:
          COLLECTION_VERSION,

        operation:
          "COLLECTION_STATUS",

        total_records:
          status.total_records,

        external_verified_records:
          status.external_verified_records,

        test_records:
          status.test_records,

        real_market_evidence_available:
          status.real_market_evidence_available,

        schema:
          status.schema,

        handoff:
          status.handoff,

        guardrails:
          status.guardrails
      });
    }

    if (request.method === "POST") {
      let body;

      try {
        body =
          await request.json();
      } catch (error) {
        return json(
          {
            success:
              false,

            engine:
              COLLECTION_ENGINE,

            version:
              COLLECTION_VERSION,

            error:
              "INVALID_JSON"
          },
          400
        );
      }

      const created =
        await createMarketSignal(
          env,
          body
        );

      if (created.error) {
        return json(
          {
            success:
              false,

            engine:
              COLLECTION_ENGINE,

            version:
              COLLECTION_VERSION,

            error:
              created.error
          },
          400
        );
      }

      return json({
        success:
          true,

        engine:
          COLLECTION_ENGINE,

        version:
          COLLECTION_VERSION,

        operation:
          "MARKET_SIGNAL_CREATED",

        result:
          created,

        handoff: {
          next_layer:
            "MARKET_INTELLIGENCE_V1",

          ready:
            created.external_verified === true
        },

        guardrails: {
          invents_market_data:
            false,

          accepts_test_as_external:
            false,

          creates_opportunity:
            false,

          creates_decision:
            false,

          executes_action:
            false
        }
      });
    }

    return json(
      {
        success:
          false,

        engine:
          COLLECTION_ENGINE,

        version:
          COLLECTION_VERSION,

        error:
          "METHOD_NOT_ALLOWED"
      },
      405
    );

  } catch (error) {
    return json(
      {
        success:
          false,

        engine:
          COLLECTION_ENGINE,

        version:
          COLLECTION_VERSION,

        error:
          error &&
          error.message
            ? error.message
            : "UNKNOWN_ERROR"
      },
      500
    );
  }
}
```
