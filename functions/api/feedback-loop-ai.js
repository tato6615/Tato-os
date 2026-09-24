export async function onRequest(context) {
  const { request, env } = context;

  const url = new URL(request.url);
  const contentId = url.searchParams.get("content_id");

  if (!contentId) {
    return json({
      success: false,
      error: "content_id is required"
    }, 400);
  }

  const method = request.method.toUpperCase();

  try {
    /*
     * ============================================================
     * FEEDBACK LOOP V1.1
     *
     * Execution Result
     *       ↓
     * Measurement V2.2
     *       ↓
     * Learning V1
     *       ↓
     * Feedback Signal
     *
     * IMPORTANT:
     * Do not assume a specific JSON shape inside ai_insights.
     * Execution Result is located by scanning persisted records
     * and checking multiple possible content-id locations.
     * ============================================================
     */

    // ------------------------------------------------------------
    // 1. Find persisted Execution Result
    // ------------------------------------------------------------

    const executionQuery = await env.DB.prepare(`
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
      WHERE insight_type = 'EXECUTION_RESULT'
      ORDER BY created_at DESC
      LIMIT 200
    `).all();

    const rows = executionQuery.results || [];

    let latestExecution = null;

    for (const row of rows) {
      const raw = row.content;

      let parsed = null;

      if (raw !== null && raw !== undefined) {
        try {
          parsed = typeof raw === "string"
            ? JSON.parse(raw)
            : raw;
        } catch {
          parsed = null;
        }
      }

      const foundContentId = findContentId(parsed, raw);

      if (foundContentId === contentId) {
        latestExecution = {
          id: row.id,
          run_id: row.run_id,
          insight_type: row.insight_type,
          title: row.title,
          score: row.score,
          priority: row.priority,
          status: row.status,
          created_at: row.created_at,
          data: parsed,
          raw_content: raw
        };

        break;
      }
    }

    if (!latestExecution) {
      return json({
        success: false,
        layer: "FEEDBACK_LOOP_V1",
        version: "1.1",
        status: "NO_EXECUTION_RESULT",
        content: {
          id: contentId
        },
        diagnostics: {
          execution_rows_scanned: rows.length,
          execution_result_type: "EXECUTION_RESULT",
          content_id_search: "MULTI_PATH"
        },
        message:
          "No persisted Execution Result could be matched to this content_id."
      }, 404);
    }

    // ------------------------------------------------------------
    // 2. Extract Execution signal
    // ------------------------------------------------------------

    const executionData = latestExecution.data || {};

    const execution =
      executionData.execution ||
      {};

    const executionResult =
      execution.result ||
      executionData.result ||
      {};

    const executionFinding =
      executionResult.finding ||
      executionData.finding ||
      null;

    const nextLearningSignal =
      executionResult.next_learning_signal ||
      executionData.next_learning_signal ||
      null;

    // ------------------------------------------------------------
    // 3. Re-enter Measurement V2.2
    // ------------------------------------------------------------

    const measurementUrl =
      `${url.origin}/api/content-measurement?content_id=${encodeURIComponent(contentId)}`;

    const measurementResponse = await fetch(measurementUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    let measurementData = null;

    try {
      measurementData = await measurementResponse.json();
    } catch {
      measurementData = null;
    }

    if (!measurementResponse.ok || !measurementData?.success) {
      return json({
        success: false,
        layer: "FEEDBACK_LOOP_V1",
        version: "1.1",
        status: "MEASUREMENT_REENTRY_FAILED",
        content: {
          id: contentId
        },
        execution: {
          run_id: latestExecution.run_id,
          insight_id: latestExecution.id,
          finding: executionFinding,
          next_learning_signal: nextLearningSignal
        },
        measurement_response: measurementData
      }, 500);
    }

    // ------------------------------------------------------------
    // 4. Re-enter Learning V1
    // ------------------------------------------------------------

    const learningUrl =
      `${url.origin}/api/learning-ai?content_id=${encodeURIComponent(contentId)}`;

    const learningResponse = await fetch(learningUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    let learningData = null;

    try {
      learningData = await learningResponse.json();
    } catch {
      learningData = null;
    }

    if (!learningResponse.ok || !learningData?.success) {
      return json({
        success: false,
        layer: "FEEDBACK_LOOP_V1",
        version: "1.1",
        status: "LEARNING_REENTRY_FAILED",
        content: {
          id: contentId
        },
        execution: {
          run_id: latestExecution.run_id,
          insight_id: latestExecution.id,
          finding: executionFinding,
          next_learning_signal: nextLearningSignal
        },
        measurement: measurementData,
        learning_response: learningData
      }, 500);
    }

    // ------------------------------------------------------------
    // 5. Build Feedback Signal
    // ------------------------------------------------------------

    const measurement =
      measurementData.measurement ||
      {};

    const learning =
      learningData.learning ||
      {};

    const feedback = {
      state: "FEEDBACK_REENTERED",

      execution_signal: {
        result_type:
          executionResult.result_type ||
          null,

        finding:
          executionFinding,

        next_learning_signal:
          nextLearningSignal
      },

      measurement_signal: {
        attention:
          measurement.attention ?? 0,

        clicks:
          measurement.clicks ?? 0,

        product_views:
          measurement.product_views ?? 0,

        customers:
          measurement.customers ?? 0,

        orders:
          measurement.orders ?? 0,

        revenue:
          measurement.revenue ?? 0
      },

      learning_signal: {
        state:
          learning.state ||
          null,

        decision_input:
          learning.decision_input ||
          null,

        rounds:
          learning.rounds ??
          null
      },

      feedback_interpretation:
        nextLearningSignal ||
        executionFinding ||
        "EXECUTION_RESULT_REENTERED_INTO_LEARNING",

      strategy_change: false,
      winner_declared: false,
      automatic_execution: false,
      requires_decision_layer: true
    };

    // ------------------------------------------------------------
    // 6. GET = Preview
    // ------------------------------------------------------------

    if (method === "GET") {
      return json({
        success: true,
        layer: "FEEDBACK_LOOP_V1",
        version: "1.1",
        mode: "preview",
        status: "READY",

        content: {
          id: contentId
        },

        source_chain: {
          measurement: "CONTENT_MEASUREMENT_ENGINE_V2.2",
          intelligence: "INTELLIGENCE_LAYER_V2.1",
          learning: "LEARNING_LAYER_V1",
          decision: "DECISION_LAYER_V1",
          action: "ACTION_LAYER_V1",
          execution: "EXECUTION_LAYER_V1",
          feedback: "FEEDBACK_LOOP_V1"
        },

        execution: {
          run_id: latestExecution.run_id,
          insight_id: latestExecution.id,
          executed_at: latestExecution.created_at,
          finding: executionFinding,
          next_learning_signal: nextLearningSignal
        },

        measurement,

        learning: {
          state: learning.state || null,
          decision_input: learning.decision_input || null,
          rounds: learning.rounds ?? null
        },

        feedback,

        persistence: null,

        diagnostics: {
          execution_rows_scanned: rows.length,
          execution_result_found: true,
          content_id_match: true
        },

        guardrails: {
          automatic_execution: false,
          action_executed: false,
          business_data_mutation: false,
          content_mutation: false,
          customer_contact: false,
          payment_action: false,
          strategy_change: false,
          winner_declared: false,
          requires_human_approval: true
        },

        next_step:
          "POST approved:true to persist the feedback-loop result."
      });
    }

    // ------------------------------------------------------------
    // 7. POST requires explicit approval
    // ------------------------------------------------------------

    let body = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    if (body.approved !== true) {
      return json({
        success: false,
        layer: "FEEDBACK_LOOP_V1",
        version: "1.1",
        status: "APPROVAL_REQUIRED",
        message:
          "POST execution requires explicit approved:true."
      }, 403);
    }

    // ------------------------------------------------------------
    // 8. Persist Feedback Run
    // ------------------------------------------------------------

    const runId = crypto.randomUUID();
    const insightId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await env.DB.prepare(`
      INSERT INTO ai_runs (
        id,
        customer_id,
        run_type,
        model,
        input,
        output,
        status,
        tokens_used,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      runId,
      null,
      "FEEDBACK_LOOP",
      "TATO_OS_FEEDBACK_V1",
      JSON.stringify({
        content_id: contentId,
        execution_run_id: latestExecution.run_id,
        execution_insight_id: latestExecution.id
      }),
      JSON.stringify({
        feedback
      }),
      "COMPLETED",
      0,
      createdAt
    ).run();

    // ------------------------------------------------------------
    // 9. Persist Feedback Insight
    // ------------------------------------------------------------

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
      "FEEDBACK_LOOP_RESULT",
      "Execution result re-entered into Measurement and Learning",
      JSON.stringify({
        content_id: contentId,

        source_execution: {
          run_id: latestExecution.run_id,
          insight_id: latestExecution.id,
          finding: executionFinding,
          next_learning_signal: nextLearningSignal
        },

        measurement,
        learning,
        feedback
      }),
      1,
      "HIGH",
      "COMPLETED",
      createdAt
    ).run();

    // ------------------------------------------------------------
    // 10. Final response
    // ------------------------------------------------------------

    return json({
      success: true,
      layer: "FEEDBACK_LOOP_V1",
      version: "1.1",
      mode: "execute",
      status: "FEEDBACK_REENTERED",

      content: {
        id: contentId
      },

      source_chain: {
        measurement: "CONTENT_MEASUREMENT_ENGINE_V2.2",
        intelligence: "INTELLIGENCE_LAYER_V2.1",
        learning: "LEARNING_LAYER_V1",
        decision: "DECISION_LAYER_V1",
        action: "ACTION_LAYER_V1",
        execution: "EXECUTION_LAYER_V1",
        feedback: "FEEDBACK_LOOP_V1"
      },

      execution: {
        run_id: latestExecution.run_id,
        insight_id: latestExecution.id,
        finding: executionFinding,
        next_learning_signal: nextLearningSignal
      },

      measurement,
      learning,
      feedback,

      persistence: {
        run_id: runId,
        insight_id: insightId,
        saved_at: createdAt
      },

      guardrails: {
        automatic_execution: false,
        action_executed: false,
        business_data_mutation: false,
        content_mutation: false,
        customer_contact: false,
        payment_action: false,
        strategy_change: false,
        winner_declared: false,
        requires_decision_layer: true
      },

      next_step:
        "Feedback loop completed. System can now re-enter the Decision cycle using the new learning signal."
    });

  } catch (error) {
    return json({
      success: false,
      layer: "FEEDBACK_LOOP_V1",
      version: "1.1",
      status: "ERROR",
      error: error?.message || String(error)
    }, 500);
  }
}


// ============================================================
// Content ID resolver
// ============================================================

function findContentId(parsed, raw) {
  if (parsed && typeof parsed === "object") {
    const directKeys = [
      "content_id",
      "contentId",
      "contentID"
    ];

    for (const key of directKeys) {
      if (typeof parsed[key] === "string") {
        return parsed[key];
      }
    }

    const nestedObjects = [
      parsed.content,
      parsed.execution,
      parsed.result,
      parsed.target,
      parsed.input,
      parsed.output,
      parsed.data,
      parsed.metadata,
      parsed.meta
    ];

    for (const obj of nestedObjects) {
      if (!obj || typeof obj !== "object") continue;

      for (const key of directKeys) {
        if (typeof obj[key] === "string") {
          return obj[key];
        }
      }

      if (
        obj.id &&
        typeof obj.id === "string" &&
        looksLikeContentId(obj.id)
      ) {
        return obj.id;
      }
    }

    const deep = deepFindContentId(parsed);

    if (deep) {
      return deep;
    }
  }

  // Last-resort raw text search.
  if (typeof raw === "string" && raw.includes(contentIdFromEnvironment(raw))) {
    return null;
  }

  return null;
}


// ============================================================
// Deep JSON search
// ============================================================

function deepFindContentId(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepFindContentId(item);
      if (found) return found;
    }

    return null;
  }

  for (const [key, val] of Object.entries(value)) {
    if (
      (
        key === "content_id" ||
        key === "contentId" ||
        key === "contentID"
      ) &&
      typeof val === "string"
    ) {
      return val;
    }

    if (
      key === "id" &&
      typeof val === "string" &&
      looksLikeContentId(val)
    ) {
      return val;
    }

    if (val && typeof val === "object") {
      const found = deepFindContentId(val);

      if (found) {
        return found;
      }
    }
  }

  return null;
}


// ============================================================
// UUID-like check
// ============================================================

function looksLikeContentId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}


// ============================================================
// Placeholder helper
// ============================================================

function contentIdFromEnvironment(raw) {
  /*
   * Intentionally returns an impossible value.
   * Raw content matching is handled by the structured resolver.
   * This keeps the function safe without assuming a database schema.
   */
  return "__NO_CONTENT_ID__";
}


// ============================================================
// JSON response
// ============================================================

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      }
    }
  );
}
