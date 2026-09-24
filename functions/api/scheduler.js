// ============================================================
// TATO-OS
// SCHEDULER V1.1
//
// Purpose:
// - Control when TATO OS Orchestrator should run.
// - Discover PUBLISHED content.
// - Prevent duplicate runs inside the configured interval.
// - Trigger Orchestrator V1.1 only.
// - Validate Orchestrator V1.1.
// - NEVER bypass human approval.
// - NEVER change strategy/content/customer/payment.
//
// Flow:
//
// Scheduler V1.1
//   -> Orchestrator V1.1
//   -> Measurement V2.2
//   -> Learning V1.0
//   -> Decision Cycle V1.1
//   -> Action Cycle V1.1
//   -> Execution Cycle V1.1 PREVIEW
//   -> STOP at Human Approval
// ============================================================

const LAYER = "TATO_OS_SCHEDULER";
const VERSION = "1.1";

const REQUIRED_ORCHESTRATOR_LAYER =
  "TATO_OS_ORCHESTRATOR";

const REQUIRED_ORCHESTRATOR_VERSION =
  "1.1";

const DEFAULT_INTERVAL_MINUTES = 60;
const DEFAULT_MAX_CONTENTS = 10;

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
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

function safeString(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  return String(value);
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
    return JSON.parse(
      String(value)
    );
  } catch (_) {
    return fallback;
  }
}

function numberValue(
  value,
  fallback = 0
) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function getIntervalMinutes(body) {
  const value =
    numberValue(
      body?.interval_minutes,
      DEFAULT_INTERVAL_MINUTES
    );

  return Math.max(
    1,
    Math.min(
      value,
      1440
    )
  );
}

function getMaxContents(body) {
  const value =
    numberValue(
      body?.max_contents,
      DEFAULT_MAX_CONTENTS
    );

  return Math.max(
    1,
    Math.min(
      value,
      100
    )
  );
}

// ------------------------------------------------------------
// Extract version from nested Orchestrator response
// ------------------------------------------------------------

function extractVersion(data) {
  if (!data) {
    return null;
  }

  if (
    data.version !== undefined &&
    data.version !== null
  ) {
    return String(
      data.version
    );
  }

  if (
    data.output?.version !==
      undefined &&
    data.output?.version !== null
  ) {
    return String(
      data.output.version
    );
  }

  return null;
}

// ------------------------------------------------------------
// Validate Orchestrator
// ------------------------------------------------------------

function validateOrchestrator(
  data
) {
  const actualLayer =
    data?.layer || null;

  const actualVersion =
    extractVersion(data);

  const layerValid =
    actualLayer ===
    REQUIRED_ORCHESTRATOR_LAYER;

  const versionValid =
    actualVersion ===
    REQUIRED_ORCHESTRATOR_VERSION;

  const successValid =
    data?.success !== false;

  return {
    valid:
      layerValid &&
      versionValid &&
      successValid,

    layer_valid:
      layerValid,

    version_valid:
      versionValid,

    success_valid:
      successValid,

    expected_layer:
      REQUIRED_ORCHESTRATOR_LAYER,

    expected_version:
      REQUIRED_ORCHESTRATOR_VERSION,

    actual_layer:
      actualLayer,

    actual_version:
      actualVersion,

    reason:
      !layerValid
        ? "INVALID_ORCHESTRATOR_LAYER"
        : !versionValid
          ? "INVALID_ORCHESTRATOR_VERSION"
          : !successValid
            ? "ORCHESTRATOR_FAILED"
            : null
  };
}

// ------------------------------------------------------------
// Resolve PUBLISHED content
// ------------------------------------------------------------

async function getPublishedContents(
  db,
  maxContents
) {
  const result =
    await db
      .prepare(
        `
        SELECT *
        FROM content_engine
        WHERE status = 'PUBLISHED'
        ORDER BY created_at ASC
        LIMIT ?
        `
      )
      .bind(
        maxContents
      )
      .all();

  return result.results || [];
}

// ------------------------------------------------------------
// Scheduler history
// ------------------------------------------------------------

