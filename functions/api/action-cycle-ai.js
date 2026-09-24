// ============================================================
// TATO-OS
// ACTION CYCLE V1.1
// Decision Cycle → Action Layer → Approval → Execution
//
// SOURCE OF TRUTH:
// Action Cycle MUST use the current Action Layer V1.1 result.
// Action Layer V1.1 uses Learning Layer V1 as its source of truth.
//
// IMPORTANT:
// - No independent Measurement aggregation
// - No independent Learning aggregation
// - No winner declaration
// - No strategy change
// - No automatic execution
// - Human approval required
// ============================================================

const LAYER = "ACTION_CYCLE_V1";
const VERSION = "1.1";

const MEASUREMENT_SOURCE =
  "CONTENT_MEASUREMENT_ENGINE_V2.2";

const INTELLIGENCE_SOURCE =
  "INTELLIGENCE_LAYER_V2.1";

const LEARNING_SOURCE =
  "LEARNING_LAYER_V1";

const DECISION_SOURCE =
  "DECISION_LAYER_V1";

const ACTION_SOURCE =
  "ACTION_LAYER_V1";

const ATTENTION_TYPE =
  "weighted_behavioral_signal";

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8",
        "cache-control": "no-store"
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
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function extractContentId(
  value,
  depth = 0
) {
  if (!value || depth > 10) {
    return null;
  }

  if (typeof value === "string") {
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
    "learning",
    "decision",
    "cycle",
    "action",
    "source_of_truth",
    "source_chain"
  ];

  for (
    const key of nestedKeys
  ) {
    if (!value[key]) {
      continue;
    }

    const found =
      extractContentId(
        value[key],
        depth + 1
      );

    if (found) {
      return found;
    }
  }

  for (
    const key of Object.keys(value)
  ) {
    if (
      nestedKeys.includes(key)
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

async function getLatestDecisionCycle(
  db,
  contentId
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
      WHERE insight_type = 'DECISION_CYCLE_RESULT'
      ORDER BY created_at DESC
      LIMIT 100
    `).all();

  const rows =
    result?.results || [];

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
      rowContentId &&
      String(rowContentId) ===
        String(contentId)
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

async function getLatestActionCycle(
  db,
  contentId
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
      WHERE insight_type = 'ACTION_CYCLE_RESULT'
      ORDER BY created_at DESC
      LIMIT 100
    `).all();

  const rows =
    result?.results || [];

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
      rowContentId &&
      String(rowContentId) ===
        String(contentId)
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

async function callActionLayer(
  request,
  contentId
) {
  const url =
    new URL(
      "/api/action-ai",
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
      `ACTION_LAYER_INVALID_RESPONSE:${response.status}`
    );
  }

  if (
    !response.ok ||
    data.success === false
  ) {
    throw new Error(
      data.error ||
      `ACTION_LAYER_FAILED:${response.status}`
    );
  }

  if (
    data.version !== "1.1"
  ) {
    throw new Error(
      `ACTION_LAYER_VERSION_MISMATCH:${data.version}`
    );
  }

  if (
    data.source_of_truth
      ?.type !==
      LEARNING_SOURCE
  ) {
    throw new Error(
      "ACTION_LAYER_SOURCE_OF_TRUTH_INVALID"
    );
  }

  if (
    data.source_of_truth
      ?.aggregation_owner !==
      LEARNING_SOURCE
  ) {
    throw new Error(
      "ACTION_LAYER_AGGREGATION_OWNER_INVALID"
    );
  }

  return data;
}

function resolveDecision(
  decisionCycle
) {
  const decisionCycleContent =
    decisionCycle?.content || {};

  const cycle =
    decisionCycleContent.cycle ||
    {};

  const decision =
    cycle.decision ||
    decisionCycleContent.decision ||
    {};

  return {
    state:
      decision.state ||
      null,

    decision_type:
      decision.decision_type ||
      null,

    decision:
      decision.decision ||
      null,

    priority:
      decision.priority ||
      null,

    confidence:
      decision.confidence ||
      null,

    reason:
      decision.reason ||
      null
  };
}

function buildGuardrails() {
  return {
    winner_declared: false,
    strategy_change: false,
    automatic_execution: false,
    action_executed: false,
    approval_required: true,
    human_approval_required: true,
    external_side_effects: false,
    business_data_mutation: false,
    content_mutation: false,
    customer_contact: false,
    payment_action: false,
    requires_execution_layer: true
  };
}

function buildSourceOfTruth(
  actionLayer
) {
  return {
    action_layer:
      ACTION_SOURCE,

    action_layer_version:
      actionLayer.version,

    action_layer_status:
      actionLayer.status,

    learning_layer:
      LEARNING_SOURCE,

    learning_run_id:
      actionLayer.source_of_truth
        ?.learning_run_id ||
      actionLayer.learning
        ?.run_id ||
      null,

    learning_created_at:
      actionLayer.source_of_truth
        ?.learning_created_at ||
      actionLayer.learning
        ?.created_at ||
      null,

    attention_type:
      actionLayer.source_of_truth
        ?.attention_type ||
      ATTENTION_TYPE,

    aggregation_owner:
      actionLayer.source_of_truth
        ?.aggregation_owner ||
      LEARNING_SOURCE
  };
}

function buildMeasurementSnapshot(
  actionLayer
) {
  const measurement =
    actionLayer.measurement ||
    {};

  return {
    rounds:
      Number(measurement.rounds) ||
      0,

    attention:
      Number(measurement.attention) ||
      0,

    clicks:
      Number(measurement.clicks) ||
      0,

    product_views:
      Number(
        measurement.product_views
      ) || 0,

    engagements:
      Number(
        measurement.engagements
      ) || 0,

    customers:
      Number(
        measurement.customers
      ) || 0,

    orders:
      Number(
        measurement.orders
      ) || 0,

    revenue:
      Number(
        measurement.revenue
      ) || 0
  };
}

async function buildCycle(
  env,
  request,
  contentId
) {
  const db =
    env.DB;

  const decisionCycle =
    await getLatestDecisionCycle(
      db,
      contentId
    );

  if (!decisionCycle) {
    return {
      success: true,
      layer: LAYER,
      version: VERSION,
      mode: "preview",
      status:
        "WAITING_FOR_DECISION_CYCLE",

      content: {
        id: contentId
      },

      diagnostics: {
        decision_cycle_found:
          false,

        action_layer_reentered:
          false,

        previous_action_cycle_found:
          false,

        source_of_truth_verified:
          false
      },

      guardrails:
        buildGuardrails(),

      next_step:
        "Decision Cycle result is required before Action Cycle."
    };
  }

  const previousActionCycle =
    await getLatestActionCycle(
      db,
      contentId
    );

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
      status:
        "ACTION_LAYER_FAILED",

      error:
        error?.message ||
        String(error),

      diagnostics: {
        decision_cycle_found:
          true,

        action_layer_reentered:
          false,

        previous_action_cycle_found:
          !!previousActionCycle,

        source_of_truth_verified:
          false
      }
    };
  }

  const decision =
    resolveDecision(
      decisionCycle
    );

  const action =
    actionLayer.action ||
    null;

  const actionType =
    action?.action_type ||
    null;

  const actionName =
    action?.action_name ||
    null;

  const actionStatus =
    action?.status ||
    "PENDING_APPROVAL";

  const measurement =
    buildMeasurementSnapshot(
      actionLayer
    );

  const sourceOfTruth =
    buildSourceOfTruth(
      actionLayer
    );

  const cycleState =
    actionLayer.status ===
    "ACTION_PROPOSED"
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
        actionLayer.content
          ?.title ||
        null,

      status:
        actionLayer.content
          ?.status ||
        null
    },

    source_chain: {
      measurement:
        MEASUREMENT_SOURCE,

      intelligence:
        INTELLIGENCE_SOURCE,

      learning:
        LEARNING_SOURCE,

      decision:
        DECISION_SOURCE,

      action:
        ACTION_SOURCE,

      execution:
        "EXECUTION_LAYER_V1",

      feedback:
        "FEEDBACK_LOOP_V1",

      decision_cycle:
        "DECISION_CYCLE_V1",

      action_cycle:
        LAYER
    },

    source_of_truth:
      sourceOfTruth,

    measurement:
      measurement,

    learning: {
      run_id:
        actionLayer.learning
          ?.run_id ||
        sourceOfTruth
          .learning_run_id ||
        null,

      created_at:
        actionLayer.learning
          ?.created_at ||
        sourceOfTruth
          .learning_created_at ||
        null,

      state:
        actionLayer.learning
          ?.state ||
        null,

      confidence:
        actionLayer.learning
          ?.confidence ||
        null
    },

    decision_cycle: {
      insight_id:
        decisionCycle.insight_id,

      run_id:
        decisionCycle.run_id,

      created_at:
        decisionCycle.created_at,

      decision: decision
    },

    action: {
      state:
        actionLayer.status,

      action_type:
        actionType,

      action_name:
        actionName,

      status:
        actionStatus,

      proposal:
        action,

      source:
        ACTION_SOURCE,

      source_of_truth:
        sourceOfTruth
    },

    cycle: {
      state:
        cycleState,

      cycle_type:
        "DECISION_TO_ACTION",

      trigger:
        "DECISION_CYCLE_RESULT",

      content_id:
        contentId,

      decision: {
        decision:
          decision.decision,

        priority:
          decision.priority,

        confidence:
          decision.confidence
      },

      action: {
        action_type:
          actionType,

        action_name:
          actionName,

        status:
          actionStatus
      },

      evidence:
        measurement,

      source_of_truth:
        sourceOfTruth,

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

      guardrails:
        buildGuardrails()
    },

    persistence: null,

    guardrails:
      buildGuardrails(),

    diagnostics: {
      decision_cycle_found:
        true,

      action_layer_reentered:
        true,

      action_layer_version:
        actionLayer.version,

      previous_action_cycle_found:
        !!previousActionCycle,

      previous_action_cycle_id:
        previousActionCycle
          ?.insight_id ||
        null,

      previous_action_cycle_run_id:
        previousActionCycle
          ?.run_id ||
        null,

      source_of_truth_verified:
        true,

      aggregation_owner:
        sourceOfTruth
          .aggregation_owner,

      evidence_owner:
        ACTION_SOURCE
    },

    next_step:
      "Action Cycle preview ready. POST approved:true to persist the cycle. Execution remains blocked until explicit approval."
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
    new URL(
      request.url
    );

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

  // ==========================================================
  // GET = PREVIEW ONLY
  // ==========================================================

  if (
    request.method === "GET"
  ) {
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
            error?.message ||
            String(error)
        },
        500
      );
    }
  }

  // ==========================================================
  // POST = HUMAN APPROVAL REQUIRED
  // ==========================================================

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

        guardrails:
          buildGuardrails()
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
      preview.status !==
      "READY"
    ) {
      return json(
        preview,
        409
      );
    }

    const cycle =
      preview.cycle ||
      {};

    const action =
      preview.action ||
      {};

    const sourceOfTruth =
      preview.source_of_truth ||
      {};

    const now =
      new Date().toISOString();

    const runId =
      crypto.randomUUID();

    const insightId =
      crypto.randomUUID();

    // ========================================================
    // PERSIST INPUT
    // ========================================================

    const inputData =
      JSON.stringify({
        layer: LAYER,

        version: VERSION,

        content_id:
          contentId,

        source_of_truth:
          sourceOfTruth,

        source_decision_cycle:
          preview.decision_cycle,

        source_action_layer:
          {
            layer:
              ACTION_SOURCE,

            version:
              action?.source ===
              ACTION_SOURCE
                ? "1.1"
                : null,

            learning_run_id:
              sourceOfTruth
                .learning_run_id,

            learning_created_at:
              sourceOfTruth
                .learning_created_at
          },

        evidence:
          preview.measurement,

        approved: true,

        approved_at:
          now
      });

    // ========================================================
    // PERSIST OUTPUT
    // ========================================================

    const outputData =
      JSON.stringify({
        cycle: {
          ...cycle,

          persistence: {
            run_id:
              runId,

            insight_id:
              insightId,

            saved_at:
              now
          }
        },

        action:

          action,

        source_of_truth:
          sourceOfTruth,

        guardrails:
          buildGuardrails(),

        executed: false
      });

    await env.DB
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

        "ACTION_CYCLE",

        "TATO_ACTION_CYCLE_V1.1",

        inputData,

        outputData,

        "completed",

        0,

        now
      )
      .run();

    // ========================================================
    // PERSIST INSIGHT
    // ========================================================

    const insightContent =
      JSON.stringify({
        cycle: {
          ...cycle,

          persistence: {
            run_id:
              runId,

            insight_id:
              insightId,

            saved_at:
              now
          }
        },

        action:

          action,

        source_of_truth:
          sourceOfTruth,

        source_decision_cycle:
          preview.decision_cycle,

        evidence:
          preview.measurement,

        guardrails:
          buildGuardrails()
      });

    await env.DB
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

        "ACTION_CYCLE_RESULT",

        "Action Cycle V1.1",

        insightContent,

        1,

        action?.proposal
          ?.trigger
          ?.decision ||
        "HIGH",

        "new",

        now
      )
      .run();

    return json({
      ...preview,

      mode:
        "execute",

      status:
        "EXECUTED",

      persistence: {
        run_id:
          runId,

        insight_id:
          insightId,

        saved_at:
          now
      },

      source_of_truth:
        sourceOfTruth,

      guardrails:
        buildGuardrails(),

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
          error?.message ||
          String(error)
      },
      500
    );
  }
}
