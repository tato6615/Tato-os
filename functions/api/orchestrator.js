// ============================================================
// TATO-OS
// ORCHESTRATOR V1.0
// Measurement → Learning → Decision → Action → Execution Preview
//
// Purpose:
// - Run the existing TATO OS layers in the correct order.
// - Do NOT duplicate layer logic.
// - Do NOT bypass human approval.
// - Do NOT mutate strategy/content/customer/payment.
// - Persist orchestrator trace into existing ai_runs / ai_insights.
//
// Execution policy:
// 1. Measurement = execute
// 2. Learning = execute
// 3. Decision Cycle = preview
// 4. Action Cycle = preview
// 5. Execution Cycle = preview
// 6. Stop at human approval boundary.
//
// This is the safe autonomous analysis loop.
// ============================================================

const LAYER = "TATO_OS_ORCHESTRATOR";
const VERSION = "1.0";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: HEADERS
    }
  );
}

function id() {
  return crypto.randomUUID();
}

function safeString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

function parseJSON(value, fallback = null) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch (_) {
    return fallback;
  }
}

// ------------------------------------------------------------
// Resolve content
// ------------------------------------------------------------

async function resolveContent(db, requestedContentId) {
  if (requestedContentId) {
    return await db
      .prepare(`
        SELECT *
        FROM content_engine
        WHERE id = ?
        LIMIT 1
      `)
      .bind(requestedContentId)
      .first();
  }

  return await db
    .prepare(`
      SELECT *
      FROM content_engine
      WHERE status = 'PUBLISHED'
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .first();
}

// ------------------------------------------------------------
// Generic internal GET caller
// ------------------------------------------------------------

async function callGET(request, path, params = {}) {
  const url = new URL(path, request.url);

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== null &&
      value !== undefined &&
      value !== ""
    ) {
      url.searchParams.set(
        key,
        String(value)
      );
    }
  }

  const response = await fetch(
    url.toString(),
    {
      method: "GET",
      headers: {
        accept: "application/json"
      }
    }
  );

  const text = await response.text();

  const data =
    parseJSON(
      text,
      {
        success: false,
        error:
          "Invalid JSON response",
        http_status:
          response.status
      }
    );

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

// ------------------------------------------------------------
// Generic internal POST caller
// ------------------------------------------------------------

async function callPOST(
  request,
  path,
  body
) {
  const url =
    new URL(
      path,
      request.url
    );

  const response =
    await fetch(
      url.toString(),
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json",
          accept:
            "application/json"
        },
        body:
          JSON.stringify(body)
      }
    );

  const text =
    await response.text();

  const data =
    parseJSON(
      text,
      {
        success: false,
        error:
          "Invalid JSON response",
        http_status:
          response.status
      }
    );

  return {
    ok:
      response.ok,
    status:
      response.status,
    data
  };
}

// ------------------------------------------------------------
// Measurement
//
// Existing Measurement GET performs a real measurement.
// We intentionally reuse it instead of duplicating logic.
// ------------------------------------------------------------

async function runMeasurement(
  request,
  contentId
) {
  return await callGET(
    request,
    "/api/content-measurement",
    {
      content_id:
        contentId
    }
  );
}

// ------------------------------------------------------------
// Learning
//
// Learning POST execute persists Learning into
// ai_runs + ai_insights.
// It does NOT execute business action.
// ------------------------------------------------------------

async function runLearning(
  request,
  contentId
) {
  return await callPOST(
    request,
    "/api/learning-ai",
    {
      mode: "execute",
      content_id:
        contentId
    }
  );
}

// ------------------------------------------------------------
// Decision Cycle
//
// Preview only.
// Decision layer remains human-controlled.
// ------------------------------------------------------------

async function runDecisionCycle(
  request,
  contentId
) {
  return await callGET(
    request,
    "/api/decision-cycle-ai",
    {
      content_id:
        contentId
    }
  );
}

// ------------------------------------------------------------
// Action Cycle
//
// Preview only.
// Does NOT execute the action.
// ------------------------------------------------------------

async function runActionCycle(
  request,
  contentId
) {
  return await callGET(
    request,
    "/api/action-cycle-ai",
    {
      content_id:
        contentId
    }
  );
}

// ------------------------------------------------------------
// Execution Cycle
//
// Preview only.
// This is the hard approval boundary.
// ------------------------------------------------------------

async function runExecutionCycle(
  request,
  contentId
) {
  return await callGET(
    request,
    "/api/execution-cycle-ai",
    {
      content_id:
        contentId
    }
  );
}

// ------------------------------------------------------------
// Save orchestrator trace
// ------------------------------------------------------------

async function saveOrchestratorRun(
  db,
  contentId,
  inputData,
  outputData,
  status,
  priority = "NORMAL"
) {
  const now =
    new Date().toISOString();

  const runId =
    id();

  const insightId =
    id();

  await db
    .prepare(`
      INSERT INTO ai_runs (
        id,
        run_type,
        model,
        input_data,
        output_data,
        status,
        tokens_used,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      runId,
      "ORCHESTRATOR",
      "TATO_OS_ORCHESTRATOR_V1",
      JSON.stringify(
        inputData
      ),
      JSON.stringify(
        outputData
      ),
      status,
      0,
      now
    )
    .run();

  await db
    .prepare(`
      INSERT INTO ai_insights (
        id,
        run_id,
        insight_type,
        title,
        content,
        score,
        priority,
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      insightId,
      runId,
      "ORCHESTRATOR_RESULT",
      "TATO OS Orchestrator V1",
      JSON.stringify(
        outputData
      ),
      1,
      priority,
      status,
      now
    )
    .run();

  return {
    run_id:
      runId,
    insight_id:
      insightId,
    created_at:
      now
  };
}

// ------------------------------------------------------------
// Execute safe orchestration
// ------------------------------------------------------------

async function runOrchestrator(
  context,
  contentId
) {
  const {
    env,
    request
  } = context;

  if (!env?.DB) {
    throw new Error(
      "D1 binding DB is missing"
    );
  }

  const content =
    await resolveContent(
      env.DB,
      contentId
    );

  if (!content) {
    return {
      success: false,
      layer: LAYER,
      version: VERSION,
      status:
        "NO_PUBLISHED_CONTENT",
      error:
        "No PUBLISHED content found in content_engine."
    };
  }

  const targetContentId =
    content.id;

  const startedAt =
    new Date().toISOString();

  // ----------------------------------------------------------
  // 1. MEASUREMENT
  // ----------------------------------------------------------

  const measurement =
    await runMeasurement(
      request,
      targetContentId
    );

  if (
    !measurement.ok ||
    measurement.data?.success === false
  ) {
    const result = {
      success: false,
      layer: LAYER,
      version: VERSION,
      status:
        "MEASUREMENT_FAILED",

      content: {
        id:
          targetContentId,
        title:
          content.title || "",
        status:
          content.status || ""
      },

      failed_layer:
        "MEASUREMENT",

      measurement:
        measurement.data
    };

    const persistence =
      await saveOrchestratorRun(
        env.DB,
        targetContentId,
        {
          content_id:
            targetContentId
        },
        result,
        "FAILED",
        "HIGH"
      );

    return {
      ...result,
      persistence
    };
  }

  // ----------------------------------------------------------
  // 2. LEARNING
  // ----------------------------------------------------------

  const learning =
    await runLearning(
      request,
      targetContentId
    );

  if (
    !learning.ok ||
    learning.data?.success === false
  ) {
    const result = {
      success: false,
      layer: LAYER,
      version: VERSION,
      status:
        "LEARNING_FAILED",

      content: {
        id:
          targetContentId,
        title:
          content.title || "",
        status:
          content.status || ""
      },

      measurement:
        measurement.data,

      failed_layer:
        "LEARNING",

      learning:
        learning.data
    };

    const persistence =
      await saveOrchestratorRun(
        env.DB,
        targetContentId,
        {
          content_id:
            targetContentId
        },
        result,
        "FAILED",
        "HIGH"
      );

    return {
      ...result,
      persistence
    };
  }

  // ----------------------------------------------------------
  // 3. DECISION CYCLE PREVIEW
  // ----------------------------------------------------------

  const decision =
    await runDecisionCycle(
      request,
      targetContentId
    );

  // ----------------------------------------------------------
  // 4. ACTION CYCLE PREVIEW
  // ----------------------------------------------------------

  const action =
    await runActionCycle(
      request,
      targetContentId
    );

  // ----------------------------------------------------------
  // 5. EXECUTION CYCLE PREVIEW
  // ----------------------------------------------------------

  const execution =
    await runExecutionCycle(
      request,
      targetContentId
    );

  const executionStatus =
    execution.data?.status ||
    "UNKNOWN";

  const decisionStatus =
    decision.data?.status ||
    "UNKNOWN";

  const actionStatus =
    action.data?.status ||
    "UNKNOWN";

  let orchestratorStatus =
    "READY";

  let priority =
    "NORMAL";

  if (
    executionStatus ===
      "READY" ||
    executionStatus ===
      "READY_TO_EXECUTE"
  ) {
    orchestratorStatus =
      "WAITING_FOR_HUMAN_APPROVAL";

    priority =
      "HIGH";
  }

  if (
    decision.data?.success === false
  ) {
    orchestratorStatus =
      "DECISION_WAITING";
  }

  if (
    action.data?.status ===
      "WAITING_FOR_DECISION_CYCLE"
  ) {
    orchestratorStatus =
      "ACTION_WAITING";
  }

  const completedAt =
    new Date().toISOString();

  const output = {
    success: true,

    layer:
      LAYER,

    version:
      VERSION,

    mode:
      "execute",

    status:
      orchestratorStatus,

    content: {
      id:
        targetContentId,
      title:
        content.title || "",
      status:
        content.status || ""
    },

    source_chain: {
      measurement:
        "CONTENT_MEASUREMENT_ENGINE_V2.2",
      intelligence:
        "INTELLIGENCE_LAYER_V2.1",
      learning:
        "LEARNING_LAYER_V1",
      decision:
        "DECISION_CYCLE_V1.0",
      action:
        "ACTION_CYCLE_V1.0",
      execution:
        "EXECUTION_CYCLE_V1.1"
    },

    pipeline: {
      measurement: {
        status:
          measurement.data?.status ||
          "COMPLETED",

        measurement_id:
          measurement.data?.measurement?.id ||
          null
      },

      learning: {
        status:
          learning.data?.status ||
          "COMPLETED",

        run_id:
          learning.data?.persistence?.run_id ||
          null,

        insight_id:
          learning.data?.persistence?.insight_id ||
          null
      },

      decision: {
        status:
          decisionStatus,

        decision:
          decision.data?.decision ||
          decision.data?.cycle?.decision ||
          null
      },

      action: {
        status:
          actionStatus,

        action:
          action.data?.action_cycle?.action ||
          action.data?.action ||
          null
      },

      execution: {
        status:
          executionStatus
      }
    },

    results: {
      measurement:
        measurement.data,

      learning:
        learning.data,

      decision:
        decision.data,

      action:
        action.data,

      execution:
        execution.data
    },

    timing: {
      started_at:
        startedAt,
      completed_at:
        completedAt
    },

    guardrails: {
      winner_declared:
        false,

      strategy_change:
        false,

      automatic_business_execution:
        false,

      business_data_mutation:
        false,

      content_mutation:
        false,

      customer_contact:
        false,

      payment_action:
        false,

      human_approval_required:
        true
    },

    next_step:
      orchestratorStatus ===
        "WAITING_FOR_HUMAN_APPROVAL"
        ? "Execution is ready. Human approval is required before Execution Cycle POST."
        : "Continue monitoring the pipeline."
  };

  const persistence =
    await saveOrchestratorRun(
      env.DB,
      targetContentId,
      {
        content_id:
          targetContentId,

        trigger:
          "ORCHESTRATOR_RUN",

        started_at:
          startedAt
      },
      output,
      "COMPLETED",
      priority
    );

  return {
    ...output,

    persistence
  };
}

// ------------------------------------------------------------
// GET
//
// Preview only.
// Does NOT run the pipeline.
// ------------------------------------------------------------

export async function onRequestGet(
  context
) {
  try {
    const {
      env,
      request
    } = context;

    if (!env?.DB) {
      return json(
        {
          success: false,
          layer: LAYER,
          version: VERSION,
          error:
            "D1 binding DB is missing"
        },
        500
      );
    }

    const url =
      new URL(
        request.url
      );

    const contentId =
      url.searchParams.get(
        "content_id"
      );

    const content =
      await resolveContent(
        env.DB,
        contentId
      );

    if (!content) {
      return json(
        {
          success: false,
          layer: LAYER,
          version: VERSION,
          status:
            "NO_PUBLISHED_CONTENT",
          error:
            "No PUBLISHED content found."
        },
        404
      );
    }

    return json({
      success: true,

      layer:
        LAYER,

      version:
        VERSION,

      mode:
        "preview",

      status:
        "READY",

      content: {
        id:
          content.id,
        title:
          content.title || "",
        status:
          content.status || ""
      },

      pipeline: [
        {
          order: 1,
          layer:
            "CONTENT_MEASUREMENT_ENGINE_V2.2",
          mode:
            "execute"
        },
        {
          order: 2,
          layer:
            "LEARNING_LAYER_V1",
          mode:
            "execute"
        },
        {
          order: 3,
          layer:
            "DECISION_CYCLE_V1.0",
          mode:
            "preview"
        },
        {
          order: 4,
          layer:
            "ACTION_CYCLE_V1.0",
          mode:
            "preview"
        },
        {
          order: 5,
          layer:
            "EXECUTION_CYCLE_V1.1",
          mode:
            "preview"
        }
      ],

      guardrails: {
        automatic_business_execution:
          false,

        strategy_change:
          false,

        business_data_mutation:
          false,

        human_approval_required:
          true
      },

      next_step:
        "POST {mode:'execute'} to run the safe orchestration loop."
    });
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        error:
          safeString(
            error?.message ||
            error
          )
      },
      500
    );
  }
}

// ------------------------------------------------------------
// POST
//
// mode = execute
//
// Runs:
// Measurement
// → Learning
// → Decision Preview
// → Action Preview
// → Execution Preview
//
// It NEVER bypasses human approval.
// ------------------------------------------------------------

export async function onRequestPost(
  context
) {
  try {
    const {
      request
    } = context;

    let body = {};

    try {
      body =
        await request.json();
    } catch (_) {
      body = {};
    }

    const mode =
      String(
        body?.mode ||
        "execute"
      ).toLowerCase();

    if (
      mode !== "execute"
    ) {
      return json(
        {
          success: false,
          layer: LAYER,
          version: VERSION,
          error:
            "Invalid mode. Use mode='execute'."
        },
        400
      );
    }

    const contentId =
      body?.content_id ||
      null;

    const result =
      await runOrchestrator(
        context,
        contentId
      );

    return json(
      result,
      result.success === false
        ? 500
        : 200
    );
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        status:
          "ERROR",
        error:
          safeString(
            error?.message ||
            error
          )
      },
      500
    );
  }
}