async function getLatestSchedulerRun(
  db
) {
  try {
    return await db
      .prepare(
        `
        SELECT *
        FROM ai_runs
        WHERE run_type = 'SCHEDULER'
        ORDER BY created_at DESC
        LIMIT 1
        `
      )
      .first();
  } catch (_) {
    return null;
  }
}

// ------------------------------------------------------------
// Check cooldown
// ------------------------------------------------------------

function calculateCooldown(
  latestRun,
  intervalMinutes
) {
  if (
    !latestRun?.created_at
  ) {
    return {
      blocked: false,
      next_run_at: null,
      remaining_minutes: 0
    };
  }

  const lastRun =
    new Date(
      latestRun.created_at
    ).getTime();

  if (
    !Number.isFinite(
      lastRun
    )
  ) {
    return {
      blocked: false,
      next_run_at: null,
      remaining_minutes: 0
    };
  }

  const intervalMs =
    intervalMinutes *
    60 *
    1000;

  const nextRun =
    lastRun +
    intervalMs;

  const now =
    Date.now();

  const remainingMs =
    Math.max(
      0,
      nextRun - now
    );

  return {
    blocked:
      remainingMs > 0,

    next_run_at:
      new Date(
        nextRun
      ).toISOString(),

    remaining_minutes:
      Math.ceil(
        remainingMs /
        60000
      )
  };
}

// ------------------------------------------------------------
// Call Orchestrator V1.1
// ------------------------------------------------------------

async function callOrchestrator(
  request,
  contentId
) {
  const url =
    new URL(
      "/api/orchestrator",
      request.url
    );

  const response =
    await fetch(
      url.toString(),
      {
        method: "POST",

        headers: {
          "content-type":
            "application/json",

          accept:
            "application/json"
        },

        body:
          JSON.stringify({
            mode:
              "execute",

            content_id:
              contentId
          })
      }
    );

  const text =
    await response.text();

  const data =
    parseJSON(
      text,
      {
        success: false,

        error:
          "Invalid JSON response from Orchestrator",

        http_status:
          response.status
      }
    );

  const validation =
    validateOrchestrator(
      data
    );

  return {
    ok:
      response.ok,

    status:
      response.status,

    data,

    validation
  };
}

// ------------------------------------------------------------
// Persist Scheduler trace
// ------------------------------------------------------------

async function saveSchedulerRun(
  db,
  inputData,
  outputData,
  status,
  priority = "NORMAL"
) {
  const now =
    new Date().toISOString();

  const runId =
    id();

  const insightId =
    id();

  await db
    .prepare(
      `
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
      `
    )
    .bind(
      runId,
      "SCHEDULER",
      "TATO_OS_SCHEDULER_V1.1",
      JSON.stringify(
        inputData
      ),
      JSON.stringify(
        outputData
      ),
      status,
      0,
      now
    )
    .run();

  await db
    .prepare(
      `
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
      `
    )
    .bind(
      insightId,
      runId,
      "SCHEDULER_RESULT",
      "TATO OS Scheduler V1.1",
      JSON.stringify(
        outputData
      ),
      1,
      priority,
      status,
      now
    )
    .run();

  return {
    run_id:
      runId,

    insight_id:
      insightId,

    created_at:
      now
  };
}

// ------------------------------------------------------------
// Build preview
// ------------------------------------------------------------

