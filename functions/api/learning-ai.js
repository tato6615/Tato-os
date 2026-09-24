// TATO-OS
// Learning Engine V2.0
// Route: /api/learning-ai
//
// Pipeline:
//
// Measurement V2.2
//        ↓
// Intelligence V2.1
//        ↓
// Learning Engine V2.0
//        ↓
// Decision Layer V1.0
//        ↓
// Action Layer V1.0
//        ↓
// Feedback
//        ↓
// Measurement
//
// PRINCIPLES
//
// Learning DOES:
// - consume Intelligence output
// - detect repeated behavioral patterns
// - identify persistent funnel blocks
// - create evidence-based learning hypotheses
// - expose evidence to Decision Layer
//
// Learning DOES NOT:
// - read behavior_events directly
// - read customers directly
// - read orders directly
// - recalculate Measurement
// - declare winners
// - change strategy
// - execute actions
// - choose business actions
// - depend on AI for core state determination
//
// V2.0 CHANGE
//
// V1.x:
// Learning recalculated raw behavioral metrics itself.
//
// V2.0:
// Intelligence is the single upstream evidence contract.
// Learning interprets Intelligence only.

const VERSION = "2.0";
const LAYER = "LEARNING_ENGINE_V2";
const INTELLIGENCE_SOURCE = "INTELLIGENCE_LAYER_V2.1";
const MEASUREMENT_SOURCE = "CONTENT_MEASUREMENT_ENGINE_V2.2";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: HEADERS
  });
}

function id() {
  return crypto.randomUUID();
}

function s(value) {
  return value == null ? "" : String(value);
}

function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

function bool(value) {
  return value === true || value === 1 || value === "true";
}

function upper(value) {
  return s(value).trim().toUpperCase();
}

/**
 * Resolve content ID.
 *
 * Priority:
 * 1. URL query
 * 2. POST body
 *
 * Learning V2 requires an explicit content scope.
 * It must never silently analyze an arbitrary latest content item.
 */
async function resolveContentId(request) {
  const url = new URL(request.url);

  const queryId =
    url.searchParams.get("content_id") ||
    url.searchParams.get("contentId");

  if (queryId) {
    return queryId;
  }

  return null;
}

/**
 * Fetch Intelligence V2.1.
 *
 * Learning does NOT calculate the underlying metrics.
 * Intelligence is the source of truth.
 */
