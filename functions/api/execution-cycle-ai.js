// ============================================================
// TATO-OS
// EXECUTION CYCLE V1.1
//
// Action Cycle V1.1
//      ↓
// Execution Layer V1
//      ↓
// Human Approval
//      ↓
// Execute
//      ↓
// Execution Result
//      ↓
// Feedback Loop V1.5
//      ↓
// Measurement V2.2
//      ↓
// Learning V1
//
// V1.1:
// - Requires ACTION_CYCLE_V1.1
// - Requires DECISION_CYCLE_V1.1
// - Never falls back to old Action Cycle V1
// - Automatically re-enters Feedback Loop after successful execution
// - Passes exact execution_run_id / execution_insight_id
// - Preserves human approval boundary
// - Does not mutate business/content/customer/payment data
// ============================================================

const LAYER =
  "EXECUTION_CYCLE_V1";

const VERSION =
  "1.1";

const REQUIRED_ACTION_CYCLE_VERSION =
  "1.1";

const REQUIRED_DECISION_CYCLE_VERSION =
  "1.1";

function json(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8"
      }
    }
  );
}

function parseJSON(
  value,
  fallback = null
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  if (
    typeof value === "object"
  ) {
    return value;
  }

  try {
    return JSON.parse(
      value
    );
  } catch {
    return fallback;
  }
}

