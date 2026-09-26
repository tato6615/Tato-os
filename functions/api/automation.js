// TATO-OS
// Automation / Execution Layer V1.1
// Route: /api/automation
//
// Pipeline:
//
// Measurement V2.3
//        ↓
// Intelligence V2.1
//        ↓
// Learning V2.3
//        ↓
// Decision V1.1
//        ↓
// Action V1.1
//        ↓
// Automation / Execution V1.1
//        ↓
// Feedback
//        ↓
// Measurement
//
// Purpose:
// - consume ONLY the governed Action Layer output
// - create a controlled execution job
// - require explicit human approval
// - execute only approved internal/manual execution jobs
// - record execution status
//
// V1.1 does NOT:
// - read raw behavior_events
// - recalculate Measurement / Intelligence / Learning
// - create or change Decisions
// - declare winners
// - change strategy
// - execute external services
//
// IMPORTANT:
// "execute" in V1.1 means releasing a governed manual task.
// No external service, customer contact, content mutation,
// payment, or business-side mutation is performed automatically.

const LAYER = "AUTOMATION_EXECUTION_V1.1";
const VERSION = "1.1";

const MEASUREMENT_SOURCE = "CONTENT_MEASUREMENT_ENGINE_V2.3";
const INTELLIGENCE_SOURCE = "INTELLIGENCE_V2.1_FEEDBACK_AWARE";
const LEARNING_SOURCE = "LEARNING_V2.3_FEEDBACK_AWARE";
const DECISION_SOURCE = "DECISION_LAYER_V1.1";
const ACTION_SOURCE = "ACTION_LAYER_V1.1";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function now() {
  return new Date().toISOString();
}

function getContentId(request, body = {}) {
  const url = new URL(request.url);
  return url.searchParams.get("content_id") || body.content_id || null;
}

function requireDb(env) {
  if (!env.DB) {
    const error = new Error("D1 binding DB not found");
    error.status = 500;
    throw error;
  }
  return env.DB;
}

async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS execution_queue (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      action_type TEXT NOT NULL,
      action_name TEXT NOT NULL,
      target TEXT,
      priority TEXT,
      status TEXT NOT NULL,
      approved INTEGER NOT NULL DEFAULT 0,
      executed INTEGER NOT NULL DEFAULT 0,
      external_execution INTEGER NOT NULL DEFAULT 0,
      action_payload TEXT NOT NULL,
      execution_payload TEXT NOT NULL,
      result_payload TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      approved_at TEXT,
      executed_at TEXT,
      updated_at TEXT NOT NULL
    )
  `).run();

  // Migrate an older live D1 execution_queue schema to the V1.1 contract.
  const info = await db.prepare(`PRAGMA table_info(execution_queue)`).all();
  const existing = new Set((info.results || []).map((row) => row.name));

  const migrations = [
    ["content_id", "TEXT"],
    ["action_type", "TEXT NOT NULL DEFAULT ''"],
    ["action_name", "TEXT NOT NULL DEFAULT ''"],
    ["target", "TEXT"],
    ["priority", "TEXT"],
    ["status", "TEXT NOT NULL DEFAULT 'PENDING'"],
    ["approved", "INTEGER NOT NULL DEFAULT 0"],
    ["executed", "INTEGER NOT NULL DEFAULT 0"],
    ["external_execution", "INTEGER NOT NULL DEFAULT 0"],
    ["action_payload", "TEXT NOT NULL DEFAULT '{}'"],
    ["execution_payload", "TEXT NOT NULL DEFAULT '{}'"],
    ["result_payload", "TEXT"],
    ["error", "TEXT"],
    ["created_at", "TEXT NOT NULL DEFAULT ''"],
    ["approved_at", "TEXT"],
    ["executed_at", "TEXT"],
    ["updated_at", "TEXT NOT NULL DEFAULT ''"]
  ];

  for (const [column, definition] of migrations) {
    if (!existing.has(column)) {
      await db.prepare(
        `ALTER TABLE execution_queue ADD COLUMN ${column} ${definition}`
      ).run();
    }
  }

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_execution_queue_status
    ON execution_queue(status)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_execution_queue_content
    ON execution_queue(content_id)
  `).run();
}

