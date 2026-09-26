// TATO-OS
// Market Intelligence V1.1
// Route: /api/market-intelligence
//
// Business Layer:
//
// External Market Evidence
//          ↓
// Market Signal Collection
//          ↓
// Market Intelligence V1.1
//          ↓
// Cross-Source Evidence
//          ↓
// Opportunity Engine
//
// V1.1 adds:
// - cross-source evidence aggregation
// - market-theme normalization
// - independent source counting
// - aggregate evidence scoring
// - D1 primary-key preservation
//
// DOES NOT:
// - invent market data
// - create opportunities
// - create decisions
// - change strategy
// - execute actions
//
// Source of truth:
// - D1 market_signals

const ENGINE = "MARKET_INTELLIGENCE_V1";
const VERSION = "1.1";

const OPPORTUNITY_ENGINE =
  "OPPORTUNITY_ENGINE_V1";

const TEST_SOURCES = new Set([
  "test",
  "demo",
  "mock",
  "sample",
  "fixture"
]);

const STOP_WORDS = new Set([
  "the",
  "and",
  "with",
  "from",
  "into",
  "market",
  "coffee",
  "thailand",
  "asia",
  "pacific",
  "marketplace",
  "continues",
  "continue",
  "showing",
  "growth",
  "reached",
  "approximately",
  "million",
  "billion",
  "year",
  "yearly",
  "increase",
  "increasing",
  "2025",
  "2026"
]);

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

function isTestSignal(row, metadata) {
  return (
    metadata.test === true ||
    metadata.demo === true ||
    metadata.mock === true ||
    metadata.sample === true ||
    metadata.fixture === true ||
    isTestSource(row.source)
  );
}

function isExternalSignal(row, metadata) {
  if (isTestSignal(row, metadata)) {
    return false;
  }

  if (metadata.external === true) {
    return true;
  }

  return false;
}

function normalizeIntent(value) {
  const raw = normalize(value);

  if (
    raw.includes("commercial") ||
    raw.includes("purchase") ||
    raw.includes("buy") ||
    raw.includes("ซื้อ")
  ) {
    return "COMMERCIAL";
  }

  if (
    raw.includes("consider") ||
    raw.includes("comparison") ||
    raw.includes("compare") ||
    raw.includes("เปรียบเทียบ")
  ) {
    return "CONSIDERATION";
  }

  if (
    raw.includes("planning") ||
    raw.includes("plan") ||
    raw.includes("วางแผน")
  ) {
    return "PLANNING";
  }

  if (
    raw.includes("informational") ||
    raw.includes("information") ||
    raw.includes("learn") ||
    raw.includes("ค้นหา") ||
    raw.includes("ข้อมูล")
  ) {
    return "INFORMATIONAL";
  }

  return "UNKNOWN";
}

function getIntent(row, metadata) {
  return normalizeIntent(
    row.intent ||
    metadata.intent ||
    metadata.purchase_intent ||
    metadata.market_intent ||
    ""
  );
}

function getTimestamp(row) {
  return (
    row.detected_at ||
    row.created_at ||
    row.created ||
    null
  );
}

function calculateFreshness(detectedAt) {
  if (!detectedAt) {
    return {
      score: 0,
      status: "UNKNOWN",
      age_hours: null
    };
  }

  const timestamp =
    new Date(detectedAt).getTime();

  if (!Number.isFinite(timestamp)) {
    return {
      score: 0,
      status: "UNKNOWN",
      age_hours: null
    };
  }

  const ageHours =
    Math.max(
      0,
      (Date.now() - timestamp) /
        3600000
    );

  let score = 1;
  let status = "FRESH";

  if (ageHours <= 24) {
    score = 1;
    status = "FRESH";
  } else if (ageHours <= 72) {
    score = 0.75;
    status = "RECENT";
  } else if (ageHours <= 168) {
    score = 0.5;
    status = "AGING";
  } else {
    score = 0.25;
    status = "STALE";
  }

  return {
    score,
    status,
    age_hours:
      Number(ageHours.toFixed(2))
  };
}

