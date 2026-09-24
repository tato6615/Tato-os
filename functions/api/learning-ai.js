// TATO-OS
// Learning Engine V2.1
// Route: /api/learning-ai
//
// Pipeline:
//
// Measurement V2.2
//        ↓
// Intelligence V2.1
//        ↓
// Learning Engine V2.1
//        ↓
// Decision Layer V1
//        ↓
// Action Layer V1
//
// Learning DOES:
// - consume Intelligence output
// - normalize Intelligence evidence
// - identify repeated behavioral signals
// - create learning hypotheses
// - provide evidence to Decision Layer
//
// Learning DOES NOT:
// - read raw behavior_events
// - read customers directly
// - read orders directly
// - recalculate Measurement
// - declare winners
// - change strategy
// - select actions
// - execute actions
//
// V2.1 FIX:
// - robust Intelligence response normalization
// - uses intelligence.totals as primary evidence
// - uses intelligence.patterns as behavioral state
// - preserves latest_measurement as supporting evidence
// - prevents false zero metrics when Intelligence already contains evidence

const VERSION = "2.1";
const LAYER = "LEARNING_ENGINE_V2";
const MEASUREMENT_SOURCE = "CONTENT_MEASUREMENT_ENGINE_V2.2";
const INTELLIGENCE_SOURCE = "INTELLIGENCE_LAYER_V2.1";

const MODEL = "@cf/zai-org/glm-4.7-flash";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });

