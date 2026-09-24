// TATO-OS
// Learning Layer V1.0
// Route: /api/learning-ai
//
// Pipeline:
//
// Measurement V2.2
//        ↓
// Intelligence V2.1
//        ↓
// Learning V1.0
//        ↓
// Decision Layer
//
// Learning does NOT:
// - declare a winner
// - change strategy
// - execute actions
//
// Learning DOES:
// - read Intelligence
// - identify repeated behavioral signals
// - create learning hypotheses
// - identify funnel problems
// - prepare evidence for Decision Layer

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const LAYER = "LEARNING_LAYER_V1";
const VERSION = "1.0";

const INTELLIGENCE_SOURCE =
  "INTELLIGENCE_LAYER_V2.1";

const MEASUREMENT_SOURCE =
  "CONTENT_MEASUREMENT_ENGINE_V2.2";

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

function percentage(value, base) {
  if (base <= 0) {
    return 0;
  }

  return Number(
    ((value / base) * 100).toFixed(2)
  );
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
  try {
    if (contentId) {
      const row =
        await db
          .prepare(
            `SELECT *
             FROM content_engine
             WHERE id = ?
             LIMIT 1`
          )
          .bind(contentId)
          .first();

      if (row) {
        return row;
      }
    }

    return await db
      .prepare(
        `SELECT *
         FROM content_engine
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .first();
  } catch (_) {
    return null;
  }
}

/*
 * -------------------------------------------------------
 * MEASUREMENT
 * -------------------------------------------------------
 */

async function getMeasurements(
  db,
  contentId
) {
  if (!contentId) {
    return [];
  }

  try {
    const result =
      await db
        .prepare(
          `SELECT *
           FROM content_measurements
           WHERE content_id = ?
           ORDER BY measured_at DESC
           LIMIT 20`
        )
        .bind(contentId)
        .all();

    return result.results || [];
  } catch (_) {
    return [];
  }
}

function normalizeMeasurement(row) {
  if (!row) {
    return null;
  }

  return {
    id:
      text(row.id),

    content_id:
      text(row.content_id),

    measured_at:
      text(row.measured_at),

    measurement_start:
      text(row.measurement_start),

    attribution_mode:
      text(row.attribution_mode),

    attention:
      numberValue(row.attention),

    product_views:
      numberValue(row.product_views),

    clicks:
      numberValue(row.clicks),

    engagements:
      numberValue(row.engagements),

    customers:
      numberValue(row.customers),

    orders:
      numberValue(row.orders),

    revenue:
      numberValue(row.revenue)
  };
}

/*
 * -------------------------------------------------------
 * INTELLIGENCE
 * -------------------------------------------------------
 */

async function getIntelligenceFromMeasurements(
  content,
  measurements
) {
  const history =
    measurements
      .map(normalizeMeasurement)
      .filter(Boolean);

  const latest =
    history.length
      ? history[0]
      : null;

  const totals = {
    attention: 0,
    product_views: 0,
    clicks: 0,
    engagements: 0,
    customers: 0,
    orders: 0,
    revenue: 0
  };

  for (const item of history) {
    totals.attention +=
      item.attention;

    totals.product_views +=
      item.product_views;

    totals.clicks +=
      item.clicks;

    totals.engagements +=
      item.engagements;

    totals.customers +=
      item.customers;

    totals.orders +=
      item.orders;

    totals.revenue +=
      item.revenue;
  }

  const patterns = {
    rounds:
      history.length,

    attention_present:
      totals.attention > 0,

    click_present:
      totals.clicks > 0,

    product_view_present:
      totals.product_views > 0,

    customer_present:
      totals.customers > 0,

    order_present:
      totals.orders > 0,

    revenue_present:
      totals.revenue > 0,

    persistent_attention:
      history.length >= 2 &&
      totals.attention > 0,

    click_without_product_view:
      totals.clicks > 0 &&
      totals.product_views === 0,

    persistent_funnel_block:
      history.length >= 2 &&
      totals.attention > 0 &&
      totals.clicks > 0 &&
      totals.product_views === 0,

    persistent_no_customer:
      history.length >= 2 &&
      totals.customers === 0,

    persistent_no_order:
      history.length >= 2 &&
      totals.orders === 0,

    persistent_no_revenue:
      history.length >= 2 &&
      totals.revenue === 0
  };

  let state =
    "OBSERVING";

  if (
    patterns.persistent_funnel_block
  ) {
    state =
      "PERSISTENT_FUNNEL_BLOCK";
  } else if (
    patterns.persistent_no_customer
  ) {
    state =
      "PERSISTENT_NO_CUSTOMER";
  } else if (
    patterns.attention_present
  ) {
    state =
      "PATTERN_DETECTED";
  }

  const conversions = {
    attention_to_product_view:
      percentage(
        totals.product_views,
        totals.attention
      ),

    product_view_to_click:
      percentage(
        totals.clicks,
        totals.product_views
      ),

    click_to_customer:
      percentage(
        totals.customers,
        totals.clicks
      ),

    customer_to_order:
      percentage(
        totals.orders,
        totals.customers
      )
  };

  return {
    source:
      INTELLIGENCE_SOURCE,

    content: {
      id:
        content
          ? content.id
          : latest
          ? latest.content_id
          : null,

      title:
        content
          ? content.title || null
          : null,

      objective:
        content
          ? content.objective || null
          : null,

      market_keyword:
        content
          ? content.market_keyword || null
          : null,

      angle:
        content
          ? content.angle || null
          : null,

      cta:
        content
          ? content.cta || null
          : null
    },

    latest_measurement:
      latest,

    rounds:
      history.length,

    totals,

    conversions,

    patterns,

    state
  };
}

/*
 * -------------------------------------------------------
 * LEARNING ENGINE
 * -------------------------------------------------------
 */

function buildLearning(
  intelligence
) {
  const {
    latest_measurement,
    rounds,
    totals,
    conversions,
    patterns,
    state
  } = intelligence;

  const signals = [];

  const hypotheses = [];

  const problems = [];

  /*
   * SIGNAL 1
   *
   * Weighted Attention exists.
   */

  if (
    totals.attention > 0
  ) {
    signals.push({
      type:
        "ATTENTION_PRESENT",

      signal:
        "weighted_behavioral_signal",

      value:
        totals.attention,

      meaning:
        "มีพฤติกรรมที่ระบบสามารถวัดเป็น Attention ได้"
    });
  }

  /*
   * SIGNAL 2
   *
   * Click exists.
   */

  if (
    totals.clicks > 0
  ) {
    signals.push({
      type:
        "CLICK_PRESENT",

      value:
        totals.clicks,

      meaning:
        "มีผู้ใช้แสดงพฤติกรรมต่อจาก Content"
    });
  }

  /*
   * SIGNAL 3
   *
   * Attention → Click
   */

  if (
    totals.attention > 0 &&
    totals.clicks > 0
  ) {
    hypotheses.push({
      type:
        "ATTENTION_CAN_PRODUCE_CLICK",

      evidence: {
        attention:
          totals.attention,

        clicks:
          totals.clicks
      },

      learning:
        "Content สามารถสร้าง Attention และพาผู้ใช้ไปถึง Click ได้"
    });
  }

  /*
   * SIGNAL 4
   *
   * Click → Product View missing
   */

  if (
    patterns.click_without_product_view
  ) {
    problems.push({
      type:
        "CLICK_TO_PRODUCT_VIEW_BLOCK",

      evidence: {
        clicks:
          totals.clicks,

        product_views:
          totals.product_views
      },

      learning:
        "มี Click แต่ยังไม่มีหลักฐานว่าเส้นทางหลัง Click ไปถึง Product View"
    });

    hypotheses.push({
      type:
        "DOWNSTREAM_PATH_REQUIRES_INVESTIGATION",

      evidence: {
        clicks:
          totals.clicks,

        product_views:
          totals.product_views
      },

      learning:
        "ปัญหาปัจจุบันอยู่ใน downstream path มากกว่าการขาด Attention"
    });
  }

  /*
   * SIGNAL 5
   *
   * No customer
   */

  if (
    patterns.persistent_no_customer
  ) {
    problems.push({
      type:
        "NO_CUSTOMER",

      evidence: {
        rounds,

        customers:
          totals.customers
      },

      learning:
        "ยังไม่มีหลักฐานเพียงพอว่าพฤติกรรมที่เกิดขึ้นนำไปสู่ Customer"
    });
  }

  /*
   * SIGNAL 6
   *
   * No order
   */

  if (
    patterns.persistent_no_order
  ) {
    problems.push({
      type:
        "NO_ORDER",

      evidence: {
        rounds,

        orders:
          totals.orders
      },

      learning:
        "ยังไม่มีหลักฐานของ Order"
    });
  }

  /*
   * SIGNAL 7
   *
   * No revenue
   */

  if (
    patterns.persistent_no_revenue
  ) {
    problems.push({
      type:
        "NO_REVENUE",

      evidence: {
        rounds,

        revenue:
          totals.revenue
      },

      learning:
        "ยังไม่มีหลักฐานของ Revenue"
    });
  }

  /*
   * -----------------------------------------------------
   * LEARNING STATE
   * -----------------------------------------------------
   */

  let learningState =
    "OBSERVING";

  if (
    problems.some(
      item =>
        item.type ===
        "CLICK_TO_PRODUCT_VIEW_BLOCK"
    )
  ) {
    learningState =
      "DOWNSTREAM_BLOCK_DETECTED";
  } else if (
    hypotheses.length > 0
  ) {
    learningState =
      "SIGNAL_LEARNED";
  }

  /*
   * -----------------------------------------------------
   * CONFIDENCE
   * -----------------------------------------------------
   */

  let confidence =
    "LOW";

  if (
    rounds >= 10 &&
    problems.length > 0
  ) {
    confidence =
      "HIGH";
  } else if (
    rounds >= 3
  ) {
    confidence =
      "MEDIUM";
  }

  /*
   * -----------------------------------------------------
   * NEXT DECISION INPUT
   *
   * IMPORTANT:
   * This is NOT an action.
   * It is only evidence for Decision Layer.
   * -----------------------------------------------------
   */

  let decisionInput =
    "CONTINUE_OBSERVATION";

  if (
    learningState ===
    "DOWNSTREAM_BLOCK_DETECTED"
  ) {
    decisionInput =
      "INVESTIGATE_DOWNSTREAM_PATH";
  } else if (
    learningState ===
    "SIGNAL_LEARNED"
  ) {
    decisionInput =
      "EVALUATE_NEXT_EXPERIMENT";
  }

  return {
    state:
      learningState,

    confidence,

    rounds,

    signals,

    hypotheses,

    problems,

    funnel: {
      attention:
        totals.attention,

      clicks:
        totals.clicks,

      product_views:
        totals.product_views,

      customers:
        totals.customers,

      orders:
        totals.orders,

      revenue:
        totals.revenue
    },

    conversions,

    decision_input:
      decisionInput,

    source_contract: {
      measurement:
        MEASUREMENT_SOURCE,

      intelligence:
        INTELLIGENCE_SOURCE,

      attention_type:
        ATTENTION_TYPE,

      attention_value:
        latest_measurement
          ? latest_measurement.attention
          : 0
    },

    guardrails: {
      winner_declared:
        false,

      strategy_change:
        false,

      automatic_execution:
        false,

      action_executed:
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

      sources: {
        measurement:
          MEASUREMENT_SOURCE,

        intelligence:
          INTELLIGENCE_SOURCE
      },

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

  /*
   * ai_runs
   *
   * Learning is recorded as a system run.
   */

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
      "RULE_BASED_V1",
      inputData,
      outputData,
      "COMPLETED",
      null,
      now
    )
    .run();

  /*
   * ai_insights
   */

  const priority =
    learning.state ===
    "DOWNSTREAM_BLOCK_DETECTED"
      ? "HIGH"
      : learning.state ===
        "SIGNAL_LEARNED"
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
      runId,
      "LEARNING",
      "TATO Learning Layer V1",
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
 * MAIN ANALYSIS
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

  const requestedContentId =
    url.searchParams.get(
      "content_id"
    );

  const content =
    await getContent(
      db,
      requestedContentId
    );

  if (!content) {
    throw new Error(
      "No content found in content_engine"
    );
  }

  const measurements =
    await getMeasurements(
      db,
      content.id
    );

  const intelligence =
    await getIntelligenceFromMeasurements(
      content,
      measurements
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
 * PUBLIC RESPONSE
 * -------------------------------------------------------
 */

function buildResponse(
  result,
  mode
) {
  return {
    success:
      true,

    layer:
      LAYER,

    version:
      VERSION,

    mode,

    status:
      "LEARNED",

    content: {
      id:
        result.content.id,

      title:
        result.content.title,

      status:
        result.content.status
    },

    source_chain: {
      measurement:
        MEASUREMENT_SOURCE,

      intelligence:
        INTELLIGENCE_SOURCE,

      learning:
        LAYER
    },

    measurement: {
      id:
        result.intelligence.latest_measurement
          ? result.intelligence.latest_measurement.id
          : null,

      attention:
        result.intelligence.latest_measurement
          ? result.intelligence.latest_measurement.attention
          : 0,

      clicks:
        result.intelligence.latest_measurement
          ? result.intelligence.latest_measurement.clicks
          : 0,

      product_views:
        result.intelligence.latest_measurement
          ? result.intelligence.latest_measurement.product_views
          : 0,

      customers:
        result.intelligence.latest_measurement
          ? result.intelligence.latest_measurement.customers
          : 0,

      orders:
        result.intelligence.latest_measurement
          ? result.intelligence.latest_measurement.orders
          : 0,

      revenue:
        result.intelligence.latest_measurement
          ? result.intelligence.latest_measurement.revenue
          : 0
    },

    intelligence: {
      state:
        result.intelligence.state,

      rounds:
        result.intelligence.rounds,

      totals:
        result.intelligence.totals,

      patterns:
        result.intelligence.patterns
    },

    learning:
      result.learning,

    next_step:
      "Learning signal ready for Decision Layer."
  };
}

/*
 * -------------------------------------------------------
 * GET
 *
 * Preview only.
 * No DB write.
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
 *
 * preview:
 *   analysis only
 *
 * execute:
 *   persist learning into ai_runs
 *   and ai_insights
 *
 * Still does NOT execute business action.
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

    const requestedMode =
      body &&
      body.mode
        ? body.mode
        : "preview";

    if (
      requestedMode !==
      "execute"
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

    return json({
      ...buildResponse(
        result,
        "execute"
      ),

      status:
        "EXECUTED",

      persistence: {
        run_id:
          saved.run_id,

        insight_id:
          saved.insight_id,

        saved:
          true
      },

      guardrails: {
        winner_declared:
          false,

        strategy_change:
          false,

        automatic_execution:
          false,

        action_executed:
          false,

        requires_decision_layer:
          true
      },

      next_step:
        "Learning saved. Decision Layer is the next stage."
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
          error &&
          error.message
            ? error.message
            : String(error)
      },
      500
    );
  }
}
