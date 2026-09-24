// TATO-OS
// Decision Cycle V1.1
// Route: /api/decision-cycle-ai
//
// Purpose:
// FEEDBACK → DECISION CYCLE → DECISION V1.1
//
// Source of Truth:
// Learning Layer V1
//
// Guardrails:
// - Does NOT change strategy
// - Does NOT declare winner
// - Does NOT execute action
// - Does NOT mutate business data
// - Human approval remains required
// ============================================================

const LAYER = "DECISION_CYCLE_V1";
const VERSION = "1.1";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
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

function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

// ------------------------------------------------------------
// Safe JSON parser
// ------------------------------------------------------------

function parseJSON(value) {
  if (!value) return null;

  if (typeof value === "object") {
    return value;
  }

  let text = String(value)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(text);
  } catch (_) {}

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start >= 0 && end > start) {
    try {
      return JSON.parse(
        text.slice(start, end + 1)
      );
    } catch (_) {}
  }

  return null;
}

// ------------------------------------------------------------
// Extract content_id recursively
// ------------------------------------------------------------

function extractContentId(value) {
  if (!value) return null;

  if (typeof value === "string") {
    const parsed = parseJSON(value);

    if (parsed) {
      return extractContentId(parsed);
    }

    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found =
        extractContentId(item);

      if (found) {
        return found;
      }
    }

    return null;
  }

  if (typeof value === "object") {
    const direct =
      value.content_id ||
      value.contentId ||
      value.content?.id ||
      value.content?.content_id;

    if (direct) {
      return String(direct);
    }

    const keys = [
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
      "cycle"
    ];

    for (const key of keys) {
      if (value[key]) {
        const found =
          extractContentId(value[key]);

        if (found) {
          return found;
        }
      }
    }
  }

  return null;
}

// ------------------------------------------------------------
// Find latest Feedback Loop result for content
// ------------------------------------------------------------

async function getLatestFeedback(
  db,
  contentId
) {
  const rows =
    await db.prepare(`
      SELECT
        id,
        customer_id,
        run_id,
        insight_type,
        title,
        content,
        score,
        priority,
        status,
        created_at
      FROM ai_insights
      WHERE insight_type = 'FEEDBACK_LOOP_RESULT'
      ORDER BY created_at DESC
      LIMIT 200
    `).all();

  for (const row of rows.results || []) {
    const parsedContent =
      parseJSON(row.content);

    const foundContentId =
      extractContentId(parsedContent);

    if (foundContentId === contentId) {
      return {
        id:
          row.id,

        run_id:
          row.run_id,

        insight_type:
          row.insight_type,

        title:
          row.title,

        content:
          parsedContent,

        score:
          n(row.score),

        priority:
          row.priority,

        status:
          row.status,

        created_at:
          row.created_at
      };
    }
  }

  return null;
}

// ------------------------------------------------------------
// Find latest Decision Cycle result
// ------------------------------------------------------------

