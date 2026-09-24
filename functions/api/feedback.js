// TATO-OS
// Feedback Layer V1.0
// Route: /api/feedback
//
// Architecture:
//
// Measurement V2.2
//        ↓
// Intelligence V2.0
//        ↓
// Learning V2.2
//        ↓
// Decision V1.1
//        ↓
// Action V1.0
//        ↓
// Automation / Execution V1.0
//        ↓
// Feedback V1.0
//        ↓
// Measurement V2.2
//
// Feedback Layer DOES:
// - read execution results
// - record what actually happened
// - preserve expected vs actual outcome
// - record operator feedback
// - create a feedback record for the next Measurement cycle
//
// Feedback Layer DOES NOT:
// - read raw behavior_events
// - recalculate measurement
// - recalculate intelligence
// - recalculate learning
// - create decisions
// - change strategy
// - declare winners
// - execute external actions
//
// V1.0 = FEEDBACK RECORDING ONLY

const VERSION = "1.0";
const LAYER = "FEEDBACK_LAYER_V1";

const AUTOMATION_LAYER = "AUTOMATION_EXECUTION_V1";
const AUTOMATION_VERSION = "1.0";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: HEADERS
  });
}

function id() {
  return crypto.randomUUID();
}

function s(value) {
  return value == null ? "" : String(value);
}

function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

function bool(value) {
  return value === true;
}

/**
 * Validate Automation / Execution Layer contract.
 */
function normalizeExecution(root) {
  if (!root || root.success !== true) {
    throw new Error(
      "Automation / Execution Layer response is invalid"
    );
  }

  if (root.layer !== AUTOMATION_LAYER) {
    throw new Error(
      `Invalid Automation Layer: expected ${AUTOMATION_LAYER}, received ${s(root.layer)}`
    );
  }

  if (root.version !== AUTOMATION_VERSION) {
    throw new Error(
      `Invalid Automation version: expected ${AUTOMATION_VERSION}, received ${s(root.version)}`
    );
  }

  if (
    root.status !== "EXECUTION_READY" &&
    root.status !== "PENDING_APPROVAL" &&
    root.status !== "EXECUTED"
  ) {
    throw new Error(
      `Invalid Automation status: ${s(root.status)}`
    );
  }

  const action = root.action || {};
  const execution = root.execution || {};

  if (!s(action.action_code)) {
    throw new Error("Action code is missing");
  }

  if (!s(action.target)) {
    throw new Error("Action target is missing");
  }

  if (!s(execution.execution_code)) {
    throw new Error("Execution code is missing");
  }

  if (execution.external_execution !== false) {
    throw new Error(
      "Automation contract violation: external_execution must be false"
    );
  }

  if (root.guardrails?.external_execution !== false) {
    throw new Error(
      "Automation contract violation: external_execution must be false"
    );
  }

  return {
    content: root.content || null,

    action: {
      action_type: s(action.action_type),
      action_code: s(action.action_code),
      priority: s(action.priority || "LOW").toUpperCase(),
      target: s(action.target),
      title: s(action.title),
      description: s(action.description),
      objective: s(action.objective),
      execution_mode: s(action.execution_mode),
      requires_human_approval:
        bool(action.requires_human_approval),
      external_execution:
        action.external_execution === true
    },

    execution: {
      execution_type: s(execution.execution_type),
      execution_code: s(execution.execution_code),
      execution_mode: s(execution.execution_mode),
      title: s(execution.title),
      objective: s(execution.objective),
      instructions: Array.isArray(execution.instructions)
        ? execution.instructions
        : [],
      external_execution:
        execution.external_execution === true,
      requires_human_approval:
        bool(execution.requires_human_approval),
      status: s(execution.status),
      approved: bool(execution.approved),
      executed: bool(execution.executed)
    },

    decision: root.decision || {},
    evidence: root.evidence || {},
    learning: root.learning || {},
    intelligence: root.intelligence || {},
    funnel: root.funnel || {},

    source_chain: Array.isArray(root.source_chain)
      ? root.source_chain
      : [],

    guardrails: root.guardrails || {},

    execution_policy:
      root.execution_policy || {},

    timestamp: root.timestamp || null
  };
}

/**
 * Validate the complete upstream chain.
 */
function validateSourceChain(executionData) {
  const chain = executionData.source_chain;

  const required = [
    "CONTENT_MEASUREMENT_ENGINE_V2.2",
    "INTELLIGENCE_LAYER_V2",
    "LEARNING_ENGINE_V2",
    "DECISION_LAYER_V1",
    "ACTION_LAYER_V1",
    "AUTOMATION_EXECUTION_V1"
  ];

  for (const layer of required) {
    if (!chain.includes(layer)) {
      throw new Error(
        `Invalid source chain: missing ${layer}`
      );
    }
  }

  return true;
}

