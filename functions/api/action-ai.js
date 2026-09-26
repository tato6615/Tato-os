// TATO-OS
// Action Layer V1.1
// Route: /api/action-ai
//
// Chain:
// Measurement V2.3
// -> Intelligence V2.1
// -> Learning V2.3
// -> Decision V1.1
// -> Action V1.1
//
// Purpose:
// Convert a validated Decision proposal into a governed Action proposal.
//
// Guardrails:
// - Reads Decision Layer output only.
// - Does NOT read raw behavior_events.
// - Does NOT recalculate Measurement.
// - Does NOT recalculate Intelligence or Learning.
// - Does NOT declare a winner.
// - Does NOT change strategy.
// - Does NOT execute business actions.
// - Human approval is required before persistence/execution boundary.
//
// GET = preview.
// POST with { approved:true } = persist the Action proposal.
// Real execution belongs to the Execution Layer.

const LAYER = "ACTION_LAYER_V1.1";
const VERSION = "1.1";

const MEASUREMENT_SOURCE = "CONTENT_MEASUREMENT_ENGINE_V2.3";
const INTELLIGENCE_SOURCE = "INTELLIGENCE_V2.1_FEEDBACK_AWARE";
const LEARNING_SOURCE = "LEARNING_V2.3_FEEDBACK_AWARE";
const DECISION_SOURCE = "DECISION_LAYER_V1.1";

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

function getContentId(request, body = {}) {
  const url = new URL(request.url);
  return url.searchParams.get("content_id") || body.content_id || null;
}

