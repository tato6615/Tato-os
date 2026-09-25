// TATO-OS
// Decision Layer V1.2
// Route: /api/decision
//
// Pipeline:
//
// Measurement V2.3
//        ↓
// Intelligence V2.1
//        ↓
// Learning Engine V2.3
//        ↓
// Decision Layer V1.2
//        ↓
// Action Layer V1.0
//
// Decision Layer DOES:
// - read Learning Engine output
// - use Learning evidence as source of decision
// - create a decision
// - hand off to Action Layer
//
// Decision Layer DOES NOT:
// - read raw behavior_events
// - recalculate Measurement
// - recalculate Intelligence
// - recalculate Learning
// - declare winners
// - change strategy automatically
// - execute actions
// - execute external actions

const VERSION = "1.2";
const LAYER = "DECISION_LAYER_V1";

const LEARNING_LAYER = "LEARNING_ENGINE_V2";
const LEARNING_VERSION = "2.3";
const LEARNING_ENGINE =
  "LEARNING_V2.3_FEEDBACK_AWARE";

const MEASUREMENT_LAYER =
  "CONTENT_MEASUREMENT_ENGINE_V2.3";

const INTELLIGENCE_LAYER =
  "INTELLIGENCE_LAYER_V2";

const INTELLIGENCE_VERSION = "2.1";
const INTELLIGENCE_ENGINE =
  "INTELLIGENCE_V2.1_FEEDBACK_AWARE";

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=UTF-8",
        "cache-control": "no-store"
      }
    }
  );
}

function getContentId(request) {
  const url = new URL(request.url);

  return (
    url.searchParams.get("content_id") ||
    url.searchParams.get("contentId") ||
    ""
  ).trim();
}

async function getLearning(request, contentId) {
  const url = new URL(request.url);

  const learningUrl =
    new URL("/api/learning-ai", url.origin);

  learningUrl.searchParams.set(
    "content_id",
    contentId
  );

  const response = await fetch(
    learningUrl.toString(),
    {
      method: "GET",
      headers: {
        "accept": "application/json"
      }
    }
  );

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Learning Engine returned invalid JSON. HTTP ${response.status}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
        `Learning Engine request failed with HTTP ${response.status}`
    );
  }

  if (!data?.success) {
    throw new Error(
      data?.error ||
        "Learning Engine did not return success=true"
    );
  }

  return data;
}

