export async function onRequestGet(context) {
  const { env } = context;

  try {
    if (!env.DB) {
      return Response.json(
        {
          success: false,
          error: "D1 database binding DB not found"
        },
        { status: 500 }
      );
    }

    await ensureAutomationRunsTable(env.DB);

    const workflows = await env.DB
      .prepare(`
        SELECT *
        FROM workflows
        ORDER BY created_at DESC
      `)
      .all();

    const runs = await env.DB
      .prepare(`
        SELECT *
        FROM automation_runs
        ORDER BY created_at DESC
        LIMIT 50
      `)
      .all();

    return Response.json({
      success: true,
      layer: "AUTOMATION",
      workflows: workflows.results || [],
      runs: runs.results || []
    });

  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}


export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return Response.json(
        {
          success: false,
          error: "D1 database binding DB not found"
        },
        { status: 500 }
      );
    }

    await ensureAutomationRunsTable(env.DB);

    const body = await request.json().catch(() => ({}));

    const mode =
      String(body.mode || "execute").toLowerCase();

    /*
      ----------------------------------------------------------
      PREVIEW
      ----------------------------------------------------------
    */

    if (mode === "preview") {
      const workflow = await getWorkflow(
        env.DB,
        body.workflow_id
      );

      if (!workflow) {
        return Response.json(
          {
            success: false,
            error: "Workflow not found"
          },
          { status: 404 }
        );
      }

      const config = parseConfig(workflow.config);

      const actionType =
        resolveActionType(
          config,
          workflow.trigger_type
        );

      const source =
        resolveSource(
          config,
          workflow.trigger_type
        );

      return Response.json({
        success: true,
        layer: "AUTOMATION",
        mode: "PREVIEW",
        workflow: normalizeWorkflow(workflow),
        execution: {
          action_type: actionType,
          source,
          status: "READY"
        }
      });
    }


    /*
      ----------------------------------------------------------
      EXECUTE
      ----------------------------------------------------------
    */

    const workflow = await getWorkflow(
      env.DB,
      body.workflow_id
    );

    if (!workflow) {
      return Response.json(
        {
          success: false,
          error: "No active workflow found"
        },
        { status: 404 }
      );
    }

    if (
      String(workflow.status || "").toLowerCase() !==
      "active"
    ) {
      return Response.json(
        {
          success: false,
          error: "Workflow is not active",
          workflow: normalizeWorkflow(workflow)
        },
        { status: 400 }
      );
    }

    const config = parseConfig(workflow.config);

    const actionType =
      resolveActionType(
        config,
        workflow.trigger_type
      );

    const source =
      resolveSource(
        config,
        workflow.trigger_type
      );

    const runId = crypto.randomUUID();

    /*
      Create execution record first.
    */

    await env.DB
      .prepare(`
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
        source,
        "RUNNING",
        JSON.stringify({
          workflow_id: workflow.id,
          trigger_type: workflow.trigger_type,
          config
        }),
        null,
        new Date().toISOString(),
        null
      )
      .run();


    /*
      ----------------------------------------------------------
      ACTION ENGINE
      ----------------------------------------------------------

      Automation does not duplicate the Action Engine.

      It sends the workflow into:

      AUTOMATION
          ↓
      ACTION ENGINE
          ↓
      RESULT
    */

    const actionUrl =
      new URL(
        "/api/actions",
        request.url
      ).toString();

    const actionResponse =
      await fetch(
        actionUrl,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            mode: "execute",
            action_type: actionType,
            source
          })
        }
      );

    const actionResult =
      await actionResponse
        .json()
        .catch(() => ({
          success: false,
          error: "Invalid Action Engine response"
        }));


    /*
      ----------------------------------------------------------
      FAILED
      ----------------------------------------------------------
    */

    if (
      !actionResponse.ok ||
      actionResult.success === false
    ) {
      await env.DB
        .prepare(`
          UPDATE automation_runs
          SET
            status = ?,
            output_data = ?,
            completed_at = ?
          WHERE id = ?
        `)
        .bind(
          "FAILED",
          JSON.stringify(actionResult),
          new Date().toISOString(),
          runId
        )
        .run();

      return Response.json(
        {
          success: false,
          layer: "AUTOMATION",
          run_id: runId,
          workflow: normalizeWorkflow(workflow),
          status: "FAILED",
          action: actionResult
        },
        { status: 500 }
      );
    }


    /*
      ----------------------------------------------------------
      COMPLETED
      ----------------------------------------------------------
    */

    await env.DB
      .prepare(`
        UPDATE automation_runs
        SET
          status = ?,
          output_data = ?,
          completed_at = ?
        WHERE id = ?
      `)
      .bind(
        "COMPLETED",
        JSON.stringify(actionResult),
        new Date().toISOString(),
        runId
      )
      .run();


    return Response.json({
      success: true,
      layer: "AUTOMATION",
      run_id: runId,
      workflow: normalizeWorkflow(workflow),
      execution: {
        action_type: actionType,
        source,
        status: "COMPLETED"
      },
      action: actionResult
    });

  } catch (error) {

    return Response.json(
      {
        success: false,
        layer: "AUTOMATION",
        error: error.message
      },
      { status: 500 }
    );
  }
}


/*
  ==========================================================
  HELPERS
  ==========================================================
*/


async function ensureAutomationRunsTable(db) {

  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS automation_runs
      (
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
    `)
    .run();
}


async function getWorkflow(db, workflowId) {

  if (workflowId) {

    return await db
      .prepare(`
        SELECT *
        FROM workflows
        WHERE id = ?
        LIMIT 1
      `)
      .bind(workflowId)
      .first();
  }

  return await db
    .prepare(`
      SELECT *
      FROM workflows
      WHERE LOWER(status) = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .first();
}


function parseConfig(config) {

  if (!config) {
    return {};
  }

  if (typeof config === "object") {
    return config;
  }

  try {
    return JSON.parse(config);
  } catch {
    return {};
  }
}


function resolveActionType(
  config,
  triggerType
) {

  if (config.action_type) {
    return String(
      config.action_type
    ).toUpperCase();
  }

  const trigger =
    String(
      config.trigger_type ||
      triggerType ||
      ""
    )
      .trim()
      .toUpperCase();

  switch (trigger) {

    case "ATTENTION":
    case "ATTENTION_SIGNAL":
    case "BEHAVIOR":
      return "CONTENT";

    case "MARKET":
    case "MARKET_SIGNAL":
    case "DEMAND":
      return "MARKET_RESPONSE";

    case "CUSTOMER":
    case "CUSTOMER_SIGNAL":
    case "SEGMENT":
      return "CUSTOMER_SEGMENT";

    case "AI":
    case "AI_INSIGHT":
    case "INSIGHT":
      return "AI_ACTION";

    default:
      return "CONTENT";
  }
}


function resolveSource(
  config,
  triggerType
) {

  if (config.source) {
    return String(
      config.source
    ).toUpperCase();
  }

  const trigger =
    String(
      triggerType ||
      ""
    )
      .trim()
      .toUpperCase();

  switch (trigger) {

    case "ATTENTION":
    case "ATTENTION_SIGNAL":
    case "BEHAVIOR":
      return "ATTENTION";

    case "MARKET":
    case "MARKET_SIGNAL":
    case "DEMAND":
      return "MARKET";

    case "CUSTOMER":
    case "CUSTOMER_SIGNAL":
    case "SEGMENT":
      return "CUSTOMER";

    case "AI":
    case "AI_INSIGHT":
    case "INSIGHT":
      return "AI_INSIGHT";

    default:
      return "SYSTEM";
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
