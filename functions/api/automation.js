// TATO-OS
// Automation / Execution Layer V1.0
// Route: /api/automation
//
// Current Architecture:
//
// Measurement V2.3
//        ↓
// Intelligence V2.1
//        ↓
// Learning V2.3
//        ↓
// Decision V1.2
//        ↓
// Action V1.0
//        ↓
// Automation / Execution V1.0
//        ↓
// Feedback
//        ↓
// Measurement
//
// Automation / Execution Layer DOES:
// - read Action Layer
// - validate Action contract
// - create an execution job
// - require human approval for V1 actions
// - execute only approved internal execution jobs
// - record execution status
//
// Automation / Execution Layer DOES NOT:
// - read raw behavior_events
// - recalculate measurement
// - recalculate intelligence
// - recalculate learning
// - create decisions
// - change strategy
// - declare winners
// - execute external services automatically in V1.0
//
// V1.0 = CONTROLLED EXECUTION
// External execution remains disabled.

const VERSION = "1.0";
const LAYER = "AUTOMATION_EXECUTION_V1";

const ACTION_LAYER = "ACTION_LAYER_V1";
const ACTION_VERSION = "1.0";

const MEASUREMENT_LAYER =
  "CONTENT_MEASUREMENT_ENGINE_V2.3";

const INTELLIGENCE_LAYER =
  "INTELLIGENCE_LAYER_V2";

const INTELLIGENCE_VERSION = "2.1";

const INTELLIGENCE_ENGINE =
  "INTELLIGENCE_V2.1_FEEDBACK_AWARE";

const LEARNING_LAYER =
  "LEARNING_ENGINE_V2";

const LEARNING_VERSION = "2.3";

const LEARNING_ENGINE =
  "LEARNING_V2.3_FEEDBACK_AWARE";

const DECISION_LAYER =
  "DECISION_LAYER_V1";

const DECISION_VERSION = "1.2";

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
 * Validate Action Layer contract.
 *
 * Automation consumes Action only.
 * It does not bypass Action Layer.
 */
function normalizeAction(root) {
  if (!root || root.success !== true) {
    throw new Error(
      "Action Layer response is invalid"
    );
  }

  if (root.layer !== ACTION_LAYER) {
    throw new Error(
      `Invalid Action Layer: expected ${ACTION_LAYER}, received ${s(root.layer)}`
    );
  }

  if (root.version !== ACTION_VERSION) {
    throw new Error(
      `Invalid Action version: expected ${ACTION_VERSION}, received ${s(root.version)}`
    );
  }

  if (root.status !== "ACTION_READY") {
    throw new Error(
      `Action is not ready: ${s(root.status)}`
    );
  }

  const action = root.action || {};
  const decision = root.decision || {};
  const content = root.content || null;

  if (!s(action.action_type)) {
    throw new Error(
      "Action type is missing"
    );
  }

  if (!s(action.action_code)) {
    throw new Error(
      "Action code is missing"
    );
  }

  if (!s(action.target)) {
    throw new Error(
      "Action target is missing"
    );
  }

  if (!s(action.execution_mode)) {
    throw new Error(
      "Action execution mode is missing"
    );
  }

  if (action.external_execution !== false) {
    throw new Error(
      "Action contract violation: external_execution must be false"
    );
  }

  if (action.requires_human_approval !== true) {
    throw new Error(
      "Action contract violation: requires_human_approval must be true"
    );
  }

  if (
    root.guardrails?.automatic_execution !== false
  ) {
    throw new Error(
      "Action contract violation: automatic_execution must be false"
    );
  }

  if (
    root.guardrails?.external_execution !== false
  ) {
    throw new Error(
      "Action contract violation: external_execution must be false"
    );
  }

  if (
    root.guardrails?.action_executed !== false
  ) {
    throw new Error(
      "Action contract violation: action_executed must be false"
    );
  }

  return {
    content,

    decision: {
      priority: s(
        decision.priority || "LOW"
      ).toUpperCase(),

      type: s(decision.type),

      target: s(decision.target),

      reason: s(decision.reason)
    },

    action: {
      action_type:
        s(action.action_type),

      action_code:
        s(action.action_code),

      priority:
        s(
          action.priority ||
          decision.priority ||
          "LOW"
        ).toUpperCase(),

      target:
        s(action.target),

      title:
        s(action.title),

      description:
        s(action.description),

      objective:
        s(action.objective),

      execution_mode:
        s(action.execution_mode),

      requires_human_approval:
        bool(
          action.requires_human_approval
        ),

      external_execution:
        action.external_execution === true
    },

    evidence:
      root.evidence || {},

    learning:
      root.learning || {},

    intelligence:
      root.intelligence || {},

    funnel:
      root.funnel || {},

    source_chain:
      Array.isArray(root.source_chain)
        ? root.source_chain
        : [],

    source_contract:
      root.source_contract || {},

    guardrails:
      root.guardrails || {},

    handoff:
      root.handoff || {},

    execution:
      root.execution || {},

    timestamp:
      root.timestamp || null
  };
}

