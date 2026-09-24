// TATO-OS
// Action Layer V1.0
// Route: /api/action-ai
//
// Chain:
// Measurement V2.2
// -> Intelligence V2.1
// -> Learning V1
// -> Decision V1
// -> Action V1
//
// IMPORTANT:
// Action V1 creates an executable action proposal.
// It does NOT execute business actions automatically.
// Human approval is required before execution.

const LAYER = "ACTION_LAYER_V1";
const VERSION = "1.0";

const MEASUREMENT_SOURCE = "CONTENT_MEASUREMENT_ENGINE_V2.2";
const INTELLIGENCE_SOURCE = "INTELLIGENCE_LAYER_V2.1";
const LEARNING_SOURCE = "LEARNING_LAYER_V1";
const DECISION_SOURCE = "DECISION_LAYER_V1";

const ATTENTION_TYPE = "weighted_behavioral_signal";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function now() {
  return new Date().toISOString();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function getContent(db, contentId) {
  return await db
    .prepare(`
      SELECT
        id,
        title,
        status,
        objective,
        attention_type,
        market_keyword,
        angle,
        cta
      FROM content_engine
      WHERE id = ?
      LIMIT 1
    `)
    .bind(contentId)
    .first();
}

async function getMeasurements(db, contentId) {
  const result = await db
    .prepare(`
      SELECT
        id,
        content_id,
        measured_at,
        attention,
        product_views,
        clicks,
        engagements,
        customers,
        orders,
        revenue
      FROM content_measurements
      WHERE content_id = ?
      ORDER BY measured_at DESC
      LIMIT 50
    `)
    .bind(contentId)
    .all();

  return result?.results || [];
}

function summarizeMeasurements(rows) {
  return rows.reduce(
    (acc, row) => {
      acc.attention += num(row.attention);
      acc.clicks += num(row.clicks);
      acc.product_views += num(row.product_views);
      acc.engagements += num(row.engagements);
      acc.customers += num(row.customers);
      acc.orders += num(row.orders);
      acc.revenue += num(row.revenue);
      return acc;
    },
    {
      attention: 0,
      clicks: 0,
      product_views: 0,
      engagements: 0,
      customers: 0,
      orders: 0,
      revenue: 0
    }
  );
}

function buildDecisionSummary(totals, rounds) {
  if (
    totals.attention > 0 &&
    totals.clicks > 0 &&
    totals.product_views === 0
  ) {
    return {
      state: "DECISION_READY",
      decision_type: "DOWNSTREAM_INVESTIGATION",
      decision: "INVESTIGATE_CLICK_TO_PRODUCT_PATH",
      priority: "HIGH",
      confidence: "HIGH",
      rounds
    };
  }

  return {
    state: "DECISION_READY",
    decision_type: "OBSERVATION",
    decision: "CONTINUE_MEASUREMENT",
    priority: "LOW",
    confidence: "LOW",
    rounds
  };
}

function buildAction(decision, content, totals) {
  if (
    decision.decision ===
    "INVESTIGATE_CLICK_TO_PRODUCT_PATH"
  ) {
    return {
      state: "ACTION_PROPOSED",

      action_type: "FUNNEL_PATH_AUDIT",

      action_name:
        "AUDIT_CLICK_TO_PRODUCT_VIEW_PATH",

      objective:
        "ตรวจสอบว่า Click จาก Content สามารถเดินทางไปถึง Product View ได้จริงหรือไม่",

      target: {
        content_id: content.id,
        content_title: content.title,
        funnel_stage_from: "CONTENT_CLICK",
        funnel_stage_to: "PRODUCT_VIEW"
      },

      trigger: {
        type: "DECISION_TRIGGER",
        decision: decision.decision
      },

      evidence: {
        attention: totals.attention,
        clicks: totals.clicks,
        product_views: totals.product_views,
        customers: totals.customers,
        orders: totals.orders,
        revenue: totals.revenue
      },

      proposed_steps: [
        {
          step: 1,
          action: "VERIFY_CLICK_EVENT",
          description:
            "ตรวจสอบว่า Content Click ถูกส่ง event และบันทึก session/source ถูกต้อง"
        },
        {
          step: 2,
          action: "VERIFY_DESTINATION",
          description:
            "ตรวจสอบปลายทางของ Click ว่าพาไปยังหน้าหรือเส้นทาง Product จริง"
        },
        {
          step: 3,
          action: "VERIFY_PRODUCT_VIEW_EVENT",
          description:
            "ตรวจสอบว่า Product View event ถูกยิงและถูกผูกกับ session เดียวกัน"
        },
        {
          step: 4,
          action: "VERIFY_ATTRIBUTION",
          description:
            "ตรวจสอบ attribution ระหว่าง Click → Product View"
        },
        {
          step: 5,
          action: "REMEASURE",
          description:
            "เก็บ Measurement รอบใหม่หลังตรวจสอบ"
        }
      ],

      expected_signal:
        "CLICK_TO_PRODUCT_VIEW_PATH_VERIFIED",

      status: "PENDING_APPROVAL"
    };
  }

  return {
    state: "ACTION_PROPOSED",

    action_type: "CONTINUE_MEASUREMENT",

    action_name:
      "CONTINUE_CONTENT_MEASUREMENT",

    objective:
      "เก็บข้อมูลเพิ่มเติมก่อนสร้าง Action ที่เฉพาะเจาะจง",

    target: {
      content_id: content.id,
      content_title: content.title
    },

    trigger: {
      type: "DECISION_TRIGGER",
      decision: decision.decision
    },

    evidence: {
      attention: totals.attention,
      clicks: totals.clicks,
      product_views: totals.product_views,
      customers: totals.customers,
      orders: totals.orders,
      revenue: totals.revenue
    },

    proposed_steps: [
      {
        step: 1,
        action: "CONTINUE_MEASUREMENT",
        description:
          "เก็บพฤติกรรมเพิ่มเติม"
      }
    ],

    expected_signal:
      "ADDITIONAL_MEASUREMENT_AVAILABLE",

    status: "PENDING_APPROVAL"
  };
}

function buildGuardrails() {
  return {
    winner_declared: false,
    strategy_change: false,
    automatic_execution: false,
    action_executed: false,

    approval_required: true,

    human_approval_required: true,

    external_side_effects: false,

    business_data_mutation: false,

    content_mutation: false,

    customer_contact: false,

    payment_action: false,

    requires_execution_layer: true
  };
}

async function saveActionProposal(
  db,
  content,
  decision,
  action,
  totals
) {
  const runId = crypto.randomUUID();
  const insightId = crypto.randomUUID();
  const createdAt = now();

  const inputData = {
    content_id: content.id,

    source_chain: {
      measurement: MEASUREMENT_SOURCE,
      intelligence: INTELLIGENCE_SOURCE,
      learning: LEARNING_SOURCE,
      decision: DECISION_SOURCE,
      action: LAYER
    },

    decision,

    evidence: totals
  };

  const outputData = {
    action,
    guardrails: buildGuardrails()
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
      "ACTION_LAYER_V1",
      "TATO-ACTION-ENGINE-V1",
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
      runId,
      "ACTION_PROPOSAL",
      action.action_name,
      JSON.stringify(outputData),
      action.state === "ACTION_PROPOSED"
        ? 1
        : 0.5,
      decision.priority,
      "PENDING_APPROVAL",
      createdAt
    )
    .run();

  return {
    run_id: runId,
    insight_id: insightId,
    saved_at: createdAt
  };
}

async function executeProposal(db, proposalId) {
  /*
   * V1.0 deliberately DOES NOT execute a real business action.
   *
   * This endpoint only records that an approval request
   * has reached the execution boundary.
   *
   * Real execution belongs to the dedicated Execution Layer
   * after the Action Layer has been validated.
   */

  return {
    executed: false,

    execution_state:
      "BLOCKED_BY_EXECUTION_LAYER",

    proposal_id:
      proposalId || null,

    reason:
      "Action Layer V1.0 creates proposals only. Real execution requires a dedicated Execution Layer.",

    guardrails: {
      automatic_execution: false,
      action_executed: false,
      human_approval_required: true,
      execution_layer_required: true
    }
  };
}

async function analyze(request, env, mode = "preview") {
  const db = env.DB;

  if (!db) {
    throw new Error("D1 binding DB not found");
  }

  const url = new URL(request.url);

  let body = {};

  if (request.method === "POST") {
    body = await request
      .clone()
      .json()
      .catch(() => ({}));
  }

  const contentId =
    url.searchParams.get("content_id") ||
    body.content_id;

  if (!contentId) {
    throw new Error("content_id is required");
  }

  const content = await getContent(
    db,
    contentId
  );

  if (!content) {
    throw new Error("Content not found");
  }

  const measurements =
    await getMeasurements(
      db,
      contentId
    );

  if (!measurements.length) {
    throw new Error(
      "No measurement data found for content"
    );
  }

  const totals =
    summarizeMeasurements(measurements);

  const decision =
    buildDecisionSummary(
      totals,
      measurements.length
    );

  const action =
    buildAction(
      decision,
      content,
      totals
    );

  const guardrails =
    buildGuardrails();

  let persistence = null;
  let execution = null;

  if (mode === "execute") {
    persistence =
      await saveActionProposal(
        db,
        content,
        decision,
        action,
        totals
      );

    execution =
      await executeProposal(
        db,
        persistence.insight_id
      );
  }

  return {
    success: true,

    layer: LAYER,

    version: VERSION,

    mode,

    status: "ACTION_PROPOSED",

    content: {
      id: content.id,
      title: content.title,
      status: content.status
    },

    source_chain: {
      measurement: MEASUREMENT_SOURCE,
      intelligence: INTELLIGENCE_SOURCE,
      learning: LEARNING_SOURCE,
      decision: DECISION_SOURCE,
      action: LAYER
    },

    measurement: {
      rounds: measurements.length,
      attention: totals.attention,
      clicks: totals.clicks,
      product_views: totals.product_views,
      engagements: totals.engagements,
      customers: totals.customers,
      orders: totals.orders,
      revenue: totals.revenue
    },

    decision,

    action,

    guardrails,

    persistence,

    execution,

    next_step:
      "Action proposal ready. Human approval and dedicated Execution Layer are required before real execution."
  };
}

export async function onRequestGet(context) {
  try {
    const url = new URL(
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
            "/api/action-ai?content_id=YOUR_CONTENT_ID"
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

export async function onRequestPost(context) {
  try {
    const body =
      await context.request
        .clone()
        .json()
        .catch(() => ({}));

    const mode =
      body?.mode === "execute"
        ? "execute"
        : "preview";

    const result =
      await analyze(
        context.request,
        context.env,
        mode
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
