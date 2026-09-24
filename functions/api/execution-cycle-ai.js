// ============================================================
// TATO-OS
// EXECUTION CYCLE V1.0
// Action Cycle → Execution Layer → Approval → Execute
// ============================================================

const LAYER = "EXECUTION_CYCLE_V1";
const VERSION = "1.0";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

function parseJSON(value, fallback = null) {
  if (value === null || value === undefined) return fallback;

  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function extractContentId(value, depth = 0) {
  if (!value || depth > 10) return null;

  if (typeof value === "string") {
    const parsed = parseJSON(value);

    if (parsed && typeof parsed === "object") {
      return extractContentId(parsed, depth + 1);
    }

    return null;
  }

  if (typeof value !== "object") return null;

  const directKeys = [
    "content_id",
    "contentId",
    "contentID"
  ];

  for (const key of directKeys) {
    if (value[key]) {
      return String(value[key]);
    }
  }

  const nestedKeys = [
    "input_data",
    "output_data",
    "content",
    "data",
    "payload",
    "result",
    "feedback",
    "execution",
    "learning",
    "decision",
    "cycle",
    "action",
    "source_action_cycle",
    "source_decision_cycle"
  ];

  for (const key of nestedKeys) {
    if (value[key]) {
      const found = extractContentId(
        value[key],
        depth + 1
      );

      if (found) return found;
    }
  }

  for (const key of Object.keys(value)) {
    if (nestedKeys.includes(key)) continue;

    const child = value[key];

    if (
      child &&
      typeof child === "object"
    ) {
      const found = extractContentId(
        child,
        depth + 1
      );

      if (found) return found;
    }
  }

  return null;
}

async function getLatestInsight(
  db,
  insightType,
  contentId
) {
  const result = await db.prepare(`
    SELECT
      id,
      run_id,
      insight_type,
      title,
      content,
      score,
      priority,
      status,
      created_at
    FROM ai_insights
    WHERE insight_type = ?
    ORDER BY created_at DESC
    LIMIT 100
  `)
    .bind(insightType)
    .all();

  const rows = result?.results || [];

  for (const row of rows) {
    const parsed =
      parseJSON(row.content, {});

    const rowContentId =
      extractContentId(parsed);

    if (
      rowContentId &&
      String(rowContentId) === String(contentId)
    ) {
      return {
        insight_id: row.id,
        run_id: row.run_id,
        insight_type: row.insight_type,
        title: row.title,
        content: parsed,
        score: row.score,
        priority: row.priority,
        status: row.status,
        created_at: row.created_at
      };
    }
  }

  return null;
}

async function getLatestActionCycle(
  db,
  contentId
) {
  return getLatestInsight(
    db,
    "ACTION_CYCLE_RESULT",
    contentId
  );
}

async function getLatestExecutionCycle(
  db,
  contentId
) {
  return getLatestInsight(
    db,
    "EXECUTION_CYCLE_RESULT",
    contentId
  );
}

function findActionCyclePayload(
  actionCycle
) {
  if (!actionCycle) return {};

  const root =
    actionCycle.content || {};

  return {
    cycle:
      root.cycle ||
      null,

    action:
      root.action ||
      null,

    decision:
      root.source_decision_cycle?.decision ||
      null,

    source_decision_cycle:
      root.source_decision_cycle ||
      null
  };
}

async function callExecutionLayerPreview(
  request,
  contentId
) {
  const url =
    new URL(
      "/api/execution-ai",
      request.url
    );

  url.searchParams.set(
    "content_id",
    contentId
  );

  const response =
    await fetch(
      url.toString(),
      {
        method: "GET",
        headers: {
          "accept": "application/json"
        }
      }
    );

  const text =
    await response.text();

  const data =
    parseJSON(text);

  if (!data) {
    throw new Error(
      `EXECUTION_LAYER_INVALID_RESPONSE:${response.status}`
    );
  }

  if (
    !response.ok ||
    data.success === false
  ) {
    throw new Error(
      data.error ||
      `EXECUTION_LAYER_FAILED:${response.status}`
    );
  }

  return data;
}

async function callExecutionLayerExecute(
  request,
  contentId
) {
  const url =
    new URL(
      "/api/execution-ai",
      request.url
    );

  url.searchParams.set(
    "content_id",
    contentId
  );

  const response =
    await fetch(
      url.toString(),
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json",
          "accept":
            "application/json"
        },
        body: JSON.stringify({
          approved: true
        })
      }
    );

  const text =
    await response.text();

  const data =
    parseJSON(text);

  if (!data) {
    throw new Error(
      `EXECUTION_LAYER_INVALID_RESPONSE:${response.status}`
    );
  }

  if (
    !response.ok ||
    data.success === false
  ) {
    throw new Error(
      data.error ||
      `EXECUTION_LAYER_FAILED:${response.status}`
    );
  }

  return data;
}