/**
 * Ensure feedback table exists.
 *
 * This table stores actual outcomes from execution.
 */
async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS feedback_events (
      id TEXT PRIMARY KEY,
      execution_id TEXT,
      content_id TEXT,
      action_code TEXT NOT NULL,
      action_target TEXT NOT NULL,
      execution_code TEXT NOT NULL,
      execution_status TEXT,
      expected_outcome TEXT,
      actual_outcome TEXT,
      outcome_status TEXT,
      operator_note TEXT,
      measurement_required INTEGER NOT NULL DEFAULT 1,
      measurement_completed INTEGER NOT NULL DEFAULT 0,
      feedback_payload TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_feedback_execution
    ON feedback_events(execution_id)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_feedback_content
    ON feedback_events(content_id)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_feedback_status
    ON feedback_events(outcome_status)
  `).run();
}

/**
 * Preview feedback structure.
 *
 * No database write.
 */
function buildFeedback(executionData, input = {}) {
  const expectedOutcome =
    s(
      input.expected_outcome ||
      executionData.action.objective ||
      "Action should produce an observable downstream result."
    );

  const actualOutcome =
    s(
      input.actual_outcome ||
      ""
    );

  const outcomeStatus =
    s(
      input.outcome_status ||
      "PENDING"
    ).toUpperCase();

  const operatorNote =
    s(
      input.operator_note ||
      ""
    );

  return {
    feedback_type: "EXECUTION_OUTCOME",

    execution: {
      status: executionData.execution.status,
      approved: executionData.execution.approved,
      executed: executionData.execution.executed
    },

    expected: {
      outcome: expectedOutcome
    },

    actual: {
      outcome: actualOutcome || null,
      status: outcomeStatus
    },

    operator: {
      note: operatorNote || null
    },

    measurement: {
      required: true,
      completed: false,
      reason:
        "Feedback must return to Measurement for the next observable cycle."
    },

    loop: {
      closed: false,
      next_layer: "MEASUREMENT_V2.2"
    }
  };
}

/**
 * Save feedback event.
 */
async function saveFeedback(
  env,
  executionData,
  feedback
) {
  if (!env.DB) {
    throw new Error("D1 binding DB is missing");
  }

  await ensureTable(env.DB);

  const now = new Date().toISOString();
  const feedbackId = id();

  const contentId =
    executionData.content?.id ||
    null;

  const executionId =
    feedback.execution_id ||
    null;

  await env.DB.prepare(`
    INSERT INTO feedback_events (
      id,
      execution_id,
      content_id,
      action_code,
      action_target,
      execution_code,
      execution_status,
      expected_outcome,
      actual_outcome,
      outcome_status,
      operator_note,
      measurement_required,
      measurement_completed,
      feedback_payload,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      feedbackId,
      executionId,
      contentId,
      executionData.action.action_code,
      executionData.action.target,
      executionData.execution.execution_code,
      executionData.execution.status,
      feedback.expected.outcome,
      feedback.actual.outcome,
      feedback.actual.status,
      feedback.operator.note,
      1,
      0,
      JSON.stringify(feedback),
      now,
      now
    )
    .run();

  return {
    id: feedbackId,
    status: "RECORDED",
    measurement_required: true,
    measurement_completed: false,
    created_at: now
  };
}

/**
 * Fetch Automation Layer from the same deployment.
 */
