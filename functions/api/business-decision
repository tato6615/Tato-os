// TATO-OS
// Business Decision V1.0
// Route: /api/business-decision
//
// Pipeline:
//
// Market Signal Collection
//          ↓
// Market Intelligence V1.1
//          ↓
// Opportunity Engine V1.0
//          ↓
// Business Decision V1.0
//          ↓
// Action / Execution
//
// Business Decision DOES:
// - read commercially supported market opportunities
// - evaluate opportunity evidence
// - create a testable business decision
// - define what evidence should be collected next
// - preserve source/evidence traceability
//
// Business Decision DOES NOT:
// - invent market data
// - treat test data as market evidence
// - guarantee revenue
// - execute actions
// - publish content
// - spend money
// - change strategy automatically
//
// Decision principle:
//
// Market evidence
//      ↓
// Opportunity
//      ↓
// Testable decision
//      ↓
// Real customer behavior
//      ↓
// Revenue evidence

const ENGINE = "BUSINESS_DECISION_V1";
const VERSION = "1.0";

const MIN_SOURCE_COUNT = 2;
const MIN_EVIDENCE_SCORE = 0.70;

const DECISION_CREATE_MARKET_TEST = "CREATE_MARKET_TEST";
const DECISION_WAIT_FOR_EVIDENCE = "WAIT_FOR_MARKET_EVIDENCE";

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

  return (
    metadata.external_verified === true ||
    metadata.external_source === true
  );
}