async function buildPreview(
  db,
  intervalMinutes,
  maxContents
) {
  const contents =
    await getPublishedContents(
      db,
      maxContents
    );

  const latestRun =
    await getLatestSchedulerRun(
      db
    );

  const cooldown =
    calculateCooldown(
      latestRun,
      intervalMinutes
    );

  return {
    success: true,

    layer:
      LAYER,

    version:
      VERSION,

    mode:
      "preview",

    status:
      cooldown.blocked
        ? "COOLDOWN"
        : contents.length
          ? "READY"
          : "NO_PUBLISHED_CONTENT",

    schedule: {
      interval_minutes:
        intervalMinutes,

      max_contents:
        maxContents,

      cooldown:
        cooldown
    },

    latest_run:
      latestRun
        ? {
            id:
              latestRun.id,

            status:
              latestRun.status,

            created_at:
              latestRun.created_at
          }
        : null,

    contents:
      contents.map(
        (
          content,
          index
        ) => ({
          order:
            index + 1,

          content_id:
            content.id,

          title:
            content.title || "",

          status:
            content.status || "",

          created_at:
            content.created_at ||
            null
        })
      ),

    pipeline: [
      {
        order: 1,

        layer:
          "CONTENT_MEASUREMENT_ENGINE_V2.2",

        version:
          "2.2",

        mode:
          "execute"
      },

      {
        order: 2,

        layer:
          "LEARNING_LAYER_V1",

        version:
          "1.0",

        mode:
          "execute"
      },

      {
        order: 3,

        layer:
          "DECISION_CYCLE_V1",

        version:
          "1.1",

        mode:
          "preview"
      },

      {
        order: 4,

        layer:
          "ACTION_CYCLE_V1",

        version:
          "1.1",

        mode:
          "preview"
      },

      {
        order: 5,

        layer:
          "EXECUTION_CYCLE_V1",

        version:
          "1.1",

        mode:
          "preview"
      }
    ],

    source_chain: {
      scheduler:
        "TATO_OS_SCHEDULER_V1.1",

      orchestrator:
        "TATO_OS_ORCHESTRATOR_V1.1",

      measurement:
        "CONTENT_MEASUREMENT_ENGINE_V2.2",

      intelligence:
        "INTELLIGENCE_LAYER_V2.1",

      learning:
        "LEARNING_LAYER_V1",

      decision:
        "DECISION_CYCLE_V1.1",

      action:
        "ACTION_CYCLE_V1.1",

      execution:
        "EXECUTION_CYCLE_V1.1",

      feedback:
        "FEEDBACK_LOOP_V1.5"
    },

    guardrails: {
      automatic_business_execution:
        false,

      strategy_change:
        false,

      content_mutation:
        false,

      customer_contact:
        false,

      payment_action:
        false,

      business_data_mutation:
        false,

      human_approval_required:
        true
    },

    next_step:
      cooldown.blocked
        ? "Scheduler is inside cooldown."
        : contents.length
          ? "POST {mode:'execute', approved:true} to run Scheduler V1.1."
          : "No PUBLISHED content is available."
  };
}

// ------------------------------------------------------------
// Execute Scheduler
// ------------------------------------------------------------

