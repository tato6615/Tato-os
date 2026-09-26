// TATO-OS
// Business Execution Layer V1.0
// Route: /api/business-execution
//
// Pipeline:
//
// Business Decision
//        ↓
// Business Action
//        ↓
// Business Approval
//        ↓
// Business Execution
//        ↓
// Market Test
//        ↓
// Measurement
//
// Execution V1 DOES:
// - verify human approval
// - prevent duplicate execution
// - create a real market-test record in D1
// - create execution history
// - preserve decision/action/approval traceability
//
// Execution V1 DOES NOT:
// - publish content
// - spend money
// - run advertisements
// - change strategy
// - claim revenue
//
// The created market test is an internal executable test object.
// External distribution remains a separate layer.

const ENGINE = "BUSINESS_EXECUTION_V1";
const VERSION = "1.0";

const REQUIRED_ACTION = "CREATE_MARKET_TEST";

const APPROVAL_TABLE = "business_action_approvals";
const EXECUTION_TABLE = "business_executions";
const MARKET_TEST_TABLE = "business_market_tests";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}

function now() {
  return new Date().toISOString();
}

function normalize(value) {
  return value == null ? "" : String(value).trim();
}

function makeId(prefix) {
  return (
    prefix +
    "-" +
    Date.now() +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

async function ensureTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS business_executions (
      id TEXT PRIMARY KEY,
      action_id TEXT NOT NULL,
      approval_id TEXT NOT NULL,
      decision_id TEXT,
      execution_type TEXT NOT NULL,
      status TEXT NOT NULL,
      market_theme TEXT,
      opportunity_type TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      created_at TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS business_market_tests (
      id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      action_id TEXT NOT NULL,
      decision_id TEXT,
      approval_id TEXT NOT NULL,
      market_theme TEXT NOT NULL,
      opportunity_type TEXT NOT NULL,
      status TEXT NOT NULL,
      objective TEXT NOT NULL,
      required_evidence TEXT NOT NULL,
      external_distribution_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
}

async function getApproval(env, actionId) {
  const result = await env.DB.prepare(`
    SELECT
      id,
      action_id,
      action_type,
      market_theme,
      opportunity_type,
      decision_id,
      status,
      approval_action,
      approved_by,
      reason,
      created_at,
      updated_at
    FROM business_action_approvals
    WHERE action_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `)
    .bind(actionId)
    .all();

  return result.results && result.results.length
    ? result.results[0]
    : null;
}

async function getExecutionByAction(env, actionId) {
  const result = await env.DB.prepare(`
    SELECT
      id,
      action_id,
      approval_id,
      decision_id,
      execution_type,
      status,
      market_theme,
      opportunity_type,
      started_at,
      completed_at,
      created_at
    FROM business_executions
    WHERE action_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `)
    .bind(actionId)
    .all();

  return result.results && result.results.length
    ? result.results[0]
    : null;
}

async function createExecution(env, approval) {
  const existing = await getExecutionByAction(
    env,
    approval.action_id
  );

  if (existing) {
    return {
      success: false,
      duplicate: true,
      existing
    };
  }

  const executionId = makeId("execution");
  const marketTestId = makeId("market-test");
  const timestamp = now();

  const requiredEvidence = JSON.stringify([
    "content_view",
    "content_click",
    "engagement",
    "product_view",
    "order_created",
    "payment_completed",
    "revenue_recorded"
  ]);

  await env.DB.prepare(`
    INSERT INTO business_executions (
      id,
      action_id,
      approval_id,
      decision_id,
      execution_type,
      status,
      market_theme,
      opportunity_type,
      started_at,
      completed_at,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      executionId,
      approval.action_id,
      approval.id,
      approval.decision_id,
      REQUIRED_ACTION,
      "COMPLETED",
      approval.market_theme,
      approval.opportunity_type,
      timestamp,
      timestamp,
      timestamp
    )
    .run();

  await env.DB.prepare(`
    INSERT INTO business_market_tests (
      id,
      execution_id,
      action_id,
      decision_id,
      approval_id,
      market_theme,
      opportunity_type,
      status,
      objective,
      required_evidence,
      external_distribution_status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      marketTestId,
      executionId,
      approval.action_id,
      approval.decision_id,
      approval.id,
      approval.market_theme,
      approval.opportunity_type,
      "READY_FOR_DISTRIBUTION",
      "Validate whether real customer behavior progresses from attention to interest, purchase, and revenue.",
      requiredEvidence,
      "NOT_STARTED",
      timestamp,
      timestamp
    )
    .run();

  return {
    success: true,
    duplicate: false,
    execution: {
      id: executionId,
      action_id: approval.action_id,
      approval_id: approval.id,
      decision_id: approval.decision_id,
      execution_type: REQUIRED_ACTION,
      status: "COMPLETED",
      market_theme: approval.market_theme,
      opportunity_type: approval.opportunity_type,
      started_at: timestamp,
      completed_at: timestamp
    },
    market_test: {
      id: marketTestId,
      execution_id: executionId,
      action_id: approval.action_id,
      decision_id: approval.decision_id,
      approval_id: approval.id,
      market_theme: approval.market_theme,
      opportunity_type: approval.opportunity_type,
      status: "READY_FOR_DISTRIBUTION",
      external_distribution_status: "NOT_STARTED"
    }
  };
}

export async function onRequestGet(context) {
  const timestamp = now();

  try {
    await ensureTables(context.env);

    const result = await context.env.DB.prepare(`
      SELECT
        id,
        action_id,
        approval_id,
        decision_id,
        execution_type,
        status,
        market_theme,
        opportunity_type,
        started_at,
        completed_at,
        created_at
      FROM business_executions
      ORDER BY created_at DESC
      LIMIT 10
    `).all();

    const tests = await context.env.DB.prepare(`
      SELECT
        id,
        execution_id,
        action_id,
        decision_id,
        approval_id,
        market_theme,
        opportunity_type,
        status,
        external_distribution_status,
        created_at,
        updated_at
      FROM business_market_tests
      ORDER BY created_at DESC
      LIMIT 10
    `).all();

    return json({
      success: true,
      engine: ENGINE,
      version: VERSION,
      timestamp,

      state:
        result.results && result.results.length
          ? "EXECUTION_HISTORY_AVAILABLE"
          : "WAITING_FOR_APPROVED_ACTION",

      summary: {
        executions:
          result.results
            ? result.results.length
            : 0,

        market_tests:
          tests.results
            ? tests.results.length
            : 0
      },

      executions: result.results || [],

      market_tests: tests.results || [],

      contract: {
        current_layer: ENGINE,
        version: VERSION,
        previous_layer: "BUSINESS_APPROVAL_V1",
        next_layer: "MARKET_TEST_DISTRIBUTION",
        accepted_action: REQUIRED_ACTION,
        human_approval_required: true,
        duplicate_execution_blocked: true
      },

      guardrails: {
        requires_approved_action: true,
        executes_only_after_human_approval: true,
        duplicate_execution_blocked: true,
        publishes_content: false,
        spends_money: false,
        runs_ads: false,
        changes_strategy: false,
        guarantees_revenue: false
      },

      data_integrity: {
        execution_persistence: "D1",
        market_test_persistence: "D1",
        approval_traceability: true,
        decision_traceability: true
      }
    });
  } catch (error) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        timestamp,
        state: "ERROR",
        error: String(
          error && error.message
            ? error.message
            : error
        )
      },
      500
    );
  }
}

export async function onRequestPost(context) {
  const timestamp = now();

  try {
    await ensureTables(context.env);

    const body = await context.request.json();

    const actionId = normalize(body.action_id);

    if (!actionId) {
      return json(
        {
          success: false,
          engine: ENGINE,
          version: VERSION,
          timestamp,
          state: "INVALID_EXECUTION_REQUEST",
          error: "action_id_required"
        },
        400
      );
    }

    const approval = await getApproval(
      context.env,
      actionId
    );

    if (!approval) {
      return json(
        {
          success: false,
          engine: ENGINE,
          version: VERSION,
          timestamp,
          state: "APPROVAL_NOT_FOUND",
          error:
            "No approval record exists for this action.",
          execution_started: false
        },
        404
      );
    }

    if (approval.action_type !== REQUIRED_ACTION) {
      return json(
        {
          success: false,
          engine: ENGINE,
          version: VERSION,
          timestamp,
          state: "UNSUPPORTED_ACTION",
          error:
            "This execution layer only accepts CREATE_MARKET_TEST.",
          execution_started: false
        },
        400
      );
    }

    if (approval.status !== "APPROVED") {
      return json(
        {
          success: false,
          engine: ENGINE,
          version: VERSION,
          timestamp,
          state: "APPROVAL_REQUIRED",
          error:
            "Human approval is required before execution.",
          approval_status: approval.status,
          execution_started: false
        },
        403
      );
    }

    const result = await createExecution(
      context.env,
      approval
    );

    if (result.duplicate) {
      return json(
        {
          success: false,
          engine: ENGINE,
          version: VERSION,
          timestamp,
          state: "ALREADY_EXECUTED",
          error:
            "This approved action has already been executed.",
          existing_execution: result.existing,
          execution_started: false,
          guardrails: {
            duplicate_execution_blocked: true
          }
        },
        409
      );
    }

    return json({
      success: true,
      engine: ENGINE,
      version: VERSION,
      timestamp,

      state: "EXECUTION_COMPLETED",

      approval: {
        id: approval.id,
        action_id: approval.action_id,
        status: approval.status,
        approved_by: approval.approved_by
      },

      execution: result.execution,

      market_test: result.market_test,

      handoff: {
        ready: true,
        next_layer: "MARKET_TEST_DISTRIBUTION",
        reason:
          "The approved market-test action has been created as a persistent executable test and is ready for controlled distribution."
      },

      external_execution: {
        published: false,
        distributed: false,
        advertising_started: false,
        money_spent: false
      },

      guardrails: {
        approval_verified: true,
        duplicate_execution_blocked: true,
        publishes_content: false,
        spends_money: false,
        runs_ads: false,
        changes_strategy: false,
        guarantees_revenue: false
      },

      contract: {
        current_layer: ENGINE,
        version: VERSION,
        previous_layer: "BUSINESS_APPROVAL_V1",
        next_layer: "MARKET_TEST_DISTRIBUTION",
        execution_status: "COMPLETED",
        external_distribution: "NOT_STARTED"
      }
    });
  } catch (error) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        timestamp,
        state: "ERROR",
        error: String(
          error && error.message
            ? error.message
            : error
        ),
        execution_started: false
      },
      500
    );
  }
}
