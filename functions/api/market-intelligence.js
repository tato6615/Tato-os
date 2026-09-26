// TATO-OS
// Market Intelligence V1.0
// Route: /api/market-intelligence
//
// Business Layer:
//
// Market
//   ↓
// Market Intelligence
//   ↓
// Opportunity Engine
//
// Market Intelligence DOES:
// - read market_signals
// - normalize market intent
// - evaluate signal freshness
// - evaluate evidence strength
// - cluster related signals
// - identify commercial market signals
// - prepare handoff to Opportunity Engine
//
// Market Intelligence DOES NOT:
// - invent market data
// - create opportunities automatically
// - change business strategy
// - create decisions
// - execute actions
//
// Source of truth:
// - D1 market_signals

const MARKET_INTELLIGENCE_ENGINE = "MARKET_INTELLIGENCE_V1";
const MARKET_INTELLIGENCE_VERSION = "1.0";

const COMMERCIAL_INTENTS = new Set([
  "COMMERCIAL",
  "CONSIDERATION",
  "PLANNING"
]);

const TEST_SOURCES = new Set([
  "test",
  "demo",
  "mock",
  "sample",
  "fixture"
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8"
    }
  });
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

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeIntent(signal) {
  const metadata = safeJson(signal.metadata, {});

  const intent =
    metadata.intent ||
    metadata.purchase_intent ||
    metadata.user_intent ||
    metadata.market_intent ||
    "";

  const normalized = normalizeText(intent);

  if (
    normalized.includes("commercial") ||
    normalized.includes("ซื้อ") ||
    normalized.includes("buy") ||
    normalized.includes("purchase")
  ) {
    return "COMMERCIAL";
  }

  if (
    normalized.includes("consider") ||
    normalized.includes("comparison") ||
    normalized.includes("compare") ||
    normalized.includes("เปรียบเทียบ")
  ) {
    return "CONSIDERATION";
  }

  if (
    normalized.includes("planning") ||
    normalized.includes("plan") ||
    normalized.includes("วางแผน")
  ) {
    return "PLANNING";
  }

  return "UNKNOWN";
}

function normalizeSource(signal) {
  const metadata = safeJson(signal.metadata, {});

  return (
    signal.source ||
    metadata.source ||
    metadata.source_type ||
    metadata.platform ||
    "unknown"
  );
}

function isTestSignal(signal) {
  const metadata = safeJson(signal.metadata, {});

  const explicitTest =
    metadata.test === true ||
    metadata.demo === true ||
    metadata.mock === true ||
    metadata.sample === true ||
    metadata.fixture === true;

  if (explicitTest) {
    return true;
  }

  const source = normalizeText(normalizeSource(signal));

  return TEST_SOURCES.has(source);
}

function parseDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function freshness(signal) {
  const detectedAt =
    parseDate(signal.detected_at) ||
    parseDate(signal.created_at);

  if (!detectedAt) {
    return {
      score: 0,
      status: "UNKNOWN",
      age_hours: null
    };
  }

  const ageHours =
    Math.max(
      0,
      Date.now() - detectedAt.getTime()
    ) / (1000 * 60 * 60);

  if (ageHours <= 24) {
    return {
      score: 1,
      status: "FRESH",
      age_hours: Number(ageHours.toFixed(2))
    };
  }

  if (ageHours <= 72) {
    return {
      score: 0.8,
      status: "RECENT",
      age_hours: Number(ageHours.toFixed(2))
    };
  }

  if (ageHours <= 168) {
    return {
      score: 0.5,
      status: "AGING",
      age_hours: Number(ageHours.toFixed(2))
    };
  }

  return {
    score: 0.2,
    status: "STALE",
    age_hours: Number(ageHours.toFixed(2))
  };
}

function confidenceScore(signal) {
  const value = Number(signal.confidence);

  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value > 1 && value <= 100) {
    return Math.max(0, Math.min(1, value / 100));
  }

  return Math.max(0, Math.min(1, value));
}

function sourceDiversityScore(signals) {
  const sources = new Set();

  for (const signal of signals) {
    const source = normalizeSource(signal);

    if (source && source !== "unknown") {
      sources.add(normalizeText(source));
    }
  }

  if (sources.size >= 4) return 1;
  if (sources.size === 3) return 0.9;
  if (sources.size === 2) return 0.75;
  if (sources.size === 1) return 0.5;

  return 0;
}

