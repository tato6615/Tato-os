// ============================================================
// TATO-OS
// ACTION CYCLE V1.0
// Decision Cycle → Action Layer → Approval → Execution
// ============================================================

const LAYER = "ACTION_CYCLE_V1";
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
  if (!value || depth > 8) return null;

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
    "action"
  ];

  for (const key of nestedKeys) {
    if (value[key]) {
      const found = extractContentId(value[key], depth + 1);

      if (found) {
        return found;
      }
    }
  }

  for (const key of Object.keys(value)) {
    const child = value[key];

    if (
      child &&
      typeof child === "object" &&
      !nestedKeys.includes(key)
    ) {
      const found = extractContentId(child, depth + 1);

      if (found) {
        return found;
      }
    }
  }

  return null;
}

function getEventData(row) {
  if (!row) return {};

  const candidates = [
    row.content,
    row.data,
    row.payload,
    row.output_data,
    row.input_data
  ];

  for (const candidate of candidates) {
    const parsed = parseJSON(candidate);

    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  }

  return {};
}

function safeString(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

async function getLatestDecisionCycle(db, contentId) {
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
    WHERE insight_type = 'DECISION_CYCLE_RESULT'
    ORDER BY created_at DESC
    LIMIT 100
  `).all();

  const rows = result?.results || [];

  for (const row of rows) {
    const parsed = parseJSON(row.content, {});

    const rowContentId = extractContentId(parsed);

    if (
      rowContentId &&
      String(rowContentId) === String(contentId)
    ) {
      return {
        insight_id: row.id,
        run_id: row.run_id,
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

async function getLatestActionCycle(db, contentId) {
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
    WHERE insight_type = 'ACTION_CYCLE_RESULT'
    ORDER BY created_at DESC
    LIMIT 100
  `).all();

  const rows = result?.results || [];

  for (const row of rows) {
    const parsed = parseJSON(row.content, {});

    const rowContentId = extractContentId(parsed);

    if (
      rowContentId &&
      String(rowContentId) === String(contentId)
    ) {
      return {
        insight_id: row.id,
        run_id: row.run_id,
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

async function callActionLayer(request, contentId) {
  const url = new URL("/api/action-ai", request.url);

  url.searchParams.set("content_id", contentId);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "accept": "application/json"
    }
  });

  const text = await response.text();

  const data = parseJSON(text);

  if (!data) {
    throw new Error(
      `ACTION_LAYER_INVALID_RESPONSE:${response.status}`
    );
  }

  if (!response.ok || data.success === false) {
    throw new Error(
      data.error ||
      `ACTION_LAYER_FAILED:${response.status}`
    );
  }

  return data;
}

async function buildCycle(env, request, contentId) {
  const db = env.DB;

  const decisionCycle =
    await getLatestDecisionCycle(db, contentId);

  if (!decisionCycle) {
    return {
      success: true,
      layer: LAYER,
      version: VERSION,
      mode: "preview",
      status: "WAITING_FOR_DECISION_CYCLE",
      content: {
        id: contentId
      },
      diagnostics: {
        decision_cycle_found: false,
        action_layer_reentered: false,
        previous_action_cycle_found: false
      },
      guardrails: {
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
        "Decision Cycle result is required before Action Cycle."
    };
  }

  const decisionCycleContent =
    decisionCycle.content || {};

  const cycle =
    decisionCycleContent.cycle ||
    {};

  const decision =
    cycle.decision ||
    decisionCycleContent.decision ||
    {};

  const decisionValue =
    decision.decision ||
    null;

  const previousActionCycle =
    await getLatestActionCycle(db, contentId);

  let actionLayer;

  try {
    actionLayer =
      await callActionLayer(
        request,
        contentId
      );
  } catch (error) {
    return {
      success: false,
      layer: LAYER,
      version: VERSION,
      mode: "preview",
      status: "ACTION_LAYER_FAILED",
      error: error.message,
      diagnostics: {
        decision_cycle_found: true,
        action_layer_reentered: false,
        previous_action_cycle_found:
          !!previousActionCycle
      }
    };
  }

  const action =
    actionLayer.action ||
    actionLayer.proposed_action ||
    actionLayer.result ||
    null;

  const actionType =
    action?.action_type ||
    action?.type ||
    null;

  const actionName =
    action?.action_name ||
    action?.name ||
    null;

  const actionStatus =
    action?.status ||
    "PROPOSED_ONLY";

  const cycleState =
    actionLayer.status === "READY"
      ? "ACTION_CYCLE_READY"
      : "ACTION_CYCLE_PROPOSED";

  return {
    success: true,
    layer: LAYER,
    version: VERSION,
    mode: "preview",
    status: "READY",

    content: {
      id: contentId,
      title:
        actionLayer.content?.title ||
        decisionCycleContent.content?.title ||
        null,
      status:
        actionLayer.content?.status ||
        decisionCycleContent.content?.status ||
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
        "ACTION_CYCLE_V1"
    },

    decision_cycle: {
      insight_id:
        decisionCycle.insight_id,
      run_id:
        decisionCycle.run_id,
      created_at:
        decisionCycle.created_at,

      decision: {
        state:
          decision.state ||
          null,
        decision_type:
          decision.decision_type ||
          null,
        decision:
          decisionValue,
        priority:
          decision.priority ||
          null,
        confidence:
          decision.confidence ||
          null,
        reason:
          decision.reason ||
          null
      }
    },

    action: {
      state:
        actionLayer.status ||
        "READY",

      action_type:
        actionType,

      action_name:
        actionName,

      status:
        actionStatus,

      proposal:
        action,

      source:
        "ACTION_LAYER_V1"
    },

    cycle: {
      state: cycleState,

      cycle_type:
        "DECISION_TO_ACTION",

      trigger:
        "DECISION_CYCLE_RESULT",

      content_id:
        contentId,

      decision: {
        decision:
          decisionValue,
        priority:
          decision.priority ||
          null,
        confidence:
          decision.confidence ||
          null
      },

      action: {
        action_type:
          actionType,
        action_name:
          actionName,
        status:
          actionStatus
      },

      previous_action_cycle:
        previousActionCycle
          ? {
              insight_id:
                previousActionCycle.insight_id,
              run_id:
                previousActionCycle.run_id,
              created_at:
                previousActionCycle.created_at
            }
          : null,

      guardrails: {
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
      decision_cycle_found: true,
      action_layer_reentered: true,
      previous_action_cycle_found:
        !!previousActionCycle,
      previous_action_cycle_id:
        previousActionCycle?.insight_id ||
        null,
      previous_action_cycle_run_id:
        previousActionCycle?.run_id ||
        null
    },

    next_step:
      "Action Cycle preview ready. POST approved:true to persist the cycle. Execution remains blocked until explicit approval."
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
        error: "DB_BINDING_NOT_FOUND"
      },
      500
    );
  }

  const url =
    new URL(request.url);

  const contentId =
    url.searchParams.get("content_id");

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
        error: "METHOD_NOT_ALLOWED"
      },
      405
    );
  }

  if (request.method === "GET") {
    try {
      const result =
        await buildCycle(
          env,
          request,
          contentId
        );

      return json(result);
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

  let body = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (body.approved !== true) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        mode: "execute",
        status: "APPROVAL_REQUIRED",
        message:
          "POST requires approved:true",
        guardrails: {
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
    const preview =
      await buildCycle(
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

    const cycle =
      preview.cycle || {};

    const action =
      preview.action || {};

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
        content_id: contentId,
        source_decision_cycle:
          preview.decision_cycle,
        approved: true,
        approved_at: now
      });

    const outputData =
      JSON.stringify({
        cycle,
        action,
        guardrails:
          preview.guardrails,
        executed: false
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
        "ACTION_CYCLE",
        "TATO_ACTION_CYCLE_V1",
        inputData,
        outputData,
        "completed",
        0,
        now
      )
      .run();

    const insightContent =
      JSON.stringify({
        cycle: {
          ...cycle,
          persistence: {
            run_id: runId,
            insight_id: insightId,
            saved_at: now
          }
        },

        action: action,

        source_decision_cycle:
          preview.decision_cycle,

        guardrails: {
          action_executed: false,
          automatic_execution: false,
          strategy_change: false,
          business_data_mutation: false,
          content_mutation: false,
          customer_contact: false,
          payment_action: false,
          requires_human_approval: true
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
        "ACTION_CYCLE_RESULT",
        "Action Cycle V1",
        insightContent,
        1,
        action.action?.priority ||
          action.priority ||
          "high",
        "new",
        now
      )
      .run();

    return json({
      ...preview,

      mode: "execute",

      status: "EXECUTED",

      persistence: {
        run_id: runId,
        insight_id: insightId,
        saved_at: now
      },

      guardrails: {
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
        "Action Cycle completed. Human approval is required before Execution."
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
