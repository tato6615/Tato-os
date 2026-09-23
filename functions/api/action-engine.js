const LAYER = "ACTION_ENGINE_V1.3";

const ACTION_MAP = {
  CONTINUE_TRAFFIC_SIGNAL: {
    action_type: "CONTINUE_MEASUREMENT",
    operation: "MEASURE_CONTENT",
  },
  OPTIMIZE_CONTENT: {
    action_type: "OPTIMIZE_CONTENT",
    operation: "OPTIMIZE_CONTENT",
  },
  CREATE_CONTENT: {
    action_type: "CREATE_CONTENT",
    operation: "CREATE_CONTENT",
  },
  CHANGE_STRATEGY: {
    action_type: "CHANGE_STRATEGY",
    operation: "CHANGE_STRATEGY",
  },
  STOP_CONTENT: {
    action_type: "STOP_CONTENT",
    operation: "STOP_CONTENT",
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
    },
  });
}

function parseJSON(value, fallback = {}) {
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

function makeId() {
  return crypto.randomUUID();
}

function resolveAction(decision) {
  const decisionType = String(
    decision.decision_type || ""
  ).trim();

  if (ACTION_MAP[decisionType]) {
    return {
      decision_type: decisionType,
      ...ACTION_MAP[decisionType],
      requires_approval: 1,
    };
  }

  const recommendation = parseJSON(
    decision.recommendation,
    {}
  );

  const recommendationText =
    typeof decision.recommendation === "string"
      ? decision.recommendation.toUpperCase()
      : "";

  const candidates = [
    recommendation.action,
    recommendation.type,
    recommendation.action_type,
    recommendationText,
  ]
    .filter(Boolean)
    .map((v) => String(v).toUpperCase());

  if (
    candidates.some((v) =>
      v.includes("CONTINUE_MEASUREMENT")
    )
  ) {
    return {
      decision_type: decisionType,
      action_type: "CONTINUE_MEASUREMENT",
      operation: "MEASURE_CONTENT",
      requires_approval: 1,
    };
  }

  if (
    candidates.some((v) =>
      v.includes("OPTIMIZE_CONTENT")
    )
  ) {
    return {
      decision_type: decisionType,
      action_type: "OPTIMIZE_CONTENT",
      operation: "OPTIMIZE_CONTENT",
      requires_approval: 1,
    };
  }

  if (
    candidates.some((v) =>
      v.includes("CREATE_CONTENT")
    )
  ) {
    return {
      decision_type: decisionType,
      action_type: "CREATE_CONTENT",
      operation: "CREATE_CONTENT",
      requires_approval: 1,
    };
  }

  if (
    candidates.some((v) =>
      v.includes("CHANGE_STRATEGY")
    )
  ) {
    return {
      decision_type: decisionType,
      action_type: "CHANGE_STRATEGY",
      operation: "CHANGE_STRATEGY",
      requires_approval: 1,
    };
  }

  if (
    candidates.some((v) =>
      v.includes("STOP_CONTENT")
    )
  ) {
    return {
      decision_type: decisionType,
      action_type: "STOP_CONTENT",
      operation: "STOP_CONTENT",
      requires_approval: 1,
    };
  }

  return null;
}

function buildPayload(
  decision,
  action,
  content,
  measurement
) {
  const evidence = parseJSON(
    decision.evidence,
    {}
  );

  const recommendationRaw =
    decision.recommendation;

  const recommendation =
    parseJSON(recommendationRaw, {});

  return {
    operation: action.operation,

    decision_run_id: decision.id,

    content_id: decision.content_id || null,

    measurement_id:
      decision.measurement_id || null,

    learning_run_id:
      decision.learning_run_id || null,

    decision_type:
      decision.decision_type,

    decision_status:
      decision.decision_status,

    priority:
      decision.priority,

    reason:
      decision.reason,

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
          measurement_start:
            measurement.measurement_start,

          metrics: parseJSON(
            measurement.metrics,
            {}
          ),

          funnel: parseJSON(
            measurement.funnel,
            {}
          ),

          attribution: parseJSON(
            measurement.attribution,
            {}
          ),

          learning_signal: parseJSON(
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
}

async function loadDecision(env, decisionRunId) {
  return await env.DB.prepare(`
    SELECT *
    FROM decision_runs
    WHERE id = ?
    LIMIT 1
  `)
    .bind(decisionRunId)
    .first();
}

async function loadLinkedData(env, decision) {
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

  return {
    content,
    measurement,
  };
}

/*
 * IMPORTANT SELECTION RULE
 *
 * A Decision is eligible for Action only when:
 *
 * 1. status = PENDING
 * 2. decision_status = PENDING_APPROVAL
 * 3. NO action_runs already references that decision
 *
 * This prevents old Decisions from re-entering the pipeline.
 */

async function getNextActionableDecision(env) {
  return await env.DB.prepare(`
    SELECT d.*
    FROM decision_runs d
    WHERE d.status = 'PENDING'
      AND d.decision_status = 'PENDING_APPROVAL'
      AND NOT EXISTS (
        SELECT 1
        FROM action_runs a
        WHERE a.decision_run_id = d.id
      )
    ORDER BY d.created_at DESC
    LIMIT 1
  `).first();
}

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

    const decision =
      await getNextActionableDecision(env);

    if (!decision) {
      return json({
        success: true,
        layer: LAYER,
        status: "NO_ACTION_READY",
        message:
          "No pending Decision without an existing Action.",
      });
    }

    const action =
      resolveAction(decision);

    if (!action) {
      return json(
        {
          success: false,
          layer: LAYER,
          status: "UNSUPPORTED_DECISION",
          decision_run_id: decision.id,
          decision_type:
            decision.decision_type,
        },
        422
      );
    }

    const {
      content,
      measurement,
    } =
      await loadLinkedData(
        env,
        decision
      );

    const payload =
      buildPayload(
        decision,
        action,
        content,
        measurement
      );

    return json({
      success: true,
      layer: LAYER,
      status: "ACTION_READY",

      action_preview: {
        decision_run_id:
          decision.id,

        decision_type:
          decision.decision_type,

        action_type:
          action.action_type,

        operation:
          action.operation,

        requires_approval: 1,

        automatic_execution: false,
      },

      decision,

      action_payload:
        payload,
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

    const url =
      new URL(request.url);

    const decisionRunId =
      body.decision_run_id ||
      url.searchParams.get(
        "decision_run_id"
      );

    if (!decisionRunId) {
      return json(
        {
          success: false,
          layer: LAYER,
          error:
            "decision_run_id is required",
        },
        400
      );
    }

    const decision =
      await loadDecision(
        env,
        decisionRunId
      );

    if (!decision) {
      return json(
        {
          success: false,
          layer: LAYER,
          error:
            "Decision not found",
          decision_run_id:
            decisionRunId,
        },
        404
      );
    }

    if (
      decision.status !==
      "PENDING"
    ) {
      return json(
        {
          success: false,
          layer: LAYER,
          status:
            "DECISION_NOT_PENDING",
          decision_run_id:
            decision.id,
          decision_status:
            decision.decision_status,
          status_value:
            decision.status,
        },
        409
      );
    }

    /*
     * HARD DUPLICATE SAFETY
     *
     * Even if POST is called directly with an old
     * Decision ID, it cannot create another Action.
     */

    const existing =
      await env.DB.prepare(`
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
        status:
          "ACTION_ALREADY_EXISTS",
        existing: true,

        decision_run_id:
          decision.id,

        action_run_id:
          existing.id,

        action_type:
          existing.action_type,

        action_status:
          existing.action_status,

        status_value:
          existing.status,

        requires_approval:
          existing.requires_approval,

        automatic_execution:
          false,

        message:
          "This Decision already has an Action. No duplicate Action was created.",
      });
    }

    const action =
      resolveAction(decision);

    if (!action) {
      return json(
        {
          success: false,
          layer: LAYER,
          status:
            "UNSUPPORTED_DECISION",
          decision_run_id:
            decision.id,
          decision_type:
            decision.decision_type,
        },
        422
      );
    }

    const {
      content,
      measurement,
    } =
      await loadLinkedData(
        env,
        decision
      );

    const payload =
      buildPayload(
        decision,
        action,
        content,
        measurement
      );

    const actionRunId =
      makeId();

    const createdAt =
      now();

    const inputData =
      JSON.stringify({
        decision_run_id:
          decision.id,

        decision_type:
          decision.decision_type,

        content_id:
          decision.content_id ||
          null,

        measurement_id:
          decision.measurement_id ||
          null,

        learning_run_id:
          decision.learning_run_id ||
          null,
      });

    const actionPayload =
      JSON.stringify(payload);

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
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?
      )
    `)
      .bind(
        actionRunId,
        action.action_type,
        LAYER,
        "PENDING",
        inputData,
        null,
        createdAt,
        null,
        decision.id,
        decision.measurement_id ||
          null,
        decision.content_id ||
          null,
        "PENDING_APPROVAL",
        decision.priority ||
          "MEDIUM",
        decision.reason ||
          "Action generated from Decision Engine.",
        actionPayload,
        1,
        null,
        null,
        null
      )
      .run();

    const saved =
      await env.DB.prepare(`
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
        decision_run_id:
          decision.id,

        decision_type:
          decision.decision_type,

        decision_status:
          decision.decision_status,

        priority:
          decision.priority,
      },

      action: {
        action_run_id:
          actionRunId,

        action_type:
          action.action_type,

        operation:
          action.operation,

        status:
          saved?.status ||
          "PENDING",

        action_status:
          saved?.action_status ||
          "PENDING_APPROVAL",

        requires_approval: 1,

        automatic_execution:
          false,

        execution_allowed:
          false,
      },

      next_stage:
        "APPROVAL_ENGINE",

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