async function getIntelligence(request, contentId) {
  const incoming = new URL(request.url);

  const intelligenceUrl = new URL(
    "/api/intelligence",
    incoming.origin
  );

  intelligenceUrl.searchParams.set("content_id", contentId);

  const response = await fetch(intelligenceUrl.toString(), {
    method: "GET",
    headers: {
      "Cache-Control": "no-store"
    }
  });

  const text = await response.text();

  let data = null;

  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new Error(
      `INTELLIGENCE_INVALID_JSON:${text.slice(0, 300)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `INTELLIGENCE_HTTP_${response.status}`
    );
  }

  if (!data?.success) {
    throw new Error(
      data?.error ||
      "INTELLIGENCE_SOURCE_FAILED"
    );
  }

  return data;
}

/**
 * Normalize Intelligence output.
 *
 * Intelligence versions may expose evidence under slightly
 * different nesting. This keeps Learning isolated from
 * implementation details while preserving the contract.
 */
function normalizeIntelligence(raw) {
  const intelligence =
    raw?.intelligence ||
    raw?.analysis ||
    raw?.result ||
    {};

  const metrics =
    intelligence?.metrics ||
    raw?.metrics ||
    {};

  const patterns =
    intelligence?.patterns ||
    raw?.patterns ||
    {};

  const conversions =
    intelligence?.conversions ||
    intelligence?.conversion ||
    raw?.conversions ||
    raw?.conversion ||
    {};

  const state =
    upper(
      intelligence?.state ||
      raw?.state ||
      "UNKNOWN"
    );

  const content =
    raw?.content ||
    intelligence?.content ||
    {};

  const latestMeasurement =
    raw?.latest_measurement ||
    intelligence?.latest_measurement ||
    raw?.measurement ||
    {};

  return {
    raw,

    state,

    metrics: {
      attention: n(
        metrics.attention ??
        raw?.attention
      ),

      clicks: n(
        metrics.clicks ??
        raw?.clicks
      ),

      product_views: n(
        metrics.product_views ??
        metrics.productViews ??
        raw?.product_views
      ),

      engagements: n(
        metrics.engagements ??
        raw?.engagements
      ),

      customers: n(
        metrics.customers ??
        raw?.customers
      ),

      orders: n(
        metrics.orders ??
        raw?.orders
      ),

      revenue: n(
        metrics.revenue ??
        raw?.revenue
      )
    },

    patterns: {
      persistent_attention: bool(
        patterns.persistent_attention
      ),

      persistent_clicks: bool(
        patterns.persistent_clicks
      ),

      click_without_product_view: bool(
        patterns.click_without_product_view
      ),

      persistent_funnel_block: bool(
        patterns.persistent_funnel_block
      ),

      no_behavior: bool(
        patterns.no_behavior
      )
    },

    conversions,

    content: {
      id:
        content.id ||
        raw?.content_id ||
        null,

      title:
        content.title ||
        raw?.title ||
        null,

      status:
        content.status ||
        raw?.content_status ||
        null
    },

    latest_measurement: {
      id:
        latestMeasurement.id ||
        raw?.latest_measurement_id ||
        null,

      attention:
        n(latestMeasurement.attention),

      clicks:
        n(latestMeasurement.clicks),

      product_views:
        n(latestMeasurement.product_views),

      engagements:
        n(latestMeasurement.engagements),

      customers:
        n(latestMeasurement.customers),

      orders:
        n(latestMeasurement.orders),

      revenue:
        n(latestMeasurement.revenue)
    },

    rounds:
      n(
        raw?.measurement_rounds ??
        intelligence?.measurement_rounds ??
        intelligence?.rounds
      )
  };
}

/**
 * Detect repeated signals.
 *
 * This function does not create new Measurement data.
 * It only interprets the patterns already established
 * by Intelligence.
 */
function detectRepeatedSignals(i) {
  const signals = [];

  if (i.patterns.persistent_attention) {
    signals.push({
      code: "PERSISTENT_ATTENTION",
      evidence: `Attention ${i.metrics.attention}`,
      repeated: true
    });
  }

  if (i.patterns.persistent_clicks) {
    signals.push({
      code: "PERSISTENT_CLICKS",
      evidence: `Clicks ${i.metrics.clicks}`,
      repeated: true
    });
  }

  if (i.patterns.click_without_product_view) {
    signals.push({
      code: "CLICK_WITHOUT_PRODUCT_VIEW",
      evidence:
        `Clicks ${i.metrics.clicks} → Product Views ${i.metrics.product_views}`,
      repeated:
        i.patterns.persistent_clicks === true
    });
  }

  if (i.patterns.persistent_funnel_block) {
    signals.push({
      code: "PERSISTENT_FUNNEL_BLOCK",
      evidence: i.state,
      repeated: true
    });
  }

  return signals;
}

/**
 * Generate Learning hypotheses.
 *
 * Hypotheses are NOT decisions.
 */
function buildHypotheses(i, signals) {
  const hypotheses = [];

  const hasAttention =
    i.metrics.attention > 0;

  const hasClicks =
    i.metrics.clicks > 0;

  const hasProductViews =
    i.metrics.product_views > 0;

  const hasCustomers =
    i.metrics.customers > 0;

  const hasOrders =
    i.metrics.orders > 0;

  if (
    hasAttention &&
    hasClicks &&
    !hasProductViews
  ) {
    hypotheses.push({
      code: "ATTENTION_CAN_PRODUCE_CLICK",
      statement:
        "มีหลักฐานว่า Attention เชื่อมโยงกับ Click",
      evidence: [
        `attention=${i.metrics.attention}`,
        `clicks=${i.metrics.clicks}`
      ],
      confidence:
        i.patterns.persistent_attention &&
        i.patterns.persistent_clicks
          ? "HIGH"
          : "MEDIUM"
    });

    hypotheses.push({
      code:
        "CLICK_TO_PRODUCT_VIEW_PATH_REQUIRES_INVESTIGATION",
      statement:
        "เกิด Click แต่ยังไม่พบ Product View จึงควรตรวจสอบเส้นทางหลัง Click",
      evidence: [
        `clicks=${i.metrics.clicks}`,
        `product_views=${i.metrics.product_views}`
      ],
      confidence:
        i.patterns.click_without_product_view
          ? "HIGH"
          : "MEDIUM"
    });
  }

  if (
    hasProductViews &&
    !hasCustomers
  ) {
    hypotheses.push({
      code:
        "PRODUCT_VIEW_TO_CUSTOMER_PATH_REQUIRES_INVESTIGATION",
      statement:
        "มี Product View แต่ยังไม่พบ Customer evidence",
      evidence: [
        `product_views=${i.metrics.product_views}`,
        `customers=${i.metrics.customers}`
      ],
      confidence: "MEDIUM"
    });
  }

  if (
    hasCustomers &&
    !hasOrders
  ) {
    hypotheses.push({
      code:
        "CUSTOMER_TO_ORDER_PATH_REQUIRES_INVESTIGATION",
      statement:
        "มี Customer evidence แต่ยังไม่พบ Order evidence",
      evidence: [
        `customers=${i.metrics.customers}`,
        `orders=${i.metrics.orders}`
      ],
      confidence: "MEDIUM"
    });
  }

  if (
    hasOrders &&
    i.metrics.revenue <= 0
  ) {
    hypotheses.push({
      code:
        "ORDER_TO_REVENUE_PATH_REQUIRES_INVESTIGATION",
      statement:
        "มี Order evidence แต่ยังไม่พบ Revenue evidence",
      evidence: [
        `orders=${i.metrics.orders}`,
        `revenue=${i.metrics.revenue}`
      ],
      confidence: "HIGH"
    });
  }

  if (
    signals.length === 0 &&
    i.metrics.attention === 0 &&
    i.metrics.clicks === 0 &&
    i.metrics.product_views === 0 &&
    i.metrics.customers === 0 &&
    i.metrics.orders === 0
  ) {
    hypotheses.push({
      code: "INSUFFICIENT_BEHAVIORAL_EVIDENCE",
      statement:
        "ยังมี behavioral evidence ไม่เพียงพอสำหรับสร้าง learning hypothesis",
      evidence: [
        "attention=0",
        "clicks=0",
        "product_views=0",
        "customers=0",
        "orders=0"
      ],
      confidence: "LOW"
    });
  }

  return hypotheses;
}

/**
 * Determine Learning state.
 *
 * This is intentionally deterministic.
 * No AI is involved.
 */
function determineLearningState(i, hypotheses) {
  if (
    i.patterns.persistent_funnel_block ||
    i.patterns.click_without_product_view
  ) {
    return "REPEATED_DOWNSTREAM_BLOCK";
  }

  if (
    i.metrics.orders > 0 &&
    i.metrics.revenue > 0
  ) {
    return "CONVERSION_EVIDENCE_PRESENT";
  }

  if (
    i.metrics.customers > 0
  ) {
    return "CUSTOMER_EVIDENCE_PRESENT";
  }

  if (
    i.metrics.product_views > 0
  ) {
    return "PRODUCT_INTEREST_PRESENT";
  }

  if (
    i.metrics.clicks > 0
  ) {
    return "CLICK_SIGNAL_PRESENT";
  }

  if (
    i.metrics.attention > 0
  ) {
    return "ATTENTION_SIGNAL_PRESENT";
  }

  if (hypotheses.length === 1) {
    return "INSUFFICIENT_EVIDENCE";
  }

  return "WAITING_FOR_EVIDENCE";
}

/**
 * Determine confidence from upstream Intelligence evidence.
 *
 * This is NOT a prediction.
 */
function determineConfidence(i, state) {
  if (
    state === "REPEATED_DOWNSTREAM_BLOCK" &&
    i.rounds >= 2
  ) {
    return "HIGH";
  }

  if (
    i.rounds >= 2 &&
    (
      i.metrics.attention > 0 ||
      i.metrics.clicks > 0 ||
      i.metrics.product_views > 0
    )
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

/**
 * Build decision input.
 *
 * Learning does not execute it.
 * Decision Layer remains responsible for deciding.
 */
function buildDecisionInput(i, state, hypotheses) {
  if (
    state === "REPEATED_DOWNSTREAM_BLOCK"
  ) {
    if (
      i.metrics.attention > 0 &&
      i.metrics.clicks > 0 &&
      i.metrics.product_views === 0
    ) {
      return {
        type: "INVESTIGATE_DOWNSTREAM_PATH",
        target: "CLICK_TO_PRODUCT_VIEW_PATH"
      };
    }
  }

  if (
    state === "PRODUCT_INTEREST_PRESENT"
  ) {
    return {
      type:
        "INVESTIGATE_PRODUCT_TO_CUSTOMER",
      target:
        "PRODUCT_TO_CUSTOMER_PATH"
    };
  }

  if (
    state === "CUSTOMER_EVIDENCE_PRESENT" &&
    i.metrics.orders === 0
  ) {
    return {
      type:
        "INVESTIGATE_CUSTOMER_TO_ORDER",
      target:
        "CUSTOMER_TO_ORDER_PATH"
    };
  }

  if (
    state === "CONVERSION_EVIDENCE_PRESENT" &&
    i.metrics.revenue <= 0
  ) {
    return {
      type:
        "INVESTIGATE_ORDER_TO_REVENUE",
      target:
        "ORDER_TO_REVENUE_PATH"
    };
  }

  if (
    state === "WAITING_FOR_EVIDENCE" ||
    state === "INSUFFICIENT_EVIDENCE"
  ) {
    return {
      type:
        "WAIT_FOR_BEHAVIORAL_EVIDENCE",
      target:
        "BEHAVIORAL_DATA"
    };
  }

  return {
    type: "CONTINUE_OBSERVATION",
    target: "CURRENT_CONTENT"
  };
}

/**
 * Build complete Learning result.
 */
function buildLearning(contentId, intelligence) {
  const i = normalizeIntelligence(
    intelligence
  );

  const repeatedSignals =
    detectRepeatedSignals(i);

  const hypotheses =
    buildHypotheses(
      i,
      repeatedSignals
    );

  const state =
    determineLearningState(
      i,
      hypotheses
    );

  const confidence =
    determineConfidence(
      i,
      state
    );

  const decisionInput =
    buildDecisionInput(
      i,
      state,
      hypotheses
    );

  const hasEvidence =
    i.metrics.attention > 0 ||
    i.metrics.clicks > 0 ||
    i.metrics.product_views > 0 ||
    i.metrics.engagements > 0 ||
    i.metrics.customers > 0 ||
    i.metrics.orders > 0 ||
    i.metrics.revenue > 0;

  return {
    id: id(),

    layer: LAYER,
    version: VERSION,

    content_id:
      contentId,

    status: "LEARNING_READY",

    state,

    confidence,

    evidence_available:
      hasEvidence,

    repeated_signal_count:
      repeatedSignals.length,

    hypothesis_count:
      hypotheses.length,

    repeated_signals:
      repeatedSignals,

    hypotheses,

    decision_input:
      decisionInput,

    evidence: {
      measurement_source:
        MEASUREMENT_SOURCE,

      intelligence_source:
        INTELLIGENCE_SOURCE,

      intelligence_state:
        i.state,

      measurement_rounds:
        i.rounds,

      metrics:
        i.metrics,

      patterns:
        i.patterns,

      conversions:
        i.conversions,

      latest_measurement:
        i.latest_measurement
    },

    source_contract: {
      measurement:
        MEASUREMENT_SOURCE,

      intelligence:
        INTELLIGENCE_SOURCE,

      learning:
        LAYER,

      content_id:
        contentId,

      intelligence_content_id:
        i.content.id
    },

    guardrails: {
      reads_raw_behavior_events:
        false,

      recalculates_measurement:
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
        "DECISION_LAYER_V1",

      decision_required:
        true,

      execute:
        false
    }
  };
}

/**
 * Optional persistence.
 *
 * Creates a dedicated learning_runs table.
 * Learning history is separated from AI runs because
 * Learning V2 is no longer an AI-dependent layer.
 */
async function ensureLearningTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS learning_runs (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      version TEXT,
      state TEXT,
      confidence TEXT,
      decision_input TEXT,
      evidence TEXT,
      hypotheses TEXT,
      status TEXT,
      created_at TEXT
    )
  `).run();
}