async function buildPreview(
  env,
  request,
  contentId
) {
  const db = env.DB;

  const actionCycle =
    await getLatestActionCycle(
      db,
      contentId
    );

  if (!actionCycle) {
    return {
      success: true,
      layer: LAYER,
      version: VERSION,
      mode: "preview",
      status:
        "WAITING_FOR_ACTION_CYCLE",

      content: {
        id: contentId
      },

      diagnostics: {
        action_cycle_found: false,
        execution_layer_reentered: false,
        previous_execution_cycle_found: false
      },

      guardrails: {
        execution_ready: false,
        action_executed: false,
        automatic_execution: false,
        strategy_change: false,
        business_data_mutation: false,
        content_mutation: false,
        customer_contact: false,
        payment_action: false,
        requires_human_approval: true
      },

      next_step:
        "Action Cycle result is required before Execution Cycle."
    };
  }

  const actionPayload =
    findActionCyclePayload(
      actionCycle
    );

  const executionPreview =
    await callExecutionLayerPreview(
      request,
      contentId
    );

  const previousExecutionCycle =
    await getLatestExecutionCycle(
      db,
      contentId
    );

  const executionResult =
    executionPreview.result ||
    executionPreview.execution ||
    executionPreview.audit ||
    null;

  const executionStatus =
    executionPreview.status ||
    executionResult?.status ||
    "READY";

  return {
    success: true,

    layer: LAYER,
    version: VERSION,
    mode: "preview",
    status: "READY",

    content: {
      id: contentId,

      title:
        executionPreview.content?.title ||
        null,

      status:
        executionPreview.content?.status ||
        null
    },

    source_chain: {
      measurement:
        "CONTENT_MEASUREMENT_ENGINE_V2.2",

      intelligence:
        "INTELLIGENCE_LAYER_V2.1",

      learning:
        "LEARNING_LAYER_V1",

      decision:
        "DECISION_LAYER_V1",

      action:
        "ACTION_LAYER_V1",

      execution:
        "EXECUTION_LAYER_V1",

      feedback:
        "FEEDBACK_LOOP_V1",

      decision_cycle:
        "DECISION_CYCLE_V1",

      action_cycle:
        "ACTION_CYCLE_V1",

      execution_cycle:
        "EXECUTION_CYCLE_V1"
    },

    action_cycle: {
      insight_id:
        actionCycle.insight_id,

      run_id:
        actionCycle.run_id,

      created_at:
        actionCycle.created_at,

      cycle:
        actionPayload.cycle,

      action:
        actionPayload.action
    },

    execution: {
      state:
        executionPreview.status ||
        "READY",

      status:
        executionStatus,

      result:
        executionResult,

      source:
        "EXECUTION_LAYER_V1"
    },

    cycle: {
      state:
        "EXECUTION_CYCLE_READY",

      cycle_type:
        "ACTION_TO_EXECUTION",

      trigger:
        "ACTION_CYCLE_RESULT",

      content_id:
        contentId,

      action: {
        action_type:
          actionPayload.action?.action_type ||
          null,

        action_name:
          actionPayload.action?.action_name ||
          null,

        status:
          actionPayload.action?.status ||
          null
      },

      execution: {
        status:
          executionStatus,

        ready:
          true
      },

      previous_execution_cycle:
        previousExecutionCycle
          ? {
              insight_id:
                previousExecutionCycle.insight_id,

              run_id:
                previousExecutionCycle.run_id,

              created_at:
                previousExecutionCycle.created_at
            }
          : null,

      guardrails: {
        execution_ready: true,
        action_executed: false,
        automatic_execution: false,
        strategy_change: false,
        business_data_mutation: false,
        content_mutation: false,
        customer_contact: false,
        payment_action: false,
        requires_human_approval: true
      }
    },

    persistence: null,

    guardrails: {
      execution_ready: true,
      action_executed: false,
      automatic_execution: false,
      strategy_change: false,
      business_data_mutation: false,
      content_mutation: false,
      customer_contact: false,
      payment_action: false,
      requires_human_approval: true
    },

    diagnostics: {
      action_cycle_found: true,

      execution_layer_reentered: true,

      previous_execution_cycle_found:
        !!previousExecutionCycle,

      previous_execution_cycle_id:
        previousExecutionCycle?.insight_id ||
        null,

      previous_execution_cycle_run_id:
        previousExecutionCycle?.run_id ||
        null
    },

    next_step:
      "Execution Cycle preview ready. POST approved:true to execute through Execution Layer."
  };
}

