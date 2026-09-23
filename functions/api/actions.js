// TATO-OS
// AI → Action Engine V1
// Route: /api/actions

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
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

async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS action_runs (
      id TEXT PRIMARY KEY,
      action_type TEXT,
      source TEXT,
      status TEXT,
      input_data TEXT,
      output_data TEXT,
      created_at TEXT,
      completed_at TEXT
    )
  `).run();
}

async function getLearningAI(request) {
  const url = new URL("/api/learning-ai", request.url);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Accept": "application/json"
    }
  });

  const data = await response.json();

  if (!response.ok || !data?.success) {
    throw new Error(
      data?.error || `Learning AI returned HTTP ${response.status}`
    );
  }

  return data;
}

function buildAction(learningAI) {
  const analysis = learningAI?.ai?.analysis || {};
  const nextAction = analysis?.next_action || {};

  const rawAction = s(
    nextAction.type ||
    analysis?.next_content?.action ||
    learningAI?.learning?.signal_type
  ).toUpperCase();

  let actionType = "WAIT";
  let status = "WAITING";

  if (
    rawAction === "DISTRIBUTE" ||
    rawAction === "PUBLISH" ||
    rawAction === "DISTRIBUTE_CONTENT" ||
    rawAction === "PUBLISH_CONTENT" ||
    rawAction === "NO_TRAFFIC"
  ) {
    actionType = "DISTRIBUTE_CONTENT";
    status = "READY";
  } else if (
    rawAction === "OPTIMIZE" ||
    rawAction === "ITERATE" ||
    rawAction === "ITERATE_CONTENT"
  ) {
    actionType = "ITERATE_CONTENT";
    status = "READY";
  } else if (rawAction === "SCALE") {
    actionType = "SCALE_CONTENT";
    status = "READY";
  }

  return {
    action_type: actionType,
    status,
    reason:
      analysis?.next_action?.reason ||
      analysis?.summary ||
      "AI generated action",
    priority: analysis?.priority || "LOW",
    content: learningAI?.content || null,
    learning: learningAI?.learning || null,
    ai: analysis
  };
}

async function saveActionRun(db, action) {
  const runId = id();
  const now = new Date().toISOString();

  await db.prepare(`
    INSERT INTO action_runs (
      id,
      action_type,
      source,
      status,
      input_data,
      output_data,
      created_at,
      completed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    runId,
    action.action_type,
    "AI_ACTION_ENGINE",
    "COMPLETED",
    JSON.stringify({
      reason: action.reason,
      priority: action.priority,
      content: action.content,
      learning: action.learning,
      ai: action.ai
    }),
    JSON.stringify(action),
    now,
    now
  ).run();

  return {
    id: runId,
    status: "COMPLETED",
    created_at: now,
    completed_at: now
  };
}

async function executeAutomation(context, action, execution) {
  const url = new URL("/api/ai-automation", context.request.url);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      action_run_id: execution.id,
      action_type: action.action_type,
      source: "AI_ACTION_ENGINE",
      content: action.content,
      learning: action.learning,
      ai: action.ai
    })
  });

  let data = null;

  try {
    data = await response.json();
  } catch (_) {
    data = {
      success: false,
      error: "Automation Bridge returned invalid JSON"
    };
  }

  if (!response.ok || !data?.success) {
    return {
      success: false,
      status: "FAILED",
      http_status: response.status,
      error:
        data?.error ||
        `Automation Bridge returned HTTP ${response.status}`,
      raw: data
    };
  }

  return data;
}

async function executeDistribution(context, action, automation) {
  const contentId = action?.content?.id;

  if (!contentId) {
    return {
      success: false,
      status: "SKIPPED",
      error: "No content ID available for distribution."
    };
  }

  const url = new URL("/api/distribution", context.request.url);

  url.searchParams.set("mode", "execute");
  url.searchParams.set("content_id", contentId);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Accept": "application/json"
    }
  });

  let data = null;

  try {
    data = await response.json();
  } catch (_) {
    data = {
      success: false,
      error: "Distribution returned invalid JSON"
    };
  }

  if (!response.ok || !data?.success) {
    return {
      success: false,
      status: "FAILED",
      http_status: response.status,
      error:
        data?.error ||
        `Distribution returned HTTP ${response.status}`,
      raw: data
    };
  }

  return data;
}