async function saveLearning(db, result) {
  await ensureLearningTable(db);

  const now =
    new Date().toISOString();

  await db.prepare(`
    INSERT INTO learning_runs (
      id,
      content_id,
      version,
      state,
      confidence,
      decision_input,
      evidence,
      hypotheses,
      status,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      result.id,
      result.content_id,
      VERSION,
      result.state,
      result.confidence,
      JSON.stringify(
        result.decision_input
      ),
      JSON.stringify(
        result.evidence
      ),
      JSON.stringify(
        result.hypotheses
      ),
      result.status,
      now
    )
    .run();

  return {
    ...result,
    saved: true,
    saved_at: now
  };
}

/**
 * GET
 *
 * Preview only.
 *
 * Example:
 * /api/learning-ai?content_id=YOUR_CONTENT_ID
 */
export async function onRequestGet(context) {
  try {
    const contentId =
      await resolveContentId(
        context.request
      );

    if (!contentId) {
      return json(
        {
          success: false,
          layer: LAYER,
          version: VERSION,
          error: "content_id_required",
          usage:
            "/api/learning-ai?content_id=YOUR_CONTENT_ID"
        },
        400
      );
    }

    const intelligence =
      await getIntelligence(
        context.request,
        contentId
      );

    const learning =
      buildLearning(
        contentId,
        intelligence
      );

    return json({
      success: true,

      layer: LAYER,
      version: VERSION,

      mode: "preview",
      status: "LEARNING_READY",

      learning,

      next_step:
        "Pass Learning evidence to Decision Layer."
    });

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

/**
 * POST
 *
 * Default:
 * preview
 *
 * mode=save:
 * persist Learning run.
 */
export async function onRequestPost(context) {
  try {
    let body = {};

    try {
      body =
        await context.request.json();
    } catch (_) {
      body = {};
    }

    const url =
      new URL(context.request.url);

    const contentId =
      body?.content_id ||
      body?.contentId ||
      url.searchParams.get(
        "content_id"
      ) ||
      url.searchParams.get(
        "contentId"
      );

    if (!contentId) {
      return json(
        {
          success: false,
          layer: LAYER,
          version: VERSION,
          error: "content_id_required",
          usage:
            "POST /api/learning-ai with {content_id, mode}"
        },
        400
      );
    }

    const mode =
      upper(body?.mode || "preview");

    const intelligence =
      await getIntelligence(
        context.request,
        contentId
      );

    const learning =
      buildLearning(
        contentId,
        intelligence
      );

    if (mode === "SAVE") {
      const saved =
        await saveLearning(
          context.env.DB,
          learning
        );

      return json({
        success: true,

        layer: LAYER,
        version: VERSION,

        mode: "save",
        status: "SAVED",

        learning: saved,

        next_step:
          "Pass Learning evidence to Decision Layer."
      });
    }

    return json({
      success: true,

      layer: LAYER,
      version: VERSION,

      mode: "preview",
      status: "LEARNING_READY",

      learning,

      next_step:
        "Pass Learning evidence to Decision Layer."
    });

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