export async function onRequest(context) {
  const {
    request,
    env
  } = context;

  if (!env.DB) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        error:
          "DB_BINDING_NOT_FOUND"
      },
      500
    );
  }

  const url =
    new URL(request.url);

  const contentId =
    url.searchParams.get(
      "content_id"
    );

  if (!contentId) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        error:
          "content_id is required"
      },
      400
    );
  }

  if (
    request.method !== "GET" &&
    request.method !== "POST"
  ) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        error:
          "METHOD_NOT_ALLOWED"
      },
      405
    );
  }

  // ----------------------------------------------------------
  // GET = PREVIEW ONLY
  // ----------------------------------------------------------

  if (
    request.method === "GET"
  ) {
    try {
      const preview =
        await buildPreview(
          env,
          request,
          contentId
        );

      return json(
        preview
      );
    } catch (error) {
      return json(
        {
          success: false,
          layer: LAYER,
          version: VERSION,
          mode: "preview",
          status: "ERROR",
          error:
            error.message
        },
        500
      );
    }
  }

  // ----------------------------------------------------------
  // POST = EXECUTE
  // ----------------------------------------------------------

  let body = {};

  try {
    body =
      await request.json();
  } catch {
    body = {};
  }

  if (
    body.approved !== true
  ) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        mode: "execute",
        status:
          "APPROVAL_REQUIRED",

        message:
          "POST requires approved:true",

        guardrails: {
          execution_ready: false,
          action_executed: false,
          automatic_execution: false,
          strategy_change: false,
          business_data_mutation: false,
          content_mutation: false,
          customer_contact: false,
          payment_action: false,
          requires_human_approval: true
        }
      },
      403
    );
  }

  try {
    // --------------------------------------------------------
    // Rebuild preview before execution
    // --------------------------------------------------------

    const preview =
      await buildPreview(
        env,
        request,
        contentId
      );

    if (
      preview.status !== "READY"
    ) {
      return json(
        preview,
        409
      );
    }

    // --------------------------------------------------------
    // Explicit approval has been received.
    // Execute ONLY through existing Execution Layer.
    // --------------------------------------------------------

    const execution =
      await callExecutionLayerExecute(
        request,
        contentId
      );

    const now =
      new Date().toISOString();

    const runId =
      crypto.randomUUID();

    const insightId =
      crypto.randomUUID();

    const inputData =
      JSON.stringify({
        layer: LAYER,
        version: VERSION,

        content_id:
          contentId,

        source_action_cycle:
          preview.action_cycle,

        approved: true,

        approved_at:
          now
      });

    const outputData =
      JSON.stringify({
        execution,

        cycle:
          preview.cycle,

        guardrails: {
          execution_ready: true,
          action_executed:
            execution.status ===
            "EXECUTED",

          automatic_execution: false,

          strategy_change: false,

          business_data_mutation:
            false,

          content_mutation:
            false,

          customer_contact:
            false,

          payment_action:
            false,

          requires_human_approval:
            true
        }
      });

    // --------------------------------------------------------
    // Persist execution cycle run
    // --------------------------------------------------------

    await env.DB.prepare(`
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

        "EXECUTION_CYCLE",

        "TATO_EXECUTION_CYCLE_V1",

        inputData,

        outputData,

        "completed",

        0,

        now
      )
      .run();

    // --------------------------------------------------------
    // Persist execution cycle result
    // --------------------------------------------------------

    const insightContent =
      JSON.stringify({
        cycle: {
          ...preview.cycle,

          execution_result:
            execution,

          persistence: {
            run_id:
              runId,

            insight_id:
              insightId,

            saved_at:
              now
          }
        },

        source_action_cycle:
          preview.action_cycle,

        execution:
          execution,

        guardrails: {
          execution_ready:
            true,

          action_executed:
            execution.status ===
            "EXECUTED",

          automatic_execution:
            false,

          strategy_change:
            false,

          business_data_mutation:
            false,

          content_mutation:
            false,

          customer_contact:
            false,

          payment_action:
            false,

          requires_human_approval:
            true
        }
      });

    await env.DB.prepare(`
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

        "EXECUTION_CYCLE_RESULT",

        "Execution Cycle V1",

        insightContent,

        1,

        "high",

        "new",

        now
      )
      .run();

    return json({
      success: true,

      layer: LAYER,

      version: VERSION,

      mode: "execute",

      status: "EXECUTED",

      content:
        preview.content,

      source_chain:
        preview.source_chain,

      action_cycle:
        preview.action_cycle,

      execution:
        execution,

      cycle: {
        ...preview.cycle,

        execution_result:
          execution,

        persistence: {
          run_id:
            runId,

          insight_id:
            insightId,

          saved_at:
            now
        }
      },

      persistence: {
        run_id:
          runId,

        insight_id:
          insightId,

        saved_at:
          now
      },

      guardrails: {
        execution_ready:
          true,

        action_executed:
          execution.status ===
          "EXECUTED",

        automatic_execution:
          false,

        strategy_change:
          false,

        business_data_mutation:
          false,

        content_mutation:
          false,

        customer_contact:
          false,

        payment_action:
          false,

        requires_human_approval:
          true
      },

      diagnostics: {
        action_cycle_found:
          true,

        execution_layer_reentered:
          true,

        execution_layer_executed:
          true,

        execution_cycle_persisted:
          true
      },

      next_step:
        "Execution Cycle completed. Execution Result is ready for Feedback Loop."
    });

  } catch (error) {
    return json(
      {
        success: false,

        layer: LAYER,

        version: VERSION,

        mode: "execute",

        status: "ERROR",

        error:
          error.message
      },
      500
    );
  }
}
