// TATO-OS
// Feedback Layer V1.1
// Route: /api/feedback
//
// Pipeline:
//
// Measurement V2.3
//        ↓
// Intelligence V2.1
//        ↓
// Learning V2.3
//        ↓
// Decision V1.3.4
//        ↓
// Action V1.4
//        ↓
// Approval V1
//        ↓
// Execution V1
//        ↓
// Feedback V1.1
//        ↓
// Measurement
//
// Feedback DOES:
// - read completed execution result
// - record operational outcome
// - preserve execution status
// - create measurement handoff
// - keep feedback separate from behavioral evidence
//
// Feedback DOES NOT:
// - create behavior events
// - create attention
// - change funnel metrics
// - recalculate Measurement
// - recalculate Intelligence
// - recalculate Learning
// - change strategy
// - declare winners
// - execute actions
//
// Cloudflare Pages Functions
// Path: functions/api/feedback.js

const LAYER = "FEEDBACK_LAYER_V1.1";
const VERSION = "1.1";

const ACTION_LAYER = "ACTION_ENGINE_V1.4";
const APPROVAL_LAYER = "APPROVAL_ENGINE_V1";
const EXECUTION_LAYER = "EXECUTION_ENGINE_V1";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: HEADERS
  });
}

function nowISO() {
  return new Date().toISOString();
}

function s(value) {
  return value == null ? "" : String(value);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeExecutionStatus(value) {
  return s(value).trim().toUpperCase();
}

function normalizeActionStatus(value) {
  return s(value).trim().toUpperCase();
}

/* ---------------------------------------------------------
   TABLE
--------------------------------------------------------- */

async function ensureFeedbackTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS feedback_runs (
      id TEXT PRIMARY KEY,
      action_run_id TEXT NOT NULL,
      execution_run_id TEXT,
      content_id TEXT,
      action_type TEXT,
      operation TEXT,
      execution_status TEXT,
      outcome_status TEXT,
      outcome TEXT,
      message TEXT,
      counted_as_behavior INTEGER DEFAULT 0,
      counted_as_attention INTEGER DEFAULT 0,
      alters_funnel_metrics INTEGER DEFAULT 0,
      measurement_required INTEGER DEFAULT 1,
      measurement_completed INTEGER DEFAULT 0,
      source TEXT,
      created_at TEXT
    )
  `).run();
}

/* ---------------------------------------------------------
   REQUEST INPUT
--------------------------------------------------------- */

async function getInput(request) {
  const url = new URL(request.url);

  let body = {};

  try {
    body = await request.json();
  } catch (_) {
    body = {};
  }

  return {
    action_run_id:
      body.action_run_id ||
      url.searchParams.get("action_run_id"),

    execution_run_id:
      body.execution_run_id ||
      url.searchParams.get("execution_run_id"),

    mode:
      s(body.mode || url.searchParams.get("mode") || "preview").toLowerCase()
  };
}

/* ---------------------------------------------------------
   LOAD ACTION
--------------------------------------------------------- */

async function getAction(db, actionRunId) {
  const result = await db.prepare(`
    SELECT
      id,
      action_type,
      status,
      action_status,
      content_id,
      measurement_id,
      priority,
      reason,
      requires_approval,
      approved_at,
      executed_at,
      result,
      output_data,
      action_payload,
      created_at
    FROM action_runs
    WHERE id = ?
    LIMIT 1
  `).bind(actionRunId).first();

  return result || null;
}

/* ---------------------------------------------------------
   LOAD EXECUTION
--------------------------------------------------------- */

async function getExecution(db, executionRunId, actionRunId) {
  let result = null;

  if (executionRunId) {
    try {
      result = await db.prepare(`
        SELECT *
        FROM execution_runs
        WHERE id = ?
        LIMIT 1
      `).bind(executionRunId).first();
    } catch (_) {
      result = null;
    }
  }

  /*
   * V1 fallback:
   * Execution Engine may not expose a persistent execution_runs
   * record in every existing schema. In that case we use the
   * action_runs execution result as the operational source.
   */

  if (!result && actionRunId) {
    const action = await db.prepare(`
      SELECT
        id,
        action_type,
        action_status,
        status,
        content_id,
        executed_at,
        result,
        output_data
      FROM action_runs
      WHERE id = ?
      LIMIT 1
    `).bind(actionRunId).first();

    if (action) {
      return {
        id: executionRunId || null,
        action_run_id: action.id,
        action_type: action.action_type,
        status:
          action.result ||
          action.output_data ||
          "UNKNOWN",
        executed_at: action.executed_at || null,
        source: "ACTION_RUN_FALLBACK"
      };
    }
  }

  return result;
}

/* ---------------------------------------------------------
   NORMALIZE EXECUTION RESULT
--------------------------------------------------------- */

function normalizeExecution(execution, action) {
  if (!execution) {
    return {
      success: false,
      error: "EXECUTION_NOT_FOUND"
    };
  }

  let rawStatus =
    execution.execution_status ||
    execution.status ||
    execution.result ||
    "";

  let status = normalizeExecutionStatus(rawStatus);

  let message =
    execution.message ||
    "";

  /*
   * If action.result/output_data is JSON,
   * attempt to recover the execution status.
   */

  for (const raw of [
    execution.result,
    execution.output_data,
    execution.status
  ]) {
    if (!raw || typeof raw !== "string") continue;

    try {
      const parsed = JSON.parse(raw);

      if (isObject(parsed)) {
        if (!status || status === "UNKNOWN") {
          status = normalizeExecutionStatus(
            parsed.status ||
            parsed.execution_status ||
            parsed.result
          );
        }

        if (!message) {
          message = s(parsed.message);
        }
      }
    } catch (_) {
      // Not JSON. Keep raw value.
    }
  }

  if (!status) {
    status = "UNKNOWN";
  }

  let outcomeStatus = "UNKNOWN";
  let outcome = "UNKNOWN";

  if (status === "EXECUTED" || status === "SUCCESS") {
    outcomeStatus = "EXECUTED";
    outcome = "EXECUTED";
  } else if (
    status === "EXECUTION_NOT_IMPLEMENTED" ||
    status === "NOT_IMPLEMENTED"
  ) {
    outcomeStatus = "NOT_IMPLEMENTED";
    outcome = "NOT_IMPLEMENTED";
  } else if (
    status === "FAILED" ||
    status === "ERROR"
  ) {
    outcomeStatus = "FAILED";
    outcome = "FAILED";
  } else if (
    status === "WAITING_FOR_APPROVAL" ||
    status === "BLOCKED"
  ) {
    outcomeStatus = "BLOCKED";
    outcome = "BLOCKED";
  } else {
    outcomeStatus = status;
    outcome = status;
  }

  return {
    success: true,
    execution_status: status,
    outcome_status: outcomeStatus,
    outcome,
    message,
    executed_at: execution.executed_at || action.executed_at || null
  };
}

/* ---------------------------------------------------------
   DUPLICATE CHECK
--------------------------------------------------------- */

async function findExistingFeedback(db, actionRunId) {
  return await db.prepare(`
    SELECT *
    FROM feedback_runs
    WHERE action_run_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(actionRunId).first();
}

