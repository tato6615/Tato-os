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
    // ============================================================
    // FEEDBACK LOOP V1.4
    //
    // Execution Result
    //      ↓
    // ai_insights.run_id
    //      ↓
    // ai_runs.input_data.content_id
    //      ↓
    // Measurement V2.2
    //      ↓
    // Learning V1
    //      ↓
    // Feedback Signal
    // ============================================================

    // ------------------------------------------------------------
    // 1. Find latest Execution Result
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

    const executionRows =
      executionQuery.results || [];

    let latestExecution = null;

    // ------------------------------------------------------------
    // 2. Resolve content_id from ai_runs.input_data
    // ------------------------------------------------------------

    for (const row of executionRows) {
      if (!row.run_id) continue;

      const runQuery = await env.DB.prepare(`
        SELECT
          id,
          run_type,
          model,
          input_data,
          output_data,
          status,
          tokens_used,
          created_at
        FROM ai_runs
        WHERE id = ?
        LIMIT 1
      `).bind(row.run_id).first();

      if (!runQuery) continue;

      let inputData = null;

      try {
        inputData =
          typeof runQuery.input_data === "string"
            ? JSON.parse(runQuery.input_data)
            : runQuery.input_data;
      } catch {
        inputData = null;
      }

      const resolvedContentId =
        inputData?.content_id ||
        inputData?.contentId ||
        inputData?.content?.id ||
        null;

      if (resolvedContentId !== contentId) {
        continue;
      }

      let executionContent = null;

      try {
        executionContent =
          typeof row.content === "string"
            ? JSON.parse(row.content)
            : row.content;
      } catch {
        executionContent = null;
      }

      latestExecution = {
        insight_id:
          row.id,

        run_id:
          row.run_id,

        title:
          row.title,

        score:
          row.score,

        priority:
          row.priority,

        status:
          row.status,

        created_at:
          row.created_at,

        execution:
          executionContent,

        run: {
          id:
            runQuery.id,

          run_type:
            runQuery.run_type,

          model:
            runQuery.model,

          input_data:
            inputData,

          status:
            runQuery.status,

          tokens_used:
            runQuery.tokens_used,

          created_at:
            runQuery.created_at
        }
      };

      break;
    }

    if (!latestExecution) {
      return json({
        success: false,

        layer:
          "FEEDBACK_LOOP_V1",

        version:
          "1.4",

        status:
          "NO_EXECUTION_RESULT",

        content: {
          id:
            contentId
        },

        diagnostics: {
          execution_rows_scanned:
            executionRows.length,

          resolution_path:
            "ai_insights.run_id -> ai_runs.input_data.content_id",

          content_id_match:
            false
        },

        message:
          "Execution Result exists, but ai_runs.input_data could not be matched to this content_id."
      }, 404);
    }

    // ------------------------------------------------------------
    // 3. Extract Execution signal
    // ------------------------------------------------------------

    const executionData =
      latestExecution.execution || {};

    const execution =
      executionData.execution || {};

    const executionResult =
      execution.result ||
      executionData.result ||
      {};

    const audit =
      executionData.audit ||
      execution.audit ||
      {};

    const executionFinding =
      executionResult.finding ||
      execution.finding ||
      audit.finding ||
      null;

    const nextLearningSignal =
      executionResult.next_learning_signal ||
      execution.next_learning_signal ||
      null;

    // ------------------------------------------------------------
    // 4. Re-enter Measurement V2.2
    // ------------------------------------------------------------

    const measurementUrl =
      `${url.origin}/api/content-measurement?content_id=${encodeURIComponent(contentId)}`;

    const measurementResponse =
      await fetch(
        measurementUrl,
        {
          method: "GET",

          headers: {
            "Accept":
              "application/json"
          }
        }
      );

    let measurementData = null;

    try {
      measurementData =
        await measurementResponse.json();
    } catch {
      measurementData = null;
    }

    if (
      !measurementResponse.ok ||
      !measurementData?.success
    ) {
      return json({
        success: false,

        layer:
          "FEEDBACK_LOOP_V1",

        version:
          "1.4",

        status:
          "MEASUREMENT_REENTRY_FAILED",

        content: {
          id:
            contentId
        },

        execution: {
          run_id:
            latestExecution.run_id,

          insight_id:
            latestExecution.insight_id,

          finding:
            executionFinding,

          next_learning_signal:
            nextLearningSignal
        },

        measurement_response:
          measurementData
      }, 500);
    }

    // ------------------------------------------------------------
    // 5. Re-enter Learning V1
    // ------------------------------------------------------------

    const learningUrl =
      `${url.origin}/api/learning-ai?content_id=${encodeURIComponent(contentId)}`;

    const learningResponse =
      await fetch(
        learningUrl,
        {
          method: "GET",

          headers: {
            "Accept":
              "application/json"
          }
        }
      );

    let learningData = null;

    try {
      learningData =
        await learningResponse.json();
    } catch {
      learningData = null;
    }

    if (
      !learningResponse.ok ||
      !learningData?.success
    ) {
      return json({
        success: false,

        layer:
          "FEEDBACK_LOOP_V1",

        version:
          "1.4",

        status:
          "LEARNING_REENTRY_FAILED",

        content: {
          id:
            contentId
        },

        execution: {
          run_id:
            latestExecution.run_id,

          insight_id:
            latestExecution.insight_id,

          finding:
            executionFinding,

          next_learning_signal:
            nextLearningSignal
        },

        measurement:
          measurementData,

        learning_response:
          learningData
      }, 500);
    }

    // ------------------------------------------------------------
    // 6. Build Feedback Signal
    // ------------------------------------------------------------

    const measurement =
      measurementData.measurement || {};

    const learning =
      learningData.learning || {};

    const feedback = {
      state:
        "FEEDBACK_REENTERED",

      source_execution: {
        run_id:
          latestExecution.run_id,

        insight_id:
          latestExecution.insight_id,

        result_type:
          executionResult.result_type ||
          execution.result_type ||
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
          learning.state || null,

        decision_input:
          learning.decision_input || null,

        rounds:
          learning.rounds ?? null
      },

      feedback_interpretation:
        nextLearningSignal ||
        executionFinding ||
        "EXECUTION_RESULT_REENTERED_INTO_LEARNING",

      strategy_change:
        false,

      winner_declared:
        false,

      automatic_execution:
        false,

      requires_decision_layer:
        true
    };

    // ------------------------------------------------------------
    // 7. GET = Preview
    // ------------------------------------------------------------

    if (method === "GET") {
      return json({
        success: true,

        layer:
          "FEEDBACK_LOOP_V1",

        version:
          "1.4",

        mode:
          "preview",

        status:
          "READY",

        content: {
          id:
            contentId
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
            "FEEDBACK_LOOP_V1"
        },

        execution: {
          run_id:
            latestExecution.run_id,

          insight_id:
            latestExecution.insight_id,

          executed_at:
            latestExecution.created_at,

          finding:
            executionFinding,

          next_learning_signal:
            nextLearningSignal
        },

        measurement,

        learning: {
          state:
            learning.state || null,

          decision_input:
            learning.decision_input || null,

          rounds:
            learning.rounds ?? null
        },

        feedback,

        persistence:
          null,

        diagnostics: {
          execution_rows_scanned:
            executionRows.length,

          execution_result_found:
            true,

          content_id_match:
            true,

          resolution_path:
            "ai_insights.run_id -> ai_runs.input_data.content_id"
        },

        guardrails: {
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

          strategy_change:
            false,

          winner_declared:
            false,

          requires_human_approval:
            true
        },

        next_step:
          "POST approved:true to persist the feedback-loop result."
      });
    }

    // ------------------------------------------------------------
    // 8. POST approval
    // ------------------------------------------------------------

    let body = {};

    try {
      body =
        await request.json();
    } catch {
      body = {};
    }

    if (body.approved !== true) {
      return json({
        success: false,

        layer:
          "FEEDBACK_LOOP_V1",

        version:
          "1.4",

        status:
          "APPROVAL_REQUIRED",

        message:
          "POST execution requires explicit approved:true."
      }, 403);
    }

    // ------------------------------------------------------------
    // 9. Persist Feedback Run
    // ------------------------------------------------------------

    const runId =
      crypto.randomUUID();

    const insightId =
      crypto.randomUUID();

    const createdAt =
      new Date().toISOString();

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
      "FEEDBACK_LOOP",
      "TATO_OS_FEEDBACK_V1",
      JSON.stringify({
        content_id:
          contentId,

        execution_run_id:
          latestExecution.run_id,

        execution_insight_id:
          latestExecution.insight_id
      }),
      JSON.stringify({
        feedback
      }),
      "COMPLETED",
      0,
      createdAt
    ).run();

    // ------------------------------------------------------------
    // 10. Persist Feedback Insight
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
        content_id:
          contentId,

        source_execution: {
          run_id:
            latestExecution.run_id,

          insight_id:
            latestExecution.insight_id,

          finding:
            executionFinding,

          next_learning_signal:
            nextLearningSignal
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
    // 11. Final response
    // ------------------------------------------------------------

    return json({
      success: true,

      layer:
        "FEEDBACK_LOOP_V1",

      version:
        "1.4",

      mode:
        "execute",

      status:
        "FEEDBACK_REENTERED",

      content: {
        id:
          contentId
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
          "FEEDBACK_LOOP_V1"
      },

      execution: {
        run_id:
          latestExecution.run_id,

        insight_id:
          latestExecution.insight_id,

        finding:
          executionFinding,

        next_learning_signal:
          nextLearningSignal
      },

      measurement,

      learning,

      feedback,

      persistence: {
        run_id:
          runId,

        insight_id:
          insightId,

        saved_at:
          createdAt
      },

      guardrails: {
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

        strategy_change:
          false,

        winner_declared:
          false,

        requires_decision_layer:
          true
      },

      next_step:
        "Feedback loop completed. System can now re-enter the Decision cycle using the new learning signal."
    });

  } catch (error) {
    return json({
      success: false,

      layer:
        "FEEDBACK_LOOP_V1",

      version:
        "1.4",

      status:
        "ERROR",

      error:
        error?.message ||
        String(error)
    }, 500);
  }
}


// ============================================================
// JSON RESPONSE
// ============================================================

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8"
      }
    }
  );
}
