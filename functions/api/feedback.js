// TATO-OS
// Feedback Layer V1.1
// Route: /api/feedback
//
// Pipeline:
//
// Measurement V2.3
//        ↓
// Intelligence V2.1
//        ↓
// Learning V2.3
//        ↓
// Decision V1.2
//        ↓
// Action V1.0
//        ↓
// Automation Execution V1.0
//        ↓
// Feedback V1.1
//        ↓
// Measurement V2.3
//
// Feedback DOES:
// - read Automation execution state
// - record execution outcome
// - persist feedback_events
// - verify persistence
// - read persisted feedback_events
// - expose latest persisted feedback
// - hand off to Measurement V2.3
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

const MEASUREMENT_LAYER =
  "CONTENT_MEASUREMENT_ENGINE_V2.3";

const INTELLIGENCE_LAYER =
  "INTELLIGENCE_LAYER_V2";

const INTELLIGENCE_VERSION =
  "2.1";

const INTELLIGENCE_ENGINE =
  "INTELLIGENCE_V2.1_FEEDBACK_AWARE";

const LEARNING_LAYER =
  "LEARNING_ENGINE_V2";

const LEARNING_VERSION =
  "2.3";

const LEARNING_ENGINE =
  "LEARNING_V2.3_FEEDBACK_AWARE";

const DECISION_LAYER =
  "DECISION_LAYER_V1";

const DECISION_VERSION =
  "1.2";

const ACTION_LAYER =
  "ACTION_LAYER_V1";

const ACTION_VERSION =
  "1.0";

const AUTOMATION_LAYER =
  "AUTOMATION_EXECUTION_V1";

const AUTOMATION_VERSION =
  "1.0";

const AUTOMATION_ENGINE =
  "AUTOMATION_V1.0_ACTION_V1.0_COMPATIBLE";

const AUTOMATION_URL =
  "/api/automation";

const DEFAULT_CONTENT_ID =
  "5127d38f-6601-41dd-bb30-9e4346dd9a4c";

const FEEDBACK_TABLE =
  "feedback_events";

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );
}

function normalize(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  return String(value);
}

async function ensureTable(DB) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS feedback_events (
      id TEXT PRIMARY KEY,
      execution_id TEXT,
      content_id TEXT,
      action_code TEXT,
      action_target TEXT,
      execution_code TEXT,
      execution_status TEXT,
      expected_outcome TEXT,
      actual_outcome TEXT,
      outcome_status TEXT,
      operator_note TEXT,
      measurement_required INTEGER DEFAULT 1,
      measurement_completed INTEGER DEFAULT 0,
      feedback_payload TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `).run();
}

async function getLatestFeedback(
  DB,
  contentId
) {
  const result =
    await DB.prepare(`
      SELECT
        id,
        execution_id,
        content_id,
        action_code,
        action_target,
        execution_code,
        execution_status,
        expected_outcome,
        actual_outcome,
        outcome_status,
        operator_note,
        measurement_required,
        measurement_completed,
        feedback_payload,
        created_at,
        updated_at
      FROM feedback_events
      WHERE content_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
      .bind(contentId)
      .first();

  return result || null;
}