/**
 * Validate current upstream chain.
 *
 * Action V1.0 must come from:
 *
 * Measurement V2.3
 * Intelligence V2.1
 * Learning V2.3
 * Decision V1.2
 * Action V1.0
 */
function validateSourceChain(actionData) {
  const chain =
    actionData.source_chain;

  const required = [
    MEASUREMENT_LAYER,
    INTELLIGENCE_ENGINE,
    LEARNING_ENGINE,
    DECISION_LAYER,
    ACTION_LAYER
  ];

  for (const layer of required) {
    if (!chain.includes(layer)) {
      throw new Error(
        `Invalid Action source chain: missing ${layer}`
      );
    }
  }

  /*
   * Validate source contract when available.
   */
  const contract =
    actionData.source_contract || {};

  const measurement =
    contract.measurement || {};

  const intelligence =
    contract.intelligence || {};

  const learning =
    contract.learning || {};

  const decision =
    contract.decision || {};

  if (
    measurement.layer &&
    measurement.layer !==
      MEASUREMENT_LAYER
  ) {
    throw new Error(
      `Invalid Measurement contract: expected ${MEASUREMENT_LAYER}, received ${measurement.layer}`
    );
  }

  if (
    intelligence.version &&
    intelligence.version !==
      INTELLIGENCE_VERSION
  ) {
    throw new Error(
      `Invalid Intelligence version: expected ${INTELLIGENCE_VERSION}, received ${intelligence.version}`
    );
  }

  if (
    intelligence.engine &&
    intelligence.engine !==
      INTELLIGENCE_ENGINE
  ) {
    throw new Error(
      `Invalid Intelligence engine: expected ${INTELLIGENCE_ENGINE}, received ${intelligence.engine}`
    );
  }

  if (
    learning.layer &&
    learning.layer !==
      LEARNING_LAYER
  ) {
    throw new Error(
      `Invalid Learning Layer: expected ${LEARNING_LAYER}, received ${learning.layer}`
    );
  }

  if (
    learning.version &&
    learning.version !==
      LEARNING_VERSION
  ) {
    throw new Error(
      `Invalid Learning version: expected ${LEARNING_VERSION}, received ${learning.version}`
    );
  }

  if (
    learning.engine &&
    learning.engine !==
      LEARNING_ENGINE
  ) {
    throw new Error(
      `Invalid Learning engine: expected ${LEARNING_ENGINE}, received ${learning.engine}`
    );
  }

  if (
    decision.layer &&
    decision.layer !==
      DECISION_LAYER
  ) {
    throw new Error(
      `Invalid Decision Layer: expected ${DECISION_LAYER}, received ${decision.layer}`
    );
  }

  if (
    decision.version &&
    decision.version !==
      DECISION_VERSION
  ) {
    throw new Error(
      `Invalid Decision version: expected ${DECISION_VERSION}, received ${decision.version}`
    );
  }

  return true;
}

/**
 * Only known V1 action codes are allowed.
 *
 * V1 intentionally supports controlled/manual execution.
 */
