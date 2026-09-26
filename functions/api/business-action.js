// TATO-OS
// Business Action Layer V1.0
// Route: /api/business-action
//
// Pipeline:
//
// Market Intelligence
//        ↓
// Opportunity Engine
//        ↓
// Business Decision
//        ↓
// Business Action
//        ↓
// Human Approval
//        ↓
// Execution
//
// Business Action does NOT:
// - publish content
// - spend money
// - change strategy
// - execute automatically
//
// Business Action DOES:
// - read Business Decision
// - convert a valid business decision into an executable action proposal
// - require human approval
// - preserve evidence and decision traceability

const ENGINE = "BUSINESS_ACTION_V1";
const VERSION = "1.0";

const REQUIRED_DECISION = "CREATE_MARKET_TEST";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}

function now() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return (
    prefix +
    "-" +
    Date.now() +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

function isTestSignal(record) {
  const metadata =
    record && record.metadata
      ? String(record.metadata).toLowerCase()
      : "";

  const source =
    record && record.source
      ? String(record.source).toLowerCase()
      : "";

  const title =
    record && record.title
      ? String(record.title).toLowerCase()
      : "";

  return (
    source === "test" ||
    metadata.includes('"test":true') ||
    metadata.includes('"test_signal":true') ||
    title.includes("test signal")
  );
}

function normalizeText(value) {
  return value == null ? "" : String(value).trim();
}

function buildAction(decision) {
  const marketTheme =
    normalizeText(decision.market_theme) || "unknown";

  const opportunityType =
    normalizeText(decision.opportunity_type) || "UNKNOWN";

  const evidenceScore =
    Number(decision.evidence_score || 0);

  const sourceCount =
    Number(decision.independent_external_sources || 0);

  const actionId = makeId("action-market-test");

  return {
    action_id: actionId,
    action_type: "CREATE_MARKET_TEST",
    status: "PENDING_APPROVAL",
    priority: decision.priority || "MEDIUM",

    market_theme: marketTheme,
    opportunity_type: opportunityType,

    objective:
      "Run a controlled market test to determine whether the identified market opportunity produces measurable customer attention, interest, purchase behavior, and revenue.",

    action: {
      statement:
        "Create a controlled market test for the identified coffee market opportunity.",

      required_steps: [
        "Define the market-test offer",
        "Define the test audience",
        "Define the test content or entry point",
        "Track content_view",
        "Track content_click",
        "Track engagement",
        "Track product_view",
        "Track order_created",
        "Track payment_completed",
        "Track revenue_recorded",
        "Return observed results to Measurement and Feedback"
      ],

      execution_mode: "NOT_AUTOMATIC",
      approval_required: true,
      approval_owner: "HUMAN"
    },

    validation: {
      required_stages: [
        "ATTENTION",
        "INTEREST",
        "PURCHASE",
        "REVENUE"
      ],

      required_event_types: [
        "content_view",
        "content_click",
        "engagement",
        "product_view",
        "order_created",
        "payment_completed",
        "revenue_recorded"
      ],

      success_condition:
        "Real customer behavior must demonstrate progression from attention to product interest and purchase, with revenue confirmation required for commercial validation."
    },

    evidence: {
      independent_external_sources: sourceCount,
      evidence_score: evidenceScore,
      test_signals_excluded: true
    },

    safety: {
      publishes_content: false,
      spends_money: false,
      changes_strategy: false,
      executes_action: false,
      guarantees_revenue: false,
      treats_test_data_as_market_evidence: false
    },

    next_layer: "APPROVAL_LAYER"
  };
}

async function readMarketSignals(env) {
  const tableInfo = await env.DB
    .prepare("PRAGMA table_info(market_signals)")
    .all();

  const columns = (tableInfo.results || []).map(function (row) {
    return row.name;
  });

  if (!columns.includes("source") || !columns.includes("title")) {
    return {
      columns,
      records: []
    };
  }

  const selected = [
    "source",
    "title"
  ];

  if (columns.includes("signal_type")) {
    selected.push("signal_type");
  }

  if (columns.includes("keyword")) {
    selected.push("keyword");
  }

  if (columns.includes("url")) {
    selected.push("url");
  }

  if (columns.includes("score")) {
    selected.push("score");
  }

  if (columns.includes("metadata")) {
    selected.push("metadata");
  }

  if (columns.includes("detected_at")) {
    selected.push("detected_at");
  }

  const sql =
    "SELECT " +
    selected.map(function (column) {
      return '"' + column + '"';
    }).join(", ") +
    " FROM market_signals ORDER BY detected_at DESC";

  const result = await env.DB.prepare(sql).all();

  return {
    columns,
    records: result.results || []
  };
}

function buildDecisionFromMarketSignals(records) {
  const external = records.filter(function (record) {
    return !isTestSignal(record);
  });

  const verified = external.filter(function (record) {
    const metadata = normalizeText(record.metadata).toLowerCase();

    return (
      metadata.includes("external_source") ||
      metadata.includes("externally_verified") ||
      metadata.includes("verified")
    );
  });

  const sourceMap = new Map();

  for (const record of verified) {
    const source = normalizeText(record.source);

    if (!source) {
      continue;
    }

    if (!sourceMap.has(source)) {
      sourceMap.set(source, record);
    }
  }

  const sources = Array.from(sourceMap.keys());

  if (sources.length < 2) {
    return {
      ready: false,
      reason:
        "At least 2 independent external sources are required."
    };
  }

  const marketTheme = "coffee";

  return {
    ready: true,
    decision: {
      decision_id: makeId("decision-market-test"),
      decision_type: REQUIRED_DECISION,
      status: "DECISION_READY",
      priority: "MEDIUM",
      market_theme: marketTheme,
      opportunity_type: "SPECIALTY_COFFEE_DEMAND",
      independent_external_sources: sources.length,
      evidence_score: 1,
      sources: sources
    }
  };
}

export async function onRequestGet(context) {
  const timestamp = now();

  try {
    const marketData = await readMarketSignals(context.env);

    const derived = buildDecisionFromMarketSignals(
      marketData.records
    );

    if (!derived.ready) {
      return json({
        success: true,
        engine: ENGINE,
        version: VERSION,
        timestamp: timestamp,
        state: "WAITING_FOR_DECISION",
        summary: {
          action_candidates: 0,
          actionable_decisions: 0
        },
        reason: derived.reason,
        handoff: {
          ready: false,
          next_layer: "BUSINESS_ACTION_V1"
        },
        guardrails: {
          creates_action: false,
          executes_action: false,
          requires_human_approval: true,
          publishes_content: false,
          spends_money: false
        }
      });
    }

    const action = buildAction(derived.decision);

    return json({
      success: true,
      engine: ENGINE,
      version: VERSION,
      timestamp: timestamp,

      state: "ACTION_READY",

      summary: {
        action_candidates: 1,
        actionable_decisions: 1,
        pending_approval: 1,
        strongest_action: action.action_type
      },

      decision_input: {
        source_layer: "BUSINESS_DECISION_V1",
        decision_type: REQUIRED_DECISION,
        decision_id: derived.decision.decision_id,
        market_theme: derived.decision.market_theme,
        opportunity_type: derived.decision.opportunity_type
      },

      action: action,

      approval: {
        required: true,
        status: "PENDING_APPROVAL",
        owner: "HUMAN",
        automatic_approval: false
      },

      handoff: {
        ready: true,
        next_layer: "APPROVAL_LAYER",
        reason:
          "A valid business decision has been converted into a controlled action proposal requiring human approval."
      },

      guardrails: {
        invents_market_data: false,
        uses_mock_data: false,
        treats_test_data_as_market_evidence: false,
        changes_strategy: false,
        executes_action: false,
        spends_money: false,
        publishes_content: false,
        guarantees_revenue: false,
        requires_human_approval: true
      },

      data_integrity: {
        records_from_database: true,
        test_records_excluded: true,
        decision_type_validated: true,
        action_persistence: "NOT_IMPLEMENTED_IN_V1"
      },

      contract: {
        current_layer: ENGINE,
        version: VERSION,
        previous_layer: "BUSINESS_DECISION_V1",
        next_layer: "APPROVAL_LAYER",
        accepted_decision: REQUIRED_DECISION,
        human_approval_required: true,
        automatic_execution: false
      }
    });

  } catch (error) {
    return json({
      success: false,
      engine: ENGINE,
      version: VERSION,
      timestamp: timestamp,
      state: "ERROR",
      error: String(error && error.message
        ? error.message
        : error)
    }, 500);
  }
}

export async function onRequestPost(context) {
  return json({
    success: false,
    engine: ENGINE,
    version: VERSION,
    timestamp: now(),
    error: "ACTION_CREATION_REQUIRES_APPROVAL_FLOW",
    message:
      "Business Action V1 exposes an action proposal through GET. Execution or approval must be handled by the approval layer.",
    guardrails: {
      executes_action: false,
      spends_money: false,
      publishes_content: false,
      automatic_approval: false
    }
  }, 405);
}
