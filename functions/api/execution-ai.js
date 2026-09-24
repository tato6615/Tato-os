// TATO-OS
// Execution Layer V1.0
// Route: /api/execution-ai
//
// Chain:
// Measurement V2.2
// -> Intelligence V2.1
// -> Learning V1
// -> Decision V1
// -> Action V1
// -> Execution V1
//
// V1 Execution:
// Executes FUNNEL_PATH_AUDIT only.
// This is a READ-ONLY diagnostic action.
// No content mutation.
// No customer contact.
// No payment.
// No strategy change.
// No external side effects.

const LAYER = "EXECUTION_LAYER_V1";
const VERSION = "1.0";

const MEASUREMENT_SOURCE = "CONTENT_MEASUREMENT_ENGINE_V2.2";
const INTELLIGENCE_SOURCE = "INTELLIGENCE_LAYER_V2.1";
const LEARNING_SOURCE = "LEARNING_LAYER_V1";
const DECISION_SOURCE = "DECISION_LAYER_V1";
const ACTION_SOURCE = "ACTION_LAYER_V1";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeEvent(row) {
  const event = {};

  for (const [key, value] of Object.entries(row || {})) {
    event[key] = value;
  }

  return event;
}

function eventType(event) {
  return String(
    event.event_type ||
    event.type ||
    event.event ||
    ""
  ).toLowerCase();
}

function contentIdOf(event) {
  return (
    event.content_id ||
    event.contentId ||
    event.content ||
    null
  );
}

function sessionIdOf(event) {
  return (
    event.session_id ||
    event.sessionId ||
    event.session ||
    null
  );
}

function createdAtOf(event) {
  return (
    event.created_at ||
    event.createdAt ||
    event.timestamp ||
    event.time ||
    null
  );
}

function isClick(event) {
  return eventType(event) === "content_click";
}

function isProductView(event) {
  return eventType(event) === "product_view";
}

function isContentView(event) {
  return eventType(event) === "content_view";
}

async function getBehaviorEvents(db, contentId) {
  /*
   * SELECT * is intentional in V1.
   * The diagnostic layer must tolerate the current
   * behavior_events schema without assuming optional
   * column names.
   */

  const result = await db
    .prepare(`
      SELECT *
      FROM behavior_events
      WHERE content_id = ?
      ORDER BY created_at ASC
      LIMIT 1000
    `)
    .bind(contentId)
    .all();

  return (result?.results || []).map(normalizeEvent);
}

function findDownstreamEvents(events, click) {
  const clickTimeRaw = createdAtOf(click);
  const clickTime = clickTimeRaw
    ? new Date(clickTimeRaw).getTime()
    : NaN;

  const clickSession = sessionIdOf(click);

  return events.filter((event) => {
    if (!isProductView(event)) {
      return false;
    }

    const productSession = sessionIdOf(event);

    if (
      clickSession &&
      productSession &&
      clickSession === productSession
    ) {
      return true;
    }

    const productTimeRaw = createdAtOf(event);
    const productTime = productTimeRaw
      ? new Date(productTimeRaw).getTime()
      : NaN;

    if (
      Number.isFinite(clickTime) &&
      Number.isFinite(productTime) &&
      productTime >= clickTime &&
      productTime <= clickTime + 24 * 60 * 60 * 1000
    ) {
      return true;
    }

    return false;
  });
}

function auditClickToProduct(events) {
  const clicks = events.filter(isClick);
  const productViews = events.filter(isProductView);

  const matched = [];

  for (const click of clicks) {
    const downstream = findDownstreamEvents(
      events,
      click
    );

    if (downstream.length > 0) {
      matched.push({
        click: {
          event_type: eventType(click),
          session_id: sessionIdOf(click),
          created_at: createdAtOf(click)
        },
        product_views: downstream.map((event) => ({
          event_type: eventType(event),
          session_id: sessionIdOf(event),
          created_at: createdAtOf(event),
          product_id:
            event.product_id ||
            event.productId ||
            null
        }))
      });
    }
  }

  return {
    content_events: events.length,

    content_views: events.filter(
      isContentView
    ).length,

    clicks: clicks.length,

    product_views: productViews.length,

    matched_click_to_product_view:
      matched.length,

    unmatched_clicks:
      Math.max(
        clicks.length - matched.length,
        0
      ),

    conversion:
      clicks.length > 0
        ? matched.length / clicks.length
        : 0,

    matched,

    finding:
      matched.length > 0
        ? "CLICK_TO_PRODUCT_VIEW_CONFIRMED"
        : clicks.length > 0
          ? "CLICK_TO_PRODUCT_VIEW_NOT_CONFIRMED"
          : "NO_CLICK_EVENT_FOUND"
  };
}

function buildExecutionResult(
  contentId,
  audit
) {
  if (
    audit.finding ===
    "CLICK_TO_PRODUCT_VIEW_CONFIRMED"
  ) {
    return {
      state: "EXECUTED",

      result_type:
        "DOWNSTREAM_PATH_CONFIRMED",

      finding:
        "CLICK_TO_PRODUCT_VIEW_CONFIRMED",

      interpretation:
        "พบ Product View ที่สามารถเชื่อมโยงกับ Click ได้จาก behavior_events",

      next_learning_signal:
        "CLICK_TO_PRODUCT_VIEW_PATH_VERIFIED"
    };
  }

  if (
    audit.finding ===
    "CLICK_TO_PRODUCT_VIEW_NOT_CONFIRMED"
  ) {
    return {
      state: "EXECUTED",

      result_type:
        "DOWNSTREAM_PATH_NOT_CONFIRMED",

      finding:
        "CLICK_TO_PRODUCT_VIEW_NOT_CONFIRMED",

      interpretation:
        "พบ Content Click แต่ยังไม่พบ Product View ที่สามารถเชื่อมโยงได้จาก behavior_events",

      next_learning_signal:
        "CLICK_TO_PRODUCT_VIEW_PATH_REMAINS_BLOCKED"
    };
  }

  return {
    state: "EXECUTED",

    result_type:
      "INSUFFICIENT_CLICK_DATA",

    finding:
      "NO_CLICK_EVENT_FOUND",

    interpretation:
      "ยังไม่พบ Content Click ใน behavior_events",

    next_learning_signal:
      "ADDITIONAL_BEHAVIOR_DATA_REQUIRED"
  };
}