function buildExecutionPlan(actionData) {
  const action =
    actionData.action;

  if (
    action.action_code ===
      "INVESTIGATE_CLICK_TO_PRODUCT_VIEW" &&
    action.target ===
      "CLICK_TO_PRODUCT_VIEW_PATH"
  ) {
    return {
      execution_type:
        "MANUAL_TASK",

      execution_code:
        "MANUAL_INVESTIGATE_CLICK_TO_PRODUCT_VIEW",

      execution_mode:
        "MANUAL_INVESTIGATION",

      title:
        action.title,

      objective:
        action.objective,

      instructions: [
        "ตรวจสอบ URL หรือปลายทางของ Click จาก Content",
        "ตรวจสอบว่า Click สามารถเปิด Product View ได้จริง",
        "ตรวจสอบ event tracking ของ Product View",
        "ตรวจสอบ content_id / product_id attribution",
        "บันทึกผลการตรวจสอบกลับเข้าสู่ระบบ Feedback"
      ],

      external_execution:
        false,

      requires_human_approval:
        true
    };
  }

  return {
    execution_type:
      "MANUAL_TASK",

    execution_code:
      "MANUAL_INVESTIGATE_ACTION",

    execution_mode:
      "MANUAL_INVESTIGATION",

    title:
      action.title ||
      `ตรวจสอบ ${action.target}`,

    objective:
      action.objective ||
      "ตรวจสอบ Action ก่อนดำเนินการจริง",

    instructions: [
      "ตรวจสอบหลักฐานของ Action",
      "ตรวจสอบเป้าหมายของ Action",
      "ตรวจสอบผลกระทบก่อนดำเนินการ",
      "บันทึกผลการดำเนินงานกลับเข้าสู่ระบบ Feedback"
    ],

    external_execution:
      false,

    requires_human_approval:
      true
  };
}

/**
 * Create execution queue.
 */
async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS execution_queue (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      action_code TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target TEXT NOT NULL,
      priority TEXT,
      execution_type TEXT,
      execution_code TEXT,
      execution_mode TEXT,
      status TEXT NOT NULL,
      requires_human_approval INTEGER NOT NULL DEFAULT 1,
      approved INTEGER NOT NULL DEFAULT 0,
      external_execution INTEGER NOT NULL DEFAULT 0,
      executed INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      action_payload TEXT,
      execution_payload TEXT,
      result_payload TEXT,
      created_at TEXT NOT NULL,
      approved_at TEXT,
      executed_at TEXT,
      updated_at TEXT NOT NULL
    )
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_execution_queue_status
    ON execution_queue(status)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_execution_queue_content
    ON execution_queue(content_id)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_execution_queue_action
    ON execution_queue(action_code)
  `).run();
}

/**
 * Call Action Layer from the same deployment origin.
 */
async function fetchActionFromRequest(
  context,
  contentId
) {
  const currentUrl =
    new URL(context.request.url);

  const url =
    new URL(
      "/api/actions",
      currentUrl.origin
    );

  if (contentId) {
    url.searchParams.set(
      "content_id",
      contentId
    );
  }

  const response =
    await fetch(
      url.toString(),
      {
        method: "GET",

        headers: {
          "Accept":
            "application/json",

          "Cache-Control":
            "no-cache"
        }
      }
    );

  const text =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(text);
  } catch (_) {
    throw new Error(
      `Action Layer returned invalid JSON: ${text.slice(
        0,
        300
      )}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
        `Action Layer HTTP ${response.status}`
    );
  }

  return data;
}

/**
 * Save execution job.
 */
