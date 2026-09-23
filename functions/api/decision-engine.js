// TATO OS — Decision Engine V1
// Route: /api/decision-engine
//
// GET  = preview decision
// POST = execute + save decision
//
// Flow:
// CONTENT_MEASUREMENT_V2.1
//        ↓
// LEARNING_AI_V1.9
//        ↓
// DECISION_ENGINE_V1
//
// Rule:
// Decision does NOT declare content winner.
// Decision does NOT execute automation.
// Decision only converts measured evidence + learning into an actionable decision.

const LAYER = "DECISION_ENGINE_V1";
const LEARNING_AGENT = "LEARNING_AI_V1.9";
const ATTRIBUTION_MODE = "CONTENT_ATTRIBUTION_V2";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function uid() {
  return crypto.randomUUID();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safeJson(value, fallback = {}) {
  if (value && typeof value === "object") return value;

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  return fallback;
}

async function first(db, sql, ...params) {
  const result = await db.prepare(sql).bind(...params).first();
  return result || null;
}

async function all(db, sql, ...params) {
  const result = await db.prepare(sql).bind(...params).all();
  return result?.results || [];
}

async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS decision_runs (
      id TEXT PRIMARY KEY,
      decision_type TEXT NOT NULL,
      decision_status TEXT NOT NULL,
      priority TEXT NOT NULL,
      content_id TEXT,
      measurement_id TEXT,
      learning_run_id TEXT,
      reason TEXT NOT NULL,
      evidence TEXT NOT NULL DEFAULT '{}',
      recommendation TEXT NOT NULL DEFAULT '{}',
      action_required INTEGER NOT NULL DEFAULT 1,
      requires_approval INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS decision_runs_status_idx
    ON decision_runs(status)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS decision_runs_content_idx
    ON decision_runs(content_id)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS decision_runs_created_idx
    ON decision_runs(created_at)
  `).run();
}

async function getLatestMeasurement(db) {
  return await first(
    db,
    `
      SELECT *
      FROM content_measurements
      WHERE attribution_mode = ?
      ORDER BY datetime(measured_at) DESC, datetime(created_at) DESC
      LIMIT 1
    `,
    ATTRIBUTION_MODE
  );
}

async function getLatestLearning(db) {
  const rows = await all(
    db,
    `
      SELECT *
      FROM ai_runs
      ORDER BY datetime(created_at) DESC
      LIMIT 50
    `
  );

  for (const row of rows) {
    const agent = String(row.agent_name || "");

    if (
      agent === LEARNING_AGENT ||
      agent.includes("LEARNING_AI_V1.9") ||
      agent.includes("LEARNING_AI")
    ) {
      const output = safeJson(row.output, {});

      return {
        row,
        output
      };
    }
  }

  return null;
}

function extractAnalysis(learning) {
  if (!learning) return {};

  const output = learning.output || {};

  if (output.ai?.analysis) {
    return safeJson(output.ai.analysis, {});
  }

  if (output.analysis) {
    return safeJson(output.analysis, {});
  }

  return {};
}

function buildMetrics(measurement) {
  return {
    attention: num(measurement?.attention),
    product_views: num(measurement?.product_views),
    clicks: num(measurement?.clicks),
    engagements: num(measurement?.engagements),
    customers: num(measurement?.customers),
    orders: num(measurement?.orders),
    revenue: num(measurement?.revenue)
  };
}

function determineEvidence(metrics) {
  const attention = metrics.attention;
  const clicks = metrics.clicks;
  const customers = metrics.customers;
  const orders = metrics.orders;
  const revenue = metrics.revenue;

  const hasAttention = attention > 0;
  const hasClick = clicks > 0;
  const hasCustomer = customers > 0;
  const hasOrder = orders > 0;
  const hasRevenue = revenue > 0;

  let level = "INSUFFICIENT";
  let confidence = "LOW";

  if (hasRevenue || orders >= 3 || customers >= 3) {
    level = "ACTIONABLE";
    confidence = "HIGH";
  } else if (
    attention >= 20 ||
    clicks >= 5 ||
    customers >= 1 ||
    orders >= 1
  ) {
    level = "DIRECTIONAL";
    confidence = "MEDIUM";
  } else if (hasAttention || hasClick) {
    level = "EARLY_SIGNAL";
    confidence = "LOW";
  }

  return {
    level,
    confidence,
    has_attention: hasAttention,
    has_click: hasClick,
    has_customer: hasCustomer,
    has_order: hasOrder,
    has_revenue: hasRevenue
  };
}

function decide(metrics, analysis) {
  const evidence = determineEvidence(metrics);

  let decisionType = "CONTINUE_MEASUREMENT";
  let decisionStatus = "PENDING";
  let priority = "LOW";
  let reason = "";
  let action = "COLLECT_MORE_DATA";
  let description = "";

  if (evidence.level === "ACTIONABLE") {
    decisionType = "SCALE_OR_ITERATE";
    decisionStatus = "READY";
    priority = "HIGH";

    if (metrics.revenue > 0 || metrics.orders > 0) {
      action = "ITERATE_ON_CONVERTING_PATTERN";
      reason = "There is verified downstream conversion evidence.";
      description =
        "Use the observed converting pattern as the basis for the next controlled iteration.";
    } else {
      action = "ITERATE";
      reason = "The content has sufficient behavioral evidence for a controlled iteration.";
      description =
        "Create a controlled variation while preserving the strongest observed signal.";
    }
  } else if (evidence.level === "DIRECTIONAL") {
    decisionType = "OPTIMIZE";
    decisionStatus = "READY";
    priority = "MEDIUM";
    action = "OPTIMIZE_NEXT_VARIATION";

    reason =
      "The content has directional evidence but not enough downstream evidence for a strong conversion conclusion.";

    description =
      "Create a controlled variation focused on improving the next measurable funnel step.";
  } else if (evidence.level === "EARLY_SIGNAL") {
    decisionType = "CONTINUE_MEASUREMENT";
    decisionStatus = "PENDING";
    priority = "MEDIUM";
    action = "COLLECT_MORE_DATA";

    reason =
      "The content has an early attention/click signal, but the sample is too small to justify a major content decision.";

    description =
      "Continue collecting behavior before making a strong optimization or scaling decision.";
  } else {
    decisionType = "HOLD";
    decisionStatus = "PENDING";
    priority = "LOW";
    action = "COLLECT_DATA";

    reason =
      "There is not enough measurable evidence to make a reliable content decision.";

    description =
      "Keep the content under measurement until meaningful behavior is observed.";
  }

  const learningNextAction =
    analysis?.next_action?.type ||
    analysis?.next_content?.action ||
    null;

  return {
    evidence,
    decision: {
      type: decisionType,
      status: decisionStatus,
      priority,
      action,
      reason,
      description,
      learning_signal: learningNextAction
    }
  };
}

function buildDecision(measurement, learningRecord) {
  const metrics = buildMetrics(measurement);
  const analysis = extractAnalysis(learningRecord);

  const result = decide(metrics, analysis);

  const evidence = {
    measurement_id: measurement?.id || null,
    content_id: measurement?.content_id || null,
    attribution_mode: measurement?.attribution_mode || null,
    metrics,
    conversion: {
      attention_to_view: num(measurement?.conversion_rate),
      view_to_click: 0,
      click_to_customer: 0,
      customer_to_order: 0
    },
    evidence_level: result.evidence.level,
    evidence_confidence: result.evidence.confidence
  };

  return {
    content: {
      id: measurement?.content_id || null,
      title: measurement?.content_title || null
    },

    measurement: {
      id: measurement?.id || null,
      measured_at: measurement?.measured_at || null,
      attribution_mode: measurement?.attribution_mode || null
    },

    metrics,

    evidence: result.evidence,

    decision: result.decision,

    recommendation: {
      action: result.decision.action,
      reason: result.decision.reason,
      description: result.decision.description,
      next_content: analysis?.next_content || null
    },

    learning_reference: learningRecord
      ? {
          run_id: learningRecord.row?.id || null,
          agent_name: learningRecord.row?.agent_name || null
        }
      : null,

    diagnostic: {
      measurement_source: "content_measurements",
      learning_source: learningRecord ? "ai_runs" : "NONE",
      attribution_mode: ATTRIBUTION_MODE,
      winner_declared: false
    }
  };
}

async function load(db) {
  const measurement = await getLatestMeasurement(db);

  if (!measurement) {
    return {
      success: false,
      status: "WAITING_FOR_MEASUREMENT",
      reason: "No CONTENT_ATTRIBUTION_V2 measurement exists.",
      measurement: null,
      learning: null
    };
  }

  const learning = await getLatestLearning(db);

  if (!learning) {
    return {
      success: false,
      status: "WAITING_FOR_LEARNING",
      reason: "Measurement exists but Learning AI result was not found.",
      measurement,
      learning: null
    };
  }

  return {
    success: true,
    measurement,
    learning,
    decision: buildDecision(measurement, learning)
  };
}

async function saveDecision(db, data) {
  const decision = data.decision;

  const id = uid();
  const now = new Date().toISOString();

  await db.prepare(`
    INSERT INTO decision_runs (
      id,
      decision_type,
      decision_status,
      priority,
      content_id,
      measurement_id,
      learning_run_id,
      reason,
      evidence,
      recommendation,
      action_required,
      requires_approval,
      status,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    decision.decision.type,
    decision.decision.status,
    decision.decision.priority,
    decision.content.id,
    decision.measurement.id,
    decision.learning_reference?.run_id || null,
    decision.decision.reason,
    JSON.stringify(decision.evidence),
    JSON.stringify(decision.recommendation),
    1,
    1,
    "PENDING",
    now
  ).run();

  return {
    id,
    created_at: now,
    status: "PENDING"
  };
}

async function handle(context, execute = false) {
  const db = context.env.DB;

  if (!db) {
    return {
      success: false,
      layer: LAYER,
      error: "D1 binding DB not found"
    };
  }

  await ensureTable(db);

  const data = await load(db);

  if (!data.success) {
    return {
      success: false,
      layer: LAYER,
      mode: execute ? "execute" : "preview",
      status: data.status,
      reason: data.reason,
      measurement: data.measurement
        ? {
            id: data.measurement.id,
            content_id: data.measurement.content_id,
            attribution_mode: data.measurement.attribution_mode
          }
        : null,
      learning: null,
      winner_decision: "NOT_DECLARED_IN_DECISION_ENGINE_V1",
      next_step:
        data.status === "WAITING_FOR_MEASUREMENT"
          ? "Create CONTENT_ATTRIBUTION_V2 measurement first."
          : "Save Learning AI result first."
    };
  }

  let saved = null;

  if (execute) {
    saved = await saveDecision(db, data);
  }

  return {
    success: true,
    layer: LAYER,
    mode: execute ? "execute" : "preview",
    status: data.decision.decision.status,
    decision: data.decision,
    saved,
    winner_decision: "NOT_DECLARED_IN_DECISION_ENGINE_V1",
    next_step: execute
      ? "Decision saved. Proceed to Action Layer."
      : "Decision preview ready. POST to save Decision."
  };
}

export async function onRequestGet(context) {
  try {
    return json(await handle(context, false));
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        error: error?.message || String(error)
      },
      500
    );
  }
}

export async function onRequestPost(context) {
  try {
    return json(await handle(context, true));
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        error: error?.message || String(error)
      },
      500
    );
  }
}