async function fetchAction(request, contentId) {
  const origin = new URL(request.url).origin;
  const url = new URL("/api/action-ai", origin);

  if (contentId) {
    url.searchParams.set("content_id", contentId);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Cache-Control": "no-cache"
    }
  });

  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const error = new Error(
      `Action Layer returned invalid JSON. HTTP ${response.status}`
    );
    error.status = 502;
    throw error;
  }

  if (!response.ok || data?.success !== true) {
    const error = new Error(
      data?.error || `Action Layer failed with HTTP ${response.status}`
    );
    error.status = response.status || 502;
    error.details = data;
    throw error;
  }

  validateAction(data);
  return data;
}

function validateAction(data) {
  if (data.layer !== ACTION_SOURCE || String(data.version) !== "1.1") {
    const error = new Error("ACTION_LAYER_CONTRACT_MISMATCH");
    error.status = 409;
    error.details = {
      expected: {
        layer: ACTION_SOURCE,
        version: "1.1"
      },
      received: {
        layer: data.layer || null,
        version: data.version || null
      }
    };
    throw error;
  }

  if (data.status !== "ACTION_PROPOSED") {
    const error = new Error(
      `Action status is not ACTION_PROPOSED: ${data.status || "UNKNOWN"}`
    );
    error.status = 409;
    throw error;
  }

  const chain = data.source_chain || {};

  if (
    chain.measurement !== MEASUREMENT_SOURCE ||
    chain.intelligence !== INTELLIGENCE_SOURCE ||
    chain.learning !== LEARNING_SOURCE ||
    chain.decision !== DECISION_SOURCE ||
    chain.action !== ACTION_SOURCE
  ) {
    const error = new Error("ACTION_SOURCE_CHAIN_INVALID");
    error.status = 409;
    error.details = {
      expected: {
        measurement: MEASUREMENT_SOURCE,
        intelligence: INTELLIGENCE_SOURCE,
        learning: LEARNING_SOURCE,
        decision: DECISION_SOURCE,
        action: ACTION_SOURCE
      },
      received: chain
    };
    throw error;
  }

  const action = data.action || {};
  const guardrails = data.guardrails || {};

  if (
    !action.action_type ||
    !action.action_name ||
    !action.status
  ) {
    const error = new Error("ACTION_PAYLOAD_INCOMPLETE");
    error.status = 409;
    throw error;
  }

  if (
    guardrails.reads_raw_behavior_events === true ||
    guardrails.recalculates_measurement === true ||
    guardrails.recalculates_intelligence === true ||
    guardrails.recalculates_learning === true ||
    guardrails.winner_declared === true ||
    guardrails.strategy_change === true ||
    guardrails.automatic_execution === true ||
    guardrails.action_executed === true ||
    guardrails.business_data_mutation === true ||
    guardrails.content_mutation === true ||
    guardrails.customer_contact === true ||
    guardrails.payment_action === true
  ) {
    const error = new Error("ACTION_GUARDRAIL_VIOLATION");
    error.status = 409;
    throw error;
  }

  if (guardrails.requires_execution_layer !== true) {
    const error = new Error("ACTION_EXECUTION_HANDOFF_MISSING");
    error.status = 409;
    throw error;
  }

  return true;
}

function buildExecutionPlan(actionData) {
  const action = actionData.action || {};

  return {
    execution_type: "MANUAL_CONTROLLED_EXECUTION",
    execution_mode: "MANUAL_OPERATOR_TASK",
    execution_code: action.action_name,
    title: action.action_name,
    objective: action.objective || "",
    target: action.target || null,
    steps: Array.isArray(action.proposed_steps)
      ? action.proposed_steps
      : [],
    expected_signal: action.expected_signal || null,
    external_execution: false,
    business_data_mutation: false,
    content_mutation: false,
    customer_contact: false,
    payment_action: false
  };
}

