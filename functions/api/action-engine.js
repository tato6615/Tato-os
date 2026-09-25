const LAYER = "ACTION_ENGINE_V1.4";
const VERSION = "1.4";
const DECISION_LAYER = "DECISION_LAYER_V1";
const DECISION_VERSION = "1.3.4";
const DECISION_ENGINE =
  "DECISION_V1.3.4_LEARNING_V2.3_COMPATIBLE";

const ACTION_MAP = {
  INVESTIGATE_DOWNSTREAM_PATH: {
    action_type: "INVESTIGATE_CLICK_TO_PRODUCT_VIEW",
    operation: "INVESTIGATE_CLICK_TO_PRODUCT_VIEW",
  },

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
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "content-type": "application/json; charset=UTF-8",
        "cache-control": "no-store",
      },
    }
  );
}

function now() {
  return new Date().toISOString();
}

function makeId() {
  return crypto.randomUUID();
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

function normalizeDecision(result) {
  if (!result || result.success !== true) {
    return {
      valid: false,
      error:
        result?.error ||
        "Decision Layer did not return a valid Decision.",
    };
  }

  if (result.layer !== DECISION_LAYER) {
    return {
      valid: false,
      error:
        `Invalid Decision layer: ${result.layer || "null"}`,
    };
  }

  if (result.version !== DECISION_VERSION) {
    return {
      valid: false,
      error:
        `Unsupported Decision version: ${result.version || "null"}`,
    };
  }

  if (result.engine !== DECISION_ENGINE) {
    return {
      valid: false,
      error:
        `Invalid Decision engine: ${result.engine || "null"}`,
    };
  }

  if (result.status !== "DECISION_READY") {
    return {
      valid: false,
      error:
        `Decision is not ready: ${result.status || "null"}`,
    };
  }

  if (!result.decision) {
    return {
      valid: false,
      error: "Decision object is missing.",
    };
  }

  const decisionType =
    String(
      result.decision.type ||
      result.decision.decision_type ||
      ""
    ).trim();

  const target =
    String(
      result.decision.target ||
      ""
    ).trim();

  if (!decisionType) {
    return {
      valid: false,
      error: "Decision type is missing.",
    };
  }

  if (!target) {
    return {
      valid: false,
      error: "Decision target is missing.",
    };
  }

  return {
    valid: true,
    decision: {
      ...result.decision,
      decision_type: decisionType,
      target,
    },
  };
}

function resolveAction(decision) {
  const decisionType =
    String(
      decision.decision_type || ""
    ).trim();

  const mapped =
    ACTION_MAP[decisionType];

  if (!mapped) {
    return null;
  }

  return {
    decision_type: decisionType,
    target:
      decision.target || null,
    action_type: mapped.action_type,
    operation: mapped.operation,
    requires_approval: 1,
    automatic_execution: false,
    execution_allowed: false,
  };
}

function buildActionPayload(
  decisionResult,
  decision,
  action
) {
  return {
    operation: action.operation,

    source: {
      layer: DECISION_LAYER,
      version: DECISION_VERSION,
      engine: DECISION_ENGINE,
    },

    content_id:
      decisionResult.content?.id ||
      null,

    content:
      decisionResult.content
        ? {
            id:
              decisionResult.content.id ||
              null,
            title:
              decisionResult.content.title ||
              null,
            status:
              decisionResult.content.status ||
              null,
          }
        : null,

    decision: {
      priority:
        decision.priority ||
        "MEDIUM",

      type:
        decision.decision_type,

      target:
        decision.target,

      reason:
        decision.reason ||
        null,

      source:
        decision.source ||
        "LEARNING_DECISION_INPUT",
    },

    learning:
      decisionResult.learning
        ? {
            layer:
              decisionResult.learning.layer ||
              null,

            version:
              decisionResult.learning.version ||
              null,

            engine:
              decisionResult.learning.engine ||
              null,

            state:
              decisionResult.learning.state ||
              null,

            confidence:
              decisionResult.learning.confidence ||
              null,

            decision_input:
              decisionResult.learning.decision_input ||
              null,
          }
        : null,

    evidence:
      decisionResult.evidence ||
      null,

    target:
      decision.target,

    execution_policy: {
      automatic_execution: false,
      requires_approval: true,
      execution_allowed_before_approval: false,
    },
  };
}

async function getDecisionFromEndpoint(
  context,
  contentId
) {
  const url =
    new URL(context.request.url);

  const decisionUrl =
    `${url.origin}/api/decision?content_id=${encodeURIComponent(
      contentId
    )}`;

  const response =
    await fetch(decisionUrl, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    });

  let result;

  try {
    result = await response.json();
  } catch {
    return {
      success: false,
      error:
        "Decision Layer returned non-JSON response.",
    };
  }

  if (!response.ok) {
    return {
      success: false,
      error:
        result?.error ||
        `Decision Layer HTTP ${response.status}`,
      raw: result,
    };
  }

  return result;
}

async function findExistingAction(
  DB,
  contentId,
  actionType
) {
  if (!contentId || !actionType) {
    return null;
  }

  return await DB.prepare(`
    SELECT *
    FROM action_runs
    WHERE content_id = ?
      AND action_type = ?
      AND action_status IN (
        'PENDING_APPROVAL',
        'APPROVED',
        'EXECUTING'
      )
    ORDER BY created_at DESC
    LIMIT 1
  `)
    .bind(
      contentId,
      actionType
    )
    .first();
}

