// TATO-OS
// Learning Engine V2.3
// Route: /api/learning-ai
//
// Pipeline:
//
// Measurement V2.3
//        ↓
// Intelligence V2.1
//        ↓
// Learning Engine V2.3
//        ↓
// Decision Layer V1.1
//
// Learning DOES:
// - read Intelligence V2.1
// - identify repeated behavioral signals
// - create learning hypotheses
// - carry operational feedback context
// - prepare evidence for Decision Layer
//
// Learning DOES NOT:
// - read raw behavior events
// - recalculate Measurement
// - recalculate Intelligence
// - declare winners
// - change strategy
// - select execution actions
// - execute actions
// - use feedback as behavior
// - use feedback as attention
// - alter funnel metrics

const VERSION = "2.3";
const LAYER = "LEARNING_ENGINE_V2";

const MEASUREMENT_SOURCE =
  "CONTENT_MEASUREMENT_ENGINE_V2.3";

const INTELLIGENCE_SOURCE =
  "INTELLIGENCE_V2.1_FEEDBACK_AWARE";

const FEEDBACK_SOURCE =
  "FEEDBACK_LAYER_V1.1";

const DECISION_SOURCE =
  "DECISION_LAYER_V1.1";

const MODEL =
  "@cf/zai-org/glm-4.7-flash";

/* =====================================================
   RESPONSE
===================================================== */

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=UTF-8",
        "cache-control":
          "no-store"
      }
    }
  );
}

/* =====================================================
   HELPERS
===================================================== */

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function object(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function first(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }

  return undefined;
}

function resolveContentId(
  request,
  body = {}
) {
  const url = new URL(request.url);

  return (
    url.searchParams.get("content_id") ||
    body.content_id ||
    body.contentId ||
    null
  );
}

/* =====================================================
   INTELLIGENCE API
===================================================== */

async function getIntelligence(
  request,
  contentId
) {
  const requestUrl =
    new URL(request.url);

  const endpoint =
    `${requestUrl.origin}/api/intelligence` +
    `?content_id=${encodeURIComponent(
      contentId
    )}`;

  const response =
    await fetch(endpoint, {
      method: "GET",
      headers: {
        accept:
          "application/json"
      }
    });

  const text =
    await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      "INTELLIGENCE_INVALID_JSON"
    );
  }

  if (
    !response.ok ||
    data?.success === false
  ) {
    throw new Error(
      `INTELLIGENCE_REQUEST_FAILED_${response.status}`
    );
  }

  /*
   * HARD CONTRACT
   *
   * Learning V2.3 must consume
   * Intelligence V2.1 only.
   */

  if (
    data?.version !== "2.1"
  ) {
    throw new Error(
      `INTELLIGENCE_VERSION_MISMATCH_EXPECTED_2.1_GOT_${data?.version || "UNKNOWN"}`
    );
  }

  if (
    data?.engine !==
    "INTELLIGENCE_V2.1_FEEDBACK_AWARE"
  ) {
    throw new Error(
      "INTELLIGENCE_ENGINE_CONTRACT_MISMATCH"
    );
  }

  return data;
}

/* =====================================================
   FEEDBACK CONTEXT
===================================================== */

function normalizeFeedbackContext(
  raw
) {
  const feedback =
    object(
      raw?.feedback_context ||
      raw?.intelligence?.feedback_context
    );

  if (
    !feedback ||
    Object.keys(feedback).length === 0
  ) {
    return {
      available: false,
      source: FEEDBACK_SOURCE,
      role:
        "OPERATIONAL_HANDOFF_ONLY",
      counted_as_behavior: false,
      counted_as_attention: false,
      alters_funnel_metrics: false,
      latest: null
    };
  }

  const latest =
    object(feedback.latest);

  return {
    available:
      Boolean(feedback.available),

    source:
      feedback.source ||
      FEEDBACK_SOURCE,

    role:
      feedback.role ||
      "OPERATIONAL_HANDOFF_ONLY",

    counted_as_behavior:
      false,

    counted_as_attention:
      false,

    alters_funnel_metrics:
      false,

    latest: {
      id:
        latest.id ||
        null,

      action_code:
        latest.action_code ||
        null,

      action_target:
        latest.action_target ||
        null,

      actual_outcome:
        latest.actual_outcome ||
        null,

      outcome_status:
        latest.outcome_status ||
        null,

      measurement_required:
        Boolean(
          latest.measurement_required
        ),

      measurement_completed:
        Boolean(
          latest.measurement_completed
        ),

      created_at:
        latest.created_at ||
        null,

      updated_at:
        latest.updated_at ||
        null
    }
  };
}