function getIntent(row) {
  const metadata = safeParse(row.metadata);

  if (metadata.intent) {
    return String(metadata.intent).toUpperCase();
  }

  const signalType = normalizeText(row.signal_type);

  if (
    signalType.includes("commercial") ||
    signalType.includes("demand") ||
    signalType.includes("market")
  ) {
    return "COMMERCIAL";
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

  if (text.includes("coffee")) {
    return "coffee";
  }

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

function calculateBaseEvidence(row) {
  let score = 0;

  if (isExternalVerified(row)) {
    score += 0.50;
  }

  if (getIntent(row) === "COMMERCIAL") {
    score += 0.25;
  }

  const freshness = freshnessScore(row.detected_at);

  if (freshness.score >= 1) {
    score += 0.25;
  } else if (freshness.score >= 0.75) {
    score += 0.15;
  } else if (freshness.score >= 0.5) {
    score += 0.05;
  }

  return Math.min(1, Number(score.toFixed(3)));
}

function buildClusters(rows) {
  const map = {};

  for (const row of rows) {
    if (isTestSignal(row)) continue;
    if (!isExternalVerified(row)) continue;
    if (getIntent(row) !== "COMMERCIAL") continue;

    const theme = deriveMarketTheme(row);

    if (!map[theme]) {
      map[theme] = [];
    }

    map[theme].push(row);
  }

  return Object.entries(map).map(([theme, themeRows]) => {
    const sourceSet = new Set(
      themeRows
        .map((row) => String(row.source || "").trim())
        .filter(Boolean)
    );

    const evidenceValues = themeRows.map(
      calculateBaseEvidence
    );

    const averageEvidence =
      evidenceValues.length > 0
        ? evidenceValues.reduce(
            (sum, value) => sum + value,
            0
          ) / evidenceValues.length
        : 0;

    let evidenceScore = averageEvidence;

    if (sourceSet.size >= 2) {
      evidenceScore += 0.25;
    }

    if (sourceSet.size >= 3) {
      evidenceScore += 0.05;
    }

    evidenceScore = Math.min(
      1,
      Number(evidenceScore.toFixed(3))
    );

    return {
      market_theme: theme,
      signal_count: themeRows.length,
      verified_signal_count: themeRows.filter(
        isExternalVerified
      ).length,
      commercial_signal_count: themeRows.filter(
        (row) => getIntent(row) === "COMMERCIAL"
      ).length,
      source_count: sourceSet.size,
      sources: [...sourceSet],
      sub_themes: [
        ...new Set(themeRows.map(deriveSubTheme))
      ],
      evidence_score: evidenceScore,
      latest_detected_at:
        themeRows
          .map((row) => row.detected_at)
          .filter(Boolean)
          .sort()
          .reverse()[0] || null,
      rows: themeRows
    };
  });
}

function determineOpportunityType(cluster) {
  const text = cluster.sub_themes
    .join(" ")
    .toLowerCase();

  if (
    text.includes("specialty") ||
    text.includes("single-origin") ||
    text.includes("single origin")
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

function buildDecisionReason(cluster) {
  return (
    "A commercially supported opportunity exists because " +
    cluster.source_count +
    " independent external sources support the same market theme, " +
    "with an evidence score of " +
    cluster.evidence_score +
    ". The next step is to validate the opportunity through real customer behavior rather than assuming market evidence will convert into revenue."
  );
}

function buildTestObjective(cluster) {
  const opportunityType =
    determineOpportunityType(cluster);

  if (opportunityType === "SPECIALTY_COFFEE_DEMAND") {
    return (
      "Test whether real customers show measurable interest " +
      "in specialty and single-origin coffee and whether that " +
      "interest progresses toward product views, purchase intent, " +
      "and actual purchase."
    );
  }

  if (
    opportunityType === "COFFEE_MARKET_EXPANSION"
  ) {
    return (
      "Test whether the observed coffee market expansion " +
      "creates measurable customer demand that can progress " +
      "from attention to product interest and purchase."
    );
  }

  return (
    "Test whether the observed coffee market signal " +
    "produces measurable customer attention, interest, " +
    "and purchase behavior."
  );
}

function buildRequiredEvidence() {
  return [
    {
      stage: "ATTENTION",
      event_types: [
        "content_view",
        "content_click"
      ],
      purpose:
        "Determine whether the opportunity attracts customer attention."
    },
    {
      stage: "INTEREST",
      event_types: [
        "engagement",
        "product_view"
      ],
      purpose:
        "Determine whether attention develops into meaningful interest."
    },
    {
      stage: "PURCHASE",
      event_types: [
        "order_created",
        "payment_completed"
      ],
      purpose:
        "Determine whether interest produces actual commercial behavior."
    },
    {
      stage: "REVENUE",
      event_types: [
        "revenue_recorded"
      ],
      purpose:
        "Measure actual monetary outcome."
    }
  ];
}

function buildDecision(cluster) {
  const commerciallyReady =
    cluster.source_count >= MIN_SOURCE_COUNT &&
    cluster.evidence_score >= MIN_EVIDENCE_SCORE;

  const opportunityType =
    determineOpportunityType(cluster);

  const decisionId =
    "decision-market-test-" +
    cluster.market_theme +
    "-" +
    Date.now();

  if (!commerciallyReady) {
    return {
      decision_id: decisionId,
      decision_type: DECISION_WAIT_FOR_EVIDENCE,
      status: "WAITING_FOR_EVIDENCE",
      market_theme: cluster.market_theme,
      opportunity_type: opportunityType,
      reason:
        "The available market evidence does not yet satisfy the commercial readiness threshold.",
      evidence: {
        source_count: cluster.source_count,
        evidence_score: cluster.evidence_score,
        minimum_source_count: MIN_SOURCE_COUNT,
        minimum_evidence_score: MIN_EVIDENCE_SCORE
      },
      required_action: "NONE",
      next_layer: "MARKET_INTELLIGENCE_V1.1"
    };
  }

  return {
    decision_id: decisionId,

    decision_type: DECISION_CREATE_MARKET_TEST,

    status: "DECISION_READY",

    priority: "MEDIUM",

    market_theme: cluster.market_theme,

    opportunity_type: opportunityType,

    decision: {
      statement:
        "Create a controlled market test to validate whether the identified market opportunity produces real customer behavior and commercial outcomes.",

      objective: buildTestObjective(cluster),

      reason: buildDecisionReason(cluster)
    },

    evidence: {
      independent_external_sources:
        cluster.source_count,

      sources: cluster.sources,

      evidence_score:
        cluster.evidence_score,

      verified_signals:
        cluster.verified_signal_count,

      commercial_signals:
        cluster.commercial_signal_count,

      test_signals_excluded: true
    },

    validation_plan: {
      objective:
        "Validate the opportunity using real customer behavior before scaling or changing strategy.",

      required_evidence:
        buildRequiredEvidence(),

      success_condition:
        "Real customer behavior must provide measurable evidence that the opportunity progresses beyond market-level interest toward product interest and purchase.",

      revenue_confirmation_required: true
    },

    affected_customer: {
      primary:
        cluster.market_theme === "coffee"
          ? "coffee consumers and coffee businesses"
          : "customers and businesses within " +
            cluster.market_theme,

      segments: cluster.sub_themes
    },

    required_action: {
      action: "CREATE_MARKET_TEST",

      execution:
        "NOT_AUTOMATIC",

      approval_required: true,

      action_owner: "HUMAN"
    },

    next_layer: "ACTION_LAYER",

    guardrails: {
      invents_market_data: false,
      treats_test_data_as_market_evidence: false,
      guarantees_revenue: false,
      changes_strategy: false,
      executes_action: false,
      spends_money: false,
      publishes_content: false
    }
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
      .prepare(
        "PRAGMA table_info(market_signals)"
      )
      .all();

    const columns =
      (schemaResult.results || []).map(
        (column) => column.name
      );

    if (!columns.length) {
      return json(
        {
          success: false,
          engine: ENGINE,
          version: VERSION,
          error:
            "market_signals table not found"
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
    ].filter((column) =>
      columns.includes(column)
    );

    const sql =
      "SELECT " +
      selectedColumns.join(", ") +
      " FROM market_signals ORDER BY detected_at DESC";

    const result = await env.DB
      .prepare(sql)
      .all();

    const rows = result.results || [];

    const clusters = buildClusters(rows);

    const readyClusters = clusters.filter(
      (cluster) =>
        cluster.source_count >=
          MIN_SOURCE_COUNT &&
        cluster.evidence_score >=
          MIN_EVIDENCE_SCORE
    );

    const decisions = readyClusters.map(
      buildDecision
    );

    const waitingClusters = clusters.filter(
      (cluster) =>
        cluster.source_count <
          MIN_SOURCE_COUNT ||
        cluster.evidence_score <
          MIN_EVIDENCE_SCORE
    );

    const waitingDecisions =
      waitingClusters.map(buildDecision);

    const allDecisions = [
      ...decisions,
      ...waitingDecisions
    ];

    const decisionReady =
      decisions.length > 0;

    return json({
      success: true,

      engine: ENGINE,

      version: VERSION,

      timestamp:
        new Date().toISOString(),

      state: decisionReady
        ? "DECISION_READY"
        : "WAITING_FOR_MARKET_EVIDENCE",

      summary: {
        total_market_signal_records:
          rows.length,

        commercially_supported_clusters:
          readyClusters.length,

        decision_candidates:
          allDecisions.length,

        actionable_decisions:
          decisions.length,

        waiting_decisions:
          waitingDecisions.length,

        strongest_evidence_score:
          readyClusters.length > 0
            ? Math.max(
                ...readyClusters.map(
                  (cluster) =>
                    cluster.evidence_score
                )
              )
            : 0
      },

      opportunity_input: {
        source_layer:
          "OPPORTUNITY_ENGINE_V1",

        commercial_readiness_requirement:
          "AT_LEAST_2_INDEPENDENT_EXTERNAL_SOURCES",

        minimum_evidence_score:
          MIN_EVIDENCE_SCORE,

        test_signals_excluded: true
      },

      decisions: allDecisions,

      strongest_decision:
        decisions.length > 0
          ? decisions.reduce(
              (best, current) => {
                if (!best) return current;

                return current.evidence
                  .evidence_score >
                  best.evidence
                    .evidence_score
                  ? current
                  : best;
              },
              null
            )
          : null,

      handoff: {
        ready: decisionReady,

        next_layer: decisionReady
          ? "ACTION_LAYER"
          : "MARKET_INTELLIGENCE_V1.1",

        reason: decisionReady
          ? "A commercially supported opportunity has been converted into a testable business decision."
          : "No commercially supported opportunity is currently ready for decision."
      },

      guardrails: {
        invents_market_data: false,

        uses_mock_data: false,

        accepts_test_as_external_evidence:
          false,

        declares_market_winner:
          false,

        guarantees_revenue:
          false,

        changes_strategy:
          false,

        executes_action:
          false,

        spends_money:
          false,

        publishes_content:
          false
      },

      data_integrity: {
        records_from_database:
          true,

        external_market_data_required:
          true,

        test_records_excluded:
          true,

        source_traceability_preserved:
          true,

        decision_persistence:
          "NOT_IMPLEMENTED_IN_V1"
      },

      contract: {
        current_layer:
          ENGINE,

        version:
          VERSION,

        previous_layer:
          "OPPORTUNITY_ENGINE_V1",

        next_layer:
          "ACTION_LAYER",

        minimum_source_count:
          MIN_SOURCE_COUNT,

        minimum_evidence_score:
          MIN_EVIDENCE_SCORE,

        human_approval_required:
          true,

        automatic_execution:
          false
      }
    });
  } catch (error) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          String(
            error &&
            error.message
              ? error.message
              : error
          )
      },
      500
    );
  }
}
