const LAYER = "EXECUTION_ENGINE_V1";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8"
    }
  });
}

function uuid() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

async function tableExists(DB, table) {
  const row = await DB.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).bind(table).first();

  return !!row;
}

async function ensureExecutionRuns(DB) {
  const exists = await tableExists(DB, "execution_runs");

  if (!exists) {
    await DB.prepare(`
      CREATE TABLE execution_runs (
        id TEXT PRIMARY KEY,
        action_run_id TEXT NOT NULL,
        execution_type TEXT NOT NULL,
        status TEXT NOT NULL,
        input_data TEXT,
        output_data TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL
      )
    `).run();

    return {
      created: true
    };
  }

  return {
    created: false
  };
}

async function getColumns(DB, table) {
  const result = await DB.prepare(
    `PRAGMA table_info(${table})`
  ).all();

  return (result.results || []).map(row => row.name);
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
    ORDER BY created_at DESC
    LIMIT 1
  `).first();
}

async function createExecutionRun(
  DB,
  action,
  executionType,
  inputData
) {
  const id = uuid();
  const createdAt = now();
  const startedAt = now();

  await DB.prepare(`
    INSERT INTO execution_runs (
      id,
      action_run_id,
      execution_type,
      status,
      input_data,
      output_data,
      started_at,
      completed_at,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    action.id,
    executionType,
    "RUNNING",
    JSON.stringify(inputData),
    null,
    startedAt,
    null,
    createdAt
  ).run();

  return {
    id,
    started_at: startedAt,
    created_at: createdAt
  };
}

async function completeExecutionRun(
  DB,
  executionId,
  status,
  outputData
) {
  const completedAt = now();

  await DB.prepare(`
    UPDATE execution_runs
    SET
      status = ?,
      output_data = ?,
      completed_at = ?
    WHERE id = ?
  `).bind(
    status,
    JSON.stringify(outputData),
    completedAt,
    executionId
  ).run();

  return completedAt;
}

async function executeMeasureContent(context, action) {
  let payload = {};

  try {
    payload = action.action_payload
      ? JSON.parse(action.action_payload)
      : {};
  } catch (_) {
    payload = {};
  }

  const contentId =
    payload.content_id ||
    action.content_id ||
    null;

  if (!contentId) {
    throw new Error(
      "MEASURE_CONTENT requires content_id"
    );
  }

  const url = new URL(context.request.url);

  const measurementUrl =
    `${url.origin}/api/content-measurement`;

  const response = await fetch(measurementUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      content_id: contentId
    })
  });

  let result;

  try {
    result = await response.json();
  } catch (_) {
    result = {
      success: false,
      error: "Measurement Engine returned non-JSON response"
    };
  }

  if (!response.ok || result.success === false) {
    throw new Error(
      result.error ||
      `Measurement Engine HTTP ${response.status}`
    );
  }

  return {
    operation: "MEASURE_CONTENT",
    content_id: contentId,
    measurement_engine: result,
    executed_at: now()
  };
}