async function saveExecution(
  db,
  contentId,
  audit,
  executionResult
) {
  const runId = crypto.randomUUID();
  const insightId = crypto.randomUUID();
  const createdAt =
    new Date().toISOString();

  const inputData = {
    content_id: contentId,

    source_chain: {
      measurement: MEASUREMENT_SOURCE,
      intelligence: INTELLIGENCE_SOURCE,
      learning: LEARNING_SOURCE,
      decision: DECISION_SOURCE,
      action: ACTION_SOURCE,
      execution: LAYER
    },

    execution_type:
      "FUNNEL_PATH_AUDIT",

    read_only: true
  };

  const outputData = {
    audit,
    execution: executionResult,

    guardrails: {
      automatic_execution: false,
      action_executed: true,
      business_data_mutation: false,
      content_mutation: false,
      customer_contact: false,
      payment_action: false,
      strategy_change: false,
      winner_declared: false
    }
  };

  await db
    .prepare(`
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
      "EXECUTION_LAYER_V1",
      "TATO-EXECUTION-ENGINE-V1",
      JSON.stringify(inputData),
      JSON.stringify(outputData),
      "COMPLETED",
      0,
      createdAt
    )
    .run();

  await db
    .prepare(`
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
      "EXECUTION_RESULT",
      executionResult.result_type,
      JSON.stringify(outputData),
      1,
      "HIGH",
      "COMPLETED",
      createdAt
    )
    .run();

  return {
    run_id: runId,
    insight_id: insightId,
    saved_at: createdAt
  };
}

async function analyze(
  request,
  env,
  mode = "preview"
) {
  const db = env.DB;

  if (!db) {
    throw new Error(
      "D1 binding DB not found"
    );
  }

  const url =
    new URL(request.url);

  let body = {};

  if (request.method === "POST") {
    body =
      await request
        .clone()
        .json()
        .catch(() => ({}));
  }

  const contentId =
    url.searchParams.get(
      "content_id"
    ) ||
    body.content_id;

  if (!contentId) {
    throw new Error(
      "content_id is required"
    );
  }

  const events =
    await getBehaviorEvents(
      db,
      contentId
    );

  const audit =
    auditClickToProduct(
      events
    );

  const executionResult =
    buildExecutionResult(
      contentId,
      audit
    );

  let persistence = null;

  if (mode === "execute") {
    persistence =
      await saveExecution(
        db,
        contentId,
        audit,
        executionResult
      );
  }

  return {
    success: true,

    layer: LAYER,

    version: VERSION,

    mode,

    status:
      mode === "execute"
        ? "EXECUTED"
        : "PREVIEW",

    content: {
      id: contentId
    },

    source_chain: {
      measurement:
        MEASUREMENT_SOURCE,
      intelligence:
        INTELLIGENCE_SOURCE,
      learning:
        LEARNING_SOURCE,
      decision:
        DECISION_SOURCE,
      action:
        ACTION_SOURCE,
      execution:
        LAYER
    },

    execution: {
      type: "FUNNEL_PATH_AUDIT",

      read_only: true,

      audit,

      result:
        mode === "execute"
          ? executionResult
          : {
              state:
                "READY_TO_EXECUTE",

              result_type:
                "FUNNEL_PATH_AUDIT",

              note:
                "GET preview does not persist or execute the action."
            }
    },

    guardrails: {
      automatic_execution: false,

      action_executed:
        mode === "execute",

      business_data_mutation: false,

      content_mutation: false,

      customer_contact: false,

      payment_action: false,

      strategy_change: false,

      winner_declared: false
    },

    persistence,

    next_step:
      mode === "execute"
        ? "Execution completed. Feed execution result back into Measurement and Learning."
        : "Execution preview ready. POST mode=execute to run the read-only funnel audit."
  };
}

export async function onRequestGet(
  context
) {
  try {
    const url =
      new URL(
        context.request.url
      );

    const contentId =
      url.searchParams.get(
        "content_id"
      );

    if (!contentId) {
      return json(
        {
          success: false,
          layer: LAYER,
          version: VERSION,
          error:
            "content_id is required",
          example:
            "/api/execution-ai?content_id=YOUR_CONTENT_ID"
        },
        400
      );
    }

    const result =
      await analyze(
        context.request,
        context.env,
        "preview"
      );

    return json(result);

  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}

export async function onRequestPost(
  context
) {
  try {
    const body =
      await context.request
        .clone()
        .json()
        .catch(() => ({}));

    /*
     * Explicit approval is required.
     * This prevents accidental execution.
     */
    if (body?.approved !== true) {
      return json(
        {
          success: false,

          layer: LAYER,

          version: VERSION,

          status:
            "APPROVAL_REQUIRED",

          error:
            "approved:true is required before execution",

          guardrails: {
            automatic_execution: false,
            action_executed: false,
            human_approval_required: true
          }
        },
        403
      );
    }

    const result =
      await analyze(
        context.request,
        context.env,
        "execute"
      );

    return json(result);

  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}