function normalizeLearning(root) {
  const learning =
    root?.learning || {};

  const evidence =
    learning?.evidence || {};

  const metrics =
    evidence?.metrics || {};

  const patterns =
    evidence?.patterns || {};

  const conversions =
    evidence?.conversions || {};

  const latestMeasurement =
    evidence?.latest_measurement || {};

  const decisionInput =
    learning?.decision_input || {};

  const hypotheses =
    Array.isArray(learning?.hypotheses)
      ? learning.hypotheses
      : [];

  const repeatedSignals =
    Array.isArray(learning?.repeated_signals)
      ? learning.repeated_signals
      : [];

  const sourceContract =
    learning?.source_contract || {};

  const feedbackContext =
    root?.feedback_context ||
    learning?.feedback_context ||
    null;

  return {
    layer:
      learning?.layer || null,

    version:
      learning?.version || null,

    engine:
      learning?.engine || null,

    content_id:
      learning?.content_id ||
      root?.content?.id ||
      null,

    status:
      learning?.status || null,

    state:
      learning?.state || null,

    confidence:
      learning?.confidence || null,

    evidence_available:
      learning?.evidence_available === true,

    metrics: {
      attention:
        Number(metrics?.attention || 0),

      clicks:
        Number(metrics?.clicks || 0),

      product_views:
        Number(metrics?.product_views || 0),

      engagements:
        Number(metrics?.engagements || 0),

      customers:
        Number(metrics?.customers || 0),

      orders:
        Number(metrics?.orders || 0),

      revenue:
        Number(metrics?.revenue || 0)
    },

    patterns: {
      rounds:
        Number(patterns?.rounds || 0),

      attention_present:
        patterns?.attention_present === true,

      clicks_present:
        patterns?.clicks_present === true,

      product_views_present:
        patterns?.product_views_present === true,

      customers_present:
        patterns?.customers_present === true,

      orders_present:
        patterns?.orders_present === true,

      revenue_present:
        patterns?.revenue_present === true,

      persistent_attention:
        patterns?.persistent_attention === true,

      persistent_clicks:
        patterns?.persistent_clicks === true,

      click_without_product_view:
        patterns?.click_without_product_view === true,

      persistent_funnel_block:
        patterns?.persistent_funnel_block === true,

      persistent_no_customer:
        patterns?.persistent_no_customer === true,

      persistent_no_order:
        patterns?.persistent_no_order === true,

      persistent_no_revenue:
        patterns?.persistent_no_revenue === true,

      no_behavior:
        patterns?.no_behavior === true
    },

    conversions: {
      attention_to_product_view:
        Number(
          conversions?.attention_to_product_view || 0
        ),

      product_view_to_click:
        Number(
          conversions?.product_view_to_click || 0
        ),

      click_to_customer:
        Number(
          conversions?.click_to_customer || 0
        ),

      customer_to_order:
        Number(
          conversions?.customer_to_order || 0
        )
    },

    latest_measurement: {
      id:
        latestMeasurement?.id || null,

      attention:
        Number(
          latestMeasurement?.attention || 0
        ),

      clicks:
        Number(
          latestMeasurement?.clicks || 0
        ),

      product_views:
        Number(
          latestMeasurement?.product_views || 0
        ),

      engagements:
        Number(
          latestMeasurement?.engagements || 0
        ),

      customers:
        Number(
          latestMeasurement?.customers || 0
        ),

      orders:
        Number(
          latestMeasurement?.orders || 0
        ),

      revenue:
        Number(
          latestMeasurement?.revenue || 0
        )
    },

    decision_input: {
      type:
        decisionInput?.type || null,

      target:
        decisionInput?.target || null
    },

    hypotheses,

    repeated_signals:
      repeatedSignals,

    measurement_source:
      sourceContract?.measurement ||
      MEASUREMENT_LAYER,

    intelligence_source:
      sourceContract?.intelligence ||
      null,

    intelligence_version:
      sourceContract?.intelligence_version ||
      null,

    intelligence_engine:
      sourceContract?.intelligence_engine ||
      null,

    learning_version:
      sourceContract?.learning_version ||
      learning?.version ||
      null,

    feedback_source:
      sourceContract?.feedback ||
      null,

    feedback_context:
      feedbackContext
  };
}