async function fetchAutomationFromRequest(
  context,
  contentId
) {
  const currentUrl = new URL(
    context.request.url
  );

  const url = new URL(
    "/api/automation",
    currentUrl.origin
  );

  if (contentId) {
    url.searchParams.set(
      "content_id",
      contentId
    );
  }

  const response = await fetch(
    url.toString(),
    {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Cache-Control": "no-cache"
      }
    }
  );

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new Error(
      `Automation Layer returned invalid JSON: ${text.slice(0, 300)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      `Automation Layer HTTP ${response.status}`
    );
  }

  return data;
}

/**
 * Build Feedback from Automation.
 */
async function buildFeedbackFromRequest(
  context,
  input = {}
) {
  const url = new URL(
    context.request.url
  );

  const contentId =
    url.searchParams.get(
      "content_id"
    ) ||
    null;

  const rawAutomation =
    await fetchAutomationFromRequest(
      context,
      contentId
    );

  const executionData =
    normalizeExecution(
      rawAutomation
    );

  validateSourceChain(
    executionData
  );

  const feedback =
    buildFeedback(
      executionData,
      input
    );

  return {
    executionData,
    feedback
  };
}

/**
 * GET
 *
 * Preview only.
 */
export async function onRequestGet(
  context
) {
  try {
    const result =
      await buildFeedbackFromRequest(
        context
      );

    return json({
      success: true,

      layer: LAYER,
      version: VERSION,

      mode: "PREVIEW",
      status: "FEEDBACK_READY",

      content:
        result.executionData.content,

      action:
        result.executionData.action,

      execution:
        result.executionData.execution,

      feedback:
        result.feedback,

      evidence:
        result.executionData.evidence,

      learning:
        result.executionData.learning,

      intelligence:
        result.executionData.intelligence,

      funnel:
        result.executionData.funnel,

      source_chain: [
        "CONTENT_MEASUREMENT_ENGINE_V2.2",
        "INTELLIGENCE_LAYER_V2",
        "LEARNING_ENGINE_V2",
        "DECISION_LAYER_V1",
        "ACTION_LAYER_V1",
        "AUTOMATION_EXECUTION_V1",
        "FEEDBACK_LAYER_V1"
      ],

      guardrails: {
        reads_raw_behavior_events: false,
        recalculates_measurement: false,
        recalculates_intelligence: false,
        recalculates_learning: false,
        creates_decision: false,
        changes_strategy: false,
        winner_declared: false,
        automatic_execution: false,
        external_execution: false,
        action_executed: false,
        feedback_recorded: false
      },

      loop: {
        current_layer: "FEEDBACK_LAYER_V1",
        next_layer: "MEASUREMENT_V2.2",
        closed: false
      },

      saved: false,

      timestamp:
        new Date().toISOString()
    });

  } catch (error) {
    return json(
      {
        success: false,

        layer: LAYER,
        version: VERSION,

        status: "ERROR",

        error:
          error?.message ||
          String(error),

        guardrails: {
          automatic_execution: false,
          external_execution: false,
          feedback_recorded: false
        }
      },
      500
    );
  }
}

/**
 * POST
 *
 * Supported modes:
 *
 * preview
 * record
 */
export async function onRequestPost(
  context
) {
  try {
    let body = {};

    try {
      body =
        await context.request.json();
    } catch (_) {
      body = {};
    }

    const mode =
      s(
        body?.mode ||
        "preview"
      ).toLowerCase();

    if (
      ![
        "preview",
        "record"
      ].includes(mode)
    ) {
      return json(
        {
          success: false,
          layer: LAYER,
          version: VERSION,
          status: "ERROR",
          error:
            "Invalid mode. Allowed: preview, record"
        },
        400
      );
    }

    const result =
      await buildFeedbackFromRequest(
        context,
        body
      );

    /**
     * PREVIEW
     */
    if (mode === "preview") {
      return json({
        success: true,

        layer: LAYER,
        version: VERSION,

        mode: "PREVIEW",
        status: "FEEDBACK_READY",

        content:
          result.executionData.content,

        action:
          result.executionData.action,

        execution:
          result.executionData.execution,

        feedback:
          result.feedback,

        queue: {
          status: "NOT_SAVED"
        },

        loop: {
          current_layer:
            "FEEDBACK_LAYER_V1",
          next_layer:
            "MEASUREMENT_V2.2",
          closed: false
        },

        guardrails: {
          reads_raw_behavior_events: false,
          recalculates_measurement: false,
          recalculates_intelligence: false,
          recalculates_learning: false,
          creates_decision: false,
          changes_strategy: false,
          winner_declared: false,
          automatic_execution: false,
          external_execution: false,
          action_executed: false,
          feedback_recorded: false
        },

        saved: false,

        timestamp:
          new Date().toISOString()
      });
    }

    /**
     * RECORD
     */
    const executionId =
      s(
        body?.execution_id ||
        ""
      ) ||
      null;

    result.feedback.execution_id =
      executionId;

    const saved =
      await saveFeedback(
        context.env,
        result.executionData,
        result.feedback
      );

    return json({
      success: true,

      layer: LAYER,
      version: VERSION,

      mode: "RECORD",
      status: "FEEDBACK_RECORDED",

      content:
        result.executionData.content,

      action:
        result.executionData.action,

      execution:
        result.executionData.execution,

      feedback:
        result.feedback,

      record:
        saved,

      loop: {
        current_layer:
          "FEEDBACK_LAYER_V1",
        next_layer:
          "MEASUREMENT_V2.2",
        closed: false,
        measurement_required: true
      },

      guardrails: {
        reads_raw_behavior_events: false,
        recalculates_measurement: false,
        recalculates_intelligence: false,
        recalculates_learning: false,
        creates_decision: false,
        changes_strategy: false,
        winner_declared: false,
        automatic_execution: false,
        external_execution: false,
        action_executed: false,
        feedback_recorded: true
      },

      saved: true,

      timestamp:
        new Date().toISOString()
    });

  } catch (error) {
    return json(
      {
        success: false,

        layer: LAYER,
        version: VERSION,

        status: "ERROR",

        error:
          error?.message ||
          String(error),

        guardrails: {
          automatic_execution: false,
          external_execution: false,
          feedback_recorded: false
        }
      },
      500
    );
  }
}
