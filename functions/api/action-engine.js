// ============================================================
// TATO OS — ACTION ENGINE V1.2
// Decision → Action
//
// Pipeline:
// ATTENTION
// → BEHAVIOR
// → MEASUREMENT
// → LEARNING
// → DECISION
// → ACTION  ← THIS LAYER
// → APPROVAL
// → EXECUTION
// → RESULT
//
// IMPORTANT:
// - Does NOT execute actions automatically
// - Does NOT approve actions
// - Requires explicit approval
// - Prevents duplicate Action from the same Decision
// - Uses LIVE action_runs schema
// ============================================================

const LAYER = "ACTION_ENGINE_V1.2";

const ACTION_MAP = {
  CONTINUE_TRAFFIC_SIGNAL: {
    action_type: "CONTINUE_MEASUREMENT",
    operation: "MEASURE_CONTENT",
    requires_approval: 1,
  },

  OPTIMIZE_CONTENT: {
    action_type: "OPTIMIZE_CONTENT",
    operation: "OPTIMIZE_CONTENT",
    requires_approval: 1,
  },

  CREATE_CONTENT: {
    action_type: "CREATE_CONTENT",
    operation: "CREATE_CONTENT",
    requires_approval: 1,
  },

  CHANGE_STRATEGY: {
    action_type: "CHANGE_STRATEGY",
    operation: "CHANGE_STRATEGY",
    requires_approval: 1,
  },

  STOP_CONTENT: {
    action_type: "STOP_CONTENT",
    operation: "STOP_CONTENT",
    requires_approval: 1,
  },
};

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
    },
  });
}