function now() {
  return new Date().toISOString();
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstDefined(...values) {
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

function resolveContentId(request, body = {}) {
  const url = new URL(request.url);

  return (
    url.searchParams.get("content_id") ||
    body.content_id ||
    body.contentId ||
    null
  );
}

/* -------------------------------------------------------
   INTELLIGENCE
------------------------------------------------------- */

async function getIntelligence(request, contentId) {
  const url = new URL(request.url);

  const intelligenceUrl =
    `${url.origin}/api/intelligence?content_id=${encodeURIComponent(contentId)}`;

  const response = await fetch(intelligenceUrl, {
    method: "GET",
    headers: {
      "accept": "application/json"
    }
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `intelligence_invalid_json:${response.status}`
    );
  }

  if (!response.ok || data?.success === false) {
    throw new Error(
      `intelligence_request_failed:${response.status}`
    );
  }

  return data;
}

/* -------------------------------------------------------
   INTELLIGENCE NORMALIZATION V2.1
------------------------------------------------------- */

function extractIntelligencePayload(raw) {
  const root = safeObject(raw);

  /*
   Intelligence implementations can expose their payload
   under different containers.

   Priority:
   root.intelligence
   root.data.intelligence
   root.result.intelligence
   root.data
   root.result
   root
  */

  const candidates = [
    root.intelligence,
    root.data?.intelligence,
    root.result?.intelligence,
    root.data,
    root.result,
    root
  ];

  for (const candidate of candidates) {
    const obj = safeObject(candidate);

    if (
      obj.totals ||
      obj.patterns ||
      obj.conversions ||
      obj.state ||
      obj.latest_measurement
    ) {
      return obj;
    }
  }

  return safeObject(root.intelligence || root);
}

function normalizeIntelligence(raw, contentId) {
  const root = safeObject(raw);
  const intel = extractIntelligencePayload(raw);

  const totals = safeObject(
    firstDefined(
      intel.totals,
      root.intelligence?.totals,
      root.data?.intelligence?.totals,
      root.result?.intelligence?.totals
    )
  );

  const patterns = safeObject(
    firstDefined(
      intel.patterns,
      root.intelligence?.patterns,
      root.data?.intelligence?.patterns,
      root.result?.intelligence?.patterns
    )
  );

  const conversions = safeObject(
    firstDefined(
      intel.conversions,
      root.intelligence?.conversions,
      root.data?.intelligence?.conversions,
      root.result?.intelligence?.conversions
    )
  );

  const latestMeasurement = safeObject(
    firstDefined(
      intel.latest_measurement,
      intel.latestMeasurement,
      root.latest_measurement,
      root.latestMeasurement,
      root.data?.latest_measurement,
      root.result?.latest_measurement
    )
  );

  const content = safeObject(
    firstDefined(
      intel.content,
      root.content,
      root.data?.content,
      root.result?.content
    )
  );

  /*
   IMPORTANT:

   Intelligence totals are the primary source.

   We DO NOT replace them with zeros merely because
   another nested object is missing.
  */

  const attention = safeNumber(
    firstDefined(
      totals.attention,
      totals.attention_count,
      intel.attention,
      root.attention,
      latestMeasurement.attention
    )
  );

  const clicks = safeNumber(
    firstDefined(
      totals.clicks,
      totals.click,
      totals.click_count,
      intel.clicks,
      root.clicks,
      latestMeasurement.clicks
    )
  );

  const productViews = safeNumber(
    firstDefined(
      totals.product_views,
      totals.productViews,
      totals.product_view,
      intel.product_views,
      intel.productViews,
      root.product_views,
      latestMeasurement.product_views,
      latestMeasurement.productViews
    )
  );

  const engagements = safeNumber(
    firstDefined(
      totals.engagements,
      totals.engagement,
      totals.engagement_count,
      intel.engagements,
      root.engagements,
      latestMeasurement.engagements
    )
  );

  const customers = safeNumber(
    firstDefined(
      totals.customers,
      totals.customer_count,
      intel.customers,
      root.customers,
      latestMeasurement.customers
    )
  );

  const orders = safeNumber(
    firstDefined(
      totals.orders,
      totals.order_count,
      intel.orders,
      root.orders,
      latestMeasurement.orders
    )
  );

  const revenue = safeNumber(
    firstDefined(
      totals.revenue,
      totals.sales,
      intel.revenue,
      root.revenue,
      latestMeasurement.revenue
    )
  );

  const rounds = safeNumber(
    firstDefined(
      intel.rounds,
      patterns.rounds,
      root.measurement_rounds,
      root.measurementRounds,
      root.rounds,
      0
    )
  );

  const state =
    firstDefined(
      intel.state,
      root.intelligence?.state,
      root.state,
      "UNKNOWN"
    ) || "UNKNOWN";

  const normalizedPatterns = {
    rounds,

    attention_present:
      Boolean(
        firstDefined(
          patterns.attention_present,
          patterns.attentionPresent,
          attention > 0
        )
      ),

    clicks_present:
      Boolean(
        firstDefined(
          patterns.clicks_present,
          patterns.clicksPresent,
          clicks > 0
        )
      ),

    product_views_present:
      Boolean(
        firstDefined(
          patterns.product_views_present,
          patterns.productViewsPresent,
          productViews > 0
        )
      ),

    customers_present:
      Boolean(
        firstDefined(
          patterns.customers_present,
          patterns.customersPresent,
          customers > 0
        )
      ),

    orders_present:
      Boolean(
        firstDefined(
          patterns.orders_present,
          patterns.ordersPresent,
          orders > 0
        )
      ),

    revenue_present:
      Boolean(
        firstDefined(
          patterns.revenue_present,
          patterns.revenuePresent,
          revenue > 0
        )
      ),

    persistent_attention:
      Boolean(
        firstDefined(
          patterns.persistent_attention,
          patterns.persistentAttention,
          false
        )
      ),

    persistent_clicks:
      Boolean(
        firstDefined(
          patterns.persistent_clicks,
          patterns.persistentClicks,
          false
        )
      ),

    click_without_product_view:
      Boolean(
        firstDefined(
          patterns.click_without_product_view,
          patterns.clickWithoutProductView,
          clicks > 0 && productViews === 0
        )
      ),

    persistent_funnel_block:
      Boolean(
        firstDefined(
          patterns.persistent_funnel_block,
          patterns.persistentFunnelBlock,
          state === "PERSISTENT_FUNNEL_BLOCK"
        )
      ),

    no_behavior:
      Boolean(
        firstDefined(
          patterns.no_behavior,
          patterns.noBehavior,
          attention === 0 &&
            clicks === 0 &&
            productViews === 0 &&
            engagements === 0
        )
      )
  };

  return {
    content: {
      id:
        content.id ||
        root.content_id ||
        root.contentId ||
        contentId,

      title: content.title || null,
      status: content.status || null
    },

    state,

    rounds,

    totals: {
      attention,
      clicks,
      product_views: productViews,
      engagements,
      customers,
      orders,
      revenue
    },

    patterns: normalizedPatterns,

    conversions: {
      attention_to_product_view: safeNumber(
        firstDefined(
          conversions.attention_to_product_view,
          conversions.attentionToProductView,
          0
        )
      ),

      product_view_to_click: safeNumber(
        firstDefined(
          conversions.product_view_to_click,
          conversions.productViewToClick,
          0
        )
      ),

      click_to_customer: safeNumber(
        firstDefined(
          conversions.click_to_customer,
          conversions.clickToCustomer,
          0
        )
      ),

      customer_to_order: safeNumber(
        firstDefined(
          conversions.customer_to_order,
          conversions.customerToOrder,
          0
        )
      ),

      engagement_to_order: safeNumber(
        firstDefined(
          conversions.engagement_to_order,
          conversions.engagementToOrder,
          0
        )
      )
    },

    latest_measurement: {
      id:
        latestMeasurement.id ||
        latestMeasurement.measurement_id ||
        null,

      attention: safeNumber(latestMeasurement.attention),

      clicks: safeNumber(latestMeasurement.clicks),

      product_views: safeNumber(
        firstDefined(
          latestMeasurement.product_views,
          latestMeasurement.productViews,
          0
        )
      ),

      engagements: safeNumber(latestMeasurement.engagements),

      customers: safeNumber(latestMeasurement.customers),

      orders: safeNumber(latestMeasurement.orders),

      revenue: safeNumber(latestMeasurement.revenue)
    }
  };
}

/* -------------------------------------------------------
   REPEATED SIGNALS
------------------------------------------------------- */

function detectRepeatedSignals(intel) {
  const signals = [];

  const p = intel.patterns;
  const t = intel.totals;

  if (
    p.persistent_attention &&
    t.attention > 0
  ) {
    signals.push({
      code: "PERSISTENT_ATTENTION",
      evidence: `Attention ${t.attention}`,
      repeated: true
    });
  }

  if (
    p.persistent_clicks &&
    t.clicks > 0
  ) {
    signals.push({
      code: "PERSISTENT_CLICKS",
      evidence: `Clicks ${t.clicks}`,
      repeated: true
    });
  }

  if (
    p.click_without_product_view
  ) {
    signals.push({
      code: "CLICK_WITHOUT_PRODUCT_VIEW",
      evidence:
        `Clicks ${t.clicks} → Product Views ${t.product_views}`,
      repeated:
        Boolean(
          p.persistent_funnel_block ||
          (intel.rounds >= 2 && t.clicks > 0)
        )
    });
  }

  if (
    p.persistent_funnel_block
  ) {
    signals.push({
      code: "PERSISTENT_FUNNEL_BLOCK",
      evidence: "PERSISTENT_FUNNEL_BLOCK",
      repeated: true
    });
  }

  return signals;
}

/* -------------------------------------------------------
   HYPOTHESES
------------------------------------------------------- */

function buildHypotheses(intel) {
  const hypotheses = [];

  const t = intel.totals;
  const p = intel.patterns;

  if (
    t.attention > 0 &&
    t.clicks > 0
  ) {
    hypotheses.push({
      type: "ATTENTION_CAN_PRODUCE_CLICK",
      evidence: {
        attention: t.attention,
        clicks: t.clicks
      }
    });
  }

  if (
    t.clicks > 0 &&
    t.product_views === 0
  ) {
    hypotheses.push({
      type: "CLICK_TO_PRODUCT_VIEW_PATH_REQUIRES_INVESTIGATION",
      evidence: {
        clicks: t.clicks,
        product_views: t.product_views
      }
    });
  }

  if (
    t.product_views > 0 &&
    t.customers === 0
  ) {
    hypotheses.push({
      type: "PRODUCT_VIEW_TO_CUSTOMER_PATH_REQUIRES_INVESTIGATION",
      evidence: {
        product_views: t.product_views,
        customers: t.customers
      }
    });
  }

  if (
    t.customers > 0 &&
    t.orders === 0
  ) {
    hypotheses.push({
      type: "CUSTOMER_TO_ORDER_PATH_REQUIRES_INVESTIGATION",
      evidence: {
        customers: t.customers,
        orders: t.orders
      }
    });
  }

  if (
    t.orders > 0 &&
    t.revenue === 0
  ) {
    hypotheses.push({
      type: "ORDER_TO_REVENUE_PATH_REQUIRES_INVESTIGATION",
      evidence: {
        orders: t.orders,
        revenue: t.revenue
      }
    });
  }

  if (
    t.attention === 0 &&
    t.clicks === 0 &&
    t.product_views === 0 &&
    t.customers === 0 &&
    t.orders === 0
  ) {
    hypotheses.push({
      type: "INSUFFICIENT_BEHAVIORAL_EVIDENCE",
      evidence: {
        rounds: intel.rounds
      }
    });
  }

  return hypotheses;
}

/* -------------------------------------------------------
   LEARNING STATE
------------------------------------------------------- */

function determineLearningState(intel, repeatedSignals) {
  const t = intel.totals;
  const p = intel.patterns;

  if (
    p.persistent_funnel_block &&
    repeatedSignals.some(
      s => s.repeated === true
    )
  ) {
    return "REPEATED_DOWNSTREAM_BLOCK";
  }

  if (t.revenue > 0) {
    return "CONVERSION_EVIDENCE_PRESENT";
  }

  if (t.customers > 0) {
    return "CUSTOMER_EVIDENCE_PRESENT";
  }

  if (t.product_views > 0) {
    return "PRODUCT_INTEREST_PRESENT";
  }

  if (t.clicks > 0) {
    return "CLICK_SIGNAL_PRESENT";
  }

  if (t.attention > 0) {
    return "ATTENTION_SIGNAL_PRESENT";
  }

  return "WAITING_FOR_EVIDENCE";
}

/* -------------------------------------------------------
   CONFIDENCE
------------------------------------------------------- */

function determineConfidence(intel, repeatedSignals) {
  const repeated =
    repeatedSignals.filter(
      signal => signal.repeated
    ).length;

  if (
    repeated >= 1 &&
    intel.rounds >= 2
  ) {
    return "HIGH";
  }

  if (
    intel.rounds >= 2 &&
    (
      intel.totals.attention > 0 ||
      intel.totals.clicks > 0 ||
      intel.totals.product_views > 0
    )
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

/* -------------------------------------------------------
   DECISION INPUT
------------------------------------------------------- */

function buildDecisionInput(intel) {
  const t = intel.totals;
  const p = intel.patterns;

  if (
    t.clicks > 0 &&
    t.product_views === 0
  ) {
    return {
      type: "INVESTIGATE_DOWNSTREAM_PATH",
      target: "CLICK_TO_PRODUCT_VIEW_PATH"
    };
  }

  if (
    t.product_views > 0 &&
    t.customers === 0
  ) {
    return {
      type: "INVESTIGATE_PRODUCT_TO_CUSTOMER",
      target: "PRODUCT_TO_CUSTOMER_PATH"
    };
  }

  if (
    t.customers > 0 &&
    t.orders === 0
  ) {
    return {
      type: "INVESTIGATE_CUSTOMER_TO_ORDER",
      target: "CUSTOMER_TO_ORDER_PATH"
    };
  }

  if (
    t.orders > 0 &&
    t.revenue === 0
  ) {
    return {
      type: "INVESTIGATE_ORDER_TO_REVENUE",
      target: "ORDER_TO_REVENUE_PATH"
    };
  }

  if (
    t.attention === 0 &&
    t.clicks === 0 &&
    t.product_views === 0 &&
    t.customers === 0 &&
    t.orders === 0 &&
    t.revenue === 0
  ) {
    return {
      type: "WAIT_FOR_BEHAVIORAL_EVIDENCE",
      target: "CURRENT_CONTENT"
    };
  }

  if (
    p.persistent_attention &&
    t.clicks === 0
  ) {
    return {
      type: "CONTINUE_OBSERVATION",
      target: "CURRENT_CONTENT"
    };
  }

  return {
    type: "CONTINUE_OBSERVATION",
    target: "CURRENT_CONTENT"
  };
}

/* -------------------------------------------------------
   AI
------------------------------------------------------- */

async function runAI(env, learning) {
  const fallback = {
    status: "FALLBACK_ANALYZED",
    model: MODEL,
    analysis: {
      summary:
        "Learning Engine generated evidence from Intelligence Layer.",

      observed_signals:
        learning.repeated_signals.map(
          signal =>
            `${signal.code}:${signal.evidence}`
        ),

      learning: {
        what_we_learned:
          learning.hypotheses.length > 0
            ? learning.hypotheses
                .map(h => h.type)
                .join(", ")
            : "ยังมีหลักฐานไม่เพียงพอสำหรับ hypothesis",

        confidence:
          learning.confidence
      },

      problems:
        learning.hypotheses.map(
          h => h.type
        ),

      next_content: {
        action: "WAIT",
        direction:
          "Decision Layer ต้องประเมินหลักฐานก่อนเปลี่ยน Content",
        angle:
          "ใช้ข้อมูลพฤติกรรมที่ตรวจพบเป็นหลัก",
        cta:
          "ดูรายละเอียดและทดลอง TATO",
        success_metric:
          "Downstream Behavioral Evidence"
      },

      next_action: {
        type: "WAIT",
        reason:
          learning.decision_input.type
      },

      priority:
        learning.confidence === "HIGH"
          ? "HIGH"
          : "MEDIUM"
    },

    debug: {
      ai_called: false,
      response_text_received: false,
      parsed_json: false,
      error: null
    }
  };

  if (
    !env ||
    !env.AI ||
    typeof env.AI.run !== "function"
  ) {
    return fallback;
  }

  try {
    const prompt = `
You are the Learning Engine of TATO-OS.

Do not choose strategy.
Do not declare winners.
Do not execute actions.

Analyze only the evidence supplied below.

Learning state:
${learning.state}

Confidence:
${learning.confidence}

Repeated signals:
${JSON.stringify(learning.repeated_signals)}

Hypotheses:
${JSON.stringify(learning.hypotheses)}

Decision input:
${JSON.stringify(learning.decision_input)}

Evidence:
${JSON.stringify(learning.evidence)}

Return concise JSON with:
summary
observed_signals
what_we_learned
problems
`;

    const result = await env.AI.run(
      MODEL,
      {
        messages: [
          {
            role: "system",
            content:
              "You are an evidence-only learning analyst."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      }
    );

    return {
      status: "AI_ANALYZED",
      model: MODEL,
      analysis: result,
      debug: {
        ai_called: true,
        response_text_received: true,
        parsed_json: true,
        error: null
      }
    };
  } catch (error) {
    return {
      ...fallback,
      debug: {
        ai_called: true,
        response_text_received: false,
        parsed_json: false,
        error: String(error?.message || error)
      }
    };
  }
}

/* -------------------------------------------------------
   BUILD LEARNING
------------------------------------------------------- */

function buildLearning(
  intel,
  repeatedSignals,
  hypotheses
) {
  const state =
    determineLearningState(
      intel,
      repeatedSignals
    );

  const confidence =
    determineConfidence(
      intel,
      repeatedSignals
    );

  const decisionInput =
    buildDecisionInput(intel);

  const evidenceAvailable =
    intel.totals.attention > 0 ||
    intel.totals.clicks > 0 ||
    intel.totals.product_views > 0 ||
    intel.totals.engagements > 0 ||
    intel.totals.customers > 0 ||
    intel.totals.orders > 0 ||
    intel.totals.revenue > 0;

  return {
    id: crypto.randomUUID(),

    layer: LAYER,

    version: VERSION,

    content_id:
      intel.content.id,

    status: "LEARNING_READY",

    state,

    confidence,

    evidence_available:
      evidenceAvailable,

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
        intel.state,

      measurement_rounds:
        intel.rounds,

      metrics: {
        attention:
          intel.totals.attention,

        clicks:
          intel.totals.clicks,

        product_views:
          intel.totals.product_views,

        engagements:
          intel.totals.engagements,

        customers:
          intel.totals.customers,

        orders:
          intel.totals.orders,

        revenue:
          intel.totals.revenue
      },

      patterns:
        intel.patterns,

      conversions:
        intel.conversions,

      latest_measurement:
        intel.latest_measurement
    },

    source_contract: {
      measurement:
        MEASUREMENT_SOURCE,

      intelligence:
        INTELLIGENCE_SOURCE,

      learning:
        LAYER,

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

/* -------------------------------------------------------
   SAVE
------------------------------------------------------- */

async function ensureLearningRunsTable(env) {
  if (!env.DB) {
    return;
  }

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS learning_runs (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      layer TEXT,
      version TEXT,
      state TEXT,
      confidence TEXT,
      decision_input TEXT,
      payload TEXT,
      created_at TEXT
    )
  `).run();
}

async function saveLearning(env, learning) {
  if (!env.DB) {
    throw new Error("DB_BINDING_REQUIRED");
  }

  await ensureLearningRunsTable(env);

  await env.DB.prepare(`
    INSERT INTO learning_runs (
      id,
      content_id,
      layer,
      version,
      state,
      confidence,
      decision_input,
      payload,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      learning.id,
      learning.content_id,
      learning.layer,
      learning.version,
      learning.state,
      learning.confidence,
      JSON.stringify(
        learning.decision_input
      ),
      JSON.stringify(learning),
      now()
    )
    .run();

  return true;
}

/* -------------------------------------------------------
   PIPELINE
------------------------------------------------------- */

async function runLearning(
  request,
  env,
  contentId
) {
  const rawIntelligence =
    await getIntelligence(
      request,
      contentId
    );

  const intelligence =
    normalizeIntelligence(
      rawIntelligence,
      contentId
    );

  /*
   Contract protection:
   Intelligence and requested content must agree.
  */

  if (
    intelligence.content.id &&
    intelligence.content.id !== contentId
  ) {
    throw new Error(
      "INTELLIGENCE_CONTENT_ID_MISMATCH"
    );
  }

  const repeatedSignals =
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
      repeatedSignals,
      hypotheses
    );

  const ai =
    await runAI(
      env,
      learning
    );

  return {
    success: true,

    layer: LAYER,

    version: VERSION,

    mode: "preview",

    status: "LEARNING_READY",

    content:
      intelligence.content,

    learning: {
      ...learning,

      ai
    },

    next_step:
      "Pass Learning evidence to Decision Layer."
  };
}

/* -------------------------------------------------------
   GET
------------------------------------------------------- */

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

    const result =
      await runLearning(
        request,
        env,
        contentId
      );

    return json(result);
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
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

/* -------------------------------------------------------
   POST
------------------------------------------------------- */

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
          success: false,
          layer: LAYER,
          version: VERSION,
          error: "content_id_required"
        },
        400
      );
    }

    const mode =
      String(
        body.mode ||
        "preview"
      ).toLowerCase();

    const result =
      await runLearning(
        request,
        env,
        contentId
      );

    if (
      mode !== "save"
    ) {
      return json({
        ...result,
        mode: "preview",
        saved: false
      });
    }

    await saveLearning(
      env,
      result.learning
    );

    return json({
      ...result,
      mode: "save",
      saved: true
    });
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
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
