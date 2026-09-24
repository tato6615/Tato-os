// ============================================================
// TATO-OS
// SCHEDULER V1.0
//
// Purpose:
// - Control when TATO OS Orchestrator should run.
// - Discover PUBLISHED content.
// - Prevent duplicate runs inside the configured interval.
// - Trigger Orchestrator only.
// - NEVER bypass human approval.
// - NEVER change strategy/content/customer/payment.
//
// Flow:
// Scheduler
//   -> Orchestrator
//   -> Measurement
//   -> Learning
//   -> Decision Preview
//   -> Action Preview
//   -> Execution Preview
//   -> STOP at Human Approval
// ============================================================

const LAYER = "TATO_OS_SCHEDULER";
const VERSION = "1.0";

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
  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

function parseJSON(value, fallback = null) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch (_) {
    return fallback;
  }
}

function numberValue(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function getIntervalMinutes(body) {
  const value = numberValue(
    body?.interval_minutes,
    DEFAULT_INTERVAL_MINUTES
  );

  return Math.max(
    1,
    Math.min(value, 1440)
  );
}

function getMaxContents(body) {
  const value = numberValue(
    body?.max_contents,
    DEFAULT_MAX_CONTENTS
  );

  return Math.max(
    1,
    Math.min(value, 100)
  );
}

// ------------------------------------------------------------
// Resolve PUBLISHED content
// ------------------------------------------------------------

async function getPublishedContents(
  db,
  maxContents
) {
  const result = await db
    .prepare(
      `
      SELECT *
      FROM content_engine
      WHERE status = 'PUBLISHED'
      ORDER BY created_at ASC
      LIMIT ?
      `
    )
    .bind(maxContents)
    .all();

  return result.results || [];
}

// ------------------------------------------------------------
// Scheduler history
//
// Uses ai_runs because this table is already part of the
// verified TATO OS schema.
// ------------------------------------------------------------

async function getLatestSchedulerRun(db) {
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
  if (!latestRun?.created_at) {
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

  if (!Number.isFinite(lastRun)) {
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
// Call Orchestrator
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

  return {
    ok:
      response.ok,

    status:
      response.status,

    data
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
      "TATO_OS_SCHEDULER_V1",
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
      "TATO OS Scheduler V1",
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
        (content, index) => ({
          order:
            index + 1,

          content_id:
            content.id,

          title:
            content.title || "",

          status:
            content.status || "",

          created_at:
            content.created_at || null
        })
      ),

    pipeline: [
      {
        order: 1,

        layer:
          "CONTENT_MEASUREMENT_ENGINE_V2.2",

        mode:
          "execute"
      },

      {
        order: 2,

        layer:
          "LEARNING_LAYER_V1",

        mode:
          "execute"
      },

      {
        order: 3,

        layer:
          "DECISION_CYCLE_V1.0",

        mode:
          "preview"
      },

      {
        order: 4,

        layer:
          "ACTION_CYCLE_V1.0",

        mode:
          "preview"
      },

      {
        order: 5,

        layer:
          "EXECUTION_CYCLE_V1.1",

        mode:
          "preview"
      }
    ],

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
          ? "POST {mode:'execute', approved:true} to run the scheduled orchestration."
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

  if (!contents.length) {
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

  if (cooldown.blocked) {
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

      const status =
        data?.status ||
        (
          orchestration.ok
            ? "COMPLETED"
            : "FAILED"
        );

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

    summary: {
      total_contents:
        contents.length,

      successful:
        successful,

      failed:
        failed,

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
        ? "Orchestrator completed safely and stopped at Human Approval."
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
// Orchestrator loop. It does NOT approve business execution.
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