function safeJsonParse(value, fallback = {}) {
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

function now() {
  return new Date().toISOString();
}

function id() {
  return crypto.randomUUID();
}

// ------------------------------------------------------------
// Extract action recommendation
// ------------------------------------------------------------

function resolveAction(decision) {
  const decisionType = String(decision.decision_type || "").trim();

  if (ACTION_MAP[decisionType]) {
    return {
      decision_type: decisionType,
      ...ACTION_MAP[decisionType],
    };
  }

  // Fallback: inspect recommendation.action
  const recommendation = safeJsonParse(
    decision.recommendation,
    {}
  );

  const recommendedAction = String(
    recommendation.action || ""
  )
    .trim()
    .toUpperCase();

  if (recommendedAction === "CONTINUE_MEASUREMENT") {
    return {
      decision_type: decisionType,
      action_type: "CONTINUE_MEASUREMENT",
      operation: "MEASURE_CONTENT",
      requires_approval: 1,
    };
  }

  if (recommendedAction === "OPTIMIZE_CONTENT") {
    return {
      decision_type: decisionType,
      action_type: "OPTIMIZE_CONTENT",
      operation: "OPTIMIZE_CONTENT",
      requires_approval: 1,
    };
  }

  if (recommendedAction === "CREATE_CONTENT") {
    return {
      decision_type: decisionType,
      action_type: "CREATE_CONTENT",
      operation: "CREATE_CONTENT",
      requires_approval: 1,
    };
  }

  if (recommendedAction === "CHANGE_STRATEGY") {
    return {
      decision_type: decisionType,
      action_type: "CHANGE_STRATEGY",
      operation: "CHANGE_STRATEGY",
      requires_approval: 1,
    };
  }

  if (recommendedAction === "STOP_CONTENT") {
    return {
      decision_type: decisionType,
      action_type: "STOP_CONTENT",
      operation: "STOP_CONTENT",
      requires_approval: 1,
    };
  }

  return null;
}

// ------------------------------------------------------------
// Build action payload
// ------------------------------------------------------------

function buildActionPayload(decision, content, measurement) {
  const recommendation = safeJsonParse(
    decision.recommendation,
    {}
  );

  const evidence = safeJsonParse(
    decision.evidence,
    {}
  );

  const action = resolveAction(decision);

  if (!action) {
    return null;
  }

  const payload = {
    operation: action.operation,

    decision_run_id: decision.id,

    content_id: decision.content_id || null,

    measurement_id: decision.measurement_id || null,

    decision_type: decision.decision_type,

    decision_status: decision.decision_status,

    priority: decision.priority,

    reason: decision.reason,

    evidence,

    recommendation,

    content: content
      ? {
          id: content.id,
          title: content.title,
          status: content.status,
          objective: content.objective,
          attention_type: content.attention_type,
          market_keyword: content.market_keyword,
          angle: content.angle,
          cta: content.cta,
        }
      : null,

    measurement: measurement
      ? {
          id: measurement.id,
          status: measurement.status,
          measured_at: measurement.measured_at,
          measurement_start: measurement.measurement_start,
          metrics: safeJsonParse(measurement.metrics, {}),
          funnel: safeJsonParse(measurement.funnel, {}),
          attribution: safeJsonParse(
            measurement.attribution,
            {}
          ),
          learning_signal: safeJsonParse(
            measurement.learning_signal,
            {}
          ),
        }
      : null,

    execution_policy: {
      automatic_execution: false,
      requires_approval: true,
      execution_allowed_before_approval: false,
    },
  };

  return payload;
}

// ------------------------------------------------------------
// GET
//
// GET /api/action-engine
//
// Returns the latest Decision that can be converted into Action.
// Does NOT create an action.
// ------------------------------------------------------------

export async function onRequestGet(context) {
  const { env } = context;

  try {
    if (!env.DB) {
      return json(
        {
          success: false,
          layer: LAYER,
          error: "D1 binding DB not found",
        },
        500
      );
    }

    const decision = await env.DB.prepare(`
      SELECT *
      FROM decision_runs
      WHERE status = 'PENDING'
        AND decision_status = 'PENDING_APPROVAL'
      ORDER BY created_at DESC
      LIMIT 1
    `).first();

    if (!decision) {
      return json({
        success: true,
        layer: LAYER,
        status: "NO_ACTION_READY",
        message: "No pending decision is available for Action Engine.",
      });
    }

    const action = resolveAction(decision);

    if (!action) {
      return json({
        success: false,
        layer: LAYER,
        status: "UNSUPPORTED_DECISION",
        decision_run_id: decision.id,
        decision_type: decision.decision_type,
        message:
          "Decision exists but no Action mapping is defined.",
      }, 422);
    }

    let content = null;
    let measurement = null;

    if (decision.content_id) {
      content = await env.DB.prepare(`
        SELECT *
        FROM content_engine
        WHERE id = ?
        LIMIT 1
      `)
        .bind(decision.content_id)
        .first();
    }

    if (decision.measurement_id) {
      measurement = await env.DB.prepare(`
        SELECT *
        FROM content_measurements
        WHERE id = ?
        LIMIT 1
      `)
        .bind(decision.measurement_id)
        .first();
    }

    const payload = buildActionPayload(
      decision,
      content,
      measurement
    );

    return json({
      success: true,
      layer: LAYER,
      status: "ACTION_READY",
      action_preview: {
        decision_run_id: decision.id,
        decision_type: decision.decision_type,
        action_type: action.action_type,
        operation: action.operation,
        requires_approval: 1,
        automatic_execution: false,
      },
      decision,
      action_payload: payload,
    });
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        error: error.message,
      },
      500
    );
  }
}