function createDecision(learning) {
  const m = learning.metrics;

  /*
   * PRIMARY DECISION SOURCE
   *
   * Learning V2.3 decision_input
   * is authoritative.
   */

  if (
    learning.decision_input?.type ===
      "INVESTIGATE_DOWNSTREAM_PATH" &&
    learning.decision_input?.target ===
      "CLICK_TO_PRODUCT_VIEW_PATH"
  ) {
    return {
      priority: "HIGH",

      type:
        "INVESTIGATE_DOWNSTREAM_PATH",

      target:
        "CLICK_TO_PRODUCT_VIEW_PATH",

      reason:
        "Learning V2.3 identifies a persistent click-to-product-view downstream block."
    };
  }

  /*
   * SECONDARY LEARNING-EVIDENCE FALLBACK
   */

  if (
    learning.patterns?.click_without_product_view ===
      true &&
    m.clicks > 0 &&
    m.product_views === 0
  ) {
    return {
      priority: "HIGH",

      type:
        "INVESTIGATE_DOWNSTREAM_PATH",

      target:
        "CLICK_TO_PRODUCT_VIEW_PATH",

      reason:
        "Learning evidence shows clicks without downstream product views."
    };
  }

  if (
    m.product_views > 0 &&
    m.customers === 0
  ) {
    return {
      priority: "MEDIUM",

      type:
        "INVESTIGATE_PRODUCT_TO_CUSTOMER",

      target:
        "PRODUCT_VIEW_TO_CUSTOMER_PATH",

      reason:
        "Learning evidence shows product views without customers."
    };
  }

  if (
    m.customers > 0 &&
    m.orders === 0
  ) {
    return {
      priority: "MEDIUM",

      type:
        "INVESTIGATE_CUSTOMER_TO_ORDER",

      target:
        "CUSTOMER_TO_ORDER_PATH",

      reason:
        "Learning evidence shows customers without orders."
    };
  }

  if (
    m.orders > 0 &&
    m.revenue === 0
  ) {
    return {
      priority: "MEDIUM",

      type:
        "INVESTIGATE_ORDER_TO_REVENUE",

      target:
        "ORDER_TO_REVENUE_PATH",

      reason:
        "Learning evidence shows orders without measured revenue."
    };
  }

  if (
    learning.evidence_available !== true ||
    (
      m.attention === 0 &&
      m.clicks === 0 &&
      m.product_views === 0 &&
      m.customers === 0 &&
      m.orders === 0 &&
      m.revenue === 0
    )
  ) {
    return {
      priority: "LOW",

      type:
        "WAIT_FOR_BEHAVIORAL_DATA",

      target:
        "CURRENT_CONTENT",

      reason:
        "Learning Engine does not provide sufficient behavioral evidence for a downstream decision."
    };
  }

  return {
    priority: "LOW",

    type:
      "CONTINUE_OBSERVATION",

    target:
      "CURRENT_CONTENT",

    reason:
      "Learning evidence does not identify a specific downstream block."
  };
}

function buildResponse(
  root,
  learning,
  decision
) {
  const content =
    root?.content || {};

  const m =
    learning.metrics;

  return {
    success: true,

    layer:
      LAYER,

    version:
      VERSION,

    engine:
      "DECISION_V1.2_LEARNING_V2.3_COMPATIBLE",

    status:
      "DECISION_READY",

    content: {
      id:
        learning.content_id ||
        content?.id ||
        null,

      title:
        content?.title ||
        null,

      status:
        content?.status ??
        null
    },

    decision,

    required_action: {
      type:
        decision.type ===
          "CONTINUE_OBSERVATION"
          ? "OBSERVE"
          : decision.type ===
            "WAIT_FOR_BEHAVIORAL_DATA"
            ? "WAIT"
            : "INVESTIGATE",

      execute: false
    },

    evidence: {
      attention:
        m.attention,

      clicks:
        m.clicks,

      product_views:
        m.product_views,

      engagements:
        m.engagements,

      customers:
        m.customers,

      orders:
        m.orders,

      revenue:
        m.revenue
    },

    learning: {
      layer:
        learning.layer,

      version:
        learning.version,

      engine:
        learning.engine,

      state:
        learning.state,

      confidence:
        learning.confidence,

      evidence_available:
        learning.evidence_available,

      measurement_rounds:
        learning.patterns.rounds,

      decision_input:
        learning.decision_input,

      signals:
        learning.repeated_signals,

      hypotheses:
        learning.hypotheses
    },

    intelligence: {
      source:
        learning.intelligence_source,

      version:
        learning.intelligence_version,

      engine:
        learning.intelligence_engine,

      state:
        root?.learning?.evidence
          ?.intelligence_state ||
        null,

      patterns:
        learning.patterns,

      conversions:
        learning.conversions
    },

    feedback: {
      available:
        !!learning.feedback_context,

      source:
        learning.feedback_source,

      context:
        learning.feedback_context
    },

    funnel: {
      attention:
        m.attention,

      clicks:
        m.clicks,

      product_views:
        m.product_views,

      engagements:
        m.engagements,

      customers:
        m.customers,

      orders:
        m.orders,

      revenue:
        m.revenue
    },

    source_chain: [
      MEASUREMENT_LAYER,
      INTELLIGENCE_ENGINE,
      LEARNING_ENGINE,
      LAYER
    ],

    source_contract: {
      measurement: {
        layer:
          learning.measurement_source,

        expected:
          MEASUREMENT_LAYER,

        rounds:
          learning.patterns.rounds,

        latest_measurement_id:
          learning.latest_measurement?.id ||
          null
      },

      intelligence: {
        layer:
          learning.intelligence_source,

        version:
          learning.intelligence_version,

        engine:
          learning.intelligence_engine
      },

      learning: {
        layer:
          learning.layer,

        version:
          learning.version,

        engine:
          learning.engine,

        state:
          learning.state,

        evidence_available:
          learning.evidence_available,

        decision_input:
          learning.decision_input
      },

      decision: {
        layer:
          LAYER,

        version:
          VERSION
      }
    },

    guardrails: {
      reads_raw_behavior_events:
        false,

      recalculates_measurement:
        false,

      recalculates_intelligence:
        false,

      recalculates_learning:
        false,

      feedback_used_as_behavior:
        false,

      feedback_used_as_attention:
        false,

      feedback_alters_funnel_metrics:
        false,

      winner_declared:
        false,

      strategy_changed:
        false,

      automatic_execution:
        false,

      action_executed:
        false,

      decision_is_executable:
        false,

      requires_action_layer:
        true,

      requires_human_approval:
        true
    },

    handoff: {
      next_layer:
        "ACTION_LAYER_V1",

      action_required:
        true,

      execute:
        false
    },

    execution: {
      allowed:
        false,

      executed:
        false,

      reason:
        "Decision Layer creates decisions only. Action and Automation layers control execution."
    },

    timestamp:
      new Date().toISOString(),

    mode:
      "PREVIEW",

    saved:
      false
  };
}

