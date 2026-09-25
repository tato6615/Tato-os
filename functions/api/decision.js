// TATO-OS
// Decision Layer V1.3.4
// Learning V2.3 Compatible
//
// Pipeline:
//
// Measurement V2.3
//        ↓
// Intelligence V2.1
//        ↓
// Learning V2.3
//        ↓
// Decision V1.3.4
//        ↓
// Action V1.4
//        ↓
// Approval
//        ↓
// Execution
//
// Decision does:
// - read Learning output
// - create a governed decision
// - determine whether an action is actually required
// - hand off actionable decisions to Action Layer
//
// Decision does NOT:
// - read raw behavior_events
// - recalculate Measurement
// - recalculate Intelligence
// - recalculate Learning
// - declare winners
// - change strategy automatically
// - execute actions
//
// IMPORTANT:
// WAIT_FOR_BEHAVIORAL_EVIDENCE is a valid terminal/holding decision.
// It MUST NOT create an Action.
// It returns control to Measurement for the next evidence cycle.

const LAYER = "DECISION_LAYER_V1";
const VERSION = "1.3.4";
const ENGINE = "DECISION_V1.3.4_LEARNING_V2.3_COMPATIBLE";

const LEARNING_LAYER = "LEARNING_ENGINE_V2";
const LEARNING_VERSION = "2.3";
const LEARNING_ENGINE = "LEARNING_V2.3_FEEDBACK_AWARE";

const INTELLIGENCE_SOURCE = "INTELLIGENCE_V2.1_FEEDBACK_AWARE";
const MEASUREMENT_SOURCE = "CONTENT_MEASUREMENT_ENGINE_V2.3";
const FEEDBACK_SOURCE = "FEEDBACK_LAYER_V1.1";

const ACTION_LAYER = "ACTION_ENGINE_V1.4";

const NON_ACTION_DECISION = "WAIT_FOR_BEHAVIORAL_EVIDENCE";