/* =====================================================
   NORMALIZE INTELLIGENCE V2.1
===================================================== */

function normalizeIntelligence(
  raw,
  contentId
) {
  const root =
    object(raw);

  const intel =
    object(
      root.intelligence
    );

  const metrics =
    object(
      root.metrics
    );

  const totals =
    object(
      intel.totals
    );

  const latest =
    object(
      first(
        intel.latest_measurement,
        metrics.latest,
        root.measurement
      )
    );

  const patterns =
    object(
      intel.patterns
    );

  const conversions =
    object(
      intel.conversions
    );

  const content =
    object(
      first(
        intel.content,
        root.content
      )
    );

  const rounds =
    number(
      first(
        intel.measurement_rounds,
        root.measurement_history?.rounds,
        root.measurement_rounds,
        0
      )
    );

  const attention =
    number(
      first(
        totals.attention,
        metrics.totals?.attention,
        latest.attention
      )
    );

  const clicks =
    number(
      first(
        totals.clicks,
        metrics.totals?.clicks,
        latest.clicks
      )
    );

  const productViews =
    number(
      first(
        totals.product_views,
        metrics.totals?.product_views,
        latest.product_views
      )
    );

  const engagements =
    number(
      first(
        totals.engagements,
        metrics.totals?.engagements,
        latest.engagements
      )
    );

  const customers =
    number(
      first(
        totals.customers,
        metrics.totals?.customers,
        latest.customers
      )
    );

  const orders =
    number(
      first(
        totals.orders,
        metrics.totals?.orders,
        latest.orders
      )
    );

  const revenue =
    number(
      first(
        totals.revenue,
        metrics.totals?.revenue,
        latest.revenue
      )
    );

  const feedbackContext =
    normalizeFeedbackContext(
      raw
    );

  return {
    content: {
      id:
        content.id ||
        contentId,

      title:
        content.title ||
        null,

      status:
        content.status ||
        null,

      objective:
        content.objective ||
        null,

      attention_type:
        content.attention_type ||
        null,

      market_keyword:
        content.market_keyword ||
        null,

      angle:
        content.angle ||
        null,

      cta:
        content.cta ||
        null
    },

    state:
      intel.state ||
      "UNKNOWN",

    confidence:
      intel.confidence ||
      "LOW",

    rounds,

    totals: {
      attention,
      clicks,
      product_views:
        productViews,
      engagements,
      customers,
      orders,
      revenue
    },

    latest_measurement: {
      id:
        latest.id ||
        null,

      attention:
        number(
          latest.attention
        ),

      clicks:
        number(
          latest.clicks
        ),

      product_views:
        number(
          latest.product_views
        ),

      engagements:
        number(
          latest.engagements
        ),

      customers:
        number(
          latest.customers
        ),

      orders:
        number(
          latest.orders
        ),

      revenue:
        number(
          latest.revenue
        )
    },

    conversions: {
      attention_to_product_view:
        number(
          conversions.attention_to_product_view
        ),

      product_view_to_click:
        number(
          conversions.product_view_to_click
        ),

      click_to_customer:
        number(
          conversions.click_to_customer
        ),

      customer_to_order:
        number(
          conversions.customer_to_order
        )
    },

    patterns: {
      rounds,

      attention_present:
        Boolean(
          first(
            patterns.attention_present,
            patterns.attentionPresent,
            attention > 0
          )
        ),

      clicks_present:
        Boolean(
          first(
            patterns.click_present,
            patterns.clicks_present,
            patterns.clicksPresent,
            clicks > 0
          )
        ),

      product_views_present:
        Boolean(
          first(
            patterns.product_view_present,
            patterns.product_views_present,
            patterns.productViewsPresent,
            productViews > 0
          )
        ),

      customers_present:
        Boolean(
          first(
            patterns.customer_present,
            patterns.customers_present,
            customers > 0
          )
        ),

      orders_present:
        Boolean(
          first(
            patterns.order_present,
            patterns.orders_present,
            orders > 0
          )
        ),

      revenue_present:
        Boolean(
          first(
            patterns.revenue_present,
            revenue > 0
          )
        ),

      persistent_attention:
        Boolean(
          patterns.persistent_attention
        ),

      persistent_clicks:
        Boolean(
          first(
            patterns.persistent_clicks,
            patterns.persistent_click
          )
        ),

      click_without_product_view:
        Boolean(
          patterns.click_without_product_view
        ),

      persistent_funnel_block:
        Boolean(
          patterns.persistent_funnel_block
        ),

      persistent_no_customer:
        Boolean(
          patterns.persistent_no_customer
        ),

      persistent_no_order:
        Boolean(
          patterns.persistent_no_order
        ),

      persistent_no_revenue:
        Boolean(
          patterns.persistent_no_revenue
        )
    },

    insights:
      Array.isArray(
        intel.insights
      )
        ? intel.insights
        : [],

    recommendation:
      object(
        intel.recommendation
      ),

    guardrails:
      object(
        intel.guardrails
      ),

    feedback_context:
      feedbackContext,

    intelligence_version:
      "2.1",

    intelligence_engine:
      "INTELLIGENCE_V2.1_FEEDBACK_AWARE"
  };
}

