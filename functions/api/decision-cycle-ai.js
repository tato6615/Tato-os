// TATO-OS
// DECISION CYCLE V1.1
// Route: /api/decision-cycle-ai
//
// Purpose:
// FEEDBACK → DECISION CYCLE → DECISION V1
//
// Guardrails:
// - Does NOT change strategy
// - Does NOT declare winner
// - Does NOT execute action
// - Does NOT mutate business data
// - Human approval remains required
// ============================================================

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
//
// IMPORTANT:
// Decision Cycle V1 stores content_id at:
// $.cycle.content_id
//
// Therefore "cycle" MUST be included in recursive traversal.
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

      // FIX:
      // Decision Cycle stores content_id here.
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
//
// IMPORTANT:
// content_id is stored inside JSON:
//
// {
//   "cycle": {
//     "content_id": "..."
//   }
// }
//
// We intentionally read rows first and resolve content_id
// in JavaScript so older records without content_id do not
// break the lookup.
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
// Call existing Decision Layer V1
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

  return {
    ok:
      response.ok,

    status:
      response.status,

    data
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
  // 3. Call Decision Layer V1
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
          decisionResult.status
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
      content_id:
        result.cycle.content_id,

      trigger:
        result.cycle.trigger,

      feedback:
        result.feedback,

      decision:
        result.decision,

      previous_cycle:
        result.cycle.previous_cycle
    });

  const outputData =
    JSON.stringify({
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
    "TATO_OS_DECISION_CYCLE_V1",
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
    "Decision Cycle V1",
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
          "DECISION_CYCLE_V1",

        version:
          "1.0",

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
          "DECISION_CYCLE_V1",

        version:
          "1.0",

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
        "DECISION_CYCLE_V1",

      version:
        "1.0",

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
          "DECISION_LAYER_V1",

        action:
          "ACTION_LAYER_V1",

        execution:
          "EXECUTION_LAYER_V1",

        feedback:
          "FEEDBACK_LOOP_V1",

        decision_cycle:
          "DECISION_CYCLE_V1"
      },

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
        "Decision Cycle preview ready. POST approved:true to persist the cycle."
    });

  } catch (error) {
    return json({
      success:
        false,

      layer:
        "DECISION_CYCLE_V1",

      version:
        "1.0",

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
          "DECISION_CYCLE_V1",

        version:
          "1.0",

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
          "DECISION_CYCLE_V1",

        version:
          "1.0",

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
          "DECISION_CYCLE_V1",

        version:
          "1.0",

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
        "DECISION_CYCLE_V1",

      version:
        "1.0",

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
          "DECISION_LAYER_V1",

        action:
          "ACTION_LAYER_V1",

        execution:
          "EXECUTION_LAYER_V1",

        feedback:
          "FEEDBACK_LOOP_V1",

        decision_cycle:
          "DECISION_CYCLE_V1"
      },

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
        "Decision Cycle completed. Human approval is required before any Action or Execution."
    });

  } catch (error) {
    return json({
      success:
        false,

      layer:
        "DECISION_CYCLE_V1",

      version:
        "1.0",

      status:
        "ERROR",

      error:
        error?.message ||
        String(error)
    }, 500);
  }
}