function evidenceScore(signal, relatedSignals) {
  const confidence = confidenceScore(signal);
  const fresh = freshness(signal);

  const diversity = sourceDiversityScore(
    relatedSignals
  );

  const score =
    confidence * 0.45 +
    fresh.score * 0.30 +
    diversity * 0.25;

  return Number(
    Math.max(0, Math.min(1, score)).toFixed(3)
  );
}

function signalKey(signal) {
  const metadata = safeJson(signal.metadata, {});

  const keyword =
    metadata.keyword ||
    metadata.market_keyword ||
    metadata.topic ||
    signal.category ||
    "unknown";

  const title =
    signal.title ||
    metadata.title ||
    "";

  return `${normalizeText(keyword)}|${normalizeText(title)}`;
}

function buildClusters(signals) {
  const clusters = new Map();

  for (const signal of signals) {
    const key = signalKey(signal);

    if (!clusters.has(key)) {
      clusters.set(key, []);
    }

    clusters.get(key).push(signal);
  }

  return [...clusters.entries()].map(
    ([key, items]) => {
      const sources = [
        ...new Set(
          items.map(normalizeSource)
        )
      ];

      const commercialCount =
        items.filter(signal =>
          COMMERCIAL_INTENTS.has(
            normalizeIntent(signal)
          )
        ).length;

      const verifiedCount =
        items.filter(
          signal => !isTestSignal(signal)
        ).length;

      const latestDate = items
        .map(signal =>
          parseDate(signal.detected_at)
        )
        .filter(Boolean)
        .sort((a, b) => b - a)[0];

      const latestSignal =
        latestDate
          ? items.find(signal => {
              const date = parseDate(
                signal.detected_at
              );

              return (
                date &&
                date.getTime() ===
                  latestDate.getTime()
              );
            })
          : items[0];

      const evidence = latestSignal
        ? evidenceScore(
            latestSignal,
            items
          )
        : 0;

      return {
        cluster_key: key,
        signal_count: items.length,
        verified_signal_count: verifiedCount,
        commercial_signal_count: commercialCount,
        source_count: sources.length,
        sources,
        latest_detected_at:
          latestDate
            ? latestDate.toISOString()
            : null,
        evidence_score: evidence
      };
    }
  );
}

function classifyState({
  totalSignals,
  verifiedSignals,
  commercialSignals,
  strongestEvidence
}) {
  if (totalSignals === 0) {
    return "NO_DATA";
  }

  if (verifiedSignals === 0) {
    return "WEAK_SIGNAL";
  }

  if (
    commercialSignals >= 2 &&
    strongestEvidence >= 0.65
  ) {
    return "COMMERCIAL_SIGNAL";
  }

  if (
    commercialSignals >= 1 &&
    strongestEvidence >= 0.45
  ) {
    return "EMERGING_SIGNAL";
  }

  return "WEAK_SIGNAL";
}

function opportunityHandoff(state, clusters) {
  if (
    state !== "COMMERCIAL_SIGNAL"
  ) {
    return {
      ready: false,
      next_layer: "MARKET_SIGNAL_COLLECTION",
      reason:
        "Commercial market evidence is not yet strong enough for Opportunity Engine."
    };
  }

  const candidates = clusters
    .filter(cluster =>
      cluster.commercial_signal_count >= 2 &&
      cluster.verified_signal_count >= 2 &&
      cluster.evidence_score >= 0.65
    )
    .sort(
      (a, b) =>
        b.evidence_score -
        a.evidence_score
    );

  if (candidates.length === 0) {
    return {
      ready: false,
      next_layer: "MARKET_SIGNAL_COLLECTION",
      reason:
        "Overall market state is commercial, but no verified cluster currently meets the Opportunity Engine threshold."
    };
  }

  return {
    ready: true,
    next_layer: "OPPORTUNITY_ENGINE_V1",
    candidate_clusters: candidates
  };
}

async function readMarketSignals(env) {
  const result = await env.DB.prepare(`
    SELECT
      id,
      source,
      category,
      title,
      confidence,
      metadata,
      detected_at,
      created_at
    FROM market_signals
    ORDER BY
      COALESCE(detected_at, created_at) DESC
    LIMIT 100
  `).all();

  return result.results || [];
}