async function executeAction(context, action) {
  let payload = {};

  try {
    payload = action.action_payload
      ? JSON.parse(action.action_payload)
      : {};
  } catch (_) {
    payload = {};
  }

  const operation =
    payload.operation ||
    action.action_type;

  if (operation === "MEASURE_CONTENT") {
    return await executeMeasureContent(
      context,
      action
    );
  }

  /*
    Other action types are deliberately NOT executed
    automatically in V1.

    This protects the system from performing an
    unsupported real-world action before its executor
    has been explicitly implemented.
  */

  return {
    operation,
    status: "NOT_IMPLEMENTED",
    message:
      "This action type has no Execution Handler in V1.",
    executed_at: now()
  };
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

    const schema = await ensureExecutionRuns(DB);

    const actionId =
      new URL(context.request.url)
        .searchParams
        .get("action_run_id");

    const action = await getAction(
      DB,
      actionId
    );

    if (!action) {
      return json({
        success: true,
        layer: LAYER,
        mode: "preview",
        status: "WAITING_FOR_ACTION"
      });
    }

    const approved =
      action.status === "APPROVED" ||
      action.action_status === "APPROVED";

    return json({
      success: true,
      layer: LAYER,
      mode: "preview",
      status: approved
        ? "EXECUTION_READY"
        : "WAITING_FOR_APPROVAL",
      action: {
        id: action.id,
        action_type: action.action_type,
        action_status: action.action_status,
        status: action.status,
        content_id: action.content_id,
        measurement_id: action.measurement_id,
        requires_approval: action.requires_approval,
        approved_at: action.approved_at,
        executed_at: action.executed_at
      },
      control: {
        approval_required: true,
        approved,
        automatic_execution: false,
        execution_status: approved
          ? "READY"
          : "BLOCKED"
      },
      schema
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
  let executionId = null;

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

    await ensureExecutionRuns(DB);

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

    if (!actionRunId) {
      return json({
        success: false,
        layer: LAYER,
        mode: "execute",
        status: "ERROR",
        error: "action_run_id is required"
      }, 400);
    }

    const action = await getAction(
      DB,
      actionRunId
    );

    if (!action) {
      return json({
        success: false,
        layer: LAYER,
        mode: "execute",
        status: "ACTION_NOT_FOUND",
        error: `Action ${actionRunId} not found`
      }, 404);
    }

    /*
      HARD SAFETY GATE:
      Execution is impossible unless the action
      has already been approved.
    */

    const approved =
      action.status === "APPROVED" ||
      action.action_status === "APPROVED";

    if (!approved) {
      return json({
        success: false,
        layer: LAYER,
        mode: "execute",
        status: "EXECUTION_BLOCKED",
        reason: "ACTION_NOT_APPROVED",
        action: {
          id: action.id,
          action_type: action.action_type,
          status: action.status,
          action_status: action.action_status,
          requires_approval: action.requires_approval
        },
        control: {
          approval_required: true,
          approved: false,
          execution_status: "BLOCKED"
        }
      }, 403);
    }

    /*
      Prevent duplicate execution.
    */

    if (
      action.executed_at ||
      action.status === "EXECUTED" ||
      action.action_status === "EXECUTED"
    ) {
      return json({
        success: true,
        layer: LAYER,
        mode: "execute",
        status: "ALREADY_EXECUTED",
        action_run_id: action.id,
        executed_at: action.executed_at
      });
    }

    let inputData = {};

    try {
      inputData = action.action_payload
        ? JSON.parse(action.action_payload)
        : {};
    } catch (_) {
      inputData = {
        raw_action_payload:
          action.action_payload || null
      };
    }

    const execution = await createExecutionRun(
      DB,
      action,
      inputData.operation ||
        action.action_type ||
        "UNKNOWN",
      inputData
    );

    executionId = execution.id;

    /*
      Mark action as EXECUTING before real execution.
    */

    await DB.prepare(`
      UPDATE action_runs
      SET
        status = ?,
        action_status = ?,
        result = ?
      WHERE id = ?
    `).bind(
      "EXECUTING",
      "EXECUTING",
      JSON.stringify({
        execution_id: executionId,
        started_at: execution.started_at
      }),
      action.id
    ).run();

    const result =
      await executeAction(
        context,
        action
      );

    const completedAt =
      await completeExecutionRun(
        DB,
        executionId,
        result.status === "NOT_IMPLEMENTED"
          ? "NOT_IMPLEMENTED"
          : "SUCCESS",
        result
      );

    /*
      If the operation has no executor yet,
      do NOT pretend it was executed.
    */

    if (result.status === "NOT_IMPLEMENTED") {
      await DB.prepare(`
        UPDATE action_runs
        SET
          status = ?,
          action_status = ?,
          result = ?,
          executed_at = ?
        WHERE id = ?
      `).bind(
        "NOT_IMPLEMENTED",
        "NOT_IMPLEMENTED",
        JSON.stringify({
          execution_id: executionId,
          result
        }),
        null,
        action.id
      ).run();

      return json({
        success: true,
        layer: LAYER,
        mode: "execute",
        status: "EXECUTION_NOT_IMPLEMENTED",
        action_run_id: action.id,
        execution_run_id: executionId,
        result,
        completed_at: completedAt
      });
    }

    await DB.prepare(`
      UPDATE action_runs
      SET
        status = ?,
        action_status = ?,
        result = ?,
        executed_at = ?
      WHERE id = ?
    `).bind(
      "EXECUTED",
      "EXECUTED",
      JSON.stringify({
        execution_id: executionId,
        result
      }),
      completedAt,
      action.id
    ).run();

    return json({
      success: true,
      layer: LAYER,
      mode: "execute",
      status: "EXECUTED",
      action_run_id: action.id,
      execution_run_id: executionId,
      action_type: action.action_type,
      execution: {
        status: "SUCCESS",
        started_at: execution.started_at,
        completed_at: completedAt
      },
      result
    });

  } catch (error) {
    const DB = context.env?.DB;

    if (DB && executionId) {
      const failedAt = now();

      try {
        await DB.prepare(`
          UPDATE execution_runs
          SET
            status = ?,
            output_data = ?,
            completed_at = ?
          WHERE id = ?
        `).bind(
          "FAILED",
          JSON.stringify({
            error: error?.message || String(error)
          }),
          failedAt,
          executionId
        ).run();
      } catch (_) {}

      try {
        const actionId =
          (await new URL(context.request.url)
            .searchParams
            .get("action_run_id")) || null;

        if (actionId) {
          await DB.prepare(`
            UPDATE action_runs
            SET
              status = ?,
              action_status = ?,
              result = ?
            WHERE id = ?
          `).bind(
            "FAILED",
            "FAILED",
            JSON.stringify({
              execution_id: executionId,
              error: error?.message || String(error)
            }),
            actionId
          ).run();
        }
      } catch (_) {}
    }

    return json({
      success: false,
      layer: LAYER,
      mode: "execute",
      status: "EXECUTION_FAILED",
      execution_run_id: executionId,
      error: error?.message || String(error)
    }, 500);
  }
}
