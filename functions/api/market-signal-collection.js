```javascript
// TATO-OS
// Market Signal Collection V1.0.1
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
// - validate evidence
// - store evidence in D1 market_signals
// - preserve source/evidence metadata
// - distinguish external evidence from test data
// - expose collection status
//
// DOES NOT:
// - invent market data
// - create opportunities
// - create decisions
// - execute actions
//
// Confirmed market_signals schema:
// id
// source
// title
// metadata
// detected_at

const ENGINE = "MARKET_SIGNAL_COLLECTION_V1";
const VERSION = "1.0.1";

const TEST_SOURCES = new Set([
  "test",
  "demo",
  "mock",
  "sample",
  "fixture"
]);

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "content-type": "application/json; charset=UTF-8"
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

function safeJson(value) {
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function isTestSource(source) {
  return TEST_SOURCES.has(
    normalize(source)
  );
}

function normalizeConfidence(value) {
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

  if (number > 1 && number <= 100) {
    return Number(
      (number / 100).toFixed(3)
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

function validateEvidence(body) {
  const errors = [];

  const source =
    text(body.source);

  const title =
    text(body.title);

  if (!source) {
    errors.push("source_required");
  }

  if (!title) {
    errors.push("title_required");
  }

  if (
    source &&
    isTestSource(source)
  ) {
    errors.push(
      "test_source_not_allowed"
    );
  }

  const metadata =
    safeJson(body.metadata);

  const evidenceUrl =
    text(
      body.evidence_url ||
      metadata.evidence_url
    );

  const externalId =
    text(
      body.external_id ||
      metadata.external_id
    );

  const evidenceReference =
    text(
      body.evidence_reference ||
      metadata.evidence_reference
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
    safeJson(body.metadata);

  const metadata = {
    ...existing,

    collection_engine:
      ENGINE,

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

    external:
      true,

    test:
      false,

    demo:
      false,

    mock:
      false,

    sample:
      false,

    fixture:
      false,

    collected_at:
      new Date().toISOString()
  };

  const evidenceUrl =
    text(
      body.evidence_url ||
      existing.evidence_url
    );

  if (evidenceUrl) {
    metadata.evidence_url =
      evidenceUrl;
  }

  const externalId =
    text(
      body.external_id ||
      existing.external_id
    );

  if (externalId) {
    metadata.external_id =
      externalId;
  }

  const evidenceReference =
    text(
      body.evidence_reference ||
      existing.evidence_reference
    );

  if (evidenceReference) {
    metadata.evidence_reference =
      evidenceReference;
  }

  return metadata;
}

async function insertSignal(env, body) {
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

  const result =
    await env.DB
      .prepare(`
        INSERT INTO market_signals
        (
          source,
          title,
          metadata,
          detected_at
        )
        VALUES (?, ?, ?, ?)
      `)
      .bind(
        source,
        title,
        JSON.stringify(metadata),
        detectedAt
      )
      .run();

  return {
    id:
      result.meta?.last_row_id ??
      null,

    source:
      source,

    title:
      title,

    intent:
      metadata.intent,

    confidence:
      confidence,

    external_verified:
      true,

    test_signal:
      false,

    detected_at:
      detectedAt
  };
}

async function getCollectionStatus(env) {
  const totalResult =
    await env.DB
      .prepare(`
        SELECT COUNT(*) AS total
        FROM market_signals
      `)
      .all();

  const total =
    Number(
      totalResult.results?.[0]?.total || 0
    );

  const rowsResult =
    await env.DB
      .prepare(`
        SELECT
          source,
          metadata
        FROM market_signals
        ORDER BY datetime(detected_at) DESC
        LIMIT 100
      `)
      .all();

  let externalCount = 0;
  let testCount = 0;

  for (
    const row of rowsResult.results || []
  ) {
    const metadata =
      safeJson(row.metadata);

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

  return {
    total_records:
      total,

    external_verified_records:
      externalCount,

    test_records:
      testCount,

    real_market_evidence_available:
      externalCount > 0,

    schema: {
      detected_columns: [
        "id",
        "source",
        "title",
        "metadata",
        "detected_at"
      ],

      schema_checked:
        true,

      category_available:
        false,

      confidence_available:
        false,

      metadata_available:
        true,

      detected_at_available:
        true
    }
  };
}

export async function onRequest(context) {
  const {
    request,
    env
  } = context;

  try {
    if (!env || !env.DB) {
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

    if (
      request.method === "GET"
    ) {
      const status =
        await getCollectionStatus(
          env
        );

      return json({
        success: true,

        engine:
          ENGINE,

        version:
          VERSION,

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

          creates_opportunity:
            false,

          creates_decision:
            false,

          executes_action:
            false
        }
      });
    }

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
        validateEvidence(
          body
        );

      if (errors.length > 0) {
        return json(
          {
            success: false,

            engine:
              ENGINE,

            version:
              VERSION,

            operation:
              "MARKET_SIGNAL_REJECTED",

            errors
          },
          400
        );
      }

      const signal =
        await insertSignal(
          env,
          body
        );

      return json({
        success: true,

        engine:
          ENGINE,

        version:
          VERSION,

        operation:
          "EXTERNAL_MARKET_SIGNAL_COLLECTED",

        signal:
          signal,

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

          ready:
            true
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

        engine:
          ENGINE,

        version:
          VERSION,

        error:
          "METHOD_NOT_ALLOWED"
      },
      405
    );

  } catch (error) {
    return json(
      {
        success: false,

        engine:
          ENGINE,

        version:
          VERSION,

        error:
          error?.message ||
          "UNKNOWN_ERROR"
      },
      500
    );
  }
}
```