async function createExecutionJob(
  env,
  actionData,
  executionPlan
) {
  if (!env.DB) {
    throw new Error(
      "D1 binding DB is missing"
    );
  }

  await ensureTable(env.DB);

  const now =
    new Date().toISOString();

  const executionId =
    id();

  const contentId =
    actionData.content?.id ||
    null;

  await env.DB.prepare(`
    INSERT INTO execution_queue (
      id,
      content_id,
      action_code,
      action_type,
      target,
      priority,
      execution_type,
      execution_code,
      execution_mode,
      status,
      requires_human_approval,
      approved,
      external_execution,
      executed,
      error,
      action_payload,
      execution_payload,
      result_payload,
      created_at,
      approved_at,
      executed_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      executionId,

      contentId,

      actionData.action.action_code,

      actionData.action.action_type,

      actionData.action.target,

      actionData.action.priority,

      executionPlan.execution_type,

      executionPlan.execution_code,

      executionPlan.execution_mode,

      "PENDING_APPROVAL",

      executionPlan.requires_human_approval
        ? 1
        : 0,

      0,

      executionPlan.external_execution
        ? 1
        : 0,

      0,

      null,

      JSON.stringify(
        actionData.action
      ),

      JSON.stringify(
        executionPlan
      ),

      null,

      now,

      null,

      null,

      now
    )
    .run();

  return {
    id: executionId,

    status:
      "PENDING_APPROVAL",

    created_at:
      now
  };
}

/**
 * Approve queued execution.
 *
 * Approval changes state only.
 * No external service is called.
 */
async function approveExecution(
  env,
  executionId
) {
  if (!env.DB) {
    throw new Error(
      "D1 binding DB is missing"
    );
  }

  await ensureTable(env.DB);

  const existing =
    await env.DB
      .prepare(`
        SELECT *
        FROM execution_queue
        WHERE id = ?
        LIMIT 1
      `)
      .bind(executionId)
      .first();

  if (!existing) {
    throw new Error(
      "Execution job not found"
    );
  }

  if (
    existing.status !==
      "PENDING_APPROVAL"
  ) {
    throw new Error(
      `Execution cannot be approved from status ${existing.status}`
    );
  }

  const now =
    new Date().toISOString();

  await env.DB.prepare(`
    UPDATE execution_queue
    SET
      status = ?,
      approved = 1,
      approved_at = ?,
      updated_at = ?
    WHERE id = ?
  `)
    .bind(
      "APPROVED",
      now,
      now,
      executionId
    )
    .run();

  return {
    id:
      executionId,

    status:
      "APPROVED",

    approved:
      true,

    approved_at:
      now
  };
}

/**
 * Execute approved job.
 *
 * V1.0 performs no external execution.
 *
 * For manual investigation,
 * execution means the task is released
 * to the human operator.
 */
async function executeApproved(
  env,
  executionId
) {
  if (!env.DB) {
    throw new Error(
      "D1 binding DB is missing"
    );
  }

  await ensureTable(env.DB);

  const existing =
    await env.DB
      .prepare(`
        SELECT *
        FROM execution_queue
        WHERE id = ?
        LIMIT 1
      `)
      .bind(executionId)
      .first();

  if (!existing) {
    throw new Error(
      "Execution job not found"
    );
  }

  if (
    existing.status !==
      "APPROVED"
  ) {
    throw new Error(
      `Execution requires APPROVED status. Current status: ${existing.status}`
    );
  }

  if (
    Number(
      existing.external_execution
    ) === 1
  ) {
    throw new Error(
      "External execution is disabled in Automation / Execution V1.0"
    );
  }

  const now =
    new Date().toISOString();

  const result = {
    execution_type:
      existing.execution_type,

    execution_code:
      existing.execution_code,

    execution_mode:
      existing.execution_mode,

    result:
      "RELEASED_TO_OPERATOR",

    external_execution:
      false,

    message:
      "Manual task released. No external service was executed."
  };

  await env.DB.prepare(`
    UPDATE execution_queue
    SET
      status = ?,
      executed = 1,
      result_payload = ?,
      executed_at = ?,
      updated_at = ?
    WHERE id = ?
  `)
    .bind(
      "EXECUTED",

      JSON.stringify(result),

      now,

      now,

      executionId
    )
    .run();

  return {
    id:
      executionId,

    status:
      "EXECUTED",

    executed:
      true,

    external_execution:
      false,

    executed_at:
      now,

    result
  };
}

/**
 * Build Automation preview.
 */
async function buildAutomation(
  context
) {
  const url =
    new URL(context.request.url);

  const contentId =
    url.searchParams.get(
      "content_id"
    ) || null;

  const rawAction =
    await fetchActionFromRequest(
      context,
      contentId
    );

  const actionData =
    normalizeAction(
      rawAction
    );

  validateSourceChain(
    actionData
  );

  const executionPlan =
    buildExecutionPlan(
      actionData
    );

  return {
    actionData,
    executionPlan
  };
}

/**
 * GET
 *
 * Preview only.
 * Does not save.
 * Does not execute.
 */
export async function onRequestGet(
  context
) {
  try {
    const result =
      await buildAutomation(
        context
      );

    return json({
      success: true,

      layer:
        LAYER,

      version:
        VERSION,

      engine:
        "AUTOMATION_V1.0_ACTION_V1.0_COMPATIBLE",

      mode:
        "PREVIEW",

      status:
        "EXECUTION_READY",

      content:
        result.actionData.content,

      action:
        result.actionData.action,

      execution: {
        ...result.executionPlan,

        status:
          "PENDING_APPROVAL",

        approved:
          false,

        executed:
          false
      },

      decision:
        result.actionData.decision,

      evidence:
        result.actionData.evidence,

      learning:
        result.actionData.learning,

      intelligence:
        result.actionData.intelligence,

      funnel:
        result.actionData.funnel,

      source_chain: [
        MEASUREMENT_LAYER,
        INTELLIGENCE_ENGINE,
        LEARNING_ENGINE,
        DECISION_LAYER,
        ACTION_LAYER,
        LAYER
      ],

      source_contract: {
        measurement: {
          layer:
            MEASUREMENT_LAYER
        },

        intelligence: {
          layer:
            INTELLIGENCE_LAYER,

          version:
            INTELLIGENCE_VERSION,

          engine:
            INTELLIGENCE_ENGINE
        },

        learning: {
          layer:
            LEARNING_LAYER,

          version:
            LEARNING_VERSION,

          engine:
            LEARNING_ENGINE
        },

        decision: {
          layer:
            DECISION_LAYER,

          version:
            DECISION_VERSION
        },

        action: {
          layer:
            ACTION_LAYER,

          version:
            ACTION_VERSION
        },

        automation: {
          layer:
            LAYER,

          version:
            VERSION
        }
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

        creates_decision:
          false,

        changes_strategy:
          false,

        winner_declared:
          false,

        automatic_execution:
          false,

        external_execution:
          false,

        action_executed:
          false,

        requires_human_approval:
          true
      },

      execution_policy: {
        mode:
          "CONTROLLED_EXECUTION",

        approval_required:
          true,

        external_execution_enabled:
          false,

        automatic_execution_enabled:
          false
      },

      handoff: {
        next_layer:
          "FEEDBACK",

        execution_ready:
          true,

        approval_required:
          true,

        execute:
          false
      },

      saved:
        false,

      timestamp:
        new Date().toISOString()
    });
  } catch (error) {
    return json(
      {
        success:
          false,

        layer:
          LAYER,

        version:
          VERSION,

        status:
          "ERROR",

        error:
          error?.message ||
          String(error),

        guardrails: {
          automatic_execution:
            false,

          external_execution:
            false,

          action_executed:
            false
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
 * queue
 * approve
 * execute
 *
 * V1.0 execution is controlled.
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
        "queue",
        "approve",
        "execute"
      ].includes(mode)
    ) {
      return json(
        {
          success:
            false,

          layer:
            LAYER,

          version:
            VERSION,

          status:
            "ERROR",

          error:
            "Invalid mode. Allowed: preview, queue, approve, execute"
        },
        400
      );
    }

    /**
     * APPROVE
     */
    if (
      mode ===
        "approve"
    ) {
      const executionId =
        s(
          body?.execution_id
        );

      if (!executionId) {
        return json(
          {
            success:
              false,

            layer:
              LAYER,

            version:
              VERSION,

            status:
              "ERROR",

            error:
              "execution_id is required for approve mode"
          },
          400
        );
      }

      const result =
        await approveExecution(
          context.env,
          executionId
        );

      return json({
        success:
          true,

        layer:
          LAYER,

        version:
          VERSION,

        mode:
          "APPROVE",

        status:
          "APPROVED",

        execution:
          result,

        guardrails: {
          automatic_execution:
            false,

          external_execution:
            false,

          action_executed:
            false,

          requires_human_approval:
            true
        },

        timestamp:
          new Date().toISOString()
      });
    }

    /**
     * EXECUTE
     *
     * Requires an already approved job.
     */
    if (
      mode ===
        "execute"
    ) {
      const executionId =
        s(
          body?.execution_id
        );

      if (!executionId) {
        return json(
          {
            success:
              false,

            layer:
              LAYER,

            version:
              VERSION,

            status:
              "ERROR",

            error:
              "execution_id is required for execute mode"
          },
          400
        );
      }

      const result =
        await executeApproved(
          context.env,
          executionId
        );

      return json({
        success:
          true,

        layer:
          LAYER,

        version:
          VERSION,

        mode:
          "EXECUTE",

        status:
          "EXECUTED",

        execution:
          result,

        guardrails: {
          automatic_execution:
            false,

          external_execution:
            false,

          action_executed:
            true,

          requires_human_approval:
            true
        },

        timestamp:
          new Date().toISOString()
      });
    }

    /**
     * PREVIEW / QUEUE
     */
    const result =
      await buildAutomation(
        context
      );

    /**
     * PREVIEW
     */
    if (
      mode ===
        "preview"
    ) {
      return json({
        success:
          true,

        layer:
          LAYER,

        version:
          VERSION,

        engine:
          "AUTOMATION_V1.0_ACTION_V1.0_COMPATIBLE",

        mode:
          "PREVIEW",

        status:
          "EXECUTION_READY",

        content:
          result.actionData.content,

        action:
          result.actionData.action,

        execution: {
          ...result.executionPlan,

          status:
            "PENDING_APPROVAL",

          approved:
            false,

          executed:
            false
        },

        decision:
          result.actionData.decision,

        evidence:
          result.actionData.evidence,

        learning:
          result.actionData.learning,

        intelligence:
          result.actionData.intelligence,

        funnel:
          result.actionData.funnel,

        queue: {
          status:
            "NOT_SAVED"
        },

        source_chain: [
          MEASUREMENT_LAYER,
          INTELLIGENCE_ENGINE,
          LEARNING_ENGINE,
          DECISION_LAYER,
          ACTION_LAYER,
          LAYER
        ],

        guardrails: {
          reads_raw_behavior_events:
            false,

          recalculates_measurement:
            false,

          recalculates_intelligence:
            false,

          recalculates_learning:
            false,

          creates_decision:
            false,

          changes_strategy:
            false,

          winner_declared:
            false,

          automatic_execution:
            false,

          external_execution:
            false,

          action_executed:
            false,

          requires_human_approval:
            true
        },

        execution_policy: {
          mode:
            "CONTROLLED_EXECUTION",

          approval_required:
            true,

          external_execution_enabled:
            false,

          automatic_execution_enabled:
            false
        },

        saved:
          false,

        timestamp:
          new Date().toISOString()
      });
    }

    /**
     * QUEUE
     *
     * Creates execution job.
     * Nothing executes yet.
     */
    const queued =
      await createExecutionJob(
        context.env,
        result.actionData,
        result.executionPlan
      );

    return json({
      success:
        true,

      layer:
        LAYER,

      version:
        VERSION,

      engine:
        "AUTOMATION_V1.0_ACTION_V1.0_COMPATIBLE",

      mode:
        "QUEUE",

      status:
        "PENDING_APPROVAL",

      content:
        result.actionData.content,

      action:
        result.actionData.action,

      execution: {
        ...result.executionPlan,

        status:
          "PENDING_APPROVAL",

        approved:
          false,

        executed:
          false
      },

      decision:
        result.actionData.decision,

      evidence:
        result.actionData.evidence,

      learning:
        result.actionData.learning,

      intelligence:
        result.actionData.intelligence,

      funnel:
        result.actionData.funnel,

      queue:
        queued,

      source_chain: [
        MEASUREMENT_LAYER,
        INTELLIGENCE_ENGINE,
        LEARNING_ENGINE,
        DECISION_LAYER,
        ACTION_LAYER,
        LAYER
      ],

      guardrails: {
        reads_raw_behavior_events:
          false,

        recalculates_measurement:
          false,

        recalculates_intelligence:
          false,

        recalculates_learning:
          false,

        creates_decision:
          false,

        changes_strategy:
          false,

        winner_declared:
          false,

        automatic_execution:
          false,

        external_execution:
          false,

        action_executed:
          false,

        requires_human_approval:
          true
      },

      execution_policy: {
        mode:
          "CONTROLLED_EXECUTION",

        approval_required:
          true,

        external_execution_enabled:
          false,

        automatic_execution_enabled:
          false
      },

      saved:
        true,

      timestamp:
        new Date().toISOString()
    });
  } catch (error) {
    return json(
      {
        success:
          false,

        layer:
          LAYER,

        version:
          VERSION,

        status:
          "ERROR",

        error:
          error?.message ||
          String(error),

        guardrails: {
          automatic_execution:
            false,

          external_execution:
            false,

          action_executed:
            false,

          requires_human_approval:
            true
        }
      },
      500
    );
  }
}