async function getFeedbackByExecution(
  DB,
  executionId
) {
  if (!executionId) {
    return null;
  }

  const result =
    await DB.prepare(`
      SELECT
        id,
        execution_id,
        content_id,
        action_code,
        action_target,
        execution_code,
        execution_status,
        expected_outcome,
        actual_outcome,
        outcome_status,
        operator_note,
        measurement_required,
        measurement_completed,
        feedback_payload,
        created_at,
        updated_at
      FROM feedback_events
      WHERE execution_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
      .bind(executionId)
      .first();

  return result || null;
}

async function getAutomationPreview(
  request,
  contentId
) {
  try {
    const requestUrl =
      new URL(request.url);

    const automationUrl =
      new URL(
        AUTOMATION_URL,
        requestUrl.origin
      );

    automationUrl.searchParams.set(
      "content_id",
      contentId
    );

    const response =
      await fetch(
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

async function getExecutionState(
  DB,
  executionId
) {
  if (!executionId) {
    return null;
  }

  try {
    const row =
      await DB.prepare(`
        SELECT *
        FROM execution_queue
        WHERE id = ?
        LIMIT 1
      `)
        .bind(executionId)
        .first();

    if (!row) {
      return null;
    }

    return {
      execution_type:
        row.execution_type ||
        "MANUAL_TASK",

      execution_code:
        row.execution_code ||
        null,

      execution_mode:
        row.execution_mode ||
        null,

      title:
        row.title ||
        null,

      objective:
        row.objective ||
        null,

      status:
        row.status ||
        "UNKNOWN",

      approved:
        Boolean(row.approved),

      executed:
        Boolean(row.executed)
    };

  } catch {
    return null;
  }
}

function parsePayload(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildSourceChain() {
  return [
    MEASUREMENT_LAYER,
    INTELLIGENCE_ENGINE,
    LEARNING_ENGINE,
    DECISION_LAYER,
    ACTION_LAYER,
    AUTOMATION_LAYER,
    LAYER
  ];
}

function buildSourceContract() {
  return {
    measurement: {
      layer:
        MEASUREMENT_LAYER
    },

    intelligence: {
      layer:
        INTELLIGENCE_LAYER,

      version:
        INTELLIGENCE_VERSION,

      engine:
        INTELLIGENCE_ENGINE
    },

    learning: {
      layer:
        LEARNING_LAYER,

      version:
        LEARNING_VERSION,

      engine:
        LEARNING_ENGINE
    },

    decision: {
      layer:
        DECISION_LAYER,

      version:
        DECISION_VERSION
    },

    action: {
      layer:
        ACTION_LAYER,

      version:
        ACTION_VERSION
    },

    automation: {
      layer:
        AUTOMATION_LAYER,

      version:
        AUTOMATION_VERSION,

      engine:
        AUTOMATION_ENGINE
    },

    feedback: {
      layer:
        LAYER,

      version:
        VERSION
    }
  };
}

function validateAutomationContract(
  automation
) {
  if (!automation) {
    return {
      valid: false,

      errors: [
        {
          field:
            "automation",

          expected:
            AUTOMATION_LAYER,

          received:
            null
        }
      ]
    };
  }

  const errors = [];

  if (
    automation.layer !==
    AUTOMATION_LAYER
  ) {
    errors.push({
      field:
        "automation.layer",

      expected:
        AUTOMATION_LAYER,

      received:
        automation.layer || null
    });
  }

  if (
    automation.version !==
    AUTOMATION_VERSION
  ) {
    errors.push({
      field:
        "automation.version",

      expected:
        AUTOMATION_VERSION,

      received:
        automation.version || null
    });
  }

  if (
    automation.engine &&
    automation.engine !==
      AUTOMATION_ENGINE
  ) {
    errors.push({
      field:
        "automation.engine",

      expected:
        AUTOMATION_ENGINE,

      received:
        automation.engine
    });
  }

  const sourceContract =
    automation.source_contract;

  if (sourceContract) {

    if (
      sourceContract.measurement?.layer &&
      sourceContract.measurement.layer !==
        MEASUREMENT_LAYER
    ) {
      errors.push({
        field:
          "automation.source_contract.measurement",

        expected:
          MEASUREMENT_LAYER,

        received:
          sourceContract.measurement.layer
      });
    }

    if (
      sourceContract.intelligence?.version &&
      sourceContract.intelligence.version !==
        INTELLIGENCE_VERSION
    ) {
      errors.push({
        field:
          "automation.source_contract.intelligence.version",

        expected:
          INTELLIGENCE_VERSION,

        received:
          sourceContract.intelligence.version
      });
    }

    if (
      sourceContract.intelligence?.engine &&
      sourceContract.intelligence.engine !==
        INTELLIGENCE_ENGINE
    ) {
      errors.push({
        field:
          "automation.source_contract.intelligence.engine",

        expected:
          INTELLIGENCE_ENGINE,

        received:
          sourceContract.intelligence.engine
      });
    }

    if (
      sourceContract.learning?.version &&
      sourceContract.learning.version !==
        LEARNING_VERSION
    ) {
      errors.push({
        field:
          "automation.source_contract.learning.version",

        expected:
          LEARNING_VERSION,

        received:
          sourceContract.learning.version
      });
    }

    if (
      sourceContract.learning?.engine &&
      sourceContract.learning.engine !==
        LEARNING_ENGINE
    ) {
      errors.push({
        field:
          "automation.source_contract.learning.engine",

        expected:
          LEARNING_ENGINE,

        received:
          sourceContract.learning.engine
      });
    }

    if (
      sourceContract.decision?.version &&
      sourceContract.decision.version !==
        DECISION_VERSION
    ) {
      errors.push({
        field:
          "automation.source_contract.decision.version",

        expected:
          DECISION_VERSION,

        received:
          sourceContract.decision.version
      });
    }

    if (
      sourceContract.action?.version &&
      sourceContract.action.version !==
        ACTION_VERSION
    ) {
      errors.push({
        field:
          "automation.source_contract.action.version",

        expected:
          ACTION_VERSION,

        received:
          sourceContract.action.version
      });
    }
  }

  return {
    valid:
      errors.length === 0,

    errors
  };
}

function buildPersistedFeedback(
  row,
  automation,
  executionState
) {
  if (!row) {
    return null;
  }

  const execution =
    executionState ||
    automation?.execution || {
      status:
        row.execution_status ||
        "UNKNOWN",

      approved:
        false,

      executed:
        false
    };

  const payload =
    parsePayload(
      row.feedback_payload
    );

  return {
    feedback_type:
      "EXECUTION_OUTCOME",

    execution: {
      status:
        execution.status ||
        row.execution_status ||
        "UNKNOWN",

      approved:
        Boolean(
          execution.approved
        ),

      executed:
        Boolean(
          execution.executed
        ),

      execution_id:
        row.execution_id ||
        null
    },

    expected: {
      outcome:
        row.expected_outcome
    },

    actual: {
      outcome:
        row.actual_outcome,

      status:
        row.outcome_status
    },

    operator: {
      note:
        row.operator_note
    },

    measurement: {
      required:
        Boolean(
          row.measurement_required
        ),

      completed:
        Boolean(
          row.measurement_completed
        ),

      reason:
        "Feedback must return to Measurement V2.3 for the next observable cycle."
    },

    persistence: {
      saved:
        true,

      verified:
        true,

      source:
        "D1.feedback_events",

      record_id:
        row.id,

      created_at:
        row.created_at,

      updated_at:
        row.updated_at
    },

    payload,

    loop: {
      closed:
        false,

      next_layer:
        MEASUREMENT_LAYER
    }
  };
}

function buildPreview({
  contentId,
  automation,
  persistedFeedback,
  executionState
}) {
  const content =
    automation?.content || {
      id:
        contentId,

      title:
        null,

      status:
        null
    };

  const action =
    automation?.action ||
    null;

  const execution =
    executionState ||
    automation?.execution || {
      execution_type:
        "MANUAL_TASK",

      execution_code:
        null,

      execution_mode:
        "MANUAL_INVESTIGATION",

      title:
        action?.title ||
        null,

      objective:
        action?.objective ||
        null,

      instructions:
        [],

      external_execution:
        false,

      requires_human_approval:
        true,

      status:
        "PENDING_APPROVAL",

      approved:
        false,

      executed:
        false
    };

  const decision =
    automation?.decision ||
    null;

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
    automation?.learning ||
    null;

  const intelligence =
    automation?.intelligence ||
    null;

  const funnel =
    automation?.funnel ||
    evidence;

  const persisted =
    buildPersistedFeedback(
      persistedFeedback,
      automation,
      executionState
    );

  const feedback =
    persisted || {
      feedback_type:
        "EXECUTION_OUTCOME",

      execution: {
        status:
          execution.status,

        approved:
          Boolean(
            execution.approved
          ),

        executed:
          Boolean(
            execution.executed
          ),

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
          "Feedback must return to Measurement V2.3 for the next observable cycle."
      },

      persistence: {
        saved:
          false,

        verified:
          false,

        source:
          "D1.feedback_events",

        record_id:
          null,

        created_at:
          null,

        updated_at:
          null
      },

      loop: {
        closed:
          false,

        next_layer:
          MEASUREMENT_LAYER
      }
    };

  return {
    success:
      true,

    layer:
      LAYER,

    version:
      VERSION,

    engine:
      "FEEDBACK_V1.1_AUTOMATION_V1.0_COMPATIBLE",

    mode:
      "PREVIEW",

    status:
      persistedFeedback
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

    source_chain:
      buildSourceChain(),

    source_contract:
      buildSourceContract(),

    guardrails: {
      reads_raw_behavior_events:
        false,

      recalculates_measurement:
        false,

      recalculates_intelligence:
        false,

      recalculates_learning:
        false,

      creates_decision:
        false,

      changes_strategy:
        false,

      winner_declared:
        false,

      automatic_execution:
        false,

      external_execution:
        false,

      action_executed:
        false,

      feedback_recorded:
        Boolean(
          persistedFeedback
        )
    },

    persistence: {
      table:
        FEEDBACK_TABLE,

      record_found:
        Boolean(
          persistedFeedback
        ),

      record_id:
        persistedFeedback?.id ||
        null
    },

    loop: {
      current_layer:
        LAYER,

      next_layer:
        MEASUREMENT_LAYER,

      closed:
        false,

      measurement_required:
        true
    },

    saved:
      Boolean(
        persistedFeedback
      ),

    timestamp:
      new Date().toISOString()
  };
}

export async function onRequest(
  context
) {
  const request =
    context.request;

  const DB =
    context.env?.DB;

  if (!DB) {
    return json(
      {
        success:
          false,

        layer:
          LAYER,

        version:
          VERSION,

        error:
          "D1_BINDING_NOT_FOUND"
      },
      500
    );
  }

  const url =
    new URL(request.url);

  const contentId =
    url.searchParams.get(
      "content_id"
    ) ||
    DEFAULT_CONTENT_ID;

  try {

    await ensureTable(DB);

    // ==================================================
    // GET
    // ==================================================

    if (
      request.method ===
      "GET"
    ) {
      const executionId =
        url.searchParams.get(
          "execution_id"
        );

      let persistedFeedback =
        null;

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

      const executionState =
        executionId
          ? await getExecutionState(
              DB,
              executionId
            )
          : null;

      const automation =
        await getAutomationPreview(
          request,
          contentId
        );

      const contract =
        validateAutomationContract(
          automation
        );

      if (
        automation &&
        !contract.valid
      ) {
        return json(
          {
            success:
              false,

            layer:
              LAYER,

            version:
              VERSION,

            status:
              "CONTRACT_ERROR",

            error:
              "Feedback Layer V1.1 requires current Automation V1.0 contract.",

            expected: {
              automation_layer:
                AUTOMATION_LAYER,

              automation_version:
                AUTOMATION_VERSION,

              automation_engine:
                AUTOMATION_ENGINE,

              measurement:
                MEASUREMENT_LAYER,

              intelligence_version:
                INTELLIGENCE_VERSION,

              intelligence_engine:
                INTELLIGENCE_ENGINE,

              learning_version:
                LEARNING_VERSION,

              learning_engine:
                LEARNING_ENGINE,

              decision_version:
                DECISION_VERSION,

              action_version:
                ACTION_VERSION
            },

            received:
              automation,

            contract_errors:
              contract.errors
          },
          409
        );
      }

      return json(
        buildPreview({
          contentId,
          automation,
          persistedFeedback,
          executionState
        })
      );
    }

    // ==================================================
    // POST
    // ==================================================

    if (
      request.method ===
      "POST"
    ) {
      let body = {};

      try {

        body =
          await request.json();

      } catch {

        return json(
          {
            success:
              false,

            layer:
              LAYER,

            version:
              VERSION,

            error:
              "INVALID_JSON_BODY"
          },
          400
        );
      }

      const mode =
        normalize(
          body.mode
        )?.toLowerCase();

      if (
        mode !==
        "record"
      ) {
        return json(
          {
            success:
              false,

            layer:
              LAYER,

            version:
              VERSION,

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
        ) ||
        "RECORDED";

      const operatorNote =
        normalize(
          body.operator_note
        );

      if (!actualOutcome) {
        return json(
          {
            success:
              false,

            layer:
              LAYER,

            version:
              VERSION,

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

      const contract =
        validateAutomationContract(
          automation
        );

      if (
        automation &&
        !contract.valid
      ) {
        return json(
          {
            success:
              false,

            layer:
              LAYER,

            version:
              VERSION,

            status:
              "CONTRACT_ERROR",

            error:
              "Feedback Layer V1.1 requires current Automation V1.0 contract.",

            contract_errors:
              contract.errors
          },
          409
        );
      }

      const executionState =
        executionId
          ? await getExecutionState(
              DB,
              executionId
            )
          : null;

      const execution =
        executionState ||
        automation?.execution || {
          status:
            "UNKNOWN",

          approved:
            false,

          executed:
            false
        };

      const action =
        automation?.action ||
        {};

      const expectedOutcome =
        action.objective ||
        "Execution outcome required";

      const id =
        crypto.randomUUID();

      const createdAt =
        new Date().toISOString();

      const feedbackPayload = {
        feedback_type:
          "EXECUTION_OUTCOME",

        execution: {
          status:
            execution.status ||
            "UNKNOWN",

          approved:
            Boolean(
              execution.approved
            ),

          executed:
            Boolean(
              execution.executed
            )
        },

        expected: {
          outcome:
            expectedOutcome
        },

        actual: {
          outcome:
            actualOutcome,

          status:
            outcomeStatus
        },

        operator: {
          note:
            operatorNote
        },

        measurement: {
          required:
            true,

          completed:
            false
        },

        loop: {
          closed:
            false,

          next_layer:
            MEASUREMENT_LAYER
        },

        execution_id:
          executionId
      };

      await DB.prepare(`
        INSERT INTO feedback_events (
          id,
          execution_id,
          content_id,
          action_code,
          action_target,
          execution_code,
          execution_status,
          expected_outcome,
          actual_outcome,
          outcome_status,
          operator_note,
          measurement_required,
          measurement_completed,
          feedback_payload,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          id,
          executionId,
          contentId,
          action.action_code ||
            null,
          action.target ||
            null,
          execution.execution_code ||
            null,
          execution.status ||
            null,
          expectedOutcome,
          actualOutcome,
          outcomeStatus,
          operatorNote,
          1,
          0,
          JSON.stringify(
            feedbackPayload
          ),
          createdAt,
          createdAt
        )
        .run();

      // ==================================================
      // REAL PERSISTENCE VERIFICATION
      // ==================================================

      const persisted =
        await DB.prepare(`
          SELECT
            id,
            execution_id,
            content_id,
            action_code,
            action_target,
            execution_code,
            execution_status,
            expected_outcome,
            actual_outcome,
            outcome_status,
            operator_note,
            measurement_required,
            measurement_completed,
            feedback_payload,
            created_at,
            updated_at
          FROM feedback_events
          WHERE id = ?
          LIMIT 1
        `)
          .bind(id)
          .first();

      if (!persisted) {
        return json(
          {
            success:
              false,

            layer:
              LAYER,

            version:
              VERSION,

            mode:
              "RECORD",

            status:
              "PERSISTENCE_VERIFICATION_FAILED",

            saved:
              false,

            feedback_recorded:
              false
          },
          500
        );
      }

      return json(
        {
          success:
            true,

          layer:
            LAYER,

          version:
            VERSION,

          engine:
            "FEEDBACK_V1.1_AUTOMATION_V1.0_COMPATIBLE",

          mode:
            "RECORD",

          status:
            "FEEDBACK_RECORDED",

          content:
            automation?.content || {
              id:
                contentId,

              title:
                null,

              status:
                null
            },

          action,

          execution,

          decision:
            automation?.decision ||
            null,

          feedback:
            buildPersistedFeedback(
              persisted,
              automation,
              executionState
            ),

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
            automation?.learning ||
            null,

          intelligence:
            automation?.intelligence ||
            null,

          funnel:
            automation?.funnel ||
            automation?.evidence ||
            null,

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
              persisted.created_at,

            updated_at:
              persisted.updated_at
          },

          source_chain:
            buildSourceChain(),

          source_contract:
            buildSourceContract(),

          guardrails: {
            reads_raw_behavior_events:
              false,

            recalculates_measurement:
              false,

            recalculates_intelligence:
              false,

            recalculates_learning:
              false,

            creates_decision:
              false,

            changes_strategy:
              false,

            winner_declared:
              false,

            automatic_execution:
              false,

            external_execution:
              false,

            action_executed:
              false,

            feedback_recorded:
              true
          },

          loop: {
            current_layer:
              LAYER,

            next_layer:
              MEASUREMENT_LAYER,

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
        success:
          false,

        layer:
          LAYER,

        version:
          VERSION,

        error:
          "METHOD_NOT_ALLOWED"
      },
      405
    );

  } catch (error) {

    return json(
      {
        success:
          false,

        layer:
          LAYER,

        version:
          VERSION,

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