function extractContentId(
  value,
  depth = 0
) {
  if (
    !value ||
    depth > 12
  ) {
    return null;
  }

  if (
    typeof value === "string"
  ) {
    const parsed =
      parseJSON(value);

    if (
      parsed &&
      typeof parsed === "object"
    ) {
      return extractContentId(
        parsed,
        depth + 1
      );
    }

    return null;
  }

  if (
    typeof value !== "object"
  ) {
    return null;
  }

  const directKeys = [
    "content_id",
    "contentId",
    "contentID"
  ];

  for (
    const key of directKeys
  ) {
    if (value[key]) {
      return String(
        value[key]
      );
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
    "execution_result",
    "learning",
    "decision",
    "cycle",
    "action",
    "source_action_cycle",
    "source_decision_cycle"
  ];

  for (
    const key of nestedKeys
  ) {
    if (value[key]) {
      const found =
        extractContentId(
          value[key],
          depth + 1
        );

      if (found) {
        return found;
      }
    }
  }

  for (
    const key of Object.keys(
      value
    )
  ) {
    if (
      nestedKeys.includes(
        key
      )
    ) {
      continue;
    }

    const child =
      value[key];

    if (
      child &&
      typeof child === "object"
    ) {
      const found =
        extractContentId(
          child,
          depth + 1
        );

      if (found) {
        return found;
      }
    }
  }

  return null;
}

function extractVersion(
  value,
  depth = 0
) {
  if (
    !value ||
    depth > 12
  ) {
    return null;
  }

  if (
    typeof value === "string"
  ) {
    const parsed =
      parseJSON(value);

    if (
      parsed &&
      typeof parsed === "object"
    ) {
      return extractVersion(
        parsed,
        depth + 1
      );
    }

    return null;
  }

  if (
    typeof value !== "object"
  ) {
    return null;
  }

  if (
    value.version !== undefined &&
    value.version !== null
  ) {
    return String(
      value.version
    );
  }

  const versionKeys = [
    "input_data",
    "output_data",
    "content",
    "data",
    "payload",
    "result",
    "cycle",
    "action",
    "source_action_cycle",
    "source_decision_cycle"
  ];

  for (
    const key of versionKeys
  ) {
    if (
      value[key] !== undefined &&
      value[key] !== null
    ) {
      const found =
        extractVersion(
          value[key],
          depth + 1
        );

      if (found) {
        return found;
      }
    }
  }

  return null;
}

function extractDecisionCycleVersion(
  value,
  depth = 0
) {
  if (
    !value ||
    depth > 12
  ) {
    return null;
  }

  if (
    typeof value === "string"
  ) {
    const parsed =
      parseJSON(value);

    if (
      parsed &&
      typeof parsed === "object"
    ) {
      return extractDecisionCycleVersion(
        parsed,
        depth + 1
      );
    }

    return null;
  }

  if (
    typeof value !== "object"
  ) {
    return null;
  }

  if (
    value.source_decision_cycle
  ) {
    const source =
      value.source_decision_cycle;

    if (
      source.version !== undefined &&
      source.version !== null
    ) {
      return String(
        source.version
      );
    }

    if (
      source.cycle?.version !== undefined &&
      source.cycle?.version !== null
    ) {
      return String(
        source.cycle.version
      );
    }
  }

  const nestedKeys = [
    "input_data",
    "output_data",
    "content",
    "data",
    "payload",
    "result",
    "cycle",
    "action",
    "source_action_cycle"
  ];

  for (
    const key of nestedKeys
  ) {
    if (value[key]) {
      const found =
        extractDecisionCycleVersion(
          value[key],
          depth + 1
        );

      if (found) {
        return found;
      }
    }
  }

  return null;
}

async function getLatestInsight(
  db,
  insightType,
  contentId,
  validator = null
) {
  const result =
    await db.prepare(`
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
      LIMIT 200
    `)
      .bind(
        insightType
      )
      .all();

  const rows =
    result?.results ||
    [];

  for (
    const row of rows
  ) {
    const parsed =
      parseJSON(
        row.content,
        {}
      );

    const rowContentId =
      extractContentId(
        parsed
      );

    if (
      !rowContentId ||
      String(rowContentId) !==
        String(contentId)
    ) {
      continue;
    }

    if (
      validator &&
      !validator(parsed, row)
    ) {
      continue;
    }

    return {
      insight_id:
        row.id,

      run_id:
        row.run_id,

      insight_type:
        row.insight_type,

      title:
        row.title,

      content:
        parsed,

      score:
        row.score,

      priority:
        row.priority,

      status:
        row.status,

      created_at:
        row.created_at
    };
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
    contentId,
    (parsed) => {
      const version =
        extractVersion(
          parsed
        );

      if (
        String(version) !==
        REQUIRED_ACTION_CYCLE_VERSION
      ) {
        return false;
      }

      const decisionCycleVersion =
        extractDecisionCycleVersion(
          parsed
        );

      if (
        decisionCycleVersion &&
        String(decisionCycleVersion) !==
          REQUIRED_DECISION_CYCLE_VERSION
      ) {
        return false;
      }

      const actionCycle =
        parsed.action_cycle ||
        parsed.cycle ||
        parsed;

      const action =
        actionCycle.action ||
        parsed.action ||
        null;

      return (
        action !== null
      );
    }
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

async function getContent(
  db,
  contentId
) {
  try {
    const result =
      await db.prepare(`
        SELECT
          id,
          title,
          status
        FROM content_engine
        WHERE id = ?
        LIMIT 1
      `)
        .bind(
          contentId
        )
        .first();

    return (
      result || {
        id:
          contentId,
        title:
          null,
        status:
          null
      }
    );
  } catch {
    return {
      id:
        contentId,
      title:
        null,
      status:
        null
    };
  }
}

function findActionCyclePayload(
  actionCycle
) {
  if (!actionCycle) {
    return {};
  }

  const root =
    actionCycle.content ||
    {};

  const cycle =
    root.cycle ||
    root.action_cycle ||
    null;

  const action =
    root.action ||
    cycle?.action ||
    null;

  const decision =
    root.source_decision_cycle
      ?.decision ||
    cycle?.source_decision_cycle
      ?.decision ||
    null;

  const sourceDecisionCycle =
    root.source_decision_cycle ||
    cycle?.source_decision_cycle ||
    null;

  return {
    cycle:
      cycle,

    action:
      action,

    decision:
      decision,

    source_decision_cycle:
      sourceDecisionCycle
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
        method:
          "GET",

        headers: {
          "accept":
            "application/json"
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
        method:
          "POST",

        headers: {
          "content-type":
            "application/json",

          "accept":
            "application/json"
        },

        body:
          JSON.stringify({
            approved:
              true
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

async function callFeedbackPreview(
  request,
  contentId,
  executionRunId,
  executionInsightId
) {
  const url =
    new URL(
      "/api/feedback-loop-ai",
      request.url
    );

  url.searchParams.set(
    "content_id",
    contentId
  );

  url.searchParams.set(
    "execution_run_id",
    executionRunId
  );

  url.searchParams.set(
    "execution_insight_id",
    executionInsightId
  );

  const response =
    await fetch(
      url.toString(),
      {
        method:
          "GET",

        headers: {
          "accept":
            "application/json"
        }
      }
    );

  const text =
    await response.text();

  const data =
    parseJSON(text);

  if (!data) {
    throw new Error(
      `FEEDBACK_LOOP_INVALID_RESPONSE:${response.status}`
    );
  }

  if (
    !response.ok ||
    data.success === false
  ) {
    throw new Error(
      data.error ||
      `FEEDBACK_LOOP_FAILED:${response.status}`
    );
  }

  return data;
}

async function callFeedbackExecute(
  request,
  contentId,
  executionRunId,
  executionInsightId
) {
  const url =
    new URL(
      "/api/feedback-loop-ai",
      request.url
    );

  url.searchParams.set(
    "content_id",
    contentId
  );

  url.searchParams.set(
    "execution_run_id",
    executionRunId
  );

  url.searchParams.set(
    "execution_insight_id",
    executionInsightId
  );

  const response =
    await fetch(
      url.toString(),
      {
        method:
          "POST",

        headers: {
          "content-type":
            "application/json",

          "accept":
            "application/json"
        },

        body:
          JSON.stringify({
            approved:
              true,

            approval_source:
              "EXECUTION_CYCLE_HUMAN_APPROVAL"
          })
      }
    );

  const text =
    await response.text();

  const data =
    parseJSON(text);

  if (!data) {
    throw new Error(
      `FEEDBACK_LOOP_INVALID_RESPONSE:${response.status}`
    );
  }

  if (
    !response.ok ||
    data.success === false
  ) {
    throw new Error(
      data.error ||
      `FEEDBACK_LOOP_FAILED:${response.status}`
    );
  }

  return data;
}

async function buildPreview(
  env,
  request,
  contentId
) {
  const db =
    env.DB;

  const content =
    await getContent(
      db,
      contentId
    );

  // ----------------------------------------------------------
  // IMPORTANT:
  // Only ACTION CYCLE V1.1 is allowed.
  // Old V1 action cycles are intentionally ignored.
  // ----------------------------------------------------------

  const actionCycle =
    await getLatestActionCycle(
      db,
      contentId
    );

  if (!actionCycle) {
    return {
      success:
        true,

      layer:
        LAYER,

      version:
        VERSION,

      mode:
        "preview",

      status:
        "WAITING_FOR_ACTION_CYCLE_V1_1",

      content,

      source_chain: {
        measurement:
          "CONTENT_MEASUREMENT_ENGINE_V2.2",

        intelligence:
          "INTELLIGENCE_LAYER_V2.1",

        learning:
          "LEARNING_LAYER_V1",

        decision:
          "DECISION_LAYER_V1.1",

        action:
          "ACTION_LAYER_V1.1",

        execution:
          "EXECUTION_LAYER_V1",

        feedback:
          "FEEDBACK_LOOP_V1.5",

        decision_cycle:
          "DECISION_CYCLE_V1.1",

        action_cycle:
          "ACTION_CYCLE_V1.1",

        execution_cycle:
          "EXECUTION_CYCLE_V1.1"
      },

      diagnostics: {
        action_cycle_found:
          false,

        required_action_cycle_version:
          REQUIRED_ACTION_CYCLE_VERSION,

        old_action_cycle_fallback:
          false,

        execution_layer_reentered:
          false,

        previous_execution_cycle_found:
          false
      },

      guardrails: {
        execution_ready:
          false,

        action_executed:
          false,

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

      next_step:
        "ACTION_CYCLE_V1.1 is required. Old ACTION_CYCLE_V1 is intentionally rejected."
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
    success:
      true,

    layer:
      LAYER,

    version:
      VERSION,

    mode:
      "preview",

    status:
      "READY",

    content,

    source_chain: {
      measurement:
        "CONTENT_MEASUREMENT_ENGINE_V2.2",

      intelligence:
        "INTELLIGENCE_LAYER_V2.1",

      learning:
        "LEARNING_LAYER_V1",

      decision:
        "DECISION_LAYER_V1.1",

      action:
        "ACTION_LAYER_V1.1",

      execution:
        "EXECUTION_LAYER_V1",

      feedback:
        "FEEDBACK_LOOP_V1.5",

      decision_cycle:
        "DECISION_CYCLE_V1.1",

      action_cycle:
        "ACTION_CYCLE_V1.1",

      execution_cycle:
        "EXECUTION_CYCLE_V1.1"
    },

    action_cycle: {
      insight_id:
        actionCycle.insight_id,

      run_id:
        actionCycle.run_id,

      created_at:
        actionCycle.created_at,

      version:
        REQUIRED_ACTION_CYCLE_VERSION,

      cycle:
        actionPayload.cycle,

      action:
        actionPayload.action,

      decision:
        actionPayload.decision,

      source_decision_cycle:
        actionPayload.source_decision_cycle
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

      source_action_cycle_version:
        REQUIRED_ACTION_CYCLE_VERSION,

      source_decision_cycle_version:
        REQUIRED_DECISION_CYCLE_VERSION,

      action: {
        action_type:
          actionPayload.action
            ?.action_type ||
          null,

        action_name:
          actionPayload.action
            ?.action_name ||
          null,

        status:
          actionPayload.action
            ?.status ||
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
        execution_ready:
          true,

        action_executed:
          false,

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
    },

    persistence:
      null,

    feedback:
      null,

    guardrails: {
      execution_ready:
        true,

      action_executed:
        false,

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

      action_cycle_version:
        REQUIRED_ACTION_CYCLE_VERSION,

      decision_cycle_version:
        REQUIRED_DECISION_CYCLE_VERSION,

      old_action_cycle_rejected:
        true,

      execution_layer_reentered:
        true,

      previous_execution_cycle_found:
        !!previousExecutionCycle,

      previous_execution_cycle_id:
        previousExecutionCycle?.insight_id ||
        null,

      previous_execution_cycle_run_id:
        previousExecutionCycle?.run_id ||
        null,

      feedback_loop_reentered:
        false
    },

    next_step:
      "Execution Cycle V1.1 preview ready. POST approved:true to execute through Execution Layer and re-enter Feedback Loop."
  };
}

export async function onRequest(
  context
) {
  const {
    request,
    env
  } = context;

  if (!env.DB) {
    return json({
      success:
        false,

      layer:
        LAYER,

      version:
        VERSION,

      error:
        "DB_BINDING_NOT_FOUND"
    }, 500);
  }

  const url =
    new URL(
      request.url
    );

  const contentId =
    url.searchParams.get(
      "content_id"
    );

  if (!contentId) {
    return json({
      success:
        false,

      layer:
        LAYER,

      version:
        VERSION,

      error:
        "content_id is required"
    }, 400);
  }

  if (
    request.method !== "GET" &&
    request.method !== "POST"
  ) {
    return json({
      success:
        false,

      layer:
        LAYER,

      version:
        VERSION,

      error:
        "METHOD_NOT_ALLOWED"
    }, 405);
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
    } catch (
      error
    ) {
      return json({
        success:
          false,

        layer:
          LAYER,

        version:
          VERSION,

        mode:
          "preview",

        status:
          "ERROR",

        error:
          error?.message ||
          String(error)
      }, 500);
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
    return json({
      success:
        false,

      layer:
        LAYER,

      version:
        VERSION,

      mode:
        "execute",

      status:
        "APPROVAL_REQUIRED",

      message:
        "POST requires approved:true",

      guardrails: {
        execution_ready:
          false,

        action_executed:
          false,

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
    }, 403);
  }

  try {
    // --------------------------------------------------------
    // 1. Rebuild preview
    // --------------------------------------------------------

    const preview =
      await buildPreview(
        env,
        request,
        contentId
      );

    if (
      preview.status !==
      "READY"
    ) {
      return json(
        preview,
        409
      );
    }

    // --------------------------------------------------------
    // 2. Execute ONLY through Execution Layer
    // --------------------------------------------------------

    const execution =
      await callExecutionLayerExecute(
        request,
        contentId
      );

    if (
      execution.status !==
      "EXECUTED"
    ) {
      return json({
        success:
          false,

        layer:
          LAYER,

        version:
          VERSION,

        mode:
          "execute",

        status:
          "EXECUTION_LAYER_NOT_EXECUTED",

        execution,

        guardrails: {
          execution_ready:
            false,

          action_executed:
            false,

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
      }, 409);
    }

    // --------------------------------------------------------
    // 3. Extract exact Execution persistence reference
    // --------------------------------------------------------

    const executionRunId =
      execution.persistence?.run_id ||
      execution.run_id ||
      null;

    const executionInsightId =
      execution.persistence?.insight_id ||
      execution.insight_id ||
      null;

    if (
      !executionRunId ||
      !executionInsightId
    ) {
      return json({
        success:
          false,

        layer:
          LAYER,

        version:
          VERSION,

        mode:
          "execute",

        status:
          "EXECUTION_REFERENCE_MISSING",

        execution,

        diagnostics: {
          execution_run_id:
            executionRunId,

          execution_insight_id:
            executionInsightId
        }
      }, 500);
    }

    // --------------------------------------------------------
    // 4. Re-enter Feedback Loop PREVIEW
    // --------------------------------------------------------

    const feedbackPreview =
      await callFeedbackPreview(
        request,
        contentId,
        executionRunId,
        executionInsightId
      );

    if (
      feedbackPreview.status !==
      "READY"
    ) {
      return json({
        success:
          false,

        layer:
          LAYER,

        version:
          VERSION,

        mode:
          "execute",

        status:
          "FEEDBACK_REENTRY_PREVIEW_FAILED",

        execution,

        feedback:
          feedbackPreview
      }, 409);
    }

    // --------------------------------------------------------
    // 5. Persist Feedback Loop
    // --------------------------------------------------------

    const feedback =
      await callFeedbackExecute(
        request,
        contentId,
        executionRunId,
        executionInsightId
      );

    if (
      feedback.status !==
      "FEEDBACK_REENTERED"
    ) {
      return json({
        success:
          false,

        layer:
          LAYER,

        version:
          VERSION,

        mode:
          "execute",

        status:
          "FEEDBACK_REENTRY_FAILED",

        execution,

        feedback
      }, 500);
    }

    // --------------------------------------------------------
    // 6. Persist Execution Cycle
    // --------------------------------------------------------

    const now =
      new Date().toISOString();

    const runId =
      crypto.randomUUID();

    const insightId =
      crypto.randomUUID();

    const inputData =
      JSON.stringify({
        layer:
          LAYER,

        version:
          VERSION,

        content_id:
          contentId,

        source_action_cycle:
          preview.action_cycle,

        source_chain:
          preview.source_chain,

        approved:
          true,

        approved_at:
          now,

        feedback_reentry: {
          execution_run_id:
            executionRunId,

          execution_insight_id:
            executionInsightId,

          feedback_run_id:
            feedback.persistence?.run_id ||
            null,

          feedback_insight_id:
            feedback.persistence?.insight_id ||
            null,

          approval_source:
            "EXECUTION_CYCLE_HUMAN_APPROVAL"
        }
      });

    const outputData =
      JSON.stringify({
        execution,

        feedback,

        cycle:
          preview.cycle,

        source_chain:
          preview.source_chain,

        guardrails: {
          execution_ready:
            true,

          action_executed:
            true,

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

        "TATO_EXECUTION_CYCLE_V1_1",

        inputData,

        outputData,

        "completed",

        0,

        now
      )
      .run();

    // --------------------------------------------------------
    // 7. Persist Execution Cycle Result
    // --------------------------------------------------------

    const insightContent =
      JSON.stringify({
        version:
          VERSION,

        cycle: {
          ...preview.cycle,

          execution_result:
            execution,

          feedback_result:
            feedback,

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

        source_chain:
          preview.source_chain,

        execution:
          execution,

        feedback:
          feedback,

        feedback_reentry: {
          execution_run_id:
            executionRunId,

          execution_insight_id:
            executionInsightId,

          feedback_run_id:
            feedback.persistence?.run_id ||
            null,

          feedback_insight_id:
            feedback.persistence?.insight_id ||
            null
        },

        guardrails: {
          execution_ready:
            true,

          action_executed:
            true,

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

        "Execution Cycle V1.1",

        insightContent,

        1,

        "HIGH",

        "COMPLETED",

        now
      )
      .run();

    // --------------------------------------------------------
    // 8. Final response
    // --------------------------------------------------------

    return json({
      success:
        true,

      layer:
        LAYER,

      version:
        VERSION,

      mode:
        "execute",

      status:
        "EXECUTED",

      content:
        preview.content,

      source_chain:
        preview.source_chain,

      action_cycle:
        preview.action_cycle,

      execution:
        execution,

      feedback:
        feedback,

      cycle: {
        ...preview.cycle,

        execution_result:
          execution,

        feedback_result:
          feedback,

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

      feedback_reentry: {
        status:
          "COMPLETED",

        execution_run_id:
          executionRunId,

        execution_insight_id:
          executionInsightId,

        feedback_run_id:
          feedback.persistence?.run_id ||
          null,

        feedback_insight_id:
          feedback.persistence?.insight_id ||
          null,

        measurement_reentered:
          true,

        learning_reentered:
          true
      },

      guardrails: {
        execution_ready:
          true,

        action_executed:
          true,

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

        action_cycle_version:
          REQUIRED_ACTION_CYCLE_VERSION,

        decision_cycle_version:
          REQUIRED_DECISION_CYCLE_VERSION,

        old_action_cycle_rejected:
          true,

        execution_layer_reentered:
          true,

        execution_layer_executed:
          true,

        execution_cycle_persisted:
          true,

        feedback_loop_reentered:
          true,

        feedback_loop_persisted:
          true,

        measurement_reentered:
          true,

        learning_reentered:
          true
      },

      next_step:
        "Execution → Feedback → Measurement → Learning completed."
    });

  } catch (
    error
  ) {
    return json({
      success:
        false,

      layer:
        LAYER,

      version:
        VERSION,

      mode:
        "execute",

      status:
        "ERROR",

      error:
        error?.message ||
        String(error)
    }, 500);
  }
}
