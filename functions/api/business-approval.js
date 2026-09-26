// TATO-OS
// Business Approval Layer V1.0
// Route: /api/business-approval
//
// Pipeline:
//
// Business Decision
//        ↓
// Business Action
//        ↓
// Business Approval
//        ↓
// APPROVED / REJECTED
//        ↓
// Execution Layer
//
// Business Approval DOES:
// - validate the action
// - require explicit human approval
// - persist approval state in D1
// - prevent duplicate approval
// - preserve action traceability
//
// Business Approval does NOT:
// - execute the action
// - publish content
// - spend money
// - guarantee revenue
// - change strategy

const ENGINE = "BUSINESS_APPROVAL_V1";
const VERSION = "1.0";

const ACTION_TYPE = "CREATE_MARKET_TEST";
const TABLE_NAME = "business_action_approvals";

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

function normalize(value) {
  return value == null ? "" : String(value).trim();
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

async function ensureTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS business_action_approvals (
      id TEXT PRIMARY KEY,
      action_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      market_theme TEXT,
      opportunity_type TEXT,
      decision_id TEXT,
      status TEXT NOT NULL,
      approval_action TEXT NOT NULL,
      approved_by TEXT,
      reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
}

async function getLatestApproval(env) {
  const result = await env.DB.prepare(`
    SELECT
      id,
      action_id,
      action_type,
      market_theme,
      opportunity_type,
      decision_id,
      status,
      approval_action,
      approved_by,
      reason,
      created_at,
      updated_at
    FROM business_action_approvals
    ORDER BY created_at DESC
    LIMIT 1
  `).all();

  return result.results && result.results.length
    ? result.results[0]
    : null;
}

async function getApprovalByActionId(env, actionId) {
  const result = await env.DB.prepare(`
    SELECT
      id,
      action_id,
      action_type,
      market_theme,
      opportunity_type,
      decision_id,
      status,
      approval_action,
      approved_by,
      reason,
      created_at,
      updated_at
    FROM business_action_approvals
    WHERE action_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `)
    .bind(actionId)
    .all();

  return result.results && result.results.length
    ? result.results[0]
    : null;
}

function validateAction(body) {
  const actionId = normalize(body.action_id);
  const actionType = normalize(body.action_type);
  const marketTheme = normalize(body.market_theme);
  const opportunityType = normalize(body.opportunity_type);
  const decisionId = normalize(body.decision_id);

  if (!actionId) {
    return {
      valid: false,
      error: "action_id_required"
    };
  }

  if (actionType !== ACTION_TYPE) {
    return {
      valid: false,
      error: "unsupported_action_type"
    };
  }

  if (!marketTheme) {
    return {
      valid: false,
      error: "market_theme_required"
    };
  }

  return {
    valid: true,
    action: {
      action_id: actionId,
      action_type: actionType,
      market_theme: marketTheme,
      opportunity_type: opportunityType || "UNKNOWN",
      decision_id: decisionId || null
    }
  };
}

async function approveAction(env, action, approvedBy, reason) {
  const existing = await getApprovalByActionId(
    env,
    action.action_id
  );

  if (existing) {
    return {
      success: false,
      duplicate: true,
      existing
    };
  }

  const id = makeId("approval");
  const timestamp = now();

  await env.DB.prepare(`
    INSERT INTO business_action_approvals (
      id,
      action_id,
      action_type,
      market_theme,
      opportunity_type,
      decision_id,
      status,
      approval_action,
      approved_by,
      reason,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      id,
      action.action_id,
      action.action_type,
      action.market_theme,
      action.opportunity_type,
      action.decision_id,
      "APPROVED",
      "APPROVE",
      approvedBy,
      reason || null,
      timestamp,
      timestamp
    )
    .run();

  return {
    success: true,
    duplicate: false,
    approval: {
      id,
      action_id: action.action_id,
      action_type: action.action_type,
      market_theme: action.market_theme,
      opportunity_type: action.opportunity_type,
      decision_id: action.decision_id,
      status: "APPROVED",
      approval_action: "APPROVE",
      approved_by: approvedBy,
      reason: reason || null,
      created_at: timestamp,
      updated_at: timestamp
    }
  };
}

async function rejectAction(env, action, approvedBy, reason) {
  const existing = await getApprovalByActionId(
    env,
    action.action_id
  );

  if (existing) {
    return {
      success: false,
      duplicate: true,
      existing
    };
  }

  const id = makeId("approval");
  const timestamp = now();

  await env.DB.prepare(`
    INSERT INTO business_action_approvals (
      id,
      action_id,
      action_type,
      market_theme,
      opportunity_type,
      decision_id,
      status,
      approval_action,
      approved_by,
      reason,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      id,
      action.action_id,
      action.action_type,
      action.market_theme,
      action.opportunity_type,
      action.decision_id,
      "REJECTED",
      "REJECT",
      approvedBy,
      reason || null,
      timestamp,
      timestamp
    )
    .run();

  return {
    success: true,
    duplicate: false,
    approval: {
      id,
      action_id: action.action_id,
      action_type: action.action_type,
      market_theme: action.market_theme,
      opportunity_type: action.opportunity_type,
      decision_id: action.decision_id,
      status: "REJECTED",
      approval_action: "REJECT",
      approved_by: approvedBy,
      reason: reason || null,
      created_at: timestamp,
      updated_at: timestamp
    }
  };
}

export async function onRequestGet(context) {
  const timestamp = now();

  try {
    await ensureTable(context.env);

    const latest = await getLatestApproval(context.env);

    return json({
      success: true,
      engine: ENGINE,
      version: VERSION,
      timestamp,

      state: latest
        ? "APPROVAL_STATE_AVAILABLE"
        : "WAITING_FOR_APPROVAL",

      summary: {
        approval_records: latest ? 1 : 0,
        latest_status: latest
          ? latest.status
          : "PENDING_APPROVAL"
      },

      latest_approval: latest,

      approval_contract: {
        accepted_action: ACTION_TYPE,
        human_approval_required: true,
        automatic_approval: false,
        execution_started: false
      },

      handoff: {
        ready: latest && latest.status === "APPROVED",
        next_layer:
          latest && latest.status === "APPROVED"
            ? "EXECUTION_LAYER"
            : "BUSINESS_APPROVAL"
      },

      guardrails: {
        executes_action: false,
        publishes_content: false,
        spends_money: false,
        changes_strategy: false,
        guarantees_revenue: false,
        automatic_approval: false
      },

      data_integrity: {
        persistence: "D1",
        table: TABLE_NAME,
        duplicate_approval_blocked: true
      }
    });
  } catch (error) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        timestamp,
        state: "ERROR",
        error: String(
          error && error.message
            ? error.message
            : error
        )
      },
      500
    );
  }
}

