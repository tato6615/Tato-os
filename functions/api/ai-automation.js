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

async function getActiveWorkflow(db) {
  return await db.prepare(`
    SELECT *
    FROM workflows
    WHERE LOWER(status) = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  `).first();
}

function parseConfig(config) {
  if (!config) return {};

  if (typeof config === "object") {
    return config;
  }

  try {
    return JSON.parse(config);
  } catch {
    return {};
  }
}

function normalizeWorkflow(workflow) {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    trigger_type: workflow.trigger_type,
    status: workflow.status,
    config: parseConfig(workflow.config),
    created_at: workflow.created_at,
    updated_at: workflow.updated_at
  };
}

async function execute(context, body = {}) {
  const db = context.env.DB;

  if (!db) {
    throw new Error("D1 database binding DB not found");
  }

  await ensureAutomationRunsTable(db);

  const workflow =
    await getActiveWorkflow(db);

  if (!workflow) {
    return {
      success: false,
      layer: "AI_ACTION_TO_AUTOMATION",
      error: "No active automation workflow found"
    };
  }

  const actionType =
    String(
      body.action_type ||
      "DISTRIBUTE_CONTENT"
    ).toUpperCase();

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

    action_run_id:
      body.action_run_id || null,

    content:
      body.content || null,

    learning:
      body.learning || null,

    ai:
      body.ai || null
  };

  const output = {
    action:
      actionType,

    status:
      "COMPLETED",

    source:
      "AI_ACTION_ENGINE",

    content:
      body.content || null,

    next_step:
      actionType === "DISTRIBUTE_CONTENT"
        ? "Content queued for distribution"
        : actionType === "ITERATE_CONTENT"
          ? "Content queued for iteration"
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
      "AI_ACTION_TO_AUTOMATION",

    mode:
      "execute",

    run_id:
      runId,

    workflow:
      normalizeWorkflow(workflow),

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
      String(
        url.searchParams.get("mode") ||
        "preview"
      ).toLowerCase();

    if (mode !== "execute") {
      const workflow =
        await getActiveWorkflow(
          context.env.DB
        );

      return json({
        success: true,
        layer:
          "AI_ACTION_TO_AUTOMATION",
        mode:
          "preview",
        workflow:
          workflow
            ? normalizeWorkflow(workflow)
            : null,
        status:
          workflow
            ? "READY"
            : "NO_ACTIVE_WORKFLOW"
      });
    }

    const result =
      await execute(context, {
        action_type:
          url.searchParams.get(
            "action_type"
          ) || "DISTRIBUTE_CONTENT",

        source:
          "AI_ACTION_ENGINE"
      });

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
      await execute(
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
