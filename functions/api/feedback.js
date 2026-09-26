// TATO-OS
// Feedback Layer V1.1
// Route: /api/feedback
//
// Feedback records the operational result of Automation / Execution V1.1.
// It does not create behavior, Attention, funnel metrics, strategy, or actions.
//
// Automation V1.1 persists executions in execution_queue.
// Legacy action_runs / execution_runs are intentionally not required here.
//
// Flow:
// Measurement V2.3 -> Intelligence -> Learning -> Decision -> Action
// -> Automation / Execution -> Feedback -> Measurement V2.3

const LAYER = "FEEDBACK_LAYER_V1.1";
const VERSION = "1.1";
const EXECUTION_SOURCE = "AUTOMATION_EXECUTION_V1.1";
const MEASUREMENT_SOURCE = "CONTENT_MEASUREMENT_ENGINE_V2.3";

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

function s(value) {
  return value == null ? "" : String(value);
}

function parseJSON(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function normalize(value) {
  return s(value).trim().toUpperCase();
}

async function ensureFeedbackTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS feedback_records (
      id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      content_id TEXT,
      action_type TEXT,
      action_name TEXT,
      execution_status TEXT NOT NULL,
      outcome_status TEXT NOT NULL,
      outcome TEXT NOT NULL,
      result_payload TEXT,
      operator_note TEXT,
      counted_as_behavior INTEGER NOT NULL DEFAULT 0,
      counted_as_attention INTEGER NOT NULL DEFAULT 0,
      alters_funnel_metrics INTEGER NOT NULL DEFAULT 0,
      measurement_required INTEGER NOT NULL DEFAULT 1,
      measurement_completed INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_feedback_records_execution
    ON feedback_records(execution_id)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_feedback_records_content
    ON feedback_records(content_id)
  `).run();
}

async function getExecution(db, executionId) {
  return await db.prepare(`
    SELECT
      id,
      content_id,
      action_type,
      action_name,
      action_code,
      target,
      priority,
      status,
      approved,
      executed,
      external_execution,
      action_payload,
      execution_payload,
      result_payload,
      error,
      created_at,
      approved_at,
      executed_at,
      updated_at
    FROM execution_queue
    WHERE id = ?
    LIMIT 1
  `).bind(executionId).first();
}

function parsePayloads(execution) {
  return {
    action: parseJSON(execution.action_payload, {}),
    execution: parseJSON(execution.execution_payload, {}),
    result: parseJSON(execution.result_payload, {})
  };
}

function normalizeOutcome(execution, payloads) {
  const status = normalize(execution.status);

  if (status === "EXECUTED" && execution.executed === 1) {
    const result = payloads.result || {};
    return {
      execution_status: "EXECUTED",
      outcome_status: "RELEASED_TO_OPERATOR",
      outcome: normalize(result.result || "RELEASED_TO_OPERATOR"),
      message:
        result.message ||
        "Controlled execution reached the manual operator boundary."
    };
  }

  if (status === "APPROVED" && execution.approved === 1) {
    return {
      execution_status: "APPROVED",
      outcome_status: "AWAITING_OPERATOR",
      outcome: "AWAITING_OPERATOR",
      message: "Execution is approved but has not reached the execution boundary."
    };
  }

  if (status === "FAILED") {
    return {
      execution_status: "FAILED",
      outcome_status: "FAILED",
      outcome: "FAILED",
      message: execution.error || "Controlled execution failed."
    };
  }

  return {
    execution_status: status || "UNKNOWN",
    outcome_status: status || "UNKNOWN",
    outcome: status || "UNKNOWN",
    message: execution.error || ""
  };
}

async function findExisting(db, executionId) {
  return await db.prepare(`
    SELECT *
    FROM feedback_records
    WHERE execution_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(executionId).first();
}

async function persistFeedback(db, execution, normalized, payloads, operatorNote) {
  const existing = await findExisting(db, execution.id);

  if (existing) {
    return {
      id: existing.id,
      duplicate: true,
      created_at: existing.created_at
    };
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await db.prepare(`
    INSERT INTO feedback_records (
      id,
      execution_id,
      content_id,
      action_type,
      action_name,
      execution_status,
      outcome_status,
      outcome,
      result_payload,
      operator_note,
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
    execution.id,
    execution.content_id || null,
    execution.action_type || null,
    execution.action_name || execution.action_code || null,
    normalized.execution_status,
    normalized.outcome_status,
    normalized.outcome,
    JSON.stringify(payloads.result || {}),
    operatorNote || null,
    0,
    0,
    0,
    1,
    0,
    LAYER,
    createdAt
  ).run();

  return {
    id,
    duplicate: false,
    created_at: createdAt
  };
}

function buildResponse(execution, normalized, payloads, mode, persisted = null) {
  return {
    success: true,
    layer: LAYER,
    version: VERSION,
    mode,
    status:
      mode === "execute"
        ? (persisted?.duplicate ? "FEEDBACK_ALREADY_EXISTS" : "FEEDBACK_SAVED")
        : "FEEDBACK_READY",

    execution: {
      id: execution.id,
      content_id: execution.content_id,
      action_type: execution.action_type,
      action_name: execution.action_name || execution.action_code,
      status: normalized.execution_status,
      approved: execution.approved === 1,
      executed: execution.executed === 1,
      executed_at: execution.executed_at || null
    },

    outcome: {
      status: normalized.outcome_status,
      outcome: normalized.outcome,
      message: normalized.message,
      result: payloads.result || {}
    },

    feedback: {
      feedback_id: persisted?.id || null,
      source: LAYER,
      role: "OPERATIONAL_OUTCOME_ONLY",
      counted_as_behavior: false,
      counted_as_attention: false,
      alters_funnel_metrics: false,
      measurement_required: true,
      measurement_completed: false
    },

    source_chain: {
      measurement: MEASUREMENT_SOURCE,
      execution: EXECUTION_SOURCE,
      feedback: LAYER
    },

    source_of_truth: {
      type: EXECUTION_SOURCE,
      version: "1.1",
      execution_id: execution.id
    },

    guardrails: {
      reads_raw_behavior_events: false,
      creates_behavior_event: false,
      creates_attention: false,
      alters_funnel_metrics: false,
      recalculates_measurement: false,
      recalculates_intelligence: false,
      recalculates_learning: false,
      changes_strategy: false,
      winner_declared: false,
      executes_action: false,
      automatic_execution: false,
      external_execution: false,
      business_data_mutation: false,
      content_mutation: false,
      customer_contact: false,
      payment_action: false,
      human_approval_required: true
    },

    handoff: {
      next_layer: "MEASUREMENT_V2.3",
      measurement_required: true,
      measurement_completed: false,
      execute: false
    },

    persistence: persisted || null
  };
}

async function runFeedback(context, mode, body = {}) {
  const db = context.env?.DB;

  if (!db) {
    return {
      success: false,
      layer: LAYER,
      version: VERSION,
      error: "DB_BINDING_NOT_FOUND"
    };
  }

  await ensureFeedbackTable(db);

  const url = new URL(context.request.url);
  const executionId =
    body.execution_id ||
    url.searchParams.get("execution_id");

  if (!executionId) {
    return {
      success: false,
      layer: LAYER,
      version: VERSION,
      error: "execution_id_required"
    };
  }

  const execution = await getExecution(db, executionId);

  if (!execution) {
    return {
      success: false,
      layer: LAYER,
      version: VERSION,
      error: "EXECUTION_NOT_FOUND",
      execution_id: executionId
    };
  }

  if (execution.executed !== 1 || normalize(execution.status) !== "EXECUTED") {
    return {
      success: false,
      layer: LAYER,
      version: VERSION,
      error: "EXECUTION_NOT_COMPLETED",
      execution: {
        id: execution.id,
        status: execution.status,
        approved: execution.approved === 1,
        executed: execution.executed === 1
      }
    };
  }

  const payloads = parsePayloads(execution);
  const normalized = normalizeOutcome(execution, payloads);

  if (mode === "preview") {
    return buildResponse(execution, normalized, payloads, "preview");
  }

  if (body.approved !== true) {
    return {
      success: false,
      layer: LAYER,
      version: VERSION,
      status: "APPROVAL_REQUIRED",
      error: "approved:true is required to persist Feedback"
    };
  }

  const persisted = await persistFeedback(
    db,
    execution,
    normalized,
    payloads,
    body.operator_note || null
  );

  return buildResponse(
    execution,
    normalized,
    payloads,
    "execute",
    persisted
  );
}

export async function onRequestGet(context) {
  try {
    return json(await runFeedback(context, "preview"));
  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      version: VERSION,
      status: "ERROR",
      error: "FEEDBACK_LAYER_ERROR",
      message: error?.message || String(error)
    }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    let body = {};

    try {
      body = await context.request.json();
    } catch (_) {
      body = {};
    }

    return json(await runFeedback(context, "execute", body));
  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      version: VERSION,
      status: "ERROR",
      error: "FEEDBACK_LAYER_ERROR",
      message: error?.message || String(error)
    }, 500);
  }
}
