```js
// TATO-OS
// Market Signal Collection V1.0
// Route: /api/market-signal-collection
//
// Business Layer:
//
// External Market Evidence
//          ↓
// Market Signal Collection
//          ↓
// market_signals (D1)
//          ↓
// Market Intelligence
//          ↓
// Opportunity Engine
//
// DOES:
// - accept externally observed market evidence
// - validate required evidence fields
// - store evidence in D1 market_signals
// - preserve source/evidence metadata
// - distinguish VERIFIED_EXTERNAL from TEST/MOCK
// - expose collection status
//
// DOES NOT:
// - invent market signals
// - scrape the internet automatically
// - declare opportunities
// - change strategy
// - create decisions
// - execute actions
//
// Source of truth:
// - external evidence supplied to this endpoint
// - D1 market_signals

const ENGINE = "MARKET_SIGNAL_COLLECTION_V1";
const VERSION = "1.0";

const TEST_SOURCES = new Set([
  "test",
  "demo",
  "mock",
  "sample",
  "fixture"
]);

const REQUIRED_EXTERNAL_FIELDS = [
  "source",
  "title"
];

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=UTF-8"
      }
    }
  );
}

function text(value) {
  return String(value ?? "").trim();
}

function normalize(value) {
  return text(value).toLowerCase();
}

function safeJson(value, fallback = {}) {
  if (!value) return fallback;

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function isTestSource(source) {
  return TEST_SOURCES.has(
    normalize(source)
  );
}

function isExternalSource(source) {
  if (!source) return false;

  return !isTestSource(source);
}

function normalizeConfidence(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  if (number > 1 && number <= 100) {
    return Number(
      Math.max(
        0,
        Math.min(1, number / 100)
      ).toFixed(3)
    );
  }

  return Number(
    Math.max(
      0,
      Math.min(1, number)
    ).toFixed(3)
  );
}

function normalizeIntent(body, metadata) {
  const raw =
    body.intent ||
    body.purchase_intent ||
    body.market_intent ||
    metadata.intent ||
    metadata.purchase_intent ||
    metadata.market_intent ||
    "";

  const value = normalize(raw);

  if (
    value.includes("commercial") ||
    value.includes("purchase") ||
    value.includes("buy") ||
    value.includes("ซื้อ")
  ) {
    return "COMMERCIAL";
  }

  if (
    value.includes("consider") ||
    value.includes("comparison") ||
    value.includes("compare") ||
    value.includes("เปรียบเทียบ")
  ) {
    return "CONSIDERATION";
  }

  if (
    value.includes("planning") ||
    value.includes("plan") ||
    value.includes("วางแผน")
  ) {
    return "PLANNING";
  }

  if (
    value.includes("informational") ||
    value.includes("information") ||
    value.includes("learn") ||
    value.includes("ค้นหา") ||
    value.includes("ข้อมูล")
  ) {
    return "INFORMATIONAL";
  }

  return "UNKNOWN";
}

async function getSchema(env) {
  const result = await env.DB
    .prepare(`
      PRAGMA table_info(market_signals)
    `)
    .all();

  return result.results || [];
}

function getColumns(schema) {
  return new Set(
    schema.map(column => column.name)
  );
}

function validateExternalEvidence(body) {
  const errors = [];

  for (
    const field of REQUIRED_EXTERNAL_FIELDS
  ) {
    if (!text(body[field])) {
      errors.push(`${field}_required`);
    }
  }

  const source = text(body.source);

  if (
    source &&
    isTestSource(source)
  ) {
    errors.push(
      "test_source_not_allowed_for_external_collection"
    );
  }

  /*
   * External collection must contain
   * some evidence reference.
   *
   * This can be:
   * - URL
   * - external_id
   * - evidence_reference
   * - platform_post
   * - search_reference
   */
  const metadata =
    safeJson(body.metadata, {});

  const evidenceUrl =
    text(
      body.evidence_url ||
      metadata.evidence_url ||
      ""
    );

  const externalId =
    text(
      body.external_id ||
      metadata.external_id ||
      ""
    );

  const evidenceReference =
    text(
      body.evidence_reference ||
      metadata.evidence_reference ||
      ""
    );

  if (
    !evidenceUrl &&
    !externalId &&
    !evidenceReference
  ) {
    errors.push(
      "external_evidence_reference_required"
    );
  }

  return errors;
}

function buildMetadata(body) {
  const existing =
    safeJson(body.metadata, {});

  const metadata = {
    ...existing,

    collection_engine: ENGINE,

    evidence_type:
      text(
        body.evidence_type ||
        existing.evidence_type ||
        "EXTERNAL_MARKET_EVIDENCE"
      ),

    intent:
      normalizeIntent(
        body,
        existing
      ),

    external: true,

    test: false,

    demo: false,

    mock: false,

    sample: false,

    fixture: false,

    collected_at:
      new Date().toISOString()
  };

  const evidenceUrl =
    text(
      body.evidence_url ||
      existing.evidence_url ||
      ""
    );

  if (evidenceUrl) {
    metadata.evidence_url =
      evidenceUrl;
  }

  const externalId =
    text(
      body.external_id ||
      existing.external_id ||
      ""
    );

  if (externalId) {
    metadata.external_id =
      externalId;
  }

  const evidenceReference =
    text(
      body.evidence_reference ||
      existing.evidence_reference ||
      ""
    );

  if (evidenceReference) {
    metadata.evidence_reference =
      evidenceReference;
  }

  return metadata;
}

async function insertSignal(env, body) {
  const schema =
    await getSchema(env);

  const columns =
    getColumns(schema);

  const source =
    text(body.source);

  const title =
    text(body.title);

  const confidence =
    normalizeConfidence(
      body.confidence
    );

  const detectedAt =
    text(body.detected_at) ||
    new Date().toISOString();

  const metadata =
    buildMetadata(body);

  const payload = {};

  /*
   * Only write columns that actually
   * exist in the current D1 schema.
   */

  if (columns.has("source")) {
    payload.source = source;
  }

  if (columns.has("title")) {
    payload.title = title;
  }

  if (columns.has("confidence")) {
    payload.confidence =
      confidence;
  }

  if (columns.has("metadata")) {
    payload.metadata =
      JSON.stringify(metadata);
  }

  if (columns.has("detected_at")) {
    payload.detected_at =
      detectedAt;
  }

  if (columns.has("category")) {
    payload.category =
      text(body.category) ||
      "MARKET";
  }

  if (
    Object.keys(payload).length === 0
  ) {
    throw new Error(
      "MARKET_SIGNALS_SCHEMA_UNSUPPORTED"
    );
  }

  const insertColumns =
    Object.keys(payload);

  const placeholders =
    insertColumns
      .map(() => "?")
      .join(", ");

  const values =
    insertColumns.map(
      column => payload[column]
    );

  const result =
    await env.DB
      .prepare(`
        INSERT INTO market_signals (
          ${insertColumns
            .map(
              column => `"${column}"`
            )
            .join(", ")}
        )
        VALUES (${placeholders})
      `)
      .bind(...values)
      .run();

  return {
    id:
      result.meta?.last_row_id ??
      null,

    source,

    title,

    intent:
      metadata.intent,

    confidence,

    external_verified:
      true,

    test_signal:
      false,

    detected_at:
      detectedAt
  };
}

async function collectionStatus(env) {
  const schema =
    await getSchema(env);

  const columns =
    getColumns(schema);

  const result =
    await env.DB
      .prepare(`
        SELECT
          COUNT(*) AS total
        FROM market_signals
      `)
      .all();

  const total =
    Number(
      result.results?.[0]?.total || 0
    );

  /*
   * Read metadata only where possible.
   * Current schema has metadata.
   */
  let externalCount = 0;
  let testCount = 0;

  if (columns.has("metadata")) {
    const rows =
      await env.DB
        .prepare(`
          SELECT
            source,
            metadata
          FROM market_signals
          ORDER BY
            detected_at DESC
          LIMIT 100
        `)
        .all();

    for (
      const row of rows.results || []
    ) {
      const metadata =
        safeJson(row.metadata, {});

      if (
        metadata.external === true
      ) {
        externalCount++;
      }

      if (
        metadata.test === true ||
        isTestSource(row.source)
      ) {
        testCount++;
      }
    }
  }

  return {
    total_records: total,

    external_verified_records:
      externalCount,

    test_records:
      testCount,

    real_market_evidence_available:
      externalCount > 0,

    schema: {
      detected_columns:
        schema.map(
          column => column.name
        ),

      schema_checked: true,

      metadata_available:
        columns.has("metadata"),

      category_available:
        columns.has("category"),

      confidence_available:
        columns.has("confidence"),

      detected_at_available:
        columns.has("detected_at")
    }
  };
}

export async function onRequest(
  context
) {
  const {
    request,
    env
  } = context;

  try {
    if (!env?.DB) {
      return json(
        {
          success: false,
          engine: ENGINE,
          version: VERSION,
          error:
            "DB_BINDING_NOT_FOUND"
        },
        500
      );
    }

    /*
     * GET
     *
     * Collection readiness/status.
     */
    if (
      request.method === "GET"
    ) {
      const status =
        await collectionStatus(env);

      return json({
        success: true,

        engine: ENGINE,

        version: VERSION,

        operation:
          "COLLECTION_STATUS",

        ...status,

        handoff: {
          next_layer:
            "MARKET_INTELLIGENCE_V1",

          ready:
            status
              .real_market_evidence_available
        },

        guardrails: {
          invents_market_data:
            false,

          accepts_test_as_external:
            false,

          writes_only_to_market_signals:
            true,

          creates_opportunity:
            false,

          creates_decision:
            false,

          executes_action:
            false
        }
      });
    }

    /*
     * POST
     *
     * Add externally observed
     * market evidence.
     */
    if (
      request.method === "POST"
    ) {
      let body;

      try {
        body =
          await request.json();
      } catch {
        return json(
          {
            success: false,
            engine: ENGINE,
            version: VERSION,
            error:
              "INVALID_JSON"
          },
          400
        );
      }

      const errors =
        validateExternalEvidence(
          body
        );

      if (errors.length > 0) {
        return json(
          {
            success: false,

            engine: ENGINE,

            version: VERSION,

            operation:
              "MARKET_SIGNAL_REJECTED",

            errors
          },
          400
        );
      }

      const inserted =
        await insertSignal(
          env,
          body
        );

      return json({
        success: true,

        engine: ENGINE,

        version: VERSION,

        operation:
          "EXTERNAL_MARKET_SIGNAL_COLLECTED",

        signal:
          inserted,

        data_integrity: {
          records_from_external_evidence:
            true,

          externally_verified:
            true,

          test_record:
            false
        },

        handoff: {
          next_layer:
            "MARKET_INTELLIGENCE_V1",

          ready: true
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
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "METHOD_NOT_ALLOWED"
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
          "UNKNOWN_ERROR"
      },
      500
    );
  }
}
```