/* ---------------------------------------------------------
   CREATE FEEDBACK
--------------------------------------------------------- */

async function createFeedback(
  db,
  action,
  execution,
  normalized
) {
  const id = crypto.randomUUID();
  const createdAt = nowISO();

  await db.prepare(`
    INSERT INTO feedback_runs (
      id,
      action_run_id,
      execution_run_id,
      content_id,
      action_type,
      operation,
      execution_status,
      outcome_status,
      outcome,
      message,
      counted_as_behavior,
      counted_as_attention,
      alters_funnel_metrics,
      measurement_required,
      measurement_completed,
      source,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    action.id,
    execution?.id || null,
    action.content_id || null,
    action.action_type || null,
    action.action_type || null,
    normalized.execution_status,
    normalized.outcome_status,
    normalized.outcome,
    normalized.message || null,

    // CRITICAL GUARDRAILS
    0,
    0,
    0,

    // Measurement must observe the system afterward.
    1,
    0,

    `${LAYER}`,
    createdAt
  ).run();

  return id;
}

/* ---------------------------------------------------------
   BUILD RESPONSE
--------------------------------------------------------- */

function buildResponse({
  action,
  execution,
  normalized,
  feedbackId,
  duplicate,
  mode
}) {
  return {
    success: true,
    layer: LAYER,
    version: VERSION,
    mode,

    status: duplicate
      ? "FEEDBACK_ALREADY_EXISTS"
      : "FEEDBACK_SAVED",

    action: {
      action_run_id: action.id,
      action_type: action.action_type,
      content_id: action.content_id || null,
      action_status:
        action.action_status ||
        action.status ||
        null
    },

    execution: {
      execution_run_id:
        execution?.id ||
        null,

      status:
        normalized.execution_status,

      outcome_status:
        normalized.outcome_status,

      outcome:
        normalized.outcome,

      message:
        normalized.message || null,

      executed_at:
        normalized.executed_at
    },

    feedback: {
      feedback_run_id: feedbackId,

      source: LAYER,

      role: "OPERATIONAL_OUTCOME_ONLY",

      counted_as_behavior: false,

      counted_as_attention: false,

      alters_funnel_metrics: false,

      measurement_required: true,

      measurement_completed: false
    },

    guardrails: {
      creates_behavior_event: false,
      creates_attention: false,
      alters_funnel_metrics: false,

      recalculates_measurement: false,
      recalculates_intelligence: false,
      recalculates_learning: false,

      changes_strategy: false,
      declares_winner: false,

      executes_action: false,
      automatic_execution: false
    },

    handoff: {
      next_layer: "MEASUREMENT_V2.3",
      measurement_required: true,
      execute: false
    }
  };
}

/* ---------------------------------------------------------
   MAIN
--------------------------------------------------------- */

async function runFeedback(context) {
  const db = context.env.DB;

  if (!db) {
    return {
      success: false,
      layer: LAYER,
      version: VERSION,
      error: "DB_BINDING_NOT_FOUND"
    };
  }

  const input = await getInput(context.request);

  if (!input.action_run_id) {
    return {
      success: false,
      layer: LAYER,
      version: VERSION,
      error: "action_run_id_required"
    };
  }

  await ensureFeedbackTable(db);

  const action = await getAction(
    db,
    input.action_run_id
  );

  if (!action) {
    return {
      success: false,
      layer: LAYER,
      version: VERSION,
      error: "ACTION_NOT_FOUND",
      action_run_id: input.action_run_id
    };
  }

  /*
   * Feedback must only observe an action that has reached
   * the execution stage.
   */

  const actionStatus = normalizeActionStatus(
    action.action_status ||
    action.status
  );

  if (
    actionStatus !== "EXECUTED" &&
    !action.executed_at &&
    !action.result
  ) {
    return {
      success: false,
      layer: LAYER,
      version: VERSION,
      error: "ACTION_NOT_EXECUTED",
      action: {
        id: action.id,
        status: action.status,
        action_status: action.action_status,
        executed_at: action.executed_at
      }
    };
  }

  const execution = await getExecution(
    db,
    input.execution_run_id,
    input.action_run_id
  );

  const normalized = normalizeExecution(
    execution,
    action
  );

  if (!normalized.success) {
    return {
      success: false,
      layer: LAYER,
      version: VERSION,
      error: normalized.error,
      action_run_id: input.action_run_id,
      execution_run_id: input.execution_run_id || null
    };
  }

  const existing = await findExistingFeedback(
    db,
    action.id
  );

  /*
   * Preview never creates a record.
   */

  if (input.mode !== "execute") {
    return buildResponse({
      action,
      execution,
      normalized,
      feedbackId: existing?.id || null,
      duplicate: !!existing,
      mode: "preview"
    });
  }

  /*
   * Execute mode creates exactly one feedback record.
   */

  if (existing) {
    return buildResponse({
      action,
      execution,
      normalized,
      feedbackId: existing.id,
      duplicate: true,
      mode: "execute"
    });
  }

  const feedbackId = await createFeedback(
    db,
    action,
    execution,
    normalized
  );

  return buildResponse({
    action,
    execution,
    normalized,
    feedbackId,
    duplicate: false,
    mode: "execute"
  });
}

/* ---------------------------------------------------------
   GET
--------------------------------------------------------- */

export async function onRequestGet(context) {
  try {
    const result = await runFeedback(context);

    return json(
      result,
      result.success ? 200 : 400
    );
  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      version: VERSION,
      error: "FEEDBACK_LAYER_ERROR",
      message: error?.message || String(error)
    }, 500);
  }
}

/* ---------------------------------------------------------
   POST
--------------------------------------------------------- */

export async function onRequestPost(context) {
  try {
    const result = await runFeedback(context);

    return json(
      result,
      result.success ? 200 : 400
    );
  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      version: VERSION,
      error: "FEEDBACK_LAYER_ERROR",
      message: error?.message || String(error)
    }, 500);
  }
}