/* =====================================================
   REPEATED SIGNALS
===================================================== */

function detectRepeatedSignals(
  intel
) {
  const signals = [];

  const t =
    intel.totals;

  const p =
    intel.patterns;

  if (
    p.persistent_attention &&
    t.attention > 0
  ) {
    signals.push({
      code:
        "PERSISTENT_ATTENTION",

      evidence:
        `Attention ${t.attention}`,

      repeated:
        true
    });
  }

  if (
    p.persistent_clicks &&
    t.clicks > 0
  ) {
    signals.push({
      code:
        "PERSISTENT_CLICKS",

      evidence:
        `Clicks ${t.clicks}`,

      repeated:
        true
    });
  }

  if (
    p.click_without_product_view &&
    t.clicks > 0
  ) {
    signals.push({
      code:
        "CLICK_WITHOUT_PRODUCT_VIEW",

      evidence:
        `Clicks ${t.clicks} → Product Views ${t.product_views}`,

      repeated:
        Boolean(
          p.persistent_funnel_block ||
          intel.rounds >= 2
        )
    });
  }

  if (
    p.persistent_funnel_block
  ) {
    signals.push({
      code:
        "PERSISTENT_FUNNEL_BLOCK",

      evidence:
        "PERSISTENT_FUNNEL_BLOCK",

      repeated:
        true
    });
  }

  if (
    p.persistent_no_customer
  ) {
    signals.push({
      code:
        "PERSISTENT_NO_CUSTOMER",

      evidence:
        `Customers ${t.customers}`,

      repeated:
        true
    });
  }

  if (
    p.persistent_no_order
  ) {
    signals.push({
      code:
        "PERSISTENT_NO_ORDER",

      evidence:
        `Orders ${t.orders}`,

      repeated:
        true
    });
  }

  if (
    p.persistent_no_revenue
  ) {
    signals.push({
      code:
        "PERSISTENT_NO_REVENUE",

      evidence:
        `Revenue ${t.revenue}`,

      repeated:
        true
    });
  }

  return signals;
}