function validateLearningContract(
  learning
) {
  const errors = [];

  /*
   * Learning identity
   */

  if (
    learning.layer !==
    LEARNING_LAYER
  ) {
    errors.push({
      field:
        "learning.layer",

      expected:
        LEARNING_LAYER,

      received:
        learning.layer
    });
  }

  if (
    learning.version !==
    LEARNING_VERSION
  ) {
    errors.push({
      field:
        "learning.version",

      expected:
        LEARNING_VERSION,

      received:
        learning.version
    });
  }

  /*
   * Learning engine is optional because
   * current Learning V2.3 output does not
   * expose learning.engine in the learning
   * object.
   *
   * If it exists, validate it.
   */

  if (
    learning.engine &&
    learning.engine !==
      LEARNING_ENGINE
  ) {
    errors.push({
      field:
        "learning.engine",

      expected:
        LEARNING_ENGINE,

      received:
        learning.engine
    });
  }

  /*
   * Measurement source
   */

  if (
    learning.measurement_source !==
    MEASUREMENT_LAYER
  ) {
    errors.push({
      field:
        "learning.source_contract.measurement",

      expected:
        MEASUREMENT_LAYER,

      received:
        learning.measurement_source
    });
  }

  /*
   * Intelligence source contract
   *
   * IMPORTANT:
   *
   * Learning V2.3 returns:
   *
   * source_contract.intelligence
   * = INTELLIGENCE_V2.1_FEEDBACK_AWARE
   *
   * Therefore this field must be
   * validated against the ENGINE value,
   * not INTELLIGENCE_LAYER_V2.
   */

  if (
    learning.intelligence_source !==
    INTELLIGENCE_ENGINE
  ) {
    errors.push({
      field:
        "learning.source_contract.intelligence",

      expected:
        INTELLIGENCE_ENGINE,

      received:
        learning.intelligence_source
    });
  }

  /*
   * Intelligence version
   */

  if (
    learning.intelligence_version !==
    INTELLIGENCE_VERSION
  ) {
    errors.push({
      field:
        "learning.source_contract.intelligence_version",

      expected:
        INTELLIGENCE_VERSION,

      received:
        learning.intelligence_version
    });
  }

  /*
   * Intelligence engine
   */

  if (
    learning.intelligence_engine !==
    INTELLIGENCE_ENGINE
  ) {
    errors.push({
      field:
        "learning.source_contract.intelligence_engine",

      expected:
        INTELLIGENCE_ENGINE,

      received:
        learning.intelligence_engine
    });
  }

  return errors;
}

