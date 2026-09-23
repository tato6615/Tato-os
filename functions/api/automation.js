function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function ensureAutomationRunsTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS automation_runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      action_type TEXT,
      source TEXT,
      status TEXT NOT NULL,
      input_data TEXT,
      output_data TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )
  `).run();
}

async function findWorkflow(db, actionType) {
  const type =
    String(actionType || "")
      .toUpperCase();

  const workflow =
    await db.prepare(`
      SELECT *
      FROM workflows
      WHERE LOWER(status) = 'active'
      ORDER BY created_at DESC
    `).all();

  const rows =
    workflow.results || [];

  if (!rows.length) {
    return null;
  }

  const exact =
    rows.find((row) => {
      let config = {};

      try {
        config =
          typeof row.config === "string"
            ? JSON.parse(row.config)
            : row.config || {};
      } catch {
        config = {};
      }

      const configuredAction =
        String(
          config.action_type || ""
        ).toUpperCase();

      if (
        configuredAction === type
      ) {
        return true;
      }

      if (
        type === "DISTRIBUTE_CONTENT" &&
        (
          configuredAction === "CONTENT" ||
          String(row.trigger_type || "").toUpperCase() === "ATTENTION" ||
          String(row.trigger_type || "").toUpperCase() === "AI"
        )
      ) {
        return true;
      }

      return false;
    });

  return exact || rows[0];
}

async function executeAutomation(
  context,
  body
) {
  const db = context.env.DB;

  await ensureAutomationRunsTable(db);

  const actionType =
    String(
      body.action_type || ""
    ).toUpperCase();

  if (!actionType) {
    return {
      success: false,
      error: "action_type is required"
    };
  }

  const workflow =
    await findWorkflow(
      db,
      actionType
    );

  if (!workflow) {
    return {
      success: false,
      error:
        "No active automation workflow found"
    };
  }

  const runId =
    crypto.randomUUID();

  const now =
    new Date().toISOString();

  const input = {
    source:
      body.source ||
      "AI_ACTION_ENGINE",

    action_type:
      actionType,

    content:
      body.content || null,

    learning:
      body.learning || null,

    ai:
      body.ai || null,

    action_run_id:
      body.action_run_id || null
  };

  const output = {
    automation:
      "AI_ACTION_TO_AUTOMATION",

    action:
      actionType,

    status:
      "COMPLETED",

    workflow_id:
      workflow.id,

    workflow_name:
      workflow.name,

    content:
      body.content || null,

    next_step:
      actionType === "DISTRIBUTE_CONTENT"
        ? "Content is queued for distribution execution"
        : actionType === "ITERATE_CONTENT"
          ? "Content is queued for iteration"
          : "Automation completed"
  };

  await db.prepare(`
    INSERT INTO automation_runs
    (
      id,
      workflow_id,
      action_type,
      source,
      status,
      input_data,
      output_data,
      created_at,
      completed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      runId,
      workflow.id,
      actionType,
      "AI_ACTION_ENGINE",
      "COMPLETED",
      JSON.stringify(input),
      JSON.stringify(output),
      now,
      now
    )
    .run();

  return {
    success: true,

    layer:
      "AUTOMATION",

    mode:
      "AI_ACTION",

    run_id:
      runId,

    workflow: {
      id:
        workflow.id,

      name:
        workflow.name,

      status:
        workflow.status
    },

    execution: {
      action_type:
        actionType,

      source:
        "AI_ACTION_ENGINE",

      status:
        "COMPLETED"
    },

    result:
      output
  };
}

export async function onRequestGet(context) {
  try {
    const url =
      new URL(context.request.url);

    const mode =
      url.searchParams.get("mode");

    if (
      mode !== "execute"
    ) {
      return json({
        success: true,
        layer:
          "AI_ACTION_TO_AUTOMATION",
        status:
          "READY",
        message:
          "Use ?mode=execute to execute AI Action into Automation"
      });
    }

    const result =
      await executeAutomation(
        context,
        {
          action_type:
            url.searchParams.get(
              "action_type"
            ) || "DISTRIBUTE_CONTENT",

          source:
            "AI_ACTION_ENGINE"
        }
      );

    return json(
      result,
      result.success ? 200 : 400
    );

  } catch (error) {
    return json(
      {
        success: false,
        layer:
          "AI_ACTION_TO_AUTOMATION",
        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}

export async function onRequestPost(context) {
  try {
    const body =
      await context.request
        .json()
        .catch(() => ({}));

    const result =
      await executeAutomation(
        context,
        body
      );

    return json(
      result,
      result.success ? 200 : 400
    );

  } catch (error) {
    return json(
      {
        success: false,
        layer:
          "AI_ACTION_TO_AUTOMATION",
        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}