/* =====================================================
   HYPOTHESES
===================================================== */

function buildHypotheses(
  intel
) {
  const t =
    intel.totals;

  const hypotheses = [];

  if (
    t.attention > 0 &&
    t.clicks > 0
  ) {
    hypotheses.push({
      type:
        "ATTENTION_CAN_PRODUCE_CLICK",

      evidence: {
        attention:
          t.attention,

        clicks:
          t.clicks
      }
    });
  }

  if (
    t.clicks > 0 &&
    t.product_views === 0
  ) {
    hypotheses.push({
      type:
        "CLICK_TO_PRODUCT_VIEW_PATH_REQUIRES_INVESTIGATION",

      evidence: {
        clicks:
          t.clicks,

        product_views:
          t.product_views
      }
    });
  }

  if (
    t.product_views > 0 &&
    t.customers === 0
  ) {
    hypotheses.push({
      type:
        "PRODUCT_VIEW_TO_CUSTOMER_PATH_REQUIRES_INVESTIGATION",

      evidence: {
        product_views:
          t.product_views,

        customers:
          t.customers
      }
    });
  }

  if (
    t.customers > 0 &&
    t.orders === 0
  ) {
    hypotheses.push({
      type:
        "CUSTOMER_TO_ORDER_PATH_REQUIRES_INVESTIGATION",

      evidence: {
        customers:
          t.customers,

        orders:
          t.orders
      }
    });
  }

  if (
    t.orders > 0 &&
    t.revenue === 0
  ) {
    hypotheses.push({
      type:
        "ORDER_TO_REVENUE_PATH_REQUIRES_INVESTIGATION",

      evidence: {
        orders:
          t.orders,

        revenue:
          t.revenue
      }
    });
  }

  return hypotheses;
}

/* =====================================================
   LEARNING STATE
===================================================== */

function determineState(
  intel,
  signals
) {
  const t =
    intel.totals;

  if (
    intel.patterns
      .persistent_funnel_block &&
    signals.some(
      signal =>
        signal.repeated
    )
  ) {
    return "REPEATED_DOWNSTREAM_BLOCK";
  }

  if (
    t.revenue > 0
  ) {
    return "CONVERSION_EVIDENCE_PRESENT";
  }

  if (
    t.customers > 0
  ) {
    return "CUSTOMER_EVIDENCE_PRESENT";
  }

  if (
    t.product_views > 0
  ) {
    return "PRODUCT_INTEREST_PRESENT";
  }

  if (
    t.clicks > 0
  ) {
    return "CLICK_SIGNAL_PRESENT";
  }

  if (
    t.attention > 0
  ) {
    return "ATTENTION_SIGNAL_PRESENT";
  }

  return "WAITING_FOR_EVIDENCE";
}

/* =====================================================
   CONFIDENCE
===================================================== */

