// TATO-OS
// DECISION LAYER V1.1
// Route: /api/decision-ai
//
// Chain:
// Measurement V2.3
// -> Intelligence V2.1
// -> Learning V2.3
// -> Decision V1.1
// -> Action Layer
//
// Purpose:
// Convert Learning V2.3 evidence into a human-reviewable
// decision proposal.
//
// Guardrails:
// - Does NOT read raw behavior events
// - Does NOT recalculate Measurement
// - Does NOT recalculate Intelligence
// - Does NOT declare a winner
// - Does NOT change strategy automatically
// - Does NOT execute an action
// - Human approval remains required

const LAYER = "DECISION_LAYER_V1.1";
const VERSION = "1.1";

const MEASUREMENT_SOURCE = "CONTENT_MEASUREMENT_ENGINE_V2.3";
const INTELLIGENCE_SOURCE = "INTELLIGENCE_V2.1_FEEDBACK_AWARE";
const LEARNING_SOURCE = "LEARNING_ENGINE_V2";
const LEARNING_VERSION = "2.3";

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

function parseJSON(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getContentId(request, body = {}) {
  const url = new URL(request.url);
  return url.searchParams.get("content_id") || body.content_id || null;
}

async function getContent(db, contentId) {
  return await db.prepare(`
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
  `).bind(contentId).first();
}

// ------------------------------------------------------------
// Learning V2.3 is the source of truth.
// Decision does NOT read ai_runs for Learning and does NOT
// independently aggregate measurements.
// ------------------------------------------------------------

async function getLearning(request, contentId) {
  const requestUrl = new URL(request.url);
  const learningUrl =
    `${requestUrl.origin}/api/learning-ai?content_id=${encodeURIComponent(contentId)}`;

  const response = await fetch(learningUrl, {
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
      contract_valid: false,
      contract_error: "LEARNING_LAYER_REQUEST_FAILED"
    };
  }

  const version = String(data.version || "");
  const engine = String(data.engine || "");

  if (
    version !== LEARNING_VERSION ||
    engine !== "LEARNING_V2.3_FEEDBACK_AWARE"
  ) {
    return {
      ok: false,
      status: 409,
      data,
      contract_valid: false,
      contract_error: "LEARNING_LAYER_CONTRACT_MISMATCH",
      expected: {
        version: LEARNING_VERSION,
        engine: "LEARNING_V2.3_FEEDBACK_AWARE"
      },
      received: {
        version: version || null,
        engine: engine || null
      }
    };
  }

  const learning = data.learning || {};
  const evidence = learning.evidence || {};
  const metrics = evidence.metrics || {};
  const decisionInput = learning.decision_input || {};
  const sourceContract = learning.source_contract || {};
  const guardrails = learning.guardrails || {};

  if (
    sourceContract.measurement !== MEASUREMENT_SOURCE ||
    sourceContract.intelligence !== INTELLIGENCE_SOURCE ||
    sourceContract.learning_version !== LEARNING_VERSION
  ) {
    return {
      ok: false,
      status: 409,
      data,
      contract_valid: false,
      contract_error: "LEARNING_SOURCE_CONTRACT_INVALID",
      expected: {
        measurement: MEASUREMENT_SOURCE,
        intelligence: INTELLIGENCE_SOURCE,
        learning_version: LEARNING_VERSION
      },
      received: sourceContract
    };
  }

  if (
    guardrails.reads_raw_behavior_events === true ||
    guardrails.recalculates_measurement === true ||
    guardrails.recalculates_intelligence === true ||
    guardrails.winner_declared === true ||
    guardrails.strategy_changed === true ||
    guardrails.action_selected === true ||
    guardrails.automatic_execution === true ||
    guardrails.action_executed === true
  ) {
    return {
      ok: false,
      status: 409,
      data,
      contract_valid: false,
      contract_error: "LEARNING_GUARDRAIL_VIOLATION"
    };
  }

  return {
    ok: true,
    status: response.status,
    data,
    learning,
    evidence,
    metrics,
    decisionInput,
    sourceContract,
    contract_valid: true
  };
}

function buildDecision(content, learningSource) {
  const learning = learningSource.learning;
  const evidence = learningSource.evidence;
  const metrics = learningSource.metrics;
  const decisionInput = learningSource.decisionInput;

  const attention = num(metrics.attention);
  const clicks = num(metrics.clicks);
  const productViews = num(metrics.product_views);
  const customers = num(metrics.customers);
  const orders = num(metrics.orders);
  const revenue = num(metrics.revenue);
  const rounds = num(evidence.measurement_rounds);

  let decisionType = "OBSERVE_MORE_DATA";
  let decision = "CONTINUE_MEASUREMENT";
  let priority = "LOW";
  let confidence = learning.confidence || "LOW";
  let reason =
    "หลักฐานจาก Learning ยังไม่เพียงพอสำหรับ Decision เชิง downstream";

  const evidenceItems = [];

  if (
    decisionInput.type === "INVESTIGATE_PRODUCT_TO_CUSTOMER" &&
    decisionInput.target === "PRODUCT_TO_CUSTOMER_PATH"
  ) {
    decisionType = "CONVERSION_INVESTIGATION";
    decision = "INVESTIGATE_PRODUCT_TO_CUSTOMER_PATH";
    priority = "HIGH";
    reason =
      "Learning พบ Product View ต่อเนื่อง แต่ยังไม่เกิด Customer จึงควรตรวจสอบเส้นทาง Product View → Customer ก่อนเปลี่ยนกลยุทธ์";

    evidenceItems.push(
      {
        signal: "ATTENTION",
        value: attention,
        interpretation: "มี Attention จาก Measurement"
      },
      {
        signal: "CLICK",
        value: clicks,
        interpretation: "มี Click ต่อเนื่อง"
      },
      {
        signal: "PRODUCT_VIEW",
        value: productViews,
        interpretation: "มี Product View ที่ถูกวัดได้"
      },
      {
        signal: "CUSTOMER",
        value: customers,
        interpretation: "ยังไม่มี Customer"
      },
      {
        signal: "ORDER",
        value: orders,
        interpretation: "ยังไม่มี Order"
      },
      {
        signal: "REVENUE",
        value: revenue,
        interpretation: "ยังไม่มี Revenue"
      }
    );
  }

  return {
    state: "DECISION_READY",
    decision_type: decisionType,
    decision,
    priority,
    confidence,
    reason,

    evidence: evidenceItems,

    scope: {
      content_id: content?.id || null,
      content_title: content?.title || null
    },

    learning_input: {
      state: learning.state || null,
      repeated_signal_count: num(learning.repeated_signal_count),
      hypothesis_count: num(learning.hypothesis_count),
      repeated_signals: learning.repeated_signals || [],
      hypotheses: learning.hypotheses || [],
      decision_input: decisionInput
    },

    measurement_snapshot: {
      rounds,
      attention,
      clicks,
      product_views: productViews,
      engagements: num(metrics.engagements),
      customers,
      orders,
      revenue
    },

    source_of_truth: {
      type: LEARNING_SOURCE,
      version: LEARNING_VERSION,
      aggregation_owner: LEARNING_SOURCE,
      learning_content_id:
        learning.content_id || content?.id || null,
      intelligence_source:
        learningSource.sourceContract.intelligence || null,
      measurement_source:
        learningSource.sourceContract.measurement || null
    },

    next_action_candidate:
      decision === "INVESTIGATE_PRODUCT_TO_CUSTOMER_PATH"
        ? {
            type: "CUSTOMER_CONVERSION_PATH_AUDIT",
            target: "PRODUCT_VIEW_TO_CUSTOMER_PATH",
            status: "PROPOSED_ONLY",
            approval_required: true
          }
        : {
            type: "CONTINUE_MEASUREMENT",
            target: "CONTENT_FUNNEL",
            status: "PROPOSED_ONLY",
            approval_required: true
          },

    guardrails: {
      reads_raw_behavior_events: false,
      recalculates_measurement: false,
      recalculates_intelligence: false,
      winner_declared: false,
      strategy_change: false,
      automatic_execution: false,
      action_executed: false,
      requires_human_approval: true,
      requires_action_layer: true
    }
  };
}

async function saveDecision(db, content, learningSource, decision) {
  const runId = crypto.randomUUID();
  const insightId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const inputData = {
    content_id: content.id,
    source_of_truth: decision.source_of_truth,
    learning: {
      version: LEARNING_VERSION,
      state: learningSource.learning.state || null,
      repeated_signal_count:
        num(learningSource.learning.repeated_signal_count),
      hypothesis_count:
        num(learningSource.learning.hypothesis_count),
      decision_input:
        learningSource.decisionInput,
      metrics:
        learningSource.metrics
    }
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
    "DECISION_LAYER_V1",
    "TATO-DECISION-ENGINE-V1.1",
    JSON.stringify(inputData),
    JSON.stringify(decision),
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
    "DECISION",
    decision.decision,
    JSON.stringify(decision),
    decision.confidence === "HIGH" ? 1 : 0.5,
    decision.priority,
    "READY",
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

  const content = await getContent(db, contentId);

  if (!content) {
    throw new Error("Content not found");
  }

  const learningSource = await getLearning(request, contentId);

  if (!learningSource.ok) {
    const error = new Error(
      learningSource.contract_error ||
      "Learning Layer request failed"
    );
    error.status = learningSource.status || 500;
    error.details = learningSource;
    throw error;
  }

  const decision = buildDecision(content, learningSource);

  let persistence = null;

  if (mode === "execute") {
    persistence = await saveDecision(
      db,
      content,
      learningSource,
      decision
    );
  }

  return {
    success: true,
    layer: LAYER,
    version: VERSION,
    mode,
    status: "DECIDED",

    content: {
      id: content.id,
      title: content.title,
      status: content.status,
      objective: content.objective,
      attention_type: content.attention_type,
      market_keyword: content.market_keyword,
      angle: content.angle,
      cta: content.cta
    },

    source_chain: {
      measurement: MEASUREMENT_SOURCE,
      intelligence: INTELLIGENCE_SOURCE,
      learning: "LEARNING_V2.3_FEEDBACK_AWARE",
      decision: LAYER
    },

    source_of_truth: decision.source_of_truth,

    measurement: decision.measurement_snapshot,

    learning: {
      version: LEARNING_VERSION,
      engine:
        learningSource.data.engine || null,
      run_id: null,
      created_at: null,
      state: learningSource.learning.state || null,
      confidence: learningSource.learning.confidence || null,
      evidence_available:
        learningSource.learning.evidence_available === true,
      repeated_signal_count:
        num(learningSource.learning.repeated_signal_count),
      hypothesis_count:
        num(learningSource.learning.hypothesis_count),
      decision_input:
        learningSource.decisionInput,
      handoff:
        learningSource.learning.handoff || null
    },

    decision,

    persistence,

    diagnostics: {
      learning_layer_called: true,
      learning_layer_version: LEARNING_VERSION,
      learning_contract_valid:
        learningSource.contract_valid,
      measurement_source_valid:
        learningSource.sourceContract.measurement ===
        MEASUREMENT_SOURCE,
      intelligence_source_valid:
        learningSource.sourceContract.intelligence ===
        INTELLIGENCE_SOURCE,
      raw_behavior_read: false,
      independent_measurement_aggregation: false
    },

    next_step:
      "Decision proposal ready. Human approval is required before Action or Execution."
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
              learning_contract_error:
                error.details.contract_error || null,
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
    const body = await context.request
      .clone()
      .json()
      .catch(() => ({}));

    const mode =
      body?.mode === "execute"
        ? "execute"
        : "preview";

    const result = await analyze(
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
        status: "ERROR",
        error: error?.message || String(error),
        diagnostics: error?.details
          ? {
              learning_contract_error:
                error.details.contract_error || null,
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
