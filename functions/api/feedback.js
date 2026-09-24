// TATO-OS
// Feedback Layer V1.1
// Route: /api/feedback
//
// Pipeline:
//
// Measurement V2.2
//        ↓
// Intelligence V2
//        ↓
// Learning V2.2
//        ↓
// Decision V1.1
//        ↓
// Action V1.0
//        ↓
// Automation Execution V1.0
//        ↓
// Feedback V1.1
//        ↓
// Measurement V2.2
//
// Feedback DOES:
// - read Automation execution state
// - record execution outcome
// - persist feedback_events
// - read persisted feedback_events
// - expose latest persisted feedback
// - hand off to Measurement
//
// Feedback DOES NOT:
// - recalculate Measurement
// - recalculate Intelligence
// - recalculate Learning
// - create Decision
// - change strategy
// - execute actions
// - declare winners

const VERSION = "1.1";
const LAYER = "FEEDBACK_LAYER_V1";

const AUTOMATION_URL = "/api/automation";

const DEFAULT_CONTENT_ID =
  "5127d38f-6601-41dd-bb30-9e4346dd9a4c";

const FEEDBACK_TABLE = "feedback_events";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function normalize(value) {
  if (value === undefined || value === null) {
    return null;
  }

  return String(value);
}

async function ensureTable(DB) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS ${FEEDBACK_TABLE} (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      execution_id TEXT,
      feedback_type TEXT,
      expected_outcome TEXT,
      actual_outcome TEXT,
      outcome_status TEXT,
      operator_note TEXT,
      measurement_required INTEGER DEFAULT 1,
      measurement_completed INTEGER DEFAULT 0,
      created_at TEXT
    )
  `).run();
}

async function getLatestFeedback(DB, contentId) {
  await ensureTable(DB);

  const result = await DB.prepare(`
    SELECT
      id,
      content_id,
      execution_id,
      feedback_type,
      expected_outcome,
      actual_outcome,
      outcome_status,
      operator_note,
      measurement_required,
      measurement_completed,
      created_at
    FROM ${FEEDBACK_TABLE}
    WHERE content_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `)
    .bind(contentId)
    .first();

  return result || null;
}

async function getFeedbackByExecution(DB, executionId) {
  await ensureTable(DB);

  const result = await DB.prepare(`
    SELECT
      id,
      content_id,
      execution_id,
      feedback_type,
      expected_outcome,
      actual_outcome,
      outcome_status,
      operator_note,
      measurement_required,
      measurement_completed,
      created_at
    FROM ${FEEDBACK_TABLE}
    WHERE execution_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `)
    .bind(executionId)
    .first();

  return result || null;
}

async function getAutomationPreview(request, contentId) {
  try {
    const url = new URL(request.url);

    const automationUrl =
      new URL(
        AUTOMATION_URL,
        url.origin
      );

    automationUrl.searchParams.set(
      "content_id",
      contentId
    );

    const response = await fetch(
      automationUrl.toString(),
      {
        method: "GET",
        headers: {
          "Cache-Control": "no-cache"
        }
      }
    );

    if (!response.ok) {
      return null;
    }

    return await response.json();

  } catch {
    return null;
  }
}

function buildFeedbackPreview({
  contentId,
  automation,
  persistedFeedback
}) {

  const content =
    automation?.content || {
      id: contentId,
      title: null,
      status: null
    };

  const action =
    automation?.action || null;

  const execution =
    automation?.execution || {
      execution_type: null,
      execution_code: null,
      execution_mode: null,
      title: null,
      objective: null,
      instructions: [],
      external_execution: false,
      requires_human_approval: true,
      status: "PENDING_APPROVAL",
      approved: false,
      executed: false
    };

  const decision =
    automation?.decision || null;

  const evidence =
    automation?.evidence || {
      attention: 0,
      clicks: 0,
      product_views: 0,
      engagements: 0,
      customers: 0,
      orders: 0,
      revenue: 0
    };

  const learning =
    automation?.learning || null;

  const intelligence =
    automation?.intelligence || null;

  const funnel =
    automation?.funnel || evidence;

  const persisted =
    persistedFeedback
      ? {
          id: persistedFeedback.id,
          content_id: persistedFeedback.content_id,
          execution_id: persistedFeedback.execution_id,
          feedback_type: persistedFeedback.feedback_type,
          expected_outcome: persistedFeedback.expected_outcome,
          actual_outcome: persistedFeedback.actual_outcome,
          outcome_status: persistedFeedback.outcome_status,
          operator_note: persistedFeedback.operator_note,
          measurement_required:
            Boolean(persistedFeedback.measurement_required),
          measurement_completed:
            Boolean(persistedFeedback.measurement_completed),
          created_at: persistedFeedback.created_at
        }
      : null;

  const feedback = persisted
    ? {
        feedback_type:
          persisted.feedback_type,

        execution: {
          status:
            execution.status || "UNKNOWN",

          approved:
            Boolean(execution.approved),

          executed:
            Boolean(execution.executed),

          execution_id:
            persisted.execution_id
        },

        expected: {
          outcome:
            persisted.expected_outcome
        },

        actual: {
          outcome:
            persisted.actual_outcome,

          status:
            persisted.outcome_status
        },

        operator: {
          note:
            persisted.operator_note
        },

        measurement: {
          required:
            persisted.measurement_required,

          completed:
            persisted.measurement_completed,

          reason:
            "Feedback must return to Measurement for the next observable cycle."
        },

        persistence: {
          saved: true,

          record_id:
            persisted.id,

          source:
            "D1.feedback_events",

          created_at:
            persisted.created_at
        },

        loop: {
          closed:
            false,

          next_layer:
            "MEASUREMENT_V2.2"
        }
      }
    : {
        feedback_type:
          "EXECUTION_OUTCOME",

        execution: {
          status:
            execution.status || "PENDING_APPROVAL",

          approved:
            Boolean(execution.approved),

          executed:
            Boolean(execution.executed),

          execution_id:
            null
        },

        expected: {
          outcome:
            action?.objective ||
            "Execution outcome required"
        },

        actual: {
          outcome:
            null,

          status:
            "PENDING"
        },

        operator: {
          note:
            null
        },

        measurement: {
          required:
            true,

          completed:
            false,

          reason:
            "Feedback must return to Measurement for the next observable cycle."
        },

        persistence: {
          saved: false,

          record_id:
            null,

          source:
            "D1.feedback_events",

          created_at:
            null
        },

        loop: {
          closed:
            false,

          next_layer:
            "MEASUREMENT_V2.2"
        }
      };

  return {
    success: true,

    layer:
      LAYER,

    version:
      VERSION,

    mode:
      "PREVIEW",

    status:
      persisted
        ? "FEEDBACK_PERSISTED"
        : "FEEDBACK_READY",

    content,

    action,

    execution,

    decision,

    feedback,

    evidence,

    learning,

    intelligence,

    funnel,

    source_chain: [
      "CONTENT_MEASUREMENT_ENGINE_V2.2",
      "INTELLIGENCE_LAYER_V2",
      "LEARNING_ENGINE_V2",
      "DECISION_LAYER_V1",
      "ACTION_LAYER_V1",
      "AUTOMATION_EXECUTION_V1",
      "FEEDBACK_LAYER_V1.1"
    ],

    guardrails: {
      reads_raw_behavior_events: false,
      recalculates_measurement: false,
      recalculates_intelligence: false,
      recalculates_learning: false,
      creates_decision: false,
      changes_strategy: false,
      winner_declared: false,
      automatic_execution: false,
      external_execution: false,
      action_executed: false,
      feedback_recorded:
        Boolean(persisted)
    },

    persistence: {
      table:
        FEEDBACK_TABLE,

      record_found:
        Boolean(persisted),

      record_id:
        persisted?.id || null
    },

    loop: {
      current_layer:
        "FEEDBACK_LAYER_V1.1",

      next_layer:
        "MEASUREMENT_V2.2",

      closed:
        false,

      measurement_required:
        true
    },

    saved:
      Boolean(persisted),

    timestamp:
      new Date().toISOString()
  };
}

export async function onRequest(context) {

  const request =
    context.request;

  const DB =
    context.env?.DB;

  if (!DB) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        error:
          "D1_BINDING_NOT_FOUND"
      },
      500
    );
  }

  const url =
    new URL(request.url);

  const contentId =
    url.searchParams.get("content_id") ||
    DEFAULT_CONTENT_ID;

  if (!contentId) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        error:
          "CONTENT_ID_REQUIRED"
      },
      400
    );
  }

  try {

    await ensureTable(DB);

    // --------------------------------------------------
    // GET
    // --------------------------------------------------

    if (request.method === "GET") {

      const executionId =
        url.searchParams.get(
          "execution_id"
        );

      let persistedFeedback = null;

      if (executionId) {

        persistedFeedback =
          await getFeedbackByExecution(
            DB,
            executionId
          );

      } else {

        persistedFeedback =
          await getLatestFeedback(
            DB,
            contentId
          );
      }

      const automation =
        await getAutomationPreview(
          request,
          contentId
        );

      return json(
        buildFeedbackPreview({
          contentId,
          automation,
          persistedFeedback
        })
      );
    }

    // --------------------------------------------------
    // POST
    // --------------------------------------------------

    if (request.method === "POST") {

      let body = {};

      try {
        body =
          await request.json();
      } catch {
        return json(
          {
            success: false,
            layer: LAYER,
            version: VERSION,
            error:
              "INVALID_JSON_BODY"
          },
          400
        );
      }

      const mode =
        normalize(body.mode)
          ?.toLowerCase();

      if (mode !== "record") {

        return json(
          {
            success: false,
            layer: LAYER,
            version: VERSION,
            error:
              "INVALID_MODE",
            expected:
              "record"
          },
          400
        );
      }

      const executionId =
        normalize(
          body.execution_id
        );

      const actualOutcome =
        normalize(
          body.actual_outcome
        );

      const outcomeStatus =
        normalize(
          body.outcome_status
        );

      const operatorNote =
        normalize(
          body.operator_note
        );

      if (!actualOutcome) {

        return json(
          {
            success: false,
            layer: LAYER,
            version: VERSION,
            error:
              "ACTUAL_OUTCOME_REQUIRED"
          },
          400
        );
      }

      const automation =
        await getAutomationPreview(
          request,
          contentId
        );

      let execution =
        automation?.execution || {
          status: "UNKNOWN",
          approved: false,
          executed: false
        };

      // --------------------------------------------------
      // If execution_id is supplied,
      // try to read the actual execution_queue state.
      // --------------------------------------------------

      if (executionId) {

        try {

          const executionRow =
            await DB.prepare(`
              SELECT *
              FROM execution_queue
              WHERE id = ?
              LIMIT 1
            `)
              .bind(executionId)
              .first();

          if (executionRow) {

            execution = {
              execution_type:
                executionRow.execution_type ||
                "MANUAL_TASK",

              execution_code:
                executionRow.execution_code ||
                null,

              execution_mode:
                executionRow.execution_mode ||
                null,

              title:
                executionRow.title ||
                null,

              objective:
                executionRow.objective ||
                null,

              status:
                executionRow.status ||
                "UNKNOWN",

              approved:
                Boolean(
                  executionRow.approved
                ),

              executed:
                Boolean(
                  executionRow.executed
                )
            };
          }

        } catch {
          // execution_queue may not exist
          // or may use a different schema.
          // Feedback recording itself remains valid.
        }
      }

      const id =
        crypto.randomUUID();

      const createdAt =
        new Date().toISOString();

      const expectedOutcome =
        automation?.action?.objective ||
        "Execution outcome required";

      await DB.prepare(`
        INSERT INTO ${FEEDBACK_TABLE} (
          id,
          content_id,
          execution_id,
          feedback_type,
          expected_outcome,
          actual_outcome,
          outcome_status,
          operator_note,
          measurement_required,
          measurement_completed,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          id,
          contentId,
          executionId,
          "EXECUTION_OUTCOME",
          expectedOutcome,
          actualOutcome,
          outcomeStatus ||
            "RECORDED",
          operatorNote,
          1,
          0,
          createdAt
        )
        .run();

      // Read it back immediately.
      // This verifies persistence instead of
      // assuming the INSERT succeeded.

      const persisted =
        await DB.prepare(`
          SELECT
            id,
            content_id,
            execution_id,
            feedback_type,
            expected_outcome,
            actual_outcome,
            outcome_status,
            operator_note,
            measurement_required,
            measurement_completed,
            created_at
          FROM ${FEEDBACK_TABLE}
          WHERE id = ?
          LIMIT 1
        `)
          .bind(id)
          .first();

      if (!persisted) {

        return json(
          {
            success: false,
            layer: LAYER,
            version: VERSION,
            mode: "RECORD",
            status:
              "PERSISTENCE_VERIFICATION_FAILED",
            saved: false,
            feedback_recorded: false
          },
          500
        );
      }

      return json(
        {
          success: true,

          layer:
            LAYER,

          version:
            VERSION,

          mode:
            "RECORD",

          status:
            "FEEDBACK_RECORDED",

          content:
            automation?.content || {
              id: contentId,
              title: null,
              status: null
            },

          action:
            automation?.action || null,

          execution,

          decision:
            automation?.decision || null,

          feedback: {
            feedback_type:
              "EXECUTION_OUTCOME",

            execution: {
              status:
                execution.status,

              approved:
                Boolean(execution.approved),

              executed:
                Boolean(execution.executed),

              execution_id:
                executionId
            },

            expected: {
              outcome:
                expectedOutcome
            },

            actual: {
              outcome:
                actualOutcome,

              status:
                outcomeStatus ||
                "RECORDED"
            },

            operator: {
              note:
                operatorNote
            },

            measurement: {
              required:
                true,

              completed:
                false,

              reason:
                "Feedback must return to Measurement for the next observable cycle."
            },

            persistence: {
              saved:
                true,

              verified:
                true,

              source:
                "D1.feedback_events"
            },

            loop: {
              closed:
                false,

              next_layer:
                "MEASUREMENT_V2.2"
            }
          },

          record: {
            id:
              persisted.id,

            status:
              "RECORDED",

            persisted:
              true,

            verified:
              true,

            measurement_required:
              true,

            measurement_completed:
              false,

            created_at:
              persisted.created_at
          },

          evidence:
            automation?.evidence || {
              attention: 0,
              clicks: 0,
              product_views: 0,
              engagements: 0,
              customers: 0,
              orders: 0,
              revenue: 0
            },

          learning:
            automation?.learning || null,

          intelligence:
            automation?.intelligence || null,

          funnel:
            automation?.funnel ||
            automation?.evidence || null,

          source_chain: [
            "CONTENT_MEASUREMENT_ENGINE_V2.2",
            "INTELLIGENCE_LAYER_V2",
            "LEARNING_ENGINE_V2",
            "DECISION_LAYER_V1",
            "ACTION_LAYER_V1",
            "AUTOMATION_EXECUTION_V1",
            "FEEDBACK_LAYER_V1.1"
          ],

          guardrails: {
            reads_raw_behavior_events: false,
            recalculates_measurement: false,
            recalculates_intelligence: false,
            recalculates_learning: false,
            creates_decision: false,
            changes_strategy: false,
            winner_declared: false,
            automatic_execution: false,
            external_execution: false,
            action_executed: false,
            feedback_recorded: true
          },

          loop: {
            current_layer:
              "FEEDBACK_LAYER_V1.1",

            next_layer:
              "MEASUREMENT_V2.2",

            closed:
              false,

            measurement_required:
              true
          },

          saved:
            true,

          timestamp:
            new Date().toISOString()
        }
      );
    }

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

  } catch (error) {

    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        error:
          "FEEDBACK_LAYER_ERROR",

        message:
          error?.message ||
          String(error)
      },
      500
    );
  }
}
