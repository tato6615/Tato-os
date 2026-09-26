const LAYER = "APPROVAL_ENGINE_V1.1";

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

async function getAction(DB, actionRunId) {
  if (actionRunId) {
    return await DB.prepare(`
      SELECT *
      FROM action_runs
      WHERE id = ?
      LIMIT 1
    `).bind(actionRunId).first();
  }

  return await DB.prepare(`
    SELECT *
    FROM action_runs
    WHERE status = 'PENDING'
       OR action_status = 'PENDING_APPROVAL'
    ORDER BY created_at DESC
    LIMIT 1
  `).first();
}

async function getPendingActions(DB) {
  const result = await DB.prepare(`
    SELECT
      id,
      action_type,
      status,
      action_status,
      priority,
      reason,
      content_id,
      measurement_id,
      requires_approval,
      approved_at,
      executed_at,
      created_at
    FROM action_runs
    WHERE status = 'PENDING'
       OR action_status = 'PENDING_APPROVAL'
    ORDER BY created_at DESC
  `).all();

  return result.results || [];
}

async function processApproval(DB, actionRunId, decision) {
  if (!actionRunId) {
    return json({
      success: false,
      layer: LAYER,
      mode: "execute",
      status: "ERROR",
      error: "action_run_id is required"
    }, 400);
  }

  if (!["APPROVE", "REJECT"].includes(decision)) {
    return json({
      success: false,
      layer: LAYER,
      mode: "execute",
      status: "ERROR",
      error: "decision must be APPROVE or REJECT"
    }, 400);
  }

  const action = await getAction(DB, actionRunId);

  if (!action) {
    return json({
      success: false,
      layer: LAYER,
      mode: "execute",
      status: "ACTION_NOT_FOUND",
      error: `Action ${actionRunId} not found`
    }, 404);
  }

  const pending =
    action.status === "PENDING" ||
    action.action_status === "PENDING_APPROVAL";

  if (!pending) {
    return json({
      success: false,
      layer: LAYER,
      mode: "execute",
      status: "APPROVAL_NOT_ALLOWED",
      error: "Action is not waiting for approval",
      action: {
        id: action.id,
        status: action.status,
        action_status: action.action_status,
        approved_at: action.approved_at,
        executed_at: action.executed_at
      }
    }, 409);
  }

  const timestamp = now();

  if (decision === "APPROVE") {
    await DB.prepare(`
      UPDATE action_runs
      SET
        status = 'APPROVED',
        action_status = 'APPROVED',
        approved_at = ?
      WHERE id = ?
    `).bind(timestamp, actionRunId).run();

    const updated = await getAction(DB, actionRunId);

    return json({
      success: true,
      layer: LAYER,
      mode: "execute",
      status: "APPROVED",
      action: {
        id: updated.id,
        action_type: updated.action_type,
        status: updated.status,
        action_status: updated.action_status,
        approved_at: updated.approved_at,
        executed_at: updated.executed_at
      },
      control: {
        approval_required: true,
        approved: true,
        automatic_execution: false,
        execution_status: "READY"
      },
      next_step:
        "POST to /api/execution-engine with the approved action_run_id."
    });
  }

  await DB.prepare(`
    UPDATE action_runs
    SET
      status = 'REJECTED',
      action_status = 'REJECTED'
    WHERE id = ?
  `).bind(actionRunId).run();

  const updated = await getAction(DB, actionRunId);

  return json({
    success: true,
    layer: LAYER,
    mode: "execute",
    status: "REJECTED",
    action: {
      id: updated.id,
      action_type: updated.action_type,
      status: updated.status,
      action_status: updated.action_status,
      approved_at: updated.approved_at,
      executed_at: updated.executed_at
    },
    control: {
      approval_required: true,
      approved: false,
      automatic_execution: false,
      execution_status: "BLOCKED"
    },
    next_step:
      "No execution will occur for this Action."
  });
}

export async function onRequestGet(context) {
  try {
    const DB = context.env?.DB;

    if (!DB) {
      return json({
        success: false,
        layer: LAYER,
        mode: "preview",
        status: "ERROR",
        error: "D1 binding DB not found"
      }, 500);
    }

    const url = new URL(context.request.url);
    const actionRunId = url.searchParams.get("action_run_id");
    const decision = String(
      url.searchParams.get("decision") ||
      url.searchParams.get("action") ||
      ""
    ).trim().toUpperCase();

    if (actionRunId || decision) {
      return await processApproval(
        DB,
        actionRunId,
        decision
      );
    }

    const actions = await getPendingActions(DB);

    return json({
      success: true,
      layer: LAYER,
      mode: "preview",
      status: actions.length
        ? "PENDING_APPROVAL"
        : "APPROVAL_QUEUE_EMPTY",
      queue: {
        count: actions.length,
        actions
      },
      control: {
        approval_required: true,
        automatic_approval: false,
        execution_allowed: false
      }
    });
  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      mode: "preview",
      status: "ERROR",
      error: error?.message || String(error)
    }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const DB = context.env?.DB;

    if (!DB) {
      return json({
        success: false,
        layer: LAYER,
        mode: "execute",
        status: "ERROR",
        error: "D1 binding DB not found"
      }, 500);
    }

    let body = {};

    try {
      body = await context.request.json();
    } catch (_) {
      body = {};
    }

    const actionRunId =
      body.action_run_id ||
      new URL(context.request.url)
        .searchParams
        .get("action_run_id");

    const decision = String(
      body.decision ||
      body.action ||
      ""
    ).trim().toUpperCase();

    return await processApproval(
      DB,
      actionRunId,
      decision
    );
  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      mode: "execute",
      status: "ERROR",
      error: error?.message || String(error)
    }, 500);
  }
}