async function analyze(context) {
  if (!context.env.DB) {
    throw new Error("D1 binding DB is missing");
  }

  await ensureTable(context.env.DB);

  const learningAI = await getLearningAI(context.request);

  const action = buildAction(learningAI);

  return {
    learning_ai: learningAI,
    action
  };
}

async function execute(context) {
  const result = await analyze(context);

  const execution = await saveActionRun(
    context.env.DB,
    result.action
  );

  let automation = null;
  let distribution = null;

  if (
    result.action.action_type === "DISTRIBUTE_CONTENT" ||
    result.action.action_type === "ITERATE_CONTENT"
  ) {
    automation = await executeAutomation(
      context,
      result.action,
      execution
    );

    if (!automation?.success) {
      return {
        ...result,
        execution,
        automation,
        distribution: null,
        result: {
          success: false,
          action_type: result.action.action_type,
          status: "AUTOMATION_FAILED",
          next_step: "Fix Automation Bridge before Distribution."
        }
      };
    }
  }

  if (
    result.action.action_type === "DISTRIBUTE_CONTENT"
  ) {
    distribution = await executeDistribution(
      context,
      result.action,
      automation
    );
  }

  return {
    ...result,
    execution,
    automation,
    distribution,
    result: {
      success:
        result.action.action_type === "WAIT"
          ? true
          : Boolean(
              automation?.success !== false &&
              distribution?.success !== false
            ),
      action_type: result.action.action_type,
      status:
        distribution?.status ||
        automation?.execution?.status ||
        execution.status,
      automation_run_id:
        automation?.run_id || null,
      distribution_run_id:
        distribution?.distribution?.id || null,
      next_step:
        distribution?.success
          ? "AI → Action → Automation → Distribution completed successfully."
          : automation?.success
            ? "Automation completed. Distribution did not complete."
            : "Action execution completed."
    }
  };
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const mode = url.searchParams.get("mode") || "preview";

    if (mode === "execute") {
      const result = await execute(context);

      return json({
        success: true,
        layer: "AI_ACTION_ENGINE_V1",
        mode: "execute",
        status: result.result.status,

        learning_ai: {
          status: result.learning_ai?.status || null,
          learning: result.learning_ai?.learning || null,
          content: result.learning_ai?.content || null
        },

        action: result.action,

        execution: result.execution,

        automation: result.automation,

        distribution: result.distribution,

        result: result.result
      });
    }

    const result = await analyze(context);

    return json({
      success: true,
      layer: "AI_ACTION_ENGINE_V1",
      mode: "preview",

      learning_ai: {
        status: result.learning_ai?.status || null,
        learning: result.learning_ai?.learning || null,
        content: result.learning_ai?.content || null
      },

      action: result.action,

      next_step:
        result.action.action_type === "WAIT"
          ? "AI recommends waiting."
          : "Run ?mode=execute to execute Action → Automation → Distribution."
    });

  } catch (error) {
    return json(
      {
        success: false,
        layer: "AI_ACTION_ENGINE_V1",
        error: error?.message || String(error)
      },
      500
    );
  }
}

export async function onRequestPost(context) {
  try {
    let body = {};

    try {
      body = await context.request.json();
    } catch (_) {}

    const mode = body?.mode || "preview";

    if (mode === "execute") {
      const result = await execute(context);

      return json({
        success: true,
        layer: "AI_ACTION_ENGINE_V1",
        mode: "execute",
        status: result.result.status,

        learning_ai: {
          status: result.learning_ai?.status || null,
          learning: result.learning_ai?.learning || null,
          content: result.learning_ai?.content || null
        },

        action: result.action,

        execution: result.execution,

        automation: result.automation,

        distribution: result.distribution,

        result: result.result
      });
    }

    const result = await analyze(context);

    return json({
      success: true,
      layer: "AI_ACTION_ENGINE_V1",
      mode: "preview",

      learning_ai: {
        status: result.learning_ai?.status || null,
        learning: result.learning_ai?.learning || null,
        content: result.learning_ai?.content || null
      },

      action: result.action,

      next_step:
        "AI Action preview ready. Run POST execute to execute the full loop."
    });

  } catch (error) {
    return json(
      {
        success: false,
        layer: "AI_ACTION_ENGINE_V1",
        error: error?.message || String(error)
      },
      500
    );
  }
}