function determineConfidence(
  intel,
  signals
) {
  const repeated =
    signals.filter(
      signal =>
        signal.repeated
    ).length;

  if (
    repeated >= 2 &&
    intel.rounds >= 10
  ) {
    return "HIGH";
  }

  if (
    repeated > 0 &&
    intel.rounds >= 2
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

/* =====================================================
   DECISION INPUT
===================================================== */

function buildDecisionInput(
  intel
) {
  const t =
    intel.totals;

  if (
    t.clicks > 0 &&
    t.product_views === 0
  ) {
    return {
      type:
        "INVESTIGATE_DOWNSTREAM_PATH",

      target:
        "CLICK_TO_PRODUCT_VIEW_PATH"
    };
  }

  if (
    t.product_views > 0 &&
    t.customers === 0
  ) {
    return {
      type:
        "INVESTIGATE_PRODUCT_TO_CUSTOMER",

      target:
        "PRODUCT_TO_CUSTOMER_PATH"
    };
  }

  if (
    t.customers > 0 &&
    t.orders === 0
  ) {
    return {
      type:
        "INVESTIGATE_CUSTOMER_TO_ORDER",

      target:
        "CUSTOMER_TO_ORDER_PATH"
    };
  }

  if (
    t.orders > 0 &&
    t.revenue === 0
  ) {
    return {
      type:
        "INVESTIGATE_ORDER_TO_REVENUE",

      target:
        "ORDER_TO_REVENUE_PATH"
    };
  }

  if (
    t.attention === 0 &&
    t.clicks === 0 &&
    t.product_views === 0 &&
    t.engagements === 0 &&
    t.customers === 0 &&
    t.orders === 0 &&
    t.revenue === 0
  ) {
    return {
      type:
        "WAIT_FOR_BEHAVIORAL_EVIDENCE",

      target:
        "CURRENT_CONTENT"
    };
  }

  return {
    type:
      "CONTINUE_OBSERVATION",

    target:
      "CURRENT_CONTENT"
  };
}

/* =====================================================
   BUILD LEARNING
===================================================== */

function buildLearning(
  intel,
  signals,
  hypotheses
) {
  const state =
    determineState(
      intel,
      signals
    );

  const confidence =
    determineConfidence(
      intel,
      signals
    );

  const decisionInput =
    buildDecisionInput(
      intel
    );

  const t =
    intel.totals;

  const evidenceAvailable =
    t.attention > 0 ||
    t.clicks > 0 ||
    t.product_views > 0 ||
    t.engagements > 0 ||
    t.customers > 0 ||
    t.orders > 0 ||
    t.revenue > 0;

  return {
    id:
      crypto.randomUUID(),

    layer:
      LAYER,

    version:
      VERSION,

    content_id:
      intel.content.id,

    status:
      "LEARNING_READY",

    state,

    confidence,

    evidence_available:
      evidenceAvailable,

    repeated_signal_count:
      signals.length,

    hypothesis_count:
      hypotheses.length,

    repeated_signals:
      signals,

    hypotheses,

    decision_input:
      decisionInput,

    evidence: {
      measurement_source:
        MEASUREMENT_SOURCE,

      intelligence_source:
        INTELLIGENCE_SOURCE,

      intelligence_state:
        intel.state,

      measurement_rounds:
        intel.rounds,

      metrics: {
        attention:
          t.attention,

        clicks:
          t.clicks,

        product_views:
          t.product_views,

        engagements:
          t.engagements,

        customers:
          t.customers,

        orders:
          t.orders,

        revenue:
          t.revenue
      },

      patterns:
        intel.patterns,

      conversions:
        intel.conversions,

      latest_measurement:
        intel.latest_measurement
    },

    feedback_context:
      intel.feedback_context,

    source_contract: {
      measurement:
        MEASUREMENT_SOURCE,

      intelligence:
        INTELLIGENCE_SOURCE,

      learning:
        LAYER,

      feedback:
        FEEDBACK_SOURCE,

      decision:
        DECISION_SOURCE,

      intelligence_version:
        "2.1",

      intelligence_engine:
        "INTELLIGENCE_V2.1_FEEDBACK_AWARE",

      learning_version:
        VERSION,

      content_id:
        intel.content.id,

      intelligence_content_id:
        intel.content.id
    },

    guardrails: {
      reads_raw_behavior_events:
        false,

      recalculates_measurement:
        false,

      recalculates_intelligence:
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

      action_selected:
        false,

      automatic_execution:
        false,

      action_executed:
        false,

      requires_decision_layer:
        true
    },

    handoff: {
      next_layer:
        "DECISION_LAYER_V1.1",

      decision_required:
        true,

      execute:
        false
    }
  };
}

/* =====================================================
   AI ANALYSIS
===================================================== */

async function runAI(
  env,
  learning
) {
  const fallback = {
    status:
      "FALLBACK_ANALYZED",

    model:
      MODEL,

    analysis: {
      summary:
        "พบหลักฐานพฤติกรรมจาก Intelligence Layer",

      observed_signals:
        learning.repeated_signals.map(
          signal =>
            `${signal.code}: ${signal.evidence}`
        ),

      learning: {
        what_we_learned:
          learning.hypotheses.length
            ? learning.hypotheses
                .map(
                  hypothesis =>
                    hypothesis.type
                )
                .join(", ")
            : "ยังไม่มี hypothesis เพิ่มเติม",

        confidence:
          learning.confidence
      },

      problems:
        learning.hypotheses.map(
          hypothesis =>
            hypothesis.type
        ),

      next_content: {
        action:
          "WAIT",

        direction:
          "รอ Decision Layer ประเมินหลักฐาน",

        angle:
          learning
            .decision_input
            .target,

        cta:
          "ดูรายละเอียดและทดลอง TATO",

        success_metric:
          "Downstream Behavioral Evidence"
      },

      next_action: {
        type:
          "WAIT",

        reason:
          learning
            .decision_input
            .type
      },

      priority:
        learning.confidence ===
        "HIGH"
          ? "HIGH"
          : "MEDIUM"
    },

    debug: {
      ai_called:
        false,

      response_text_received:
        false,

      parsed_json:
        false,

      error:
        null
    }
  };

  /*
   * AI is optional.
   * Deterministic Learning state
   * never depends on AI output.
   */

  if (
    !env?.AI ||
    typeof env.AI.run !==
      "function"
  ) {
    return fallback;
  }

  try {
    const result =
      await env.AI.run(
        MODEL,
        {
          messages: [
            {
              role:
                "system",

              content:
                [
                  "You are an evidence-only learning analyst.",
                  "Use only the supplied evidence.",
                  "Do not choose strategy.",
                  "Do not declare winners.",
                  "Do not execute actions.",
                  "Do not treat feedback as behavior.",
                  "Do not treat feedback as attention.",
                  "Do not alter funnel metrics.",
                  "Return factual evidence analysis only."
                ].join(" ")
            },

            {
              role:
                "user",

              content:
                JSON.stringify({
                  state:
                    learning.state,

                  confidence:
                    learning.confidence,

                  repeated_signals:
                    learning.repeated_signals,

                  hypotheses:
                    learning.hypotheses,

                  decision_input:
                    learning.decision_input,

                  evidence:
                    learning.evidence,

                  feedback_context:
                    learning.feedback_context
                })
            }
          ]
        }
      );

    return {
      status:
        "AI_ANALYZED",

      model:
        MODEL,

      analysis:
        result,

      debug: {
        ai_called:
          true,

        response_text_received:
          true,

        parsed_json:
          true,

        error:
          null
      }
    };
  } catch (error) {
    return {
      ...fallback,

      debug: {
        ai_called:
          true,

        response_text_received:
          false,

        parsed_json:
          false,

        error:
          String(
            error?.message ||
            error
          )
      }
    };
  }
}

/* =====================================================
   PIPELINE
===================================================== */

async function runLearning(
  request,
  env,
  contentId
) {
  const raw =
    await getIntelligence(
      request,
      contentId
    );

  const intelligence =
    normalizeIntelligence(
      raw,
      contentId
    );

  /*
   * Content contract.
   */

  if (
    intelligence.content.id !==
    contentId
  ) {
    throw new Error(
      "INTELLIGENCE_CONTENT_ID_MISMATCH"
    );
  }

  /*
   * Intelligence contract.
   */

  if (
    intelligence.intelligence_version !==
    "2.1"
  ) {
    throw new Error(
      "INTELLIGENCE_VERSION_CONTRACT_FAILED"
    );
  }

  if (
    intelligence.intelligence_engine !==
    "INTELLIGENCE_V2.1_FEEDBACK_AWARE"
  ) {
    throw new Error(
      "INTELLIGENCE_ENGINE_CONTRACT_FAILED"
    );
  }

  /*
   * Measurement contract.
   *
   * Intelligence V2.1 is expected to
   * consume Measurement V2.3.
   */

  const intelligenceSource =
    raw?.source_contract?.measurement ||
    raw?.intelligence?.source_contract?.measurement ||
    MEASUREMENT_SOURCE;

  if (
    intelligenceSource !==
    MEASUREMENT_SOURCE
  ) {
    throw new Error(
      `MEASUREMENT_SOURCE_CONTRACT_FAILED_EXPECTED_${MEASUREMENT_SOURCE}_GOT_${intelligenceSource}`
    );
  }

  /*
   * Feedback contract.
   */

  const feedbackContext =
    intelligence.feedback_context;

  if (
    feedbackContext
      .counted_as_behavior !==
      false
  ) {
    throw new Error(
      "FEEDBACK_BEHAVIOR_GUARDRAIL_FAILED"
    );
  }

  if (
    feedbackContext
      .counted_as_attention !==
      false
  ) {
    throw new Error(
      "FEEDBACK_ATTENTION_GUARDRAIL_FAILED"
    );
  }

  if (
    feedbackContext
      .alters_funnel_metrics !==
      false
  ) {
    throw new Error(
      "FEEDBACK_FUNNEL_GUARDRAIL_FAILED"
    );
  }

  const signals =
    detectRepeatedSignals(
      intelligence
    );

  const hypotheses =
    buildHypotheses(
      intelligence
    );

  const learning =
    buildLearning(
      intelligence,
      signals,
      hypotheses
    );

  const ai =
    await runAI(
      env,
      learning
    );

  return {
    success:
      true,

    layer:
      LAYER,

    version:
      VERSION,

    engine:
      "LEARNING_V2.3_FEEDBACK_AWARE",

    mode:
      "preview",

    status:
      "LEARNING_READY",

    content:
      intelligence.content,

    learning: {
      ...learning,

      ai
    },

    feedback_context:
      intelligence.feedback_context,

    source_chain: [
      MEASUREMENT_SOURCE,
      INTELLIGENCE_SOURCE,
      FEEDBACK_SOURCE,
      "LEARNING_V2.3_FEEDBACK_AWARE"
    ],

    loop: {
      current_layer:
        "LEARNING_V2.3",

      previous_layer:
        "INTELLIGENCE_V2.1",

      measurement_source:
        MEASUREMENT_SOURCE,

      feedback_source:
        FEEDBACK_SOURCE,

      next_layer:
        "DECISION_V1.1",

      decision_required:
        true,

      closed:
        false
    },

    next_step:
      "Pass Learning V2.3 evidence to Decision Layer V1.1."
  };
}

/* =====================================================
   GET
===================================================== */

export async function onRequestGet({
  request,
  env
}) {
  try {
    const contentId =
      resolveContentId(
        request
      );

    if (!contentId) {
      return json(
        {
          success:
            false,

          layer:
            LAYER,

          version:
            VERSION,

          error:
            "content_id_required",

          usage:
            "/api/learning-ai?content_id=YOUR_CONTENT_ID"
        },
        400
      );
    }

    return json(
      await runLearning(
        request,
        env,
        contentId
      )
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
          String(
            error?.message ||
            error
          )
      },
      500
    );
  }
}

/* =====================================================
   POST
===================================================== */

export async function onRequestPost({
  request,
  env
}) {
  try {
    let body = {};

    try {
      body =
        await request.json();
    } catch {
      body = {};
    }

    const contentId =
      resolveContentId(
        request,
        body
      );

    if (!contentId) {
      return json(
        {
          success:
            false,

          layer:
            LAYER,

          version:
            VERSION,

          error:
            "content_id_required"
        },
        400
      );
    }

    const result =
      await runLearning(
        request,
        env,
        contentId
      );

    return json({
      ...result,

      mode:
        "preview",

      saved:
        false
    });
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
          String(
            error?.message ||
            error
          )
      },
      500
    );
  }
}