async function createMarketSignal(env, body) {
  const source =
    body.source ||
    body.source_type ||
    null;

  const category =
    body.category ||
    "MARKET";

  const title =
    body.title ||
    null;

  const confidence =
    body.confidence ??
    null;

  const metadata =
    body.metadata ||
    {};

  const detectedAt =
    body.detected_at ||
    new Date().toISOString();

  if (!source) {
    return {
      error: "source_required"
    };
  }

  if (!title) {
    return {
      error: "title_required"
    };
  }

  const result = await env.DB.prepare(`
    INSERT INTO market_signals (
      source,
      category,
      title,
      confidence,
      metadata,
      detected_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `)
    .bind(
      source,
      category,
      title,
      confidence,
      JSON.stringify(metadata),
      detectedAt
    )
    .run();

  return {
    success: true,
    id: result.meta?.last_row_id || null
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
          error: "DB_BINDING_NOT_FOUND",
          engine:
            MARKET_INTELLIGENCE_ENGINE
        },
        500
      );
    }

    const url =
      new URL(request.url);

    if (request.method === "POST") {
      let body;

      try {
        body = await request.json();
      } catch {
        return json(
          {
            success: false,
            error: "INVALID_JSON"
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
            success: false,
            error: created.error
          },
          400
        );
      }

      return json({
        success: true,
        engine:
          MARKET_INTELLIGENCE_ENGINE,
        version:
          MARKET_INTELLIGENCE_VERSION,
        operation:
          "MARKET_SIGNAL_CREATED",
        result: created,
        handoff:
          "MARKET_INTELLIGENCE_V1"
      });
    }

    if (request.method !== "GET") {
      return json(
        {
          success: false,
          error: "METHOD_NOT_ALLOWED"
        },
        405
      );
    }

    const signals =
      await readMarketSignals(env);

    const analyzedSignals =
      signals.map(signal => {
        const relatedSignals =
          signals.filter(
            candidate =>
              signalKey(candidate) ===
              signalKey(signal)
          );

        const intent =
          normalizeIntent(signal);

        const freshnessData =
          freshness(signal);

        const testData =
          isTestSignal(signal);

        const evidence =
          evidenceScore(
            signal,
            relatedSignals
          );

        return {
          id: signal.id,
          source:
            normalizeSource(signal),
          category:
            signal.category || null,
          title:
            signal.title || null,
          intent,
          confidence:
            confidenceScore(signal),
          freshness:
            freshnessData,
          evidence_score:
            evidence,
          data_quality: {
            test_signal: testData,
            database_record: true,
            externally_verified:
              !testData
          },
          detected_at:
            signal.detected_at ||
            signal.created_at ||
            null
        };
      });

    const verifiedSignals =
      analyzedSignals.filter(
        signal =>
          !signal.data_quality.test_signal
      );

    const commercialSignals =
      verifiedSignals.filter(
        signal =>
          COMMERCIAL_INTENTS.has(
            signal.intent
          )
      );

    const strongestEvidence =
      analyzedSignals.length > 0
        ? Math.max(
            ...analyzedSignals.map(
              signal =>
                signal.evidence_score
            )
          )
        : 0;

    const state =
      classifyState({
        totalSignals:
          analyzedSignals.length,
        verifiedSignals:
          verifiedSignals.length,
        commercialSignals:
          commercialSignals.length,
        strongestEvidence
      });

    const clusters =
      buildClusters(signals);

    const handoff =
      opportunityHandoff(
        state,
        clusters
      );

    return json({
      success: true,

      engine:
        MARKET_INTELLIGENCE_ENGINE,

      version:
        MARKET_INTELLIGENCE_VERSION,

      timestamp:
        new Date().toISOString(),

      state,

      summary: {
        total_signals:
          analyzedSignals.length,

        verified_signals:
          verifiedSignals.length,

        test_signals:
          analyzedSignals.length -
          verifiedSignals.length,

        commercial_signals:
          commercialSignals.length,

        strongest_evidence_score:
          strongestEvidence,

        cluster_count:
          clusters.length
      },

      market_signals:
        analyzedSignals,

      clusters,

      opportunity_handoff:
        handoff,

      guardrails: {
        invents_market_data: false,
        uses_mock_data: false,
        test_data_can_create_commercial_signal:
          false,
        changes_strategy: false,
        creates_opportunity:
          handoff.ready,
        creates_decision: false,
        executes_action: false
      },

      data_integrity: {
        records_from_database: true,
        external_market_data_verified:
          verifiedSignals.length > 0,
        test_records_excluded_from_commercial_readiness:
          true
      },

      handoff_contract: {
        current_layer:
          "MARKET_INTELLIGENCE_V1",

        next_layer:
          handoff.next_layer,

        ready:
          handoff.ready
      }
    });
  } catch (error) {
    return json(
      {
        success: false,
        engine:
          MARKET_INTELLIGENCE_ENGINE,
        version:
          MARKET_INTELLIGENCE_VERSION,
        error:
          error?.message ||
          "UNKNOWN_ERROR"
      },
      500
    );
  }
}