const ACTIONABLE_DECISIONS = new Set([
  "INVESTIGATE_DOWNSTREAM_PATH",
  "CONTINUE_TRAFFIC_SIGNAL",
  "OPTIMIZE_CONTENT",
  "CREATE_CONTENT",
  "CHANGE_STRATEGY",
  "STOP_CONTENT",
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function now() {
  return new Date().toISOString();
}

function errorResponse(message, extra = {}, status = 400) {
  return json(
    {
      success: false,
      layer: LAYER,
      version: VERSION,
      engine: ENGINE,
      status: "CONTRACT_ERROR",
      error: message,
      ...extra,
      timestamp: now(),
    },
    status
  );
}

function getContentId(request) {
  const url = new URL(request.url);

  return (
    url.searchParams.get("content_id") ||
    url.searchParams.get("contentId") ||
    null
  );
}

function isObject(value) {
  return value !== null && typeof value === "object";
}

function normalizeLearning(payload) {
  if (!isObject(payload)) {
    throw new Error("Learning response is not an object.");
  }

  if (payload.success !== true) {
    throw new Error(
      payload.error || "Learning Layer returned success=false."
    );
  }

  if (payload.layer !== LEARNING_LAYER) {
    throw new Error(
      `Unexpected Learning layer '${payload.layer}'. Expected '${LEARNING_LAYER}'.`
    );
  }

  if (payload.version !== LEARNING_VERSION) {
    throw new Error(
      `Unexpected Learning version '${payload.version}'. Expected '${LEARNING_VERSION}'.`
    );
  }

  if (payload.engine !== LEARNING_ENGINE) {
    throw new Error(
      `Unexpected Learning engine '${payload.engine}'. Expected '${LEARNING_ENGINE}'.`
    );
  }

  if (payload.status !== "LEARNING_READY") {
    throw new Error(
      `Learning status '${payload.status}' is not LEARNING_READY.`
    );
  }

  if (!isObject(payload.learning)) {
    throw new Error("Learning object is missing.");
  }

  const learning = payload.learning;

  if (learning.engine !== LEARNING_ENGINE) {
    throw new Error(
      `Learning embedded engine '${learning.engine}' does not match '${LEARNING_ENGINE}'.`
    );
  }

  if (!isObject(learning.decision_input)) {
    throw new Error("Learning decision_input is missing.");
  }

  return payload;
}

function getDecisionInput(learningPayload) {
  const decisionInput = learningPayload.learning.decision_input;

  const type = decisionInput.type || null;
  const target = decisionInput.target || "CURRENT_CONTENT";

  if (!type) {
    throw new Error("Learning decision_input.type is missing.");
  }

  return {
    type,
    target,
  };
}

function determinePriority(type, learning) {
  if (type === NON_ACTION_DECISION) {
    return "LOW";
  }

  if (type === "INVESTIGATE_DOWNSTREAM_PATH") {
    return "HIGH";
  }

  if (type === "STOP_CONTENT") {
    return "HIGH";
  }

  if (type === "CHANGE_STRATEGY") {
    return "HIGH";
  }

  if (learning?.confidence === "HIGH") {
    return "HIGH";
  }

  return "MEDIUM";
}

function buildEvidence(learning) {
  const evidence = learning?.evidence || {};
  const metrics = evidence?.metrics || {};

  return {
    attention: Number(metrics.attention || 0),
    clicks: Number(metrics.clicks || 0),
    product_views: Number(metrics.product_views || 0),
    engagements: Number(metrics.engagements || 0),
    customers: Number(metrics.customers || 0),
    orders: Number(metrics.orders || 0),
    revenue: Number(metrics.revenue || 0),
  };
}

function buildIntelligence(learningPayload) {
  const learning = learningPayload.learning || {};
  const evidence = learning.evidence || {};
  const patterns = evidence.patterns || {};
  const conversions = evidence.conversions || {};

  return {
    layer: "INTELLIGENCE_LAYER_V2",
    source: INTELLIGENCE_SOURCE,
    version: "2.1",
    engine: INTELLIGENCE_SOURCE,
    state: evidence.intelligence_state || "UNKNOWN",
    patterns: {
      rounds: Number(patterns.rounds || 0),
      attention_present: Boolean(patterns.attention_present),
      clicks_present: Boolean(patterns.clicks_present),
      product_views_present: Boolean(patterns.product_views_present),
      customers_present: Boolean(patterns.customers_present),
      orders_present: Boolean(patterns.orders_present),
      revenue_present: Boolean(patterns.revenue_present),
      persistent_attention: Boolean(patterns.persistent_attention),
      persistent_clicks: Boolean(patterns.persistent_clicks),
      click_without_product_view: Boolean(
        patterns.click_without_product_view
      ),
      persistent_funnel_block: Boolean(
        patterns.persistent_funnel_block
      ),
      persistent_no_customer: Boolean(
        patterns.persistent_no_customer
      ),
      persistent_no_order: Boolean(patterns.persistent_no_order),
      persistent_no_revenue: Boolean(
        patterns.persistent_no_revenue
      ),
      no_behavior: !Boolean(
        patterns.attention_present ||
          patterns.clicks_present ||
          patterns.product_views_present ||
          patterns.customers_present ||
          patterns.orders_present ||
          patterns.revenue_present
      ),
    },
    conversions: {
      attention_to_product_view: Number(
        conversions.attention_to_product_view || 0
      ),
      product_view_to_click: Number(
        conversions.product_view_to_click || 0
      ),
      click_to_customer: Number(
        conversions.click_to_customer || 0
      ),
      customer_to_order: Number(
        conversions.customer_to_order || 0
      ),
    },
  };
}

function buildLearningContract(learningPayload) {
  const learning = learningPayload.learning || {};

  return {
    layer: LEARNING_LAYER,
    version: LEARNING_VERSION,
    engine: LEARNING_ENGINE,
    state: learning.state || null,
    confidence: learning.confidence || null,
    evidence_available: Boolean(learning.evidence_available),
    measurement_rounds: Number(
      learning?.evidence?.measurement_rounds || 0
    ),
    decision_input: learning.decision_input || null,
    signals: Array.isArray(learning.repeated_signals)
      ? learning.repeated_signals
      : [],
    hypotheses: Array.isArray(learning.hypotheses)
      ? learning.hypotheses
      : [],
  };
}

function buildFeedbackContract(learningPayload) {
  const feedback =
    learningPayload.feedback_context ||
    learningPayload.learning?.feedback_context ||
    null;

  if (!feedback) {
    return {
      available: false,
      source: FEEDBACK_SOURCE,
      counted_as_behavior: false,
      counted_as_attention: false,
      alters_funnel_metrics: false,
    };
  }

  return {
    available: Boolean(feedback.available),
    source: feedback.source || FEEDBACK_SOURCE,
    context: feedback,
    counted_as_behavior: Boolean(feedback.counted_as_behavior),
    counted_as_attention: Boolean(feedback.counted_as_attention),
    alters_funnel_metrics: Boolean(
      feedback.alters_funnel_metrics
    ),
  };
}

function buildSourceContract(learningPayload, contentId) {
  const learning = learningPayload.learning || {};
  const evidence = learning.evidence || {};
  const measurementId =
    evidence?.latest_measurement?.id || null;

  return {
    measurement: {
      layer: MEASUREMENT_SOURCE,
      expected: MEASUREMENT_SOURCE,
      rounds: Number(evidence.measurement_rounds || 0),
      latest_measurement_id: measurementId,
    },

    intelligence: {
      layer: "INTELLIGENCE_LAYER_V2",
      source: INTELLIGENCE_SOURCE,
      expected_source: INTELLIGENCE_SOURCE,
      version: "2.1",
      expected_version: "2.1",
      engine: INTELLIGENCE_SOURCE,
      expected_engine: INTELLIGENCE_SOURCE,
    },

    learning: {
      layer: LEARNING_LAYER,
      version: LEARNING_VERSION,
      engine: LEARNING_ENGINE,
      state: learning.state || null,
      evidence_available: Boolean(
        learning.evidence_available
      ),
      decision_input: learning.decision_input || null,
    },

    decision: {
      layer: LAYER,
      version: VERSION,
      engine: ENGINE,
    },

    content_id: contentId,
  };
}

function buildGuardrails(isActionable) {
  return {
    reads_raw_behavior_events: false,
    recalculates_measurement: false,
    recalculates_intelligence: false,
    recalculates_learning: false,

    feedback_used_as_behavior: false,
    feedback_used_as_attention: false,
    feedback_alters_funnel_metrics: false,

    winner_declared: false,
    strategy_changed: false,

    action_selected: isActionable,
    automatic_execution: false,
    action_executed: false,

    decision_is_executable: false,

    requires_action_layer: isActionable,
    requires_human_approval: isActionable,
  };
}

function buildNonActionDecision({
  contentId,
  title,
  decisionInput,
  learningPayload,
}) {
  const learning = learningPayload.learning || {};
  const evidence = buildEvidence(learning);

  return {
    success: true,
    layer: LAYER,
    version: VERSION,
    engine: ENGINE,
    status: "DECISION_READY",
    mode: "PREVIEW",

    content: {
      id: contentId,
      title: title || null,
      status: learningPayload.content?.status ?? null,
    },

    decision: {
      priority: "LOW",
      type: NON_ACTION_DECISION,
      target: decisionInput.target,
      reason:
        "Decision created from Learning V2.3 decision_input. Behavioral evidence is not yet available.",
      source: "LEARNING_DECISION_INPUT",
    },

    required_action: {
      type: "NONE",
      execute: false,
    },

    evidence,

    learning: buildLearningContract(learningPayload),

    intelligence: buildIntelligence(learningPayload),

    feedback: buildFeedbackContract(learningPayload),

    funnel: evidence,

    source_chain: [
      MEASUREMENT_SOURCE,
      INTELLIGENCE_SOURCE,
      LEARNING_ENGINE,
      LAYER,
    ],

    source_contract: buildSourceContract(
      learningPayload,
      contentId
    ),

    guardrails: buildGuardrails(false),

    handoff: {
      next_layer: MEASUREMENT_SOURCE,
      action_required: false,
      execute: false,
      reason:
        "No behavioral evidence is available. Return to Measurement for the next evidence cycle.",
    },

    execution: {
      allowed: false,
      executed: false,
      reason:
        "No action exists for WAIT_FOR_BEHAVIORAL_EVIDENCE.",
    },

    loop: {
      current_layer: LAYER,
      previous_layer: LEARNING_ENGINE,
      next_layer: MEASUREMENT_SOURCE,
      closed: false,
    },

    timestamp: now(),
    saved: false,
  };
}

function buildActionableDecision({
  contentId,
  title,
  decisionInput,
  learningPayload,
}) {
  const learning = learningPayload.learning || {};
  const evidence = buildEvidence(learning);
  const priority = determinePriority(
    decisionInput.type,
    learning
  );

  return {
    success: true,
    layer: LAYER,
    version: VERSION,
    engine: ENGINE,
    status: "DECISION_READY",
    mode: "PREVIEW",

    content: {
      id: contentId,
      title: title || null,
      status: learningPayload.content?.status ?? null,
    },

    decision: {
      priority,
      type: decisionInput.type,
      target: decisionInput.target,
      reason:
        "Decision created from Learning V2.3 decision_input.",
      source: "LEARNING_DECISION_INPUT",
    },

    required_action: {
      type: "INVESTIGATE",
      execute: false,
    },

    evidence,

    learning: buildLearningContract(learningPayload),

    intelligence: buildIntelligence(learningPayload),

    feedback: buildFeedbackContract(learningPayload),

    funnel: evidence,

    source_chain: [
      MEASUREMENT_SOURCE,
      INTELLIGENCE_SOURCE,
      LEARNING_ENGINE,
      LAYER,
    ],

    source_contract: buildSourceContract(
      learningPayload,
      contentId
    ),

    guardrails: buildGuardrails(true),

    handoff: {
      next_layer: ACTION_LAYER,
      action_required: true,
      execute: false,
    },

    execution: {
      allowed: false,
      executed: false,
      reason:
        "Decision Layer creates decisions only. Action and Automation layers control execution.",
    },

    loop: {
      current_layer: LAYER,
      previous_layer: LEARNING_ENGINE,
      next_layer: ACTION_LAYER,
      closed: false,
    },

    timestamp: now(),
    saved: false,
  };
}

async function getLearningFromEndpoint(request, contentId) {
  const requestUrl = new URL(request.url);

  const origin = requestUrl.origin;

  const learningUrl =
    `${origin}/api/learning-ai?content_id=` +
    encodeURIComponent(contentId);

  const response = await fetch(learningUrl, {
    method: "GET",
    headers: {
      accept: "application/json",
    },
  });

  const text = await response.text();

  let payload;

  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(
      `Learning endpoint returned invalid JSON. HTTP ${response.status}.`
    );
  }

  if (!response.ok) {
    throw new Error(
      payload?.error ||
        `Learning endpoint failed with HTTP ${response.status}.`
    );
  }

  return normalizeLearning(payload);
}

async function runDecision(request, env) {
  const contentId = getContentId(request);

  if (!contentId) {
    return errorResponse(
      "content_id is required."
    );
  }

  let learningPayload;

  try {
    learningPayload = await getLearningFromEndpoint(
      request,
      contentId
    );
  } catch (error) {
    return errorResponse(
      error?.message || "Unable to read Learning Layer."
    );
  }

  const decisionInput = getDecisionInput(
    learningPayload
  );

  const title =
    learningPayload?.content?.title ||
    learningPayload?.learning?.content?.title ||
    null;

  // ------------------------------------------------------------
  // CRITICAL CONTRACT
  //
  // WAIT_FOR_BEHAVIORAL_EVIDENCE is NOT an Action.
  //
  // Do not send this decision to Action Layer.
  // Do not create an action_run.
  // Do not require approval.
  // Return to Measurement for the next evidence cycle.
  // ------------------------------------------------------------

  if (decisionInput.type === NON_ACTION_DECISION) {
    return json(
      buildNonActionDecision({
        contentId,
        title,
        decisionInput,
        learningPayload,
      })
    );
  }

  // ------------------------------------------------------------
  // Any other Decision type must be explicitly actionable.
  // Unknown Decision types fail closed.
  // ------------------------------------------------------------

  if (!ACTIONABLE_DECISIONS.has(decisionInput.type)) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        engine: ENGINE,
        status: "UNSUPPORTED_DECISION",
        decision: decisionInput,
        error:
          `No Decision policy exists for type '${decisionInput.type}'.`,
        guardrails: {
          reads_raw_behavior_events: false,
          recalculates_measurement: false,
          recalculates_intelligence: false,
          recalculates_learning: false,
          automatic_execution: false,
          action_executed: false,
        },
        timestamp: now(),
      },
      400
    );
  }

  return json(
    buildActionableDecision({
      contentId,
      title,
      decisionInput,
      learningPayload,
    })
  );
}

export async function onRequestGet(context) {
  return runDecision(
    context.request,
    context.env
  );
}

export async function onRequestPost(context) {
  return runDecision(
    context.request,
    context.env
  );
}