export async function onRequestGet(
  context
) {
  try {
    const contentId =
      getContentId(
        context.request
      );

    if (!contentId) {
      return json(
        {
          success: false,

          layer:
            LAYER,

          version:
            VERSION,

          status:
            "INVALID_REQUEST",

          error:
            "content_id is required."
        },
        400
      );
    }

    /*
     * Decision reads Learning only.
     */

    const learningRoot =
      await getLearning(
        context.request,
        contentId
      );

    const learning =
      normalizeLearning(
        learningRoot
      );

    /*
     * Strict current upstream contract.
     */

    const contractErrors =
      validateLearningContract(
        learning
      );

    if (
      contractErrors.length > 0
    ) {
      return json(
        {
          success: false,

          layer:
            LAYER,

          version:
            VERSION,

          status:
            "CONTRACT_ERROR",

          error:
            "Decision Layer V1.2 requires the current Learning V2.3 upstream contract.",

          expected: {
            learning_layer:
              LEARNING_LAYER,

            learning_version:
              LEARNING_VERSION,

            learning_engine:
              LEARNING_ENGINE,

            measurement:
              MEASUREMENT_LAYER,

            intelligence_layer:
              INTELLIGENCE_LAYER,

            intelligence_source:
              INTELLIGENCE_ENGINE,

            intelligence_version:
              INTELLIGENCE_VERSION,

            intelligence_engine:
              INTELLIGENCE_ENGINE
          },

          received: {
            learning_layer:
              learning.layer,

            learning_version:
              learning.version,

            learning_engine:
              learning.engine,

            measurement:
              learning.measurement_source,

            intelligence_source:
              learning.intelligence_source,

            intelligence_version:
              learning.intelligence_version,

            intelligence_engine:
              learning.intelligence_engine
          },

          contract_errors:
            contractErrors
        },
        409
      );
    }

    /*
     * Content identity validation.
     */

    if (
      learning.content_id &&
      learning.content_id !== contentId
    ) {
      return json(
        {
          success: false,

          layer:
            LAYER,

          version:
            VERSION,

          status:
            "CONTENT_MISMATCH",

          error:
            "Learning content_id does not match requested content_id.",

          requested_content_id:
            contentId,

          learning_content_id:
            learning.content_id
        },
        409
      );
    }

    /*
     * Learning must explicitly provide evidence.
     */

    if (
      learning.evidence_available !==
      true
    ) {
      return json(
        {
          success: false,

          layer:
            LAYER,

          version:
            VERSION,

          status:
            "EVIDENCE_NOT_AVAILABLE",

          error:
            "Learning Engine V2.3 did not provide sufficient evidence."
        },
        409
      );
    }

    /*
     * Create decision from Learning evidence.
     */

    const decision =
      createDecision(
        learning
      );

    return json(
      buildResponse(
        learningRoot,
        learning,
        decision
      )
    );

  } catch (error) {
    return json(
      {
        success: false,

        layer:
          LAYER,

        version:
          VERSION,

        status:
          "ERROR",

        error:
          error?.message ||
          "Unknown Decision Layer error."
      },
      500
    );
  }
}

export async function onRequestPost(
  context
) {
  return onRequestGet(
    context
  );
}
