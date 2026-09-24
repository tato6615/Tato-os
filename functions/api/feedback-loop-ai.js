// ============================================================
// TATO-OS
// FEEDBACK LOOP V1.5
//
// Execution Result
//      ↓
// Measurement V2.2
//      ↓
// Learning V1
//      ↓
// Feedback Signal
//
// V1.5:
// - Supports exact execution_run_id / execution_insight_id
// - Prevents selecting an unrelated older execution result
// - Preserves human approval requirement
// - Supports inherited approval from Execution Cycle
// ============================================================

const LAYER = "FEEDBACK_LOOP_V1";
const VERSION = "1.5";

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

function parseJSON(value, fallback = null) {
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
  if (!value || depth > 12) {
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

async function getRun(
  db,
  runId
) {
  if (!runId) {
    return null;
  }

  return await db.prepare(`
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
  `)
    .bind(runId)
    .first();
}

async function resolveExecutionResult(
  db,
  contentId,
  executionRunId = null,
  executionInsightId = null
) {
  // ----------------------------------------------------------
  // Exact execution reference
  // ----------------------------------------------------------

  if (
    executionRunId ||
    executionInsightId
  ) {
    let row = null;

    if (executionInsightId) {
      row =
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
          WHERE id = ?
            AND insight_type = 'EXECUTION_RESULT'
          LIMIT 1
        `)
          .bind(executionInsightId)
          .first();
    } else {
      row =
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
          WHERE run_id = ?
            AND insight_type = 'EXECUTION_RESULT'
          ORDER BY created_at DESC
          LIMIT 1
        `)
          .bind(executionRunId)
          .first();
    }

    if (!row) {
      return {
        execution: null,
        diagnostics: {
          mode:
            "EXACT_REFERENCE",

          execution_run_id:
            executionRunId,

          execution_insight_id:
            executionInsightId,

          found:
            false
        }
      };
    }

    const run =
      await getRun(
        db,
        row.run_id
      );

    const inputData =
      parseJSON(
        run?.input_data,
        {}
      );

    const resolvedContentId =
      extractContentId(
        inputData
      );

    if (
      resolvedContentId !==
      String(contentId)
    ) {
      return {
        execution: null,
        diagnostics: {
          mode:
            "EXACT_REFERENCE",

          execution_run_id:
            row.run_id,

          execution_insight_id:
            row.id,

          found:
            true,

          content_id_match:
            false,

          resolved_content_id:
            resolvedContentId
        }
      };
    }

    return {
      execution: {
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
          parseJSON(
            row.content,
            {}
          ),

        run: {
          id:
            run?.id || null,

          run_type:
            run?.run_type || null,

          model:
            run?.model || null,

          input_data:
            inputData,

          output_data:
            parseJSON(
              run?.output_data,
              {}
            ),

          status:
            run?.status || null,

          tokens_used:
            run?.tokens_used ?? 0,

          created_at:
            run?.created_at || null
        }
      },

      diagnostics: {
        mode:
          "EXACT_REFERENCE",

        execution_run_id:
          row.run_id,

        execution_insight_id:
          row.id,

        found:
          true,

        content_id_match:
          true
      }
    };
  }

  // ----------------------------------------------------------
  // Fallback: latest matching execution
  // ----------------------------------------------------------

  const executionQuery =
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
      WHERE insight_type = 'EXECUTION_RESULT'
      ORDER BY created_at DESC
      LIMIT 200
    `).all();

  const rows =
    executionQuery.results || [];

  for (
    const row of rows
  ) {
    if (!row.run_id) {
      continue;
    }

    const run =
      await getRun(
        db,
        row.run_id
      );

    if (!run) {
      continue;
    }

    const inputData =
      parseJSON(
        run.input_data,
        {}
      );

    const resolvedContentId =
      extractContentId(
        inputData
      );

    if (
      resolvedContentId !==
      String(contentId)
    ) {
      continue;
    }

    return {
      execution: {
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
          parseJSON(
            row.content,
            {}
          ),

        run: {
          id:
            run.id,

          run_type:
            run.run_type,

          model:
            run.model,

          input_data:
            inputData,

          output_data:
            parseJSON(
              run.output_data,
              {}
            ),

          status:
            run.status,

          tokens_used:
            run.tokens_used,

          created_at:
            run.created_at
        }
      },

      diagnostics: {
        mode:
          "LATEST_MATCHING_EXECUTION",

        execution_rows_scanned:
          rows.length,

        execution_run_id:
          row.run_id,

        execution_insight_id:
          row.id,

        found:
          true,

        content_id_match:
          true
      }
    };
  }

  return {
    execution: null,

    diagnostics: {
      mode:
        "LATEST_MATCHING_EXECUTION",

      execution_rows_scanned:
        rows.length,

      found:
        false,

      content_id_match:
        false
    }
  };
}

function extractExecutionSignal(
  latestExecution
) {
  const executionData =
    latestExecution?.execution ||
    {};

  const execution =
    executionData.execution ||
    {};

  const executionResult =
    execution.execution_result ||
    execution.result ||
    executionData.execution_result ||
    executionData.result ||
    {};

  const audit =
    executionData.audit ||
    execution.audit ||
    {};

  const finding =
    executionResult.finding ||
    execution.finding ||
    audit.finding ||
    executionData.finding ||
    null;

  const nextLearningSignal =
    executionResult.next_learning_signal ||
    execution.next_learning_signal ||
    executionData.next_learning_signal ||
    null;

  const resultType =
    executionResult.result_type ||
    execution.result_type ||
    executionData.result_type ||
    null;

  return {
    executionData,
    execution,
    executionResult,
    audit,
    finding,
    nextLearningSignal,
    resultType
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
      success: false,
      layer: LAYER,
      version: VERSION,
      status:
        "DB_BINDING_NOT_FOUND"
    }, 500);
  }

  const url =
    new URL(request.url);

  const contentId =
    url.searchParams.get(
      "content_id"
    );

  const executionRunId =
    url.searchParams.get(
      "execution_run_id"
    );

  const executionInsightId =
    url.searchParams.get(
      "execution_insight_id"
    );

  if (!contentId) {
    return json({
      success: false,
      layer: LAYER,
      version: VERSION,
      error:
        "content_id is required"
    }, 400);
  }

  const method =
    request.method.toUpperCase();

  if (
    method !== "GET" &&
    method !== "POST"
  ) {
    return json({
      success: false,
      layer: LAYER,
      version: VERSION,
      error:
        "METHOD_NOT_ALLOWED"
    }, 405);
  }

  try {
    // ----------------------------------------------------------
    // 1. Resolve Execution Result
    // ----------------------------------------------------------

    const resolved =
      await resolveExecutionResult(
        env.DB,
        contentId,
        executionRunId,
        executionInsightId
      );

    const latestExecution =
      resolved.execution;

    if (!latestExecution) {
      return json({
        success: false,

        layer:
          LAYER,

        version:
          VERSION,

        status:
          "NO_EXECUTION_RESULT",

        content: {
          id:
            contentId
        },

        diagnostics:
          resolved.diagnostics,

        message:
          "Execution Result could not be resolved for this content_id."
      }, 404);
    }

    // ----------------------------------------------------------
    // 2. Extract execution signal
    // ----------------------------------------------------------

    const signal =
      extractExecutionSignal(
        latestExecution
      );

    // ----------------------------------------------------------
    // 3. Re-enter Measurement V2.2
    // ----------------------------------------------------------

    const measurementUrl =
      new URL(
        "/api/content-measurement",
        url.origin
      );

    measurementUrl.searchParams.set(
      "content_id",
      contentId
    );

    const measurementResponse =
      await fetch(
        measurementUrl.toString(),
        {
          method:
            "GET",

          headers: {
            "Accept":
              "application/json"
          }
        }
      );

    const measurementData =
      await measurementResponse
        .json()
        .catch(() => null);

    if (
      !measurementResponse.ok ||
      !measurementData?.success
    ) {
      return json({
        success: false,

        layer:
          LAYER,

        version:
          VERSION,

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
            signal.finding,

          next_learning_signal:
            signal.nextLearningSignal
        },

        measurement_response:
          measurementData
      }, 500);
    }

    // ----------------------------------------------------------
    // 4. Re-enter Learning V1
    // ----------------------------------------------------------

    const learningUrl =
      new URL(
        "/api/learning-ai",
        url.origin
      );

    learningUrl.searchParams.set(
      "content_id",
      contentId
    );

    const learningResponse =
      await fetch(
        learningUrl.toString(),
        {
          method:
            "GET",

          headers: {
            "Accept":
              "application/json"
          }
        }
      );

    const learningData =
      await learningResponse
        .json()
        .catch(() => null);

    if (
      !learningResponse.ok ||
      !learningData?.success
    ) {
      return json({
        success: false,

        layer:
          LAYER,

        version:
          VERSION,

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
            signal.finding,

          next_learning_signal:
            signal.nextLearningSignal
        },

        measurement:
          measurementData,

        learning_response:
          learningData
      }, 500);
    }

    // ----------------------------------------------------------
    // 5. Build Feedback Signal
    // ----------------------------------------------------------

    const measurement =
      measurementData.measurement ||
      {};

    const learning =
      learningData.learning ||
      {};

    const feedback = {
      state:
        "FEEDBACK_REENTERED",

      source_execution: {
        run_id:
          latestExecution.run_id,

        insight_id:
          latestExecution.insight_id,

        result_type:
          signal.resultType,

        finding:
          signal.finding,

        next_learning_signal:
          signal.nextLearningSignal
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
        signal.nextLearningSignal ||
        signal.finding ||
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

    // ----------------------------------------------------------
    // 6. GET = Preview only
    // ----------------------------------------------------------

    if (method === "GET") {
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
            "FEEDBACK_LOOP_V1.5"
        },

        execution: {
          run_id:
            latestExecution.run_id,

          insight_id:
            latestExecution.insight_id,

          executed_at:
            latestExecution.created_at,

          finding:
            signal.finding,

          next_learning_signal:
            signal.nextLearningSignal
        },

        measurement,

        learning: {
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

        feedback,

        persistence:
          null,

        diagnostics: {
          execution_result_found:
            true,

          execution_run_id:
            latestExecution.run_id,

          execution_insight_id:
            latestExecution.insight_id,

          content_id_match:
            true,

          resolution:
            resolved.diagnostics
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

    // ----------------------------------------------------------
    // 7. POST = Persist Feedback
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
        success: false,

        layer:
          LAYER,

        version:
          VERSION,

        status:
          "APPROVAL_REQUIRED",

        message:
          "POST requires approved:true."
      }, 403);
    }

    const approvalSource =
      body.approval_source ||
      "DIRECT_HUMAN_APPROVAL";

    // ----------------------------------------------------------
    // 8. Persist Feedback Run
    // ----------------------------------------------------------

    const runId =
      crypto.randomUUID();

    const insightId =
      crypto.randomUUID();

    const createdAt =
      new Date().toISOString();

    const feedbackInput = {
      content_id:
        contentId,

      execution_run_id:
        latestExecution.run_id,

      execution_insight_id:
        latestExecution.insight_id,

      approval_source:
        approvalSource,

      approved:
        true
    };

    const feedbackOutput = {
      feedback,

      measurement,

      learning,

      source_execution: {
        run_id:
          latestExecution.run_id,

        insight_id:
          latestExecution.insight_id
      }
    };

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
    `)
      .bind(
        runId,
        null,
        "FEEDBACK_LOOP",
        "TATO_OS_FEEDBACK_V1_5",
        JSON.stringify(
          feedbackInput
        ),
        JSON.stringify(
          feedbackOutput
        ),
        "COMPLETED",
        0,
        createdAt
      )
      .run();

    // ----------------------------------------------------------
    // 9. Persist Feedback Insight
    // ----------------------------------------------------------

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
    `)
      .bind(
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
              signal.finding,

            next_learning_signal:
              signal.nextLearningSignal
          },

          measurement,

          learning,

          feedback,

          approval: {
            approved:
              true,

            source:
              approvalSource
          }
        }),
        1,
        "HIGH",
        "COMPLETED",
        createdAt
      )
      .run();

    // ----------------------------------------------------------
    // 10. Final response
    // ----------------------------------------------------------

    return json({
      success: true,

      layer:
        LAYER,

      version:
        VERSION,

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
          "FEEDBACK_LOOP_V1.5"
      },

      execution: {
        run_id:
          latestExecution.run_id,

        insight_id:
          latestExecution.insight_id,

        finding:
          signal.finding,

        next_learning_signal:
          signal.nextLearningSignal
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

      approval: {
        approved:
          true,

        source:
          approvalSource
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
        "Feedback loop completed. System can now re-enter the Decision Cycle using the new learning signal."
    });

  } catch (error) {
    return json({
      success: false,

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
