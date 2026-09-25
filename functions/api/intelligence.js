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
// Learning V2.3
//        ↓
// Decision V1.1
//
// Learning V2.3:
// - consumes Intelligence V2.1
// - consumes Intelligence feedback_context
// - does NOT recalculate Measurement
// - does NOT recalculate Intelligence
// - identifies repeated behavioral signals
// - creates learning hypotheses
// - prepares evidence for Decision Layer
// - does NOT declare a winner
// - does NOT change strategy
// - does NOT execute actions

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate"
};

const LAYER = "LEARNING_ENGINE_V2";
const VERSION = "2.3";

const INTELLIGENCE_SOURCE =
  "INTELLIGENCE_V2.1_FEEDBACK_AWARE";

const MEASUREMENT_SOURCE =
  "CONTENT_MEASUREMENT_ENGINE_V2.3";

const FEEDBACK_SOURCE =
  "FEEDBACK_LAYER_V1.1";

const DECISION_SOURCE =
  "DECISION_LAYER_V1.1";

const ATTENTION_TYPE =
  "weighted_behavioral_signal";

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: HEADERS
    }
  );
}

function text(value) {
  return value == null
    ? ""
    : String(value);
}

function numberValue(value) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : 0;
}

function safeJSON(value, fallback = null) {
  if (value == null) {
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

/*
 * -------------------------------------------------------
 * CONTENT
 * -------------------------------------------------------
 */

async function getContent(
  db,
  contentId
) {
  if (!contentId) {
    return null;
  }

  try {
    return await db
      .prepare(
        `SELECT *
         FROM content_engine
         WHERE id = ?
         LIMIT 1`
      )
      .bind(contentId)
      .first();
  } catch (_) {
    return null;
  }
}

/*
 * -------------------------------------------------------
 * INTELLIGENCE
 *
 * IMPORTANT:
 * Learning consumes the Intelligence API.
 *
 * It does NOT rebuild Intelligence from raw
 * Measurement data.
 * -------------------------------------------------------
 */

async function getIntelligence(
  context,
  contentId
) {
  const requestURL =
    new URL(
      context.request.url
    );

  requestURL.pathname =
    "/api/intelligence";

  requestURL.search = "";

  if (contentId) {
    requestURL.searchParams.set(
      "content_id",
      contentId
    );
  }

  const request =
    new Request(
      requestURL.toString(),
      {
        method: "GET",
        headers: {
          "Accept":
            "application/json"
        }
      }
    );

  const response =
    await context.env.ASSETS
      ? fetch(request)
      : fetch(request);

  if (!response.ok) {
    throw new Error(
      `Intelligence request failed: ${response.status}`
    );
  }

  const payload =
    await response.json();

  if (
    !payload ||
    payload.success !== true
  ) {
    throw new Error(
      "Invalid Intelligence response"
    );
  }

  if (
    payload.version !== "2.1"
  ) {
    throw new Error(
      `Unsupported Intelligence version: ${text(payload.version)}`
    );
  }

  if (
    payload.engine !==
    "INTELLIGENCE_V2.1_FEEDBACK_AWARE"
  ) {
    throw new Error(
      "Invalid Intelligence engine"
    );
  }

  if (
    !payload.intelligence
  ) {
    throw new Error(
      "Intelligence payload is missing"
    );
  }

  return payload;
}

/*
 * -------------------------------------------------------
 * NORMALIZE INTELLIGENCE
 * -------------------------------------------------------
 */

function normalizeIntelligence(
  payload
) {
  const source =
    payload.intelligence || {};

  const latest =
    source.latest_measurement || {};

  const totals =
    source.totals || {};

  const patterns =
    source.patterns || {};

  const conversions =
    source.conversions || {};

  return {
    layer:
      text(source.layer),

    version:
      text(source.version),

    engine:
      text(source.engine),

    state:
      text(source.state),

    confidence:
      text(source.confidence),

    content:
      source.content || null,

    latest_measurement: {
      id:
        latest.id || null,

      content_id:
        latest.content_id || null,

      measured_at:
        latest.measured_at || null,

      attention:
        numberValue(
          latest.attention
        ),

      product_views:
        numberValue(
          latest.product_views
        ),

      clicks:
        numberValue(
          latest.clicks
        ),

      engagements:
        numberValue(
          latest.engagements
        ),

      customers:
        numberValue(
          latest.customers
        ),

      orders:
        numberValue(
          latest.orders
        ),

      revenue:
        numberValue(
          latest.revenue
        )
    },

    measurement_rounds:
      numberValue(
        source.measurement_rounds
      ),

    totals: {
      attention:
        numberValue(
          totals.attention
        ),

      product_views:
        numberValue(
          totals.product_views
        ),

      clicks:
        numberValue(
          totals.clicks
        ),

      engagements:
        numberValue(
          totals.engagements
        ),

      customers:
        numberValue(
          totals.customers
        ),

      orders:
        numberValue(
          totals.orders
        ),

      revenue:
        numberValue(
          totals.revenue
        )
    },

    conversions,

    patterns,

    insights:
      Array.isArray(
        source.insights
      )
        ? source.insights
        : [],

    recommendation:
      source.recommendation ||
      null,

    feedback_context:
      source.feedback_context ||
      payload.feedback_context ||
      {
        available: false,
        role:
          "OPERATIONAL_CONTEXT_ONLY",
        counted_as_behavior:
          false,
        counted_as_attention:
          false,
        alters_funnel_metrics:
          false,
        source:
          FEEDBACK_SOURCE,
        latest: null
      }
  };
}

/*
 * -------------------------------------------------------
 * REPEATED SIGNALS
 * -------------------------------------------------------
 */

function buildRepeatedSignals(
  intelligence
) {
  const totals =
    intelligence.totals;

  const patterns =
    intelligence.patterns;

  const rounds =
    intelligence.measurement_rounds;

  const signals = [];

  if (
    patterns.persistent_attention
  ) {
    signals.push({
      type:
        "PERSISTENT_ATTENTION",

      evidence: {
        rounds,
        attention:
          totals.attention
      },

      meaning:
        "Attention เกิดต่อเนื่องหลายรอบ"
    });
  }

  if (
    patterns.click_without_product_view
  ) {
    signals.push({
      type:
        "CLICK_WITHOUT_PRODUCT_VIEW",

      evidence: {
        rounds,
        clicks:
          totals.clicks,

        product_views:
          totals.product_views
      },

      meaning:
        "มี Click ต่อเนื่องแต่ยังไม่พบ Product View"
    });
  }

  if (
    patterns.persistent_funnel_block
  ) {
    signals.push({
      type:
        "PERSISTENT_FUNNEL_BLOCK",

      evidence: {
        rounds,
        attention:
          totals.attention,

        clicks:
          totals.clicks,

        product_views:
          totals.product_views
      },

      meaning:
        "Funnel block เกิดต่อเนื่อง"
    });
  }

  if (
    patterns.persistent_no_customer
  ) {
    signals.push({
      type:
        "PERSISTENT_NO_CUSTOMER",

      evidence: {
        rounds,
        customers:
          totals.customers
      },

      meaning:
        "ยังไม่เกิด Customer หลังมี Measurement หลายรอบ"
    });
  }

  if (
    patterns.persistent_no_order
  ) {
    signals.push({
      type:
        "PERSISTENT_NO_ORDER",

      evidence: {
        rounds,
        orders:
          totals.orders
      },

      meaning:
        "ยังไม่เกิด Order หลังมี Measurement หลายรอบ"
    });
  }

  if (
    patterns.persistent_no_revenue
  ) {
    signals.push({
      type:
        "PERSISTENT_NO_REVENUE",

      evidence: {
        rounds,
        revenue:
          totals.revenue
      },

      meaning:
        "ยังไม่เกิด Revenue หลังมี Measurement หลายรอบ"
    });
  }

  return signals;
}

/*
 * -------------------------------------------------------
 * HYPOTHESES
 * -------------------------------------------------------
 */

function buildHypotheses(
  intelligence,
  repeatedSignals
) {
  const totals =
    intelligence.totals;

  const patterns =
    intelligence.patterns;

  const hypotheses = [];

  if (
    totals.attention > 0 &&
    totals.clicks > 0
  ) {
    hypotheses.push({
      type:
        "ATTENTION_TO_CLICK_SIGNAL",

      evidence: {
        attention:
          totals.attention,

        clicks:
          totals.clicks
      },

      hypothesis:
        "Content สามารถสร้าง Attention และพาผู้ใช้ไปถึง Click ได้"
    });
  }

  if (
    patterns.click_without_product_view
  ) {
    hypotheses.push({
      type:
        "DOWNSTREAM_PATH_REQUIRES_INVESTIGATION",

      evidence: {
        clicks:
          totals.clicks,

        product_views:
          totals.product_views
      },

      hypothesis:
        "จุดที่ควรตรวจสอบอยู่หลัง Click ก่อน Product View"
    });
  }

  if (
    patterns.persistent_no_customer
  ) {
    hypotheses.push({
      type:
        "CUSTOMER_CONVERSION_NOT_OBSERVED",

      evidence: {
        rounds:
          intelligence.measurement_rounds,

        customers:
          totals.customers
      },

      hypothesis:
        "ยังไม่มีหลักฐานเพียงพอว่า downstream behavior นำไปสู่ Customer"
    });
  }

  if (
    repeatedSignals.length >= 3
  ) {
    hypotheses.push({
      type:
        "REPEATED_SIGNAL_CLUSTER",

      evidence: {
        repeated_signal_count:
          repeatedSignals.length,

        rounds:
          intelligence.measurement_rounds
      },

      hypothesis:
        "มีหลาย behavioral signals เกิดซ้ำในทิศทางเดียวกันและควรส่งต่อให้ Decision Layer ตรวจสอบ"
    });
  }

  return hypotheses;
}

/*
 * -------------------------------------------------------
 * LEARNING STATE
 * -------------------------------------------------------
 */

function determineState(
  intelligence,
  repeatedSignals
) {
  const patterns =
    intelligence.patterns;

  if (
    patterns.persistent_funnel_block
  ) {
    return "REPEATED_DOWNSTREAM_BLOCK";
  }

  if (
    repeatedSignals.length >= 3
  ) {
    return "REPEATED_SIGNAL_CLUSTER";
  }

  if (
    repeatedSignals.length > 0
  ) {
    return "SIGNAL_DETECTED";
  }

  return "OBSERVING";
}

/*
 * -------------------------------------------------------
 * CONFIDENCE
 * -------------------------------------------------------
 */

function determineConfidence(
  intelligence,
  state
) {
  const rounds =
    intelligence.measurement_rounds;

  if (
    state ===
      "REPEATED_DOWNSTREAM_BLOCK" &&
    rounds >= 10
  ) {
    return "HIGH";
  }

  if (
    rounds >= 5
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

/*
 * -------------------------------------------------------
 * DECISION INPUT
 *
 * Learning does not decide the action.
 * -------------------------------------------------------
 */

function buildDecisionInput(
  intelligence,
  state
) {
  const patterns =
    intelligence.patterns;

  if (
    state ===
    "REPEATED_DOWNSTREAM_BLOCK"
  ) {
    return {
      input:
        "INVESTIGATE_DOWNSTREAM_PATH",

      target:
        "CLICK_TO_PRODUCT_VIEW_PATH",

      reason:
        "พบ Click ซ้ำโดยไม่มี Product View"
    };
  }

  if (
    patterns.persistent_no_customer
  ) {
    return {
      input:
        "INVESTIGATE_CONVERSION",

      target:
        "CLICK_TO_CUSTOMER_PATH",

      reason:
        "ยังไม่พบ Customer หลัง Measurement หลายรอบ"
    };
  }

  if (
    state ===
    "REPEATED_SIGNAL_CLUSTER"
  ) {
    return {
      input:
        "REVIEW_REPEATED_SIGNALS",

      target:
        "BEHAVIOR_SIGNAL_CLUSTER",

      reason:
        "พบ behavioral signals ซ้ำหลายประเภท"
    };
  }

  return {
    input:
      "CONTINUE_OBSERVATION",

    target:
      "MEASUREMENT_LOOP",

    reason:
      "ยังไม่มีหลักฐานเพียงพอ"
  };
}

/*
 * -------------------------------------------------------
 * LEARNING
 * -------------------------------------------------------
 */

function buildLearning(
  intelligence
) {
  const repeatedSignals =
    buildRepeatedSignals(
      intelligence
    );

  const hypotheses =
    buildHypotheses(
      intelligence,
      repeatedSignals
    );

  const state =
    determineState(
      intelligence,
      repeatedSignals
    );

  const confidence =
    determineConfidence(
      intelligence,
      state
    );

  const decisionInput =
    buildDecisionInput(
      intelligence,
      state
    );

  const feedback =
    intelligence.feedback_context ||
    {};

  return {
    layer:
      LAYER,

    version:
      VERSION,

    state,

    confidence,

    measurement_rounds:
      intelligence.measurement_rounds,

    repeated_signal_count:
      repeatedSignals.length,

    repeated_signals:
      repeatedSignals,

    hypotheses,

    evidence: {
      latest_measurement:
        intelligence.latest_measurement,

      totals:
        intelligence.totals,

      conversions:
        intelligence.conversions,

      patterns:
        intelligence.patterns
    },

    feedback_context: {
      available:
        feedback.available === true,

      role:
        "OPERATIONAL_CONTEXT_ONLY",

      source:
        FEEDBACK_SOURCE,

      counted_as_behavior:
        false,

      counted_as_attention:
        false,

      alters_funnel_metrics:
        false,

      latest:
        feedback.latest || null
    },

    decision_input:
      decisionInput,

    source_contract: {
      measurement:
        MEASUREMENT_SOURCE,

      intelligence:
        INTELLIGENCE_SOURCE,

      learning:
        `${LAYER}_${VERSION}`,

      next:
        DECISION_SOURCE
    },

    guardrails: {
      reads_raw_behavior:
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

      action_created:
        false,

      action_executed:
        false,

      automatic_execution:
        false,

      requires_decision_layer:
        true
    }
  };
}

/*
 * -------------------------------------------------------
 * SAVE LEARNING
 * -------------------------------------------------------
 */

async function saveLearning(
  db,
  content,
  intelligence,
  learning
) {
  const now =
    new Date().toISOString();

  const runId =
    crypto.randomUUID();

  const insightId =
    crypto.randomUUID();

  const contentId =
    content
      ? content.id
      : intelligence.latest_measurement
      ? intelligence.latest_measurement.content_id
      : null;

  const measurementId =
    intelligence.latest_measurement
      ? intelligence.latest_measurement.id
      : null;

  const inputData =
    JSON.stringify({
      layer:
        LAYER,

      version:
        VERSION,

      source_contract:
        learning.source_contract,

      content_id:
        contentId,

      measurement_id:
        measurementId,

      intelligence,

      learning
    });

  const outputData =
    JSON.stringify(
      learning
    );

  await db
    .prepare(
      `INSERT INTO ai_runs (
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      runId,
      null,
      "LEARNING",
      "RULE_BASED_V2.3",
      inputData,
      outputData,
      "COMPLETED",
      null,
      now
    )
    .run();

  const priority =
    learning.state ===
    "REPEATED_DOWNSTREAM_BLOCK"
      ? "HIGH"
      : learning.state ===
        "REPEATED_SIGNAL_CLUSTER"
      ? "MEDIUM"
      : "LOW";

  const score =
    priority === "HIGH"
      ? 90
      : priority === "MEDIUM"
      ? 60
      : 30;

  await db
    .prepare(
      `INSERT INTO ai_insights (
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      insightId,
      null,
      "LEARNING",
      "LEARNING_V2.3",
      "TATO Learning Engine V2.3",
      outputData,
      score,
      priority,
      "NEW",
      now
    )
    .run();

  return {
    run_id:
      runId,

    insight_id:
      insightId
  };
}

/*
 * -------------------------------------------------------
 * MAIN
 * -------------------------------------------------------
 */

async function analyze(
  context
) {
  const db =
    context.env.DB;

  if (!db) {
    throw new Error(
      "D1 binding DB is missing"
    );
  }

  const url =
    new URL(
      context.request.url
    );

  const contentId =
    url.searchParams.get(
      "content_id"
    );

  const intelligencePayload =
    await getIntelligence(
      context,
      contentId
    );

  const intelligence =
    normalizeIntelligence(
      intelligencePayload
    );

  if (
    intelligence.layer !==
    "INTELLIGENCE_LAYER_V2"
  ) {
    throw new Error(
      "Invalid Intelligence layer"
    );
  }

  if (
    intelligence.version !==
    "2.1"
  ) {
    throw new Error(
      "Learning requires Intelligence V2.1"
    );
  }

  const resolvedContentId =
    contentId ||
    intelligence.content &&
    intelligence.content.id
      ? (
          contentId ||
          intelligence.content.id
        )
      : null;

  const content =
    await getContent(
      db,
      resolvedContentId
    );

  const learning =
    buildLearning(
      intelligence
    );

  return {
    content,
    intelligence,
    learning
  };
}

/*
 * -------------------------------------------------------
 * RESPONSE
 * -------------------------------------------------------
 */

function buildResponse(
  result,
  mode
) {
  const intelligence =
    result.intelligence;

  const learning =
    result.learning;

  return {
    success:
      true,

    layer:
      LAYER,

    version:
      VERSION,

    mode,

    status:
      "LEARNING_READY",

    content:
      result.content
        ? {
            id:
              result.content.id,

            title:
              result.content.title,

            status:
              result.content.status
          }
        : intelligence.content
        ? {
            id:
              intelligence.content.id,

            title:
              intelligence.content.title,

            status:
              result.content
                ? result.content.status
                : null
          }
        : null,

    measurement: {
      id:
        intelligence.latest_measurement.id,

      attention:
        intelligence.latest_measurement.attention,

      clicks:
        intelligence.latest_measurement.clicks,

      product_views:
        intelligence.latest_measurement.product_views,

      engagements:
        intelligence.latest_measurement.engagements,

      customers:
        intelligence.latest_measurement.customers,

      orders:
        intelligence.latest_measurement.orders,

      revenue:
        intelligence.latest_measurement.revenue
    },

    intelligence: {
      layer:
        intelligence.layer,

      version:
        intelligence.version,

      engine:
        intelligence.engine,

      state:
        intelligence.state,

      confidence:
        intelligence.confidence,

      measurement_rounds:
        intelligence.measurement_rounds,

      totals:
        intelligence.totals,

      patterns:
        intelligence.patterns,

      recommendation:
        intelligence.recommendation
    },

    learning,

    source_chain: [
      MEASUREMENT_SOURCE,
      INTELLIGENCE_SOURCE,
      `${LAYER}_${VERSION}`
    ],

    handoff: {
      next_layer:
        DECISION_SOURCE,

      ready:
        true
    },

    guardrails:
      learning.guardrails,

    loop: {
      current_layer:
        `${LAYER}_${VERSION}`,

      previous_layer:
        "INTELLIGENCE_V2.1",

      next_layer:
        "DECISION_V1.1",

      closed:
        false
    },

    next_step:
      "Learning signal ready for Decision Layer."
  };
}

/*
 * -------------------------------------------------------
 * GET
 * -------------------------------------------------------
 */

export async function onRequestGet(
  context
) {
  try {
    const result =
      await analyze(
        context
      );

    return json(
      buildResponse(
        result,
        "preview"
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
          error &&
          error.message
            ? error.message
            : String(error)
      },
      500
    );
  }
}

/*
 * -------------------------------------------------------
 * POST
 * -------------------------------------------------------
 */

export async function onRequestPost(
  context
) {
  try {
    let body = {};

    try {
      body =
        await context.request.json();
    } catch (_) {}

    const result =
      await analyze(
        context
      );

    const mode =
      body &&
      body.mode
        ? body.mode
        : "preview";

    if (
      mode !== "execute"
    ) {
      return json(
        buildResponse(
          result,
          "preview"
        )
      );
    }

    const saved =
      await saveLearning(
        context.env.DB,
        result.content,
        result.intelligence,
        result.learning
      );

    const response =
      buildResponse(
        result,
        "execute"
      );

    response.saved =
      true;

    response.run_id =
      saved.run_id;

    response.insight_id =
      saved.insight_id;

    return json(
      response
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
          error &&
          error.message
            ? error.message
            : String(error)
      },
      500
    );
  }
}