async function runScheduler(
  context,
  body
) {
  const {
    env,
    request
  } = context;

  if (!env?.DB) {
    throw new Error(
      "D1 binding DB is missing"
    );
  }

  const intervalMinutes =
    getIntervalMinutes(
      body
    );

  const maxContents =
    getMaxContents(
      body
    );

  const contents =
    await getPublishedContents(
      env.DB,
      maxContents
    );

  if (
    !contents.length
  ) {
    const result = {
      success: true,

      layer:
        LAYER,

      version:
        VERSION,

      mode:
        "execute",

      status:
        "NO_PUBLISHED_CONTENT",

      schedule: {
        interval_minutes:
          intervalMinutes,

        max_contents:
          maxContents
      },

      results: [],

      source_chain: {
        scheduler:
          "TATO_OS_SCHEDULER_V1.1",

        orchestrator:
          "TATO_OS_ORCHESTRATOR_V1.1"
      },

      guardrails: {
        automatic_business_execution:
          false,

        strategy_change:
          false,

        business_data_mutation:
          false,

        human_approval_required:
          true
      }
    };

    const persistence =
      await saveSchedulerRun(
        env.DB,
        {
          interval_minutes:
            intervalMinutes,

          max_contents:
            maxContents
        },
        result,
        "COMPLETED"
      );

    return {
      ...result,

      persistence
    };
  }

  const latestRun =
    await getLatestSchedulerRun(
      env.DB
    );

  const cooldown =
    calculateCooldown(
      latestRun,
      intervalMinutes
    );

  if (
    cooldown.blocked
  ) {
    const result = {
      success: true,

      layer:
        LAYER,

      version:
        VERSION,

      mode:
        "execute",

      status:
        "COOLDOWN",

      schedule: {
        interval_minutes:
          intervalMinutes,

        max_contents:
          maxContents,

        next_run_at:
          cooldown.next_run_at,

        remaining_minutes:
          cooldown.remaining_minutes
      },

      latest_run:
        latestRun
          ? {
              id:
                latestRun.id,

              status:
                latestRun.status,

              created_at:
                latestRun.created_at
            }
          : null,

      results: [],

      source_chain: {
        scheduler:
          "TATO_OS_SCHEDULER_V1.1",

        orchestrator:
          "TATO_OS_ORCHESTRATOR_V1.1"
      },

      guardrails: {
        automatic_business_execution:
          false,

        strategy_change:
          false,

        business_data_mutation:
          false,

        human_approval_required:
          true
      },

      next_step:
        "Wait until the scheduler cooldown expires."
    };

    return result;
  }

  const startedAt =
    new Date().toISOString();

  const results = [];

  let successful =
    0;

  let failed =
    0;

  let waitingForApproval =
    0;

  let invalidOrchestrator =
    0;

  for (
    const content
    of contents
  ) {
    try {
      const orchestration =
        await callOrchestrator(
          request,
          content.id
        );

      const data =
        orchestration.data;

      const validation =
        orchestration.validation;

      const status =
        data?.status ||
        (
          orchestration.ok
            ? "COMPLETED"
            : "FAILED"
        );

      if (
        !validation.valid
      ) {
        invalidOrchestrator += 1;
        failed += 1;

        results.push({
          content: {
            id:
              content.id,

            title:
              content.title || "",

            status:
              content.status || ""
          },

          status:
            "INVALID_ORCHESTRATOR",

          success:
            false,

          validation,

          orchestrator:
            data
        });

        continue;
      }

      if (
        orchestration.ok &&
        data?.success !== false
      ) {
        successful += 1;
      } else {
        failed += 1;
      }

      if (
        status ===
        "WAITING_FOR_HUMAN_APPROVAL"
      ) {
        waitingForApproval += 1;
      }

      results.push({
        content: {
          id:
            content.id,

          title:
            content.title || "",

          status:
            content.status || ""
        },

        status,

        success:
          orchestration.ok &&
          data?.success !== false,

        validation,

        orchestrator:
          data
      });
    } catch (error) {
      failed += 1;

      results.push({
        content: {
          id:
            content.id,

          title:
            content.title || "",

          status:
            content.status || ""
        },

        status:
          "ERROR",

        success:
          false,

        error:
          safeString(
            error?.message ||
            error
          )
      });
    }
  }

  const completedAt =
    new Date().toISOString();

  let schedulerStatus =
    "COMPLETED";

  if (
    failed > 0 &&
    successful === 0
  ) {
    schedulerStatus =
      "FAILED";
  } else if (
    failed > 0
  ) {
    schedulerStatus =
      "PARTIAL";
  } else if (
    waitingForApproval > 0
  ) {
    schedulerStatus =
      "WAITING_FOR_HUMAN_APPROVAL";
  }

  const output = {
    success:
      schedulerStatus !==
      "FAILED",

    layer:
      LAYER,

    version:
      VERSION,

    mode:
      "execute",

    status:
      schedulerStatus,

    schedule: {
      interval_minutes:
        intervalMinutes,

      max_contents:
        maxContents
    },

    source_chain: {
      scheduler:
        "TATO_OS_SCHEDULER_V1.1",

      orchestrator:
        "TATO_OS_ORCHESTRATOR_V1.1",

      measurement:
        "CONTENT_MEASUREMENT_ENGINE_V2.2",

      intelligence:
        "INTELLIGENCE_LAYER_V2.1",

      learning:
        "LEARNING_LAYER_V1",

      decision:
        "DECISION_CYCLE_V1.1",

      action:
        "ACTION_CYCLE_V1.1",

      execution:
        "EXECUTION_CYCLE_V1.1",

      feedback:
        "FEEDBACK_LOOP_V1.5"
    },

    summary: {
      total_contents:
        contents.length,

      successful:
        successful,

      failed:
        failed,

      invalid_orchestrator:
        invalidOrchestrator,

      waiting_for_human_approval:
        waitingForApproval
    },

    results,

    timing: {
      started_at:
        startedAt,

      completed_at:
        completedAt
    },

    version_validation: {
      orchestrator: {
        expected_layer:
          REQUIRED_ORCHESTRATOR_LAYER,

        expected_version:
          REQUIRED_ORCHESTRATOR_VERSION
      },

      cycles: {
        decision:
          "DECISION_CYCLE_V1.1",

        action:
          "ACTION_CYCLE_V1.1",

        execution:
          "EXECUTION_CYCLE_V1.1"
      }
    },

    guardrails: {
      automatic_business_execution:
        false,

      strategy_change:
        false,

      business_data_mutation:
        false,

      content_mutation:
        false,

      customer_contact:
        false,

      payment_action:
        false,

      human_approval_required:
        true
    },

    next_step:
      waitingForApproval > 0
        ? "Orchestrator V1.1 completed safely and stopped at Human Approval."
        : schedulerStatus ===
          "FAILED"
          ? "Scheduler failed. Inspect orchestrator validation and results."
          : "Scheduler completed the scheduled orchestration run."
  };

  const persistence =
    await saveSchedulerRun(
      env.DB,
      {
        interval_minutes:
          intervalMinutes,

        max_contents:
          maxContents,

        trigger:
          "SCHEDULER_RUN",

        orchestrator_version:
          REQUIRED_ORCHESTRATOR_VERSION,

        started_at:
          startedAt
      },
      output,
      schedulerStatus,
      waitingForApproval > 0
        ? "HIGH"
        : "NORMAL"
    );

  return {
    ...output,

    persistence
  };
}