async function getDecision(request, contentId) {
  const requestUrl = new URL(request.url);
  const decisionUrl =
    `${requestUrl.origin}/api/decision-ai?content_id=${encodeURIComponent(contentId)}`;

  const response = await fetch(decisionUrl, {
    method: "GET",
    headers: {
      "Accept": "application/json"
    }
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok || !data?.success) {
    return {
      ok: false,
      status: response.status,
      data,
      error: "DECISION_LAYER_REQUEST_FAILED"
    };
  }

  if (
    data.layer !== DECISION_SOURCE ||
    String(data.version) !== "1.1"
  ) {
    return {
      ok: false,
      status: 409,
      data,
      error: "DECISION_LAYER_CONTRACT_MISMATCH",
      expected: {
        layer: DECISION_SOURCE,
        version: "1.1"
      },
      received: {
        layer: data.layer || null,
        version: data.version || null
      }
    };
  }

  const sourceChain = data.source_chain || {};

  if (
    sourceChain.measurement !== MEASUREMENT_SOURCE ||
    sourceChain.intelligence !== INTELLIGENCE_SOURCE ||
    sourceChain.learning !== LEARNING_SOURCE ||
    sourceChain.decision !== DECISION_SOURCE
  ) {
    return {
      ok: false,
      status: 409,
      data,
      error: "DECISION_SOURCE_CHAIN_INVALID",
      expected: {
        measurement: MEASUREMENT_SOURCE,
        intelligence: INTELLIGENCE_SOURCE,
        learning: LEARNING_SOURCE,
        decision: DECISION_SOURCE
      },
      received: sourceChain
    };
  }

  const decision = data.decision || {};
  const guardrails = decision.guardrails || {};

  if (
    guardrails.reads_raw_behavior_events === true ||
    guardrails.recalculates_measurement === true ||
    guardrails.recalculates_intelligence === true ||
    guardrails.winner_declared === true ||
    guardrails.strategy_change === true ||
    guardrails.automatic_execution === true ||
    guardrails.action_executed === true
  ) {
    return {
      ok: false,
      status: 409,
      data,
      error: "DECISION_GUARDRAIL_VIOLATION"
    };
  }

  return {
    ok: true,
    status: response.status,
    data,
    decision,
    sourceChain
  };
}

function buildAction(decisionResult) {
  const decision = decisionResult.decision || {};
  const measurement = decisionResult.measurement || {};
  const content = decisionResult.content || {};

  if (
    decision.decision_type === "DOWNSTREAM_INVESTIGATION" &&
    decision.decision === "INVESTIGATE_CLICK_TO_PRODUCT_PATH" &&
    decision.next_action_candidate?.type === "FUNNEL_PATH_AUDIT"
  ) {
    return {
      state: "ACTION_PROPOSED",
      action_type: "FUNNEL_PATH_AUDIT",
      action_name: "AUDIT_CLICK_TO_PRODUCT_VIEW_PATH",
      objective:
        "ตรวจสอบว่า Click จาก Content สามารถเดินทางไปถึง Product View และถูกวัด attribution ได้จริงหรือไม่",
      target: {
        content_id: content.id,
        content_title: content.title,
        funnel_stage_from: "CONTENT_CLICK",
        funnel_stage_to: "PRODUCT_VIEW"
      },
      trigger: {
        type: "DECISION_TRIGGER",
        decision: decision.decision,
        decision_type: decision.decision_type
      },
      evidence: {
        rounds: num(measurement.rounds),
        attention: num(measurement.attention),
        clicks: num(measurement.clicks),
        product_views: num(measurement.product_views),
        engagements: num(measurement.engagements),
        customers: num(measurement.customers),
        orders: num(measurement.orders),
        revenue: num(measurement.revenue)
      },
      proposed_steps: [
        {
          step: 1,
          action: "VERIFY_CLICK_EVENT",
          description:
            "ตรวจสอบว่า Content Click ถูกส่ง event และบันทึก source/session ถูกต้อง"
        },
        {
          step: 2,
          action: "VERIFY_DESTINATION",
          description:
            "ตรวจสอบปลายทางของ Click ว่าพาไปยัง Product path จริง"
        },
        {
          step: 3,
          action: "VERIFY_PRODUCT_VIEW_EVENT",
          description:
            "ตรวจสอบว่า Product View event ถูกยิงหลัง Click และผูก attribution ได้"
        },
        {
          step: 4,
          action: "VERIFY_ATTRIBUTION",
          description:
            "ตรวจสอบความสัมพันธ์ Click → Product View โดยใช้ session/time attribution"
        },
        {
          step: 5,
          action: "REMEASURE",
          description:
            "เก็บ Measurement รอบใหม่หลังตรวจสอบ"
        }
      ],
      expected_signal: "CLICK_TO_PRODUCT_VIEW_PATH_VERIFIED",
      status: "PENDING_APPROVAL"
    };
  }

  return {
    state: "ACTION_PROPOSED",
    action_type: "CONTINUE_MEASUREMENT",
    action_name: "CONTINUE_CONTENT_MEASUREMENT",
    objective: "เก็บหลักฐานเพิ่มเติมก่อนสร้าง Action ที่เฉพาะเจาะจง",
    target: {
      content_id: content.id,
      content_title: content.title
    },
    trigger: {
      type: "DECISION_TRIGGER",
      decision: decision.decision,
      decision_type: decision.decision_type
    },
    evidence: {
      rounds: num(measurement.rounds),
      attention: num(measurement.attention),
      clicks: num(measurement.clicks),
      product_views: num(measurement.product_views),
      engagements: num(measurement.engagements),
      customers: num(measurement.customers),
      orders: num(measurement.orders),
      revenue: num(measurement.revenue)
    },
    proposed_steps: [
      {
        step: 1,
        action: "CONTINUE_MEASUREMENT",
        description: "เก็บพฤติกรรมเพิ่มเติมจาก Measurement"
      }
    ],
    expected_signal: "ADDITIONAL_MEASUREMENT_AVAILABLE",
    status: "PENDING_APPROVAL"
  };
}

function buildGuardrails() {
  return {
    reads_raw_behavior_events: false,
    recalculates_measurement: false,
    recalculates_intelligence: false,
    recalculates_learning: false,
    winner_declared: false,
    strategy_change: false,
    automatic_execution: false,
    action_executed: false,
    business_data_mutation: false,
    content_mutation: false,
    customer_contact: false,
    payment_action: false,
    human_approval_required: true,
    requires_execution_layer: true
  };
}

async function saveAction(db, content, decisionResult, action) {
  const runId = crypto.randomUUID();
  const insightId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const inputData = {
    content_id: content.id,
    source_chain: {
      measurement: MEASUREMENT_SOURCE,
      intelligence: INTELLIGENCE_SOURCE,
      learning: LEARNING_SOURCE,
      decision: DECISION_SOURCE,
      action: LAYER
    },
    source_of_truth: {
      type: DECISION_SOURCE,
      decision_version: "1.1",
      decision_content_id: content.id
    },
    decision: decisionResult.decision,
    measurement: decisionResult.measurement
  };

  const outputData = {
    action,
    guardrails: buildGuardrails()
  };

  await db.prepare(`
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
    "ACTION_LAYER_V1.1",
    "TATO-ACTION-ENGINE-V1.1",
    JSON.stringify(inputData),
    JSON.stringify(outputData),
    "COMPLETED",
    0,
    createdAt
  ).run();

  await db.prepare(`
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
    "ACTION_PROPOSAL",
    action.action_name,
    JSON.stringify(outputData),
    1,
    decisionResult.decision?.priority || "NORMAL",
    "PENDING_APPROVAL",
    createdAt
  ).run();

  return {
    run_id: runId,
    insight_id: insightId,
    saved_at: createdAt
  };
}

async function analyze(request, env, mode = "preview") {
  const db = env.DB;

  if (!db) {
    throw new Error("D1 binding DB not found");
  }

  let body = {};

  if (request.method === "POST") {
    body = await request.clone().json().catch(() => ({}));
  }

  const contentId = getContentId(request, body);

  if (!contentId) {
    throw new Error("content_id is required");
  }

  const decisionSource = await getDecision(request, contentId);

  if (!decisionSource.ok) {
    const error = new Error(
      decisionSource.error || "Decision Layer request failed"
    );
    error.status = decisionSource.status || 500;
    error.details = decisionSource;
    throw error;
  }

  const decisionResult = decisionSource.data;
  const action = buildAction(decisionResult);
  const guardrails = buildGuardrails();

  let persistence = null;

  if (mode === "execute") {
    persistence = await saveAction(
      db,
      decisionResult.content,
      decisionResult,
      action
    );
  }

  return {
    success: true,
    layer: LAYER,
    version: VERSION,
    mode,
    status: "ACTION_PROPOSED",

    content: decisionResult.content,

    source_chain: {
      measurement: MEASUREMENT_SOURCE,
      intelligence: INTELLIGENCE_SOURCE,
      learning: LEARNING_SOURCE,
      decision: DECISION_SOURCE,
      action: LAYER
    },

    source_of_truth: {
      type: DECISION_SOURCE,
      version: "1.1",
      decision_content_id: decisionResult.content?.id || contentId,
      aggregation_owner: LEARNING_SOURCE
    },

    measurement: decisionResult.measurement || null,
    learning: decisionResult.learning || null,
    decision: decisionResult.decision || null,
    action,
    guardrails,
    persistence,

    diagnostics: {
      decision_layer_called: true,
      decision_layer_version: decisionResult.version,
      decision_contract_valid: true,
      measurement_source_valid:
        decisionResult.source_chain?.measurement === MEASUREMENT_SOURCE,
      intelligence_source_valid:
        decisionResult.source_chain?.intelligence === INTELLIGENCE_SOURCE,
      learning_source_valid:
        decisionResult.source_chain?.learning === LEARNING_SOURCE,
      raw_behavior_read: false,
      independent_measurement_aggregation: false,
      automatic_execution: false
    },

    next_step:
      mode === "execute"
        ? "Action proposal persisted. Human approval and Execution Layer are required for real execution."
        : "Action proposal ready. GET is preview-only; POST with approved:true persists the proposal."
  };
}

export async function onRequestGet(context) {
  try {
    const result = await analyze(
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
        status: "ERROR",
        error: error?.message || String(error),
        diagnostics: error?.details
          ? {
              decision_contract_error:
                error.details.error || null,
              expected:
                error.details.expected || null,
              received:
                error.details.received || null
            }
          : null
      },
      error?.status || 500
    );
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.clone().json().catch(() => ({}));

    if (body?.approved !== true) {
      return json(
        {
          success: false,
          layer: LAYER,
          version: VERSION,
          status: "APPROVAL_REQUIRED",
          error: "approved:true is required to persist the Action proposal",
          guardrails: {
            automatic_execution: false,
            action_executed: false,
            human_approval_required: true
          }
        },
        403
      );
    }

    const result = await analyze(
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
        status: "ERROR",
        error: error?.message || String(error),
        diagnostics: error?.details
          ? {
              decision_contract_error:
                error.details.error || null,
              expected:
                error.details.expected || null,
              received:
                error.details.received || null
            }
          : null
      },
      error?.status || 500
    );
  }
}