export async function onRequestPost(context) {
  const timestamp = now();

  try {
    await ensureTable(context.env);

    const body = await context.request.json();

    const validation = validateAction(body);

    if (!validation.valid) {
      return json(
        {
          success: false,
          engine: ENGINE,
          version: VERSION,
          timestamp,
          state: "INVALID_APPROVAL_REQUEST",
          error: validation.error
        },
        400
      );
    }

    const action = validation.action;

    const approvalAction = normalize(
      body.approval_action
    ).toUpperCase();

    const approvedBy =
      normalize(body.approved_by) || "HUMAN";

    const reason = normalize(body.reason);

    if (
      approvalAction !== "APPROVE" &&
      approvalAction !== "REJECT"
    ) {
      return json(
        {
          success: false,
          engine: ENGINE,
          version: VERSION,
          timestamp,
          state: "INVALID_APPROVAL_ACTION",
          error:
            "approval_action must be APPROVE or REJECT"
        },
        400
      );
    }

    let result;

    if (approvalAction === "APPROVE") {
      result = await approveAction(
        context.env,
        action,
        approvedBy,
        reason
      );
    } else {
      result = await rejectAction(
        context.env,
        action,
        approvedBy,
        reason
      );
    }

    if (result.duplicate) {
      return json(
        {
          success: false,
          engine: ENGINE,
          version: VERSION,
          timestamp,
          state: "ALREADY_PROCESSED",
          error:
            "This action already has an approval decision.",
          existing_approval: result.existing,
          guardrails: {
            duplicate_approval_blocked: true,
            executes_action: false
          }
        },
        409
      );
    }

    const approved =
      result.approval.status === "APPROVED";

    return json({
      success: true,
      engine: ENGINE,
      version: VERSION,
      timestamp,

      state: approved
        ? "APPROVED"
        : "REJECTED",

      approval: result.approval,

      handoff: {
        ready: approved,
        next_layer: approved
          ? "EXECUTION_LAYER"
          : "BUSINESS_ACTION",
        reason: approved
          ? "Human approval has been recorded. Execution remains a separate step."
          : "Action was rejected and must not proceed to execution."
      },

      execution: {
        started: false,
        automatic: false,
        next_layer: approved
          ? "EXECUTION_LAYER"
          : null
      },

      guardrails: {
        executes_action: false,
        publishes_content: false,
        spends_money: false,
        changes_strategy: false,
        guarantees_revenue: false,
        automatic_approval: false,
        duplicate_approval_blocked: true
      },

      contract: {
        current_layer: ENGINE,
        version: VERSION,
        previous_layer: "BUSINESS_ACTION_V1",
        next_layer: approved
          ? "EXECUTION_LAYER"
          : "BUSINESS_ACTION",
        human_approval_required: true,
        execution_started: false
      }
    });
  } catch (error) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        timestamp,
        state: "ERROR",
        error: String(
          error && error.message
            ? error.message
            : error
        )
      },
      500
    );
  }
}