async function getLatestCycle(
  db,
  contentId
) {
  const rows =
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
      LIMIT 200
    `).all();

  for (const row of rows.results || []) {
    const parsed =
      parseJSON(row.content);

    const foundContentId =
      extractContentId(parsed);

    if (foundContentId === contentId) {
      return {
        id:
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
          n(row.score),

        priority:
          row.priority,

        status:
          row.status,

        created_at:
          row.created_at
      };
    }
  }

  return null;
}

// ------------------------------------------------------------
// Call Decision Layer V1.1
//
// IMPORTANT:
// Decision Cycle does NOT calculate Measurement.
// Decision Layer V1.1 must use Learning V1 as the
// aggregation source of truth.
//
// Required contract:
// - version = 1.1
// - source_of_truth.type = LEARNING_LAYER_V1
// - source_of_truth.aggregation_owner = LEARNING_LAYER_V1
// ------------------------------------------------------------

async function callDecisionLayer(
  request,
  contentId
) {
  const requestUrl =
    new URL(request.url);

  const decisionUrl =
    `${requestUrl.origin}/api/decision-ai?content_id=${encodeURIComponent(contentId)}`;

  const response =
    await fetch(
      decisionUrl,
      {
        method:
          "GET",

        headers: {
          "Accept":
            "application/json"
        }
      }
    );

  let data = null;

  try {
    data =
      await response.json();
  } catch (_) {
    data = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      data,
      contract_valid: false,
      contract_error: "DECISION_LAYER_REQUEST_FAILED"
    };
  }

  if (!data?.success) {
    return {
      ok: false,
      status: response.status,
      data,
      contract_valid: false,
      contract_error: "DECISION_LAYER_UNSUCCESSFUL"
    };
  }

  const version =
    String(data.version || "");

  if (version !== "1.1") {
    return {
      ok: false,
      status: 409,
      data,
      contract_valid: false,
      contract_error:
        "DECISION_LAYER_VERSION_MISMATCH",
      expected_version: "1.1",
      received_version: version || null
    };
  }

  const source =
    data.source_of_truth || {};

  const sourceType =
    String(source.type || "");

  const aggregationOwner =
    String(
      source.aggregation_owner || ""
    );

  if (
    sourceType !==
      "LEARNING_LAYER_V1" ||
    aggregationOwner !==
      "LEARNING_LAYER_V1"
  ) {
    return {
      ok: false,
      status: 409,
      data,
      contract_valid: false,
      contract_error:
        "DECISION_LAYER_SOURCE_OF_TRUTH_INVALID",
      expected_source_of_truth: {
        type:
          "LEARNING_LAYER_V1",

        aggregation_owner:
          "LEARNING_LAYER_V1"
      },
      received_source_of_truth:
        source
    };
  }

  return {
    ok: true,
    status: response.status,
    data,
    contract_valid: true
  };
}

// ------------------------------------------------------------
// Build Cycle
// ------------------------------------------------------------

async function buildCycle(
  context,
  contentId
) {
  const db =
    context.env.DB;

  if (!db) {
    throw new Error(
      "D1 binding DB is missing"
    );
  }

  // ----------------------------------------------------------
  // 1. Feedback
  // ----------------------------------------------------------

  const feedback =
    await getLatestFeedback(
      db,
      contentId
    );

  if (!feedback) {
    return {
      success:
        false,

      status:
        "NO_FEEDBACK",

      content: {
        id:
          contentId
      },

      diagnostics: {
        feedback_found:
          false,

        lookup:
          "ai_insights.insight_type=FEEDBACK_LOOP_RESULT"
      }
    };
  }

  // ----------------------------------------------------------
  // 2. Existing Decision Cycle history
  // ----------------------------------------------------------

  const previousCycle =
    await getLatestCycle(
      db,
      contentId
    );

  // ----------------------------------------------------------
  // 3. Re-enter Decision Layer V1.1
  // ----------------------------------------------------------

  const decisionResult =
    await callDecisionLayer(
      context.request,
      contentId
    );

  if (
    !decisionResult.ok ||
    !decisionResult.data?.success
  ) {
    return {
      success:
        false,

      status:
        "DECISION_REENTRY_FAILED",

      content: {
        id:
          contentId
      },

      feedback,

      decision_response:
        decisionResult.data,

      diagnostics: {
        feedback_found:
          true,

        decision_layer_status:
          decisionResult.status,

        decision_layer_contract_valid:
          decisionResult.contract_valid,

        decision_layer_contract_error:
          decisionResult.contract_error ||
          null,

        expected_version:
          decisionResult.expected_version ||
          "1.1",

        expected_source_of_truth: {
          type:
            "LEARNING_LAYER_V1",

          aggregation_owner:
            "LEARNING_LAYER_V1"
        },

        received_source_of_truth:
          decisionResult.received_source_of_truth ||
          null
      }
    };
  }

  const decision =
    decisionResult.data;

  // ----------------------------------------------------------
  // 4. Build Cycle Signal
  // ----------------------------------------------------------

  const feedbackContent =
    feedback.content || {};

  const feedbackData =
    feedbackContent.feedback || {};

  const sourceExecution =
    feedbackData.source_execution || {};

  const learningSignal =
    feedbackData.learning_signal || {};

  const decisionSourceOfTruth =
    decision.source_of_truth || {};

  const decisionMeasurement =
    decision.measurement || {};

  const cycle = {
    state:
      "DECISION_CYCLE_READY",

    cycle_type:
      "FEEDBACK_REENTRY",

    trigger:
      "FEEDBACK_LOOP_RESULT",

    content_id:
      contentId,

    feedback: {
      insight_id:
        feedback.id,

      run_id:
        feedback.run_id,

      finding:
        sourceExecution.finding ||
        null,

      next_learning_signal:
        sourceExecution.next_learning_signal ||
        null,

      feedback_state:
        feedbackData.state ||
        null
    },

    learning_signal: {
      state:
        learningSignal.state ||
        null,

      decision_input:
        learningSignal.decision_input ||
        null,

      rounds:
        n(learningSignal.rounds)
    },

    decision: {
      state:
        decision.decision?.state ||
        null,

      decision_type:
        decision.decision?.decision_type ||
        null,

      decision:
        decision.decision?.decision ||
        null,

      priority:
        decision.decision?.priority ||
        null,

      confidence:
        decision.decision?.confidence ||
        null,

      reason:
        decision.decision?.reason ||
        null
    },

    // --------------------------------------------------------
    // Source of Truth
    // --------------------------------------------------------

    source_of_truth: {
      type:
        decisionSourceOfTruth.type ||
        null,

      learning_run_id:
        decisionSourceOfTruth.learning_run_id ||
        null,

      learning_created_at:
        decisionSourceOfTruth.learning_created_at ||
        null,

      attention_type:
        decisionSourceOfTruth.attention_type ||
        null,

      aggregation_owner:
        decisionSourceOfTruth.aggregation_owner ||
        null
    },

    // --------------------------------------------------------
    // Measurement Snapshot
    //
    // This is only the snapshot supplied by Decision V1.1.
    // Decision Cycle does NOT aggregate measurements itself.
    // --------------------------------------------------------

    measurement: {
      rounds:
        n(decisionMeasurement.rounds),

      attention:
        n(decisionMeasurement.attention),

      clicks:
        n(decisionMeasurement.clicks),

      product_views:
        n(
          decisionMeasurement.product_views
        ),

      engagements:
        n(
          decisionMeasurement.engagements
        ),

      customers:
        n(
          decisionMeasurement.customers
        ),

      orders:
        n(
          decisionMeasurement.orders
        ),

      revenue:
        n(
          decisionMeasurement.revenue
        )
    },

    // --------------------------------------------------------
    // Previous Cycle
    // --------------------------------------------------------

    previous_cycle:
      previousCycle
        ? {
            insight_id:
              previousCycle.id,

            run_id:
              previousCycle.run_id,

            created_at:
              previousCycle.created_at
          }
        : null,

    guardrails: {
      winner_declared:
        false,

      strategy_change:
        false,

      automatic_execution:
        false,

      action_executed:
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
  };

  return {
    success:
      true,

    status:
      "READY",

    content: {
      id:
        contentId,

      title:
        decision.content?.title ||
        null,

      status:
        decision.content?.status ||
        null
    },

    feedback,

    decision,

    cycle
  };
}

// ------------------------------------------------------------
// Persist Cycle
// ------------------------------------------------------------

async function saveCycle(
  env,
  result
) {
  const runId =
    id();

  const insightId =
    id();

  const now =
    new Date().toISOString();

  const inputData =
    JSON.stringify({
      layer:
        LAYER,

      version:
        VERSION,

      content_id:
        result.cycle.content_id,

      trigger:
        result.cycle.trigger,

      feedback:
        result.feedback,

      learning_signal:
        result.cycle.learning_signal,

      decision:
        result.decision,

      source_of_truth:
        result.cycle.source_of_truth,

      measurement:
        result.cycle.measurement,

      previous_cycle:
        result.cycle.previous_cycle
    });

  const outputData =
    JSON.stringify({
      layer:
        LAYER,

      version:
        VERSION,

      cycle:
        result.cycle
    });

  await env.DB.prepare(`
    INSERT INTO ai_runs (
      id,
      customer_id,
      run_type,
      model,
      input_data,
      output_data,
      status,
      tokens_used,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    runId,
    null,
    "DECISION_CYCLE",
    "TATO_OS_DECISION_CYCLE_V1.1",
    inputData,
    outputData,
    "COMPLETED",
    0,
    now
  ).run();

  await env.DB.prepare(`
    INSERT INTO ai_insights (
      id,
      customer_id,
      run_id,
      insight_type,
      title,
      content,
      score,
      priority,
      status,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    insightId,
    null,
    runId,
    "DECISION_CYCLE_RESULT",
    "Decision Cycle V1.1",
    outputData,
    0,
    result.cycle.decision?.priority ||
      "NORMAL",
    "NEW",
    now
  ).run();

  return {
    run_id:
      runId,

    insight_id:
      insightId,

    saved_at:
      now
  };
}

// ============================================================
// GET = PREVIEW
// ============================================================

export async function onRequestGet(
  context
) {
  try {
    const url =
      new URL(context.request.url);

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

    const result =
      await buildCycle(
        context,
        contentId
      );

    if (!result.success) {
      return json({
        success:
          false,

        layer:
          LAYER,

        version:
          VERSION,

        status:
          result.status,

        content:
          result.content,

        feedback:
          result.feedback ||
          null,

        diagnostics:
          result.diagnostics ||
          null,

        decision_response:
          result.decision_response ||
          null
      },
      result.status === "NO_FEEDBACK"
        ? 404
        : 500);
    }

    return json({
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

      content:
        result.content,

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
          "FEEDBACK_LOOP_V1",

        decision_cycle:
          "DECISION_CYCLE_V1.1"
      },

      source_of_truth:
        result.cycle.source_of_truth,

      measurement:
        result.cycle.measurement,

      feedback: {
        insight_id:
          result.feedback.id,

        run_id:
          result.feedback.run_id,

        finding:
          result.cycle.feedback.finding,

        next_learning_signal:
          result.cycle.feedback.next_learning_signal
      },

      learning_signal:
        result.cycle.learning_signal,

      decision:
        result.cycle.decision,

      cycle:
        result.cycle,

      persistence:
        null,

      guardrails:
        result.cycle.guardrails,

      diagnostics: {
        feedback_found:
          true,

        decision_layer_reentered:
          true,

        decision_layer_version:
          "1.1",

        decision_source_of_truth_valid:
          true,

        aggregation_owner:
          "LEARNING_LAYER_V1",

        previous_cycle_found:
          !!result.cycle.previous_cycle,

        previous_cycle_id:
          result.cycle.previous_cycle?.insight_id ||
          null,

        previous_cycle_run_id:
          result.cycle.previous_cycle?.run_id ||
          null
      },

      next_step:
        "Decision Cycle V1.1 preview ready. POST approved:true to persist the cycle."
    });

  } catch (error) {
    return json({
      success:
        false,

      layer:
        LAYER,

      version:
        VERSION,

      status:
        "ERROR",

      error:
        error?.message ||
        String(error)
    }, 500);
  }
}

// ============================================================
// POST = EXECUTE / PERSIST
// ============================================================

export async function onRequestPost(
  context
) {
  try {
    const url =
      new URL(context.request.url);

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

    let body = {};

    try {
      body =
        await context.request.json();
    } catch (_) {
      body = {};
    }

    if (body.approved !== true) {
      return json({
        success:
          false,

        layer:
          LAYER,

        version:
          VERSION,

        status:
          "APPROVAL_REQUIRED",

        message:
          "POST execution requires explicit approved:true."
      }, 403);
    }

    const result =
      await buildCycle(
        context,
        contentId
      );

    if (!result.success) {
      return json({
        success:
          false,

        layer:
          LAYER,

        version:
          VERSION,

        status:
          result.status,

        content:
          result.content,

        diagnostics:
          result.diagnostics ||
          null,

        decision_response:
          result.decision_response ||
          null
      },
      result.status === "NO_FEEDBACK"
        ? 404
        : 500);
    }

    const persistence =
      await saveCycle(
        context.env,
        result
      );

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
        result.content,

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
          "FEEDBACK_LOOP_V1",

        decision_cycle:
          "DECISION_CYCLE_V1.1"
      },

      source_of_truth:
        result.cycle.source_of_truth,

      measurement:
        result.cycle.measurement,

      feedback:
        result.feedback,

      learning_signal:
        result.cycle.learning_signal,

      decision:
        result.decision,

      cycle:
        result.cycle,

      persistence,

      guardrails:
        result.cycle.guardrails,

      next_step:
        "Decision Cycle V1.1 completed. Human approval is required before any Action or Execution."
    });

  } catch (error) {
    return json({
      success:
        false,

      layer:
        LAYER,

      version:
        VERSION,

      status:
        "ERROR",

      error:
        error?.message ||
        String(error)
    }, 500);
  }
}