// ------------------------------------------------------------
// GET
//
// Preview only.
// NEVER executes Orchestrator.
// ------------------------------------------------------------

export async function onRequestGet(
  context
) {
  try {
    const {
      env,
      request
    } = context;

    if (!env?.DB) {
      return json(
        {
          success: false,

          layer:
            LAYER,

          version:
            VERSION,

          error:
            "D1 binding DB is missing"
        },
        500
      );
    }

    const url =
      new URL(
        request.url
      );

    const intervalMinutes =
      numberValue(
        url.searchParams.get(
          "interval_minutes"
        ),
        DEFAULT_INTERVAL_MINUTES
      );

    const maxContents =
      numberValue(
        url.searchParams.get(
          "max_contents"
        ),
        DEFAULT_MAX_CONTENTS
      );

    const result =
      await buildPreview(
        env.DB,
        Math.max(
          1,
          Math.min(
            intervalMinutes,
            1440
          )
        ),
        Math.max(
          1,
          Math.min(
            maxContents,
            100
          )
        )
      );

    return json(
      result
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

        status:
          "ERROR",

        error:
          safeString(
            error?.message ||
            error
          )
      },
      500
    );
  }
}

// ------------------------------------------------------------
// POST
//
// Requires explicit approved:true.
//
// This approval only allows Scheduler to start the safe
// Orchestrator V1.1 loop.
//
// Orchestrator itself still stops at Human Approval.
// ------------------------------------------------------------

export async function onRequestPost(
  context
) {
  try {
    const {
      request
    } = context;

    let body = {};

    try {
      body =
        await request.json();
    } catch (_) {
      body = {};
    }

    if (
      body?.approved !== true
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
            "APPROVAL_REQUIRED",

          error:
            "Scheduler execution requires approved:true."
        },
        403
      );
    }

    const result =
      await runScheduler(
        context,
        body
      );

    return json(
      result,
      result.success === false
        ? 500
        : 200
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

        status:
          "ERROR",

        error:
          safeString(
            error?.message ||
            error
          )
      },
      500
    );
  }
}