async function createAction(
  DB,
  decisionResult,
  decision,
  action
) {
  const contentId =
    decisionResult.content?.id ||
    null;

  const existing =
    await findExistingAction(
      DB,
      contentId,
      action.action_type
    );

  if (existing) {
    return {
      created: false,
      existing: true,
      action: existing,
    };
  }

  const actionRunId =
    makeId();

  const createdAt =
    now();

  const payload =
    buildActionPayload(
      decisionResult,
      decision,
      action
    );

  const inputData = {
    source_layer: DECISION_LAYER,
    source_version: DECISION_VERSION,
    source_engine: DECISION_ENGINE,

    content_id:
      contentId,

    decision_type:
      decision.decision_type,

    decision_target:
      decision.target,
  };

  await DB.prepare(`
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

      JSON.stringify(inputData),

      null,

      createdAt,

      null,

      null,

      null,

      contentId,

      "PENDING_APPROVAL",

      decision.priority ||
        "MEDIUM",

      decision.reason ||
        "Action created from Decision Layer.",

      JSON.stringify(payload),

      1,

      null,

      null,

      null
    )
    .run();

  const saved =
    await DB.prepare(`
      SELECT *
      FROM action_runs
      WHERE id = ?
      LIMIT 1
    `)
      .bind(actionRunId)
      .first();

  return {
    created: true,
    existing: false,
    action: saved,
  };
}

function actionResponse(
  decisionResult,
  decision,
  action,
  created
) {
  return {
    success: true,

    layer: LAYER,
    version: VERSION,

    status:
      created.existing
        ? "ACTION_ALREADY_EXISTS"
        : "ACTION_SAVED",

    source_contract: {
      decision_layer:
        DECISION_LAYER,

      decision_version:
        DECISION_VERSION,

      decision_engine:
        DECISION_ENGINE,
    },

    decision: {
      type:
        decision.decision_type,

      target:
        decision.target,

      priority:
        decision.priority ||
        "MEDIUM",

      reason:
        decision.reason ||
        null,

      source:
        decision.source ||
        "LEARNING_DECISION_INPUT",
    },

    action: {
      action_run_id:
        created.action?.id ||
        null,

      action_type:
        action.action_type,

      operation:
        action.operation,

      status:
        created.action?.status ||
        "PENDING",

      action_status:
        created.action?.action_status ||
        "PENDING_APPROVAL",

      requires_approval: true,

      automatic_execution: false,

      execution_allowed: false,
    },

    control: {
      automatic_execution: false,

      requires_approval: true,

      execution_allowed_before_approval:
        false,

      human_approval_required:
        true,
    },

    guardrails: {
      reads_raw_behavior_events:
        false,

      recalculates_measurement:
        false,

      recalculates_intelligence:
        false,

      recalculates_learning:
        false,

      changes_strategy:
        false,

      declares_winner:
        false,

      automatic_execution:
        false,

      action_executed:
        false,
    },

    next_stage:
      "APPROVAL_ENGINE",
  };
}

async function runAction(context) {
  const { env, request } =
    context;

  const DB = env?.DB;

  if (!DB) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        status: "ERROR",
        error:
          "D1 binding DB not found.",
      },
      500
    );
  }

  const url =
    new URL(request.url);

  let body = {};

  try {
    body =
      await request.json();
  } catch {
    body = {};
  }

  const contentId =
    body.content_id ||
    url.searchParams.get(
      "content_id"
    );

  if (!contentId) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        status: "INVALID_REQUEST",
        error:
          "content_id is required.",
        usage:
          "/api/action-engine?content_id=<content_id>",
      },
      400
    );
  }

  /*
   * ACTION LAYER CONTRACT
   *
   * Action reads Decision output.
   * It does not read raw behavior.
   * It does not recalculate upstream layers.
   */

  const decisionResult =
    await getDecisionFromEndpoint(
      context,
      contentId
    );

  const normalized =
    normalizeDecision(
      decisionResult
    );

  if (!normalized.valid) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        status: "DECISION_CONTRACT_ERROR",
        content_id: contentId,
        error:
          normalized.error,
        decision_response:
          decisionResult,
      },
      422
    );
  }

  const decision =
    normalized.decision;

  const action =
    resolveAction(
      decision
    );

  if (!action) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        status:
          "UNSUPPORTED_DECISION",

        decision: {
          type:
            decision.decision_type,

          target:
            decision.target,
        },

        error:
          `No Action mapping exists for Decision type '${decision.decision_type}'.`,
      },
      422
    );
  }

  const created =
    await createAction(
      DB,
      decisionResult,
      decision,
      action
    );

  return json(
    actionResponse(
      decisionResult,
      decision,
      action,
      created
    )
  );
}

export async function onRequestGet(
  context
) {
  try {
    return await runAction(
      context
    );
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        status: "ACTION_ERROR",
        error:
          error?.message ||
          String(error),
      },
      500
    );
  }
}

export async function onRequestPost(
  context
) {
  try {
    return await runAction(
      context
    );
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        status: "ACTION_ERROR",
        error:
          error?.message ||
          String(error),
      },
      500
    );
  }
}