// ------------------------------------------------------------
// POST
//
// POST /api/action-engine
//
// Body:
// {
//   "decision_run_id": "..."
// }
//
// Creates exactly ONE Action for the Decision.
// Does NOT approve.
// Does NOT execute.
// ------------------------------------------------------------

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return json(
        {
          success: false,
          layer: LAYER,
          error: "D1 binding DB not found",
        },
        500
      );
    }

    let body = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const decisionRunId =
      body.decision_run_id ||
      new URL(request.url).searchParams.get(
        "decision_run_id"
      );

    if (!decisionRunId) {
      return json(
        {
          success: false,
          layer: LAYER,
          error: "decision_run_id is required",
        },
        400
      );
    }

    // --------------------------------------------------------
    // 1. Load exact Decision
    // --------------------------------------------------------

    const decision = await env.DB.prepare(`
      SELECT *
      FROM decision_runs
      WHERE id = ?
      LIMIT 1
    `)
      .bind(decisionRunId)
      .first();

    if (!decision) {
      return json(
        {
          success: false,
          layer: LAYER,
          error: "Decision not found",
          decision_run_id: decisionRunId,
        },
        404
      );
    }

    // --------------------------------------------------------
    // 2. Safety gate
    // --------------------------------------------------------

    if (decision.status !== "PENDING") {
      return json(
        {
          success: false,
          layer: LAYER,
          status: "DECISION_NOT_PENDING",
          decision_run_id: decision.id,
          decision_status: decision.decision_status,
          status_value: decision.status,
          message:
            "Only PENDING decisions can create a new Action.",
        },
        409
      );
    }

    // --------------------------------------------------------
    // 3. Prevent duplicate Action
    // --------------------------------------------------------

    const existing = await env.DB.prepare(`
      SELECT *
      FROM action_runs
      WHERE decision_run_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
      .bind(decision.id)
      .first();

    if (existing) {
      return json({
        success: true,
        layer: LAYER,
        status: "ACTION_ALREADY_EXISTS",
        existing: true,
        decision_run_id: decision.id,
        action_run_id: existing.id,
        action_type: existing.action_type,
        action_status: existing.action_status,
        status_value: existing.status,
        requires_approval: existing.requires_approval,
        automatic_execution: false,
      });
    }

    // --------------------------------------------------------
    // 4. Resolve Action
    // --------------------------------------------------------

    const action = resolveAction(decision);

    if (!action) {
      return json(
        {
          success: false,
          layer: LAYER,
          status: "UNSUPPORTED_DECISION",
          decision_run_id: decision.id,
          decision_type: decision.decision_type,
          message:
            "No Action mapping exists for this Decision.",
        },
        422
      );
    }

    // --------------------------------------------------------
    // 5. Load linked data
    // --------------------------------------------------------

    let content = null;
    let measurement = null;

    if (decision.content_id) {
      content = await env.DB.prepare(`
        SELECT *
        FROM content_engine
        WHERE id = ?
        LIMIT 1
      `)
        .bind(decision.content_id)
        .first();
    }

    if (decision.measurement_id) {
      measurement = await env.DB.prepare(`
        SELECT *
        FROM content_measurements
        WHERE id = ?
        LIMIT 1
      `)
        .bind(decision.measurement_id)
        .first();
    }

    // --------------------------------------------------------
    // 6. Build Action Payload
    // --------------------------------------------------------

    const actionPayload = buildActionPayload(
      decision,
      content,
      measurement
    );

    if (!actionPayload) {
      return json(
        {
          success: false,
          layer: LAYER,
          status: "ACTION_PAYLOAD_FAILED",
          decision_run_id: decision.id,
        },
        422
      );
    }

    // --------------------------------------------------------
    // 7. Create Action
    // --------------------------------------------------------

    const actionRunId = id();
    const createdAt = now();

    const source = LAYER;

    const actionReason =
      decision.reason ||
      "Action generated from Decision Engine.";

    const priority =
      decision.priority ||
      "MEDIUM";

    const actionPayloadJson =
      JSON.stringify(actionPayload);

    const inputData = JSON.stringify({
      decision_run_id: decision.id,
      decision_type: decision.decision_type,
      content_id: decision.content_id || null,
      measurement_id: decision.measurement_id || null,
    });

    await env.DB.prepare(`
      INSERT INTO action_runs (
        id,
        action_type,
        source,
        status,
        input_data,
        output_data,
        created_at,
        completed_at,
        decision_run_id,
        measurement_id,
        content_id,
        action_status,
        priority,
        reason,
        action_payload,
        requires_approval,
        approved_at,
        executed_at,
        result
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `)
      .bind(
        actionRunId,
        action.action_type,
        source,
        "PENDING",
        inputData,
        null,
        createdAt,
        null,
        decision.id,
        decision.measurement_id || null,
        decision.content_id || null,
        "PENDING_APPROVAL",
        priority,
        actionReason,
        actionPayloadJson,
        1,
        null,
        null,
        null
      )
      .run();

    // --------------------------------------------------------
    // 8. Verify saved Action
    // --------------------------------------------------------

    const saved = await env.DB.prepare(`
      SELECT *
      FROM action_runs
      WHERE id = ?
      LIMIT 1
    `)
      .bind(actionRunId)
      .first();

    return json({
      success: true,
      layer: LAYER,
      status: "ACTION_SAVED",
      existing: false,

      decision: {
        decision_run_id: decision.id,
        decision_type: decision.decision_type,
        decision_status: decision.decision_status,
        priority: decision.priority,
      },

      action: {
        action_run_id: actionRunId,
        action_type: action.action_type,
        operation: action.operation,
        status: saved?.status || "PENDING",
        action_status:
          saved?.action_status ||
          "PENDING_APPROVAL",
        requires_approval: 1,
        automatic_execution: false,
        execution_allowed: false,
      },

      next_stage: "APPROVAL_ENGINE",

      message:
        "Action created successfully. Approval is required before execution.",
    });
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        error: error.message,
      },
      500
    );
  }
}