function tokenize(value) {
  return normalize(value)
    .replace(/[^a-z0-9ก-๙\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter(
      word => !STOP_WORDS.has(word)
    );
}

function containsAny(value, terms) {
  const normalized =
    normalize(value);

  return terms.some(
    term =>
      normalized.includes(
        normalize(term)
      )
  );
}

function deriveMarketTheme(row, metadata) {
  const title =
    normalize(row.title);

  const topic =
    normalize(
      metadata.topic ||
      metadata.market ||
      metadata.subcategory ||
      ""
    );

  const combined =
    `${title} ${topic}`;

  if (
    containsAny(
      combined,
      [
        "specialty",
        "single-origin",
        "single origin",
        "specialty coffee"
      ]
    )
  ) {
    return "coffee";
  }

  if (
    containsAny(
      combined,
      [
        "coffee trade",
        "coffee import",
        "coffee export",
        "coffee market",
        "coffee"
      ]
    )
  ) {
    return "coffee";
  }

  if (
    metadata.market
  ) {
    return normalize(
      metadata.market
    );
  }

  const tokens =
    tokenize(combined);

  if (tokens.length > 0) {
    return tokens
      .slice(0, 3)
      .join(" ");
  }

  return "unknown";
}

function deriveSubTheme(row, metadata) {
  const combined =
    `${normalize(row.title)} ${normalize(
      JSON.stringify(metadata)
    )}`;

  if (
    containsAny(
      combined,
      [
        "specialty",
        "single-origin",
        "single origin"
      ]
    )
  ) {
    return "specialty coffee";
  }

  if (
    containsAny(
      combined,
      [
        "import",
        "imports"
      ]
    )
  ) {
    return "coffee trade";
  }

  if (
    containsAny(
      combined,
      [
        "export",
        "exports"
      ]
    )
  ) {
    return "coffee trade";
  }

  return "general market";
}

function calculateBaseEvidence(
  row,
  metadata,
  freshness
) {
  let score = 0;

  const external =
    isExternalSignal(
      row,
      metadata
    );

  const test =
    isTestSignal(
      row,
      metadata
    );

  if (external) {
    score += 0.20;
  }

  if (!test) {
    score += 0.10;
  }

  if (
    metadata.evidence_url ||
    metadata.external_id ||
    metadata.evidence_reference
  ) {
    score += 0.15;
  }

  if (
    getIntent(row, metadata) ===
    "COMMERCIAL"
  ) {
    score += 0.10;
  }

  score +=
    freshness.score * 0.25;

  return Number(
    Math.min(1, score).toFixed(3)
  );
}

function calculateAggregateEvidence(
  signals
) {
  if (!signals.length) {
    return 0;
  }

  const sourceCount =
    new Set(
      signals.map(
        signal =>
          normalize(
            signal.source
          )
      )
    ).size;

  const commercialCount =
    signals.filter(
      signal =>
        signal.intent ===
        "COMMERCIAL"
    ).length;

  const verifiedCount =
    signals.filter(
      signal =>
        signal.data_quality
          .externally_verified
    ).length;

  const averageBase =
    signals.reduce(
      (sum, signal) =>
        sum +
        signal.base_evidence_score,
      0
    ) / signals.length;

  let score =
    averageBase * 0.45;

  if (verifiedCount >= 1) {
    score += 0.10;
  }

  if (commercialCount >= 1) {
    score += 0.10;
  }

  if (sourceCount >= 2) {
    score += 0.25;
  }

  if (sourceCount >= 3) {
    score += 0.05;
  }

  return Number(
    Math.min(1, score).toFixed(3)
  );
}

function buildMarketSignal(
  row
) {
  const metadata =
    safeJson(row.metadata);

  const testSignal =
    isTestSignal(
      row,
      metadata
    );

  const externalVerified =
    isExternalSignal(
      row,
      metadata
    );

  const intent =
    getIntent(
      row,
      metadata
    );

  const freshness =
    calculateFreshness(
      getTimestamp(row)
    );

  const marketTheme =
    deriveMarketTheme(
      row,
      metadata
    );

  const subTheme =
    deriveSubTheme(
      row,
      metadata
    );

  const baseEvidence =
    calculateBaseEvidence(
      row,
      metadata,
      freshness
    );

  return {
    id:
      row.id ??
      null,

    source:
      row.source ?? null,

    category:
      row.category ?? null,

    title:
      row.title ?? null,

    intent,

    market_theme:
      marketTheme,

    sub_theme:
      subTheme,

    confidence:
      Number(
        metadata.confidence ??
        row.confidence ??
        0
      ) || 0,

    freshness,

    base_evidence_score:
      baseEvidence,

    evidence_score:
      baseEvidence,

    data_quality: {
      test_signal:
        testSignal,

      database_record:
        true,

      externally_verified:
        externalVerified
    },

    detected_at:
      getTimestamp(row)
  };
}

function buildClusters(signals) {
  const groups = new Map();

  for (
    const signal of signals
  ) {
    const key =
      signal.market_theme ||
      "unknown";

    if (!groups.has(key)) {
      groups.set(
        key,
        []
      );
    }

    groups
      .get(key)
      .push(signal);
  }

  const clusters = [];

  for (
    const [
      clusterKey,
      group
    ] of groups
  ) {
    const commercialSignals =
      group.filter(
        signal =>
          signal.intent ===
          "COMMERCIAL"
      );

    const verifiedSignals =
      group.filter(
        signal =>
          signal.data_quality
            .externally_verified
      );

    const externalSignals =
      group.filter(
        signal =>
          signal.data_quality
            .externally_verified &&
          !signal.data_quality
            .test_signal
      );

    const sources =
      [
        ...new Set(
          externalSignals.map(
            signal =>
              signal.source
          )
        )
      ];

    const aggregateScore =
      calculateAggregateEvidence(
        externalSignals
      );

    const latest =
      group
        .map(
          signal =>
            signal.detected_at
        )
        .filter(Boolean)
        .sort()
        .reverse()[0] ||
      null;

    clusters.push({
      cluster_key:
        clusterKey,

      signal_count:
        group.length,

      verified_signal_count:
        verifiedSignals.length,

      commercial_signal_count:
        commercialSignals.length,

      source_count:
        sources.length,

      sources,

      sub_themes:
        [
          ...new Set(
            group.map(
              signal =>
                signal.sub_theme
            )
          )
        ],

      latest_detected_at:
        latest,

      evidence_score:
        aggregateScore
    });
  }

  return clusters.sort(
    (a, b) =>
      b.evidence_score -
      a.evidence_score
  );
}

function getState(
  clusters,
  verifiedSignals
) {
  const commercialExternal =
    verifiedSignals.filter(
      signal =>
        signal.intent ===
        "COMMERCIAL"
    );

  if (
    commercialExternal.length ===
    0
  ) {
    return "NO_DATA";
  }

  const strongest =
    clusters[0]?.evidence_score ||
    0;

  const strongestCluster =
    clusters[0];

  const independentSources =
    strongestCluster?.source_count ||
    0;

  if (
    independentSources >= 2 &&
    strongest >= 0.70
  ) {
    return "COMMERCIAL_SIGNAL";
  }

  if (
    strongest >= 0.50
  ) {
    return "EMERGING_SIGNAL";
  }

  return "WEAK_SIGNAL";
}

function buildOpportunityHandoff(
  clusters
) {
  const commercialClusters =
    clusters.filter(
      cluster =>
        cluster.commercial_signal_count >
          0 &&
        cluster.verified_signal_count >
          0
    );

  if (
    commercialClusters.length ===
    0
  ) {
    return {
      ready: false,
      next_layer:
        "MARKET_SIGNAL_COLLECTION",
      reason:
        "No verified commercial market evidence is available."
    };
  }

  const strongest =
    commercialClusters[0];

  if (
    strongest.source_count >= 2 &&
    strongest.evidence_score >= 0.70
  ) {
    return {
      ready: true,

      next_layer:
        OPPORTUNITY_ENGINE,

      reason:
        "Multiple independent external sources support the same commercial market theme.",

      market_theme:
        strongest.cluster_key,

      source_count:
        strongest.source_count,

      evidence_score:
        strongest.evidence_score
    };
  }

  return {
    ready: false,

    next_layer:
      "MARKET_SIGNAL_COLLECTION",

    reason:
      "Commercial market evidence exists, but cross-source evidence is not yet strong enough for Opportunity Engine.",

    market_theme:
      strongest.cluster_key,

    source_count:
      strongest.source_count,

    evidence_score:
      strongest.evidence_score
  };
}

async function getSchema(env) {
  const result =
    await env.DB
      .prepare(
        "PRAGMA table_info(market_signals)"
      )
      .all();

  return result.results || [];
}

async function getMarketSignals(env) {
  const schema =
    await getSchema(env);

  const columns =
    new Set(
      schema.map(
        column =>
          column.name
      )
    );

  const selectColumns = [
    "id",
    "source",
    "title",
    "metadata",
    "detected_at"
  ];

  if (
    columns.has("category")
  ) {
    selectColumns.push(
      "category"
    );
  }

  if (
    columns.has("confidence")
  ) {
    selectColumns.push(
      "confidence"
    );
  }

  const sql =
    `SELECT ${selectColumns.join(
      ", "
    )} FROM market_signals ORDER BY detected_at DESC LIMIT 100`;

  const result =
    await env.DB
      .prepare(sql)
      .all();

  return {
    rows:
      result.results || [],

    schema,
    
    columns
  };
}

export async function onRequest(
  context
) {
  const request =
    context.request;

  const env =
    context.env;

  try {
    if (
      !env ||
      !env.DB
    ) {
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
      request.method !== "GET"
    ) {
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
    }

    const data =
      await getMarketSignals(
        env
      );

    const rawRows =
      data.rows;

    const marketSignals =
      rawRows.map(
        row =>
          buildMarketSignal(row)
      );

    const verifiedSignals =
      marketSignals.filter(
        signal =>
          signal.data_quality
            .externally_verified
      );

    const testSignals =
      marketSignals.filter(
        signal =>
          signal.data_quality
            .test_signal
      );

    const commercialSignals =
      verifiedSignals.filter(
        signal =>
          signal.intent ===
          "COMMERCIAL"
      );

    const clusters =
      buildClusters(
        marketSignals
      );

    const state =
      getState(
        clusters,
        verifiedSignals
      );

    const opportunityHandoff =
      buildOpportunityHandoff(
        clusters
      );

    return json({
      success: true,

      engine:
        ENGINE,

      version:
        VERSION,

      timestamp:
        new Date().toISOString(),

      state,

      summary: {
        total_signals:
          marketSignals.length,

        verified_signals:
          verifiedSignals.length,

        test_signals:
          testSignals.length,

        commercial_signals:
          commercialSignals.length,

        strongest_evidence_score:
          clusters[0]
            ?.evidence_score ||
          0,

        cluster_count:
          clusters.length
      },

      schema: {
        detected_columns:
          data.schema.map(
            column =>
              column.name
          ),

        schema_checked:
          true,

        category_available:
          data.columns.has(
            "category"
          ),

        confidence_available:
          data.columns.has(
            "confidence"
          ),

        metadata_available:
          data.columns.has(
            "metadata"
          ),

        detected_at_available:
          data.columns.has(
            "detected_at"
          )
      },

      market_signals:
        marketSignals,

      clusters,

      cross_source_evidence: {
        enabled:
          true,

        independent_external_sources:
          [
            ...new Set(
              verifiedSignals.map(
                signal =>
                  signal.source
              )
            )
          ].length,

        verified_external_signals:
          verifiedSignals.length,

        commercial_external_signals:
          commercialSignals.length,

        test_signals_excluded:
          true
      },

      opportunity_handoff:
        opportunityHandoff,

      guardrails: {
        invents_market_data:
          false,

        uses_mock_data:
          false,

        test_data_can_create_commercial_signal:
          false,

        test_data_can_strengthen_cross_source_evidence:
          false,

        changes_strategy:
          false,

        creates_opportunity:
          false,

        creates_decision:
          false,

        executes_action:
          false
      },

      data_integrity: {
        records_from_database:
          true,

        external_market_data_verified:
          verifiedSignals.length >
          0,

        test_records_excluded_from_commercial_readiness:
          true,

        primary_key_preserved:
          true
      },

      handoff_contract: {
        current_layer:
          ENGINE,

        next_layer:
          opportunityHandoff.ready
            ? OPPORTUNITY_ENGINE
            : "MARKET_SIGNAL_COLLECTION",

        ready:
          opportunityHandoff.ready,

        evidence_requirement:
          "AT_LEAST_2_INDEPENDENT_EXTERNAL_SOURCES_FOR_COMMERCIAL_READINESS"
      }
    });

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