async function createJob(db, actionData, executionPlan) {
  await ensureTable(db);

  const id = crypto.randomUUID();
  const createdAt = now();
  const contentId = actionData.content?.id || null;
  const action = actionData.action || {};
  const decision = actionData.decision || {};

  await db.prepare(`
    INSERT INTO execution_queue (
      id,
      content_id,
      action_type,
      action_name,
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
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    contentId,
    action.action_type,
    action.action_name,
    JSON.stringify(action.target || null),
    decision.priority || "NORMAL",
    "APPROVED",
    1,
    0,
    0,
    JSON.stringify(actionData),
    JSON.stringify(executionPlan),
    null,
    null,
    createdAt,
    createdAt,
    null,
    createdAt
  ).run();

  return {
    id,
    status: "APPROVED",
    approved: true,
    executed: false,
    created_at: createdAt,
    approved_at: createdAt
  };
}

async function getJob(db, executionId) {
  await ensureTable(db);

  const row = await db.prepare(`
    SELECT *
    FROM execution_queue
    WHERE id = ?
    LIMIT 1
  `).bind(executionId).first();

  if (!row) {
    const error = new Error("EXECUTION_JOB_NOT_FOUND");
    error.status = 404;
    throw error;
  }

  return row;
}

async function executeJob(db, executionId) {
  const row = await getJob(db, executionId);

  if (row.status !== "APPROVED" || Number(row.approved) !== 1) {
    const error = new Error(
      `EXECUTION_APPROVAL_REQUIRED: current status is ${row.status}`
    );
    error.status = 409;
    throw error;
  }

  if (Number(row.external_execution) === 1) {
    const error = new Error("EXTERNAL_EXECUTION_DISABLED");
    error.status = 409;
    throw error;
  }

  const executedAt = now();

  const result = {
    type: "MANUAL_OPERATOR_TASK_RELEASED",
    execution_code: JSON.parse(row.execution_payload || "{}").execution_code || null,
    result: "RELEASED_TO_OPERATOR",
    external_execution: false,
    business_data_mutation: false,
    content_mutation: false,
    customer_contact: false,
    payment_action: false,
    message:
      "Execution boundary reached. The governed manual task is released to the operator; no external service was called."
  };

  await db.prepare(`
    UPDATE execution_queue
    SET
      status = ?,
      executed = 1,
      result_payload = ?,
      executed_at = ?,
      updated_at = ?,
      error = NULL
    WHERE id = ?
  `).bind(
    "EXECUTED",
    JSON.stringify(result),
    executedAt,
    executedAt,
    executionId
  ).run();

  return {
    id: executionId,
    status: "EXECUTED",
    approved: true,
    executed: true,
    executed_at: executedAt,
    result
  };
}

function buildGuardrails() {
  return {
    reads_raw_behavior_events: false,
    recalculates_measurement: false,
    recalculates_intelligence: false,
    recalculates_learning: false,
    winner_declared: false,
    strategy_change: false,
    automatic_execution: false,
    action_executed: false,
    external_execution: false,
    business_data_mutation: false,
    content_mutation: false,
    customer_contact: false,
    payment_action: false,
    human_approval_required: true,
    requires_execution_layer: true
  };
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const executionId = url.searchParams.get("execution_id");
    const contentId = url.searchParams.get("content_id");

    if (executionId) {
      const db = requireDb(context.env);
      const job = await getJob(db, executionId);

      return json({
        success: true,
        layer: LAYER,
        version: VERSION,
        mode: "status",
        status: job.status,
        execution: {
          id: job.id,
          content_id: job.content_id,
          action_type: job.action_type,
          action_name: job.action_name,
          priority: job.priority,
          approved: Boolean(job.approved),
          executed: Boolean(job.executed),
          external_execution: Boolean(job.external_execution),
          created_at: job.created_at,
          approved_at: job.approved_at,
          executed_at: job.executed_at,
          result: job.result_payload
            ? JSON.parse(job.result_payload)
            : null
        },
        guardrails: buildGuardrails()
      });
    }

    if (!contentId) {
      throw Object.assign(
        new Error("content_id is required for preview"),
        { status: 400 }
      );
    }

    const actionData = await fetchAction(context.request, contentId);
    const executionPlan = buildExecutionPlan(actionData);

    return json({
      success: true,
      layer: LAYER,
      version: VERSION,
      mode: "preview",
      status: "EXECUTION_READY",
      content: actionData.content || null,
      action: actionData.action || null,
      execution: {
        ...executionPlan,
        status: "AWAITING_HUMAN_APPROVAL",
        approved: false,
        executed: false
      },
      measurement: actionData.measurement || null,
      decision: actionData.decision || null,
      learning: actionData.learning || null,
      source_chain: {
        measurement: MEASUREMENT_SOURCE,
        intelligence: INTELLIGENCE_SOURCE,
        learning: LEARNING_SOURCE,
        decision: DECISION_SOURCE,
        action: ACTION_SOURCE,
        execution: LAYER
      },
      source_of_truth: {
        type: ACTION_SOURCE,
        version: "1.1",
        content_id: actionData.content?.id || contentId
      },
      guardrails: buildGuardrails(),
      diagnostics: {
        action_layer_called: true,
        action_layer_version: actionData.version,
        action_contract_valid: true,
        action_source_chain_valid: true,
        raw_behavior_read: false,
        independent_measurement_aggregation: false,
        automatic_execution: false,
        external_execution: false
      },
      persistence: null,
      next_step:
        "Human approval required. POST with approved:true creates an approved execution job. A second POST with execution_id and execute:true releases the controlled task."
    });
  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      version: VERSION,
      status: "ERROR",
      error: error?.message || String(error),
      diagnostics: error?.details || null,
      guardrails: buildGuardrails()
    }, error?.status || 500);
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.clone().json().catch(() => ({}));
    const db = requireDb(context.env);

    // Step 1: explicit human approval creates the execution job.
    if (body.approved === true && !body.execution_id) {
      const contentId = getContentId(context.request, body);

      if (!contentId) {
        throw Object.assign(
          new Error("content_id is required when approving an Action"),
          { status: 400 }
        );
      }

      const actionData = await fetchAction(context.request, contentId);
      const executionPlan = buildExecutionPlan(actionData);
      const persistence = await createJob(
        db,
        actionData,
        executionPlan
      );

      return json({
        success: true,
        layer: LAYER,
        version: VERSION,
        mode: "approve",
        status: "APPROVED",
        content: actionData.content || null,
        action: actionData.action || null,
        execution: {
          ...executionPlan,
          ...persistence
        },
        source_chain: {
          measurement: MEASUREMENT_SOURCE,
          intelligence: INTELLIGENCE_SOURCE,
          learning: LEARNING_SOURCE,
          decision: DECISION_SOURCE,
          action: ACTION_SOURCE,
          execution: LAYER
        },
        source_of_truth: {
          type: ACTION_SOURCE,
          version: "1.1",
          content_id: actionData.content?.id || contentId
        },
        guardrails: buildGuardrails(),
        diagnostics: {
          action_layer_called: true,
          action_contract_valid: true,
          action_source_chain_valid: true,
          human_approval_received: true,
          automatic_execution: false,
          external_execution: false,
          action_executed: false
        },
        next_step:
          "Execution job approved. POST with execution_id and execute:true to release the controlled manual task."
      });
    }

    // Step 2: execution requires an existing approved job.
    if (body.execute === true && body.execution_id) {
      const result = await executeJob(db, body.execution_id);

      return json({
        success: true,
        layer: LAYER,
        version: VERSION,
        mode: "execute",
        status: result.status,
        execution: result,
        guardrails: buildGuardrails(),
        diagnostics: {
          action_layer_called: false,
          human_approval_required: true,
          human_approval_verified: true,
          automatic_execution: false,
          external_execution: false,
          action_executed: true
        },
        next_step:
          "Controlled execution completed. Record the operator result in Feedback, then return to Measurement."
      });
    }

    // Status lookup through POST is intentionally not an execution path.
    if (body.execution_id) {
      const job = await getJob(db, body.execution_id);

      return json({
        success: true,
        layer: LAYER,
        version: VERSION,
        mode: "status",
        status: job.status,
        execution: {
          id: job.id,
          status: job.status,
          approved: Boolean(job.approved),
          executed: Boolean(job.executed),
          external_execution: Boolean(job.external_execution),
          created_at: job.created_at,
          approved_at: job.approved_at,
          executed_at: job.executed_at,
          result: job.result_payload
            ? JSON.parse(job.result_payload)
            : null
        },
        guardrails: buildGuardrails()
      });
    }

    return json({
      success: false,
      layer: LAYER,
      version: VERSION,
      status: "APPROVAL_REQUIRED",
      error:
        "Use approved:true with content_id to create an execution job, or execution_id with execute:true to release an approved job.",
      guardrails: buildGuardrails()
    }, 403);
  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      version: VERSION,
      status: "ERROR",
      error: error?.message || String(error),
      diagnostics: error?.details || null,
      guardrails: buildGuardrails()
    }, error?.status || 500);
  }
}
