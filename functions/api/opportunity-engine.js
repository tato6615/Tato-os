// TATO-OS
// Opportunity Engine V1.0
// Route: /api/opportunity-engine
//
// Pipeline:
//
// Market Signal Collection
//          ↓
// Market Intelligence V1.1
//          ↓
// Opportunity Engine V1.0
//          ↓
// Decision Layer
//
// Opportunity Engine DOES:
// - read verified market signals from D1
// - identify commercially supported market themes
// - aggregate independent external evidence
// - create structured opportunity candidates
// - preserve evidence and source traceability
//
// Opportunity Engine DOES NOT:
// - invent market data
// - treat test data as evidence
// - declare strategy
// - create decisions
// - execute actions
// - claim revenue
//
// Commercial readiness contract:
// AT_LEAST_2_INDEPENDENT_EXTERNAL_SOURCES
// AND evidence_score >= 0.70

const ENGINE = "OPPORTUNITY_ENGINE_V1";
const VERSION = "1.0";

const MIN_SOURCE_COUNT = 2;
const MIN_EVIDENCE_SCORE = 0.70;

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function safeParse(value) {
  if (!value) return {};

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isTestSignal(row) {
  const source = normalizeText(row.source);
  const signalType = normalizeText(row.signal_type);
  const keyword = normalizeText(row.keyword);
  const title = normalizeText(row.title);
  const content = normalizeText(row.content);
  const metadata = safeParse(row.metadata);

  if (metadata.test === true) return true;
  if (metadata.test_signal === true) return true;
  if (metadata.external_source === false) return true;

  if (source === "test") return true;
  if (source.includes("test")) return true;
  if (signalType.includes("test")) return true;
  if (keyword.includes("test")) return true;
  if (title.includes("test")) return true;
  if (content.includes("test-market")) return true;

  return false;
}

function isExternalVerified(row) {
  const metadata = safeParse(row.metadata);

  if (metadata.external_verified === true) return true;
  if (metadata.external_source === true) return true;

  return false;
}

function getIntent(row) {
  const metadata = safeParse(row.metadata);

  if (metadata.intent) {
    return String(metadata.intent).toUpperCase();
  }

  if (row.signal_type) {
    const type = String(row.signal_type).toUpperCase();

    if (
      type.includes("COMMERCIAL") ||
      type.includes("DEMAND") ||
      type.includes("MARKET")
    ) {
      return "COMMERCIAL";
    }
  }

  return "UNKNOWN";
}

function deriveMarketTheme(row) {
  const metadata = safeParse(row.metadata);

  if (metadata.market_theme) {
    return normalizeText(metadata.market_theme);
  }

  const text = [
    row.source,
    row.keyword,
    row.title,
    row.content,
    metadata.topic,
    metadata.market
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (text.includes("coffee")) return "coffee";

  return normalizeText(row.keyword) || "unknown";
}

function deriveSubTheme(row) {
  const metadata = safeParse(row.metadata);

  if (metadata.sub_theme) {
    return normalizeText(metadata.sub_theme);
  }

  const text = [
    row.keyword,
    row.title,
    row.content,
    metadata.topic,
    metadata.subcategory,
    metadata.signal
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    text.includes("specialty") ||
    text.includes("single-origin") ||
    text.includes("single origin")
  ) {
    return "specialty coffee";
  }

  if (
    text.includes("import") ||
    text.includes("export") ||
    text.includes("trade")
  ) {
    return "coffee trade";
  }

  return "general market";
}

function freshnessScore(detectedAt) {
  if (!detectedAt) {
    return {
      score: 0,
      status: "UNKNOWN",
      age_hours: null
    };
  }

  const timestamp = new Date(detectedAt).getTime();

  if (!Number.isFinite(timestamp)) {
    return {
      score: 0,
      status: "UNKNOWN",
      age_hours: null
    };
  }

  const ageHours = Math.max(
    0,
    (Date.now() - timestamp) / (1000 * 60 * 60)
  );

  if (ageHours <= 24) {
    return {
      score: 1,
      status: "FRESH",
      age_hours: Number(ageHours.toFixed(2))
    };
  }

  if (ageHours <= 72) {
    return {
      score: 0.75,
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
    score: 0.25,
    status: "OLD",
    age_hours: Number(ageHours.toFixed(2))
  };
}

function baseEvidenceScore(row) {
  const externalVerified = isExternalVerified(row);
  const intent = getIntent(row);
  const freshness = freshnessScore(row.detected_at);

  let score = 0.25;

  if (externalVerified) score += 0.35;
  if (intent === "COMMERCIAL") score += 0.20;
  if (freshness.score >= 1) score += 0.10;
  else if (freshness.score >= 0.75) score += 0.05;

  return Math.min(1, Number(score.toFixed(3)));
}

function calculateEvidenceScore(rows, sourceCount) {
  if (!rows.length) return 0;

  const values = rows.map((row) => baseEvidenceScore(row));

  const average =
    values.reduce((sum, value) => sum + value, 0) / values.length;

  let score = average;

  if (sourceCount >= 2) {
    score += 0.25;
  }

  if (sourceCount >= 3) {
    score += 0.05;
  }

  return Math.min(1, Number(score.toFixed(3)));
}

function buildOpportunityType(subThemes) {
  const text = subThemes.join(" ").toLowerCase();

  if (
    text.includes("specialty") ||
    text.includes("single-origin")
  ) {
    return "SPECIALTY_COFFEE_DEMAND";
  }

  if (
    text.includes("trade") ||
    text.includes("import") ||
    text.includes("export")
  ) {
    return "COFFEE_MARKET_EXPANSION";
  }

  return "COFFEE_MARKET_DEMAND";
}

function buildOpportunityTitle(theme, opportunityType) {
  if (opportunityType === "SPECIALTY_COFFEE_DEMAND") {
    return (
      "Growing opportunity around specialty and single-origin coffee demand in " +
      theme
    );
  }

  if (opportunityType === "COFFEE_MARKET_EXPANSION") {
    return (
      "Growing commercial opportunity in the " +
      theme +
      " market"
    );
  }

  return (
    "Commercial opportunity emerging from " +
    theme +
    " market demand"
  );
}

function buildWhyNow(rows, sourceCount, evidenceScore) {
  const latest = rows
    .map((row) => row.detected_at)
    .filter(Boolean)
    .sort()
    .reverse()[0];

  return {
    reason:
      "The same commercial market theme is supported by multiple independent external sources.",
    independent_external_sources: sourceCount,
    evidence_score: evidenceScore,
    latest_detected_at: latest || null
  };
}

function buildAffectedCustomer(theme, subThemes) {
  if (theme === "coffee") {
    return {
      primary: "coffee consumers and coffee businesses",
      relevant_segments: [
        "specialty coffee customers",
        "single-origin coffee customers",
        "coffee shops",
        "coffee-focused businesses"
      ],
      basis: "Derived from the observed market theme and source sub-themes."
    };
  }

  return {
    primary: "market participants in " + theme,
    relevant_segments: subThemes,
    basis: "Derived from observed market signals."
  };
}

function buildOpportunity(rows, cluster) {
  const opportunityType = buildOpportunityType(cluster.sub_themes);

  return {
    opportunity_id:
      "opp-" +
      cluster.cluster_key.replace(/[^a-z0-9]+/gi, "-") +
      "-" +
      Date.now(),

    market_theme: cluster.cluster_key,

    opportunity_type: opportunityType,

    title: buildOpportunityTitle(
      cluster.cluster_key,
      opportunityType
    ),

    market_signal: {
      signal_count: rows.length,
      verified_signal_count: rows.filter(isExternalVerified).length,
      commercial_signal_count: rows.filter(
        (row) => getIntent(row) === "COMMERCIAL"
      ).length
    },

    evidence: {
      independent_external_sources: cluster.source_count,
      sources: cluster.sources,
      evidence_score: cluster.evidence_score,
      requirement:
        "AT_LEAST_2_INDEPENDENT_EXTERNAL_SOURCES_FOR_COMMERCIAL_READINESS"
    },

    sub_themes: cluster.sub_themes,

    why_now: buildWhyNow(
      rows,
      cluster.source_count,
      cluster.evidence_score
    ),

    affected_customer: buildAffectedCustomer(
      cluster.cluster_key,
      cluster.sub_themes
    ),

    potential_value: {
      status: "NOT_QUANTIFIED",
      reason:
        "Opportunity Engine does not invent revenue, market size, or financial value."
    },

    validation_status:
      cluster.source_count >= MIN_SOURCE_COUNT &&
      cluster.evidence_score >= MIN_EVIDENCE_SCORE
        ? "COMMERCially_SUPPORTED"
        : "INSUFFICIENT_EVIDENCE",

    next_layer: "DECISION_LAYER",

    guardrails: {
      invented_market_data: false,
      test_data_used_as_evidence: false,
      strategy_declared: false,
      decision_created: false,
      action_created: false,
      execution_started: false
    },

    source_traceability: rows.map((row) => ({
      id: row.id || null,
      source: row.source || null,
      title: row.title || null,
      url: row.url || null,
      detected_at: row.detected_at || null,
      externally_verified: isExternalVerified(row),
      intent: getIntent(row),
      sub_theme: deriveSubTheme(row)
    }))
  };
}

export async function onRequestGet(context) {
  const { env } = context;

  if (!env || !env.DB) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: "D1 binding DB is not available"
      },
      500
    );
  }

  try {
    const schemaResult = await env.DB
      .prepare("PRAGMA table_info(market_signals)")
      .all();

    const columns = (schemaResult.results || []).map(
      (column) => column.name
    );

    if (!columns.length) {
      return json(
        {
          success: false,
          engine: ENGINE,
          version: VERSION,
          error: "market_signals table not found"
        },
        500
      );
    }

    const requiredColumns = [
      "source",
      "title",
      "metadata",
      "detected_at"
    ];

    const missingColumns = requiredColumns.filter(
      (column) => !columns.includes(column)
    );

    if (missingColumns.length) {
      return json(
        {
          success: false,
          engine: ENGINE,
          version: VERSION,
          error: "Required market_signals columns are missing",
          missing_columns: missingColumns,
          detected_columns: columns
        },
        500
      );
    }

    const selectedColumns = [
      "id",
      "source",
      "signal_type",
      "keyword",
      "title",
      "content",
      "url",
      "score",
      "metadata",
      "detected_at"
    ].filter((column) => columns.includes(column));

    const sql =
      "SELECT " +
      selectedColumns.join(", ") +
      " FROM market_signals ORDER BY detected_at DESC";

    const result = await env.DB
      .prepare(sql)
      .all();

    const allRows = result.results || [];

    const externalVerifiedRows = allRows.filter((row) => {
      return (
        !isTestSignal(row) &&
        isExternalVerified(row)
      );
    });

    const commercialRows = externalVerifiedRows.filter(
      (row) => getIntent(row) === "COMMERCIAL"
    );

    const clustersMap = {};

    for (const row of commercialRows) {
      const theme = deriveMarketTheme(row);

      if (!clustersMap[theme]) {
        clustersMap[theme] = [];
      }

      clustersMap[theme].push(row);
    }

    const clusters = Object.entries(clustersMap).map(
      ([theme, rows]) => {
        const sourceSet = new Set(
          rows
            .map((row) => String(row.source || "").trim())
            .filter(Boolean)
        );

        const subThemes = [
          ...new Set(rows.map(deriveSubTheme))
        ];

        const evidenceScore = calculateEvidenceScore(
          rows,
          sourceSet.size
        );

        return {
          cluster_key: theme,
          signal_count: rows.length,
          verified_signal_count: rows.filter(
            isExternalVerified
          ).length,
          commercial_signal_count: rows.filter(
            (row) => getIntent(row) === "COMMERCIAL"
          ).length,
          source_count: sourceSet.size,
          sources: [...sourceSet],
          sub_themes: subThemes,
          latest_detected_at:
            rows
              .map((row) => row.detected_at)
              .filter(Boolean)
              .sort()
              .reverse()[0] || null,
          evidence_score: evidenceScore
        };
      }
    );

    const commerciallyReadyClusters = clusters.filter(
      (cluster) =>
        cluster.source_count >= MIN_SOURCE_COUNT &&
        cluster.evidence_score >= MIN_EVIDENCE_SCORE
    );

    const opportunities = [];

    for (const cluster of commerciallyReadyClusters) {
      const rows = commercialRows.filter(
        (row) =>
          deriveMarketTheme(row) === cluster.cluster_key
      );

      opportunities.push(
        buildOpportunity(rows, cluster)
      );
    }

    const strongestOpportunity =
      opportunities.length > 0
        ? opportunities.reduce((best, current) => {
            if (!best) return current;

            return current.evidence.evidence_score >
              best.evidence.evidence_score
              ? current
              : best;
          }, null)
        : null;

    const opportunityReady =
      commerciallyReadyClusters.length > 0;

    return json({
      success: true,

      engine: ENGINE,
      version: VERSION,
      timestamp: new Date().toISOString(),

      state: opportunityReady
        ? "OPPORTUNITY_IDENTIFIED"
        : "WAITING_FOR_MARKET_EVIDENCE",

      summary: {
        total_market_signal_records: allRows.length,
        external_verified_records:
          externalVerifiedRows.length,
        commercial_external_records:
          commercialRows.length,
        commercially_ready_clusters:
          commerciallyReadyClusters.length,
        opportunity_candidates:
          opportunities.length,
        strongest_evidence_score:
          strongestOpportunity
            ? strongestOpportunity.evidence.evidence_score
            : 0
      },

      market_evidence: {
        independent_external_sources:
          strongestOpportunity
            ? strongestOpportunity.evidence
                .independent_external_sources
            : 0,

        test_signals_excluded: true,

        commercial_readiness_requirement:
          "AT_LEAST_2_INDEPENDENT_EXTERNAL_SOURCES_FOR_COMMERCIAL_READINESS"
      },

      opportunities,

      strongest_opportunity: strongestOpportunity,

      handoff: {
        ready: opportunityReady,
        next_layer: opportunityReady
          ? "DECISION_LAYER"
          : "MARKET_SIGNAL_COLLECTION",
        reason: opportunityReady
          ? "A commercially supported market opportunity has been identified from independent external evidence."
          : "No market theme currently satisfies the commercial opportunity evidence threshold."
      },

      guardrails: {
        invents_market_data: false,
        uses_mock_data: false,
        accepts_test_as_external_evidence: false,
        creates_strategy: false,
        creates_decision: false,
        executes_action: false,
        claims_revenue: false,
        claims_profit: false
      },

      data_integrity: {
        records_from_database: true,
        external_market_data_required: true,
        test_records_excluded: true,
        source_traceability_preserved: true,
        opportunity_persistence:
          "NOT_IMPLEMENTED_IN_V1"
      },

      contract: {
        current_layer: ENGINE,
        version: VERSION,
        previous_layer: "MARKET_INTELLIGENCE_V1.1",
        next_layer: "DECISION_LAYER",
        commercial_evidence_requirement:
          "AT_LEAST_2_INDEPENDENT_EXTERNAL_SOURCES",
        minimum_evidence_score: MIN_EVIDENCE_SCORE,
        minimum_source_count: MIN_SOURCE_COUNT
      }
    });
  } catch (error) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error: String(error && error.message
          ? error.message
          : error)
      },
      500
    );
  }
}
