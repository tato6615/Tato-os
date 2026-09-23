const LAYER = "DECISION_ENGINE_V1.5";

const DEFAULT_LEARNING_RUN_ID =
  "52afcbac-8ae2-4344-90d3-55e49a90a872";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}

function safeJson(value, fallback = {}) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizePriority(value) {
  const v = String(value || "").toUpperCase();

  if (v === "HIGH") return "HIGH";
  if (v === "LOW") return "LOW";

  return "MEDIUM";
}

function getMetrics(measurement) {
  return {
    attention: Number(measurement?.attention || 0),
    product_views: Number(
      measurement?.product_views || 0
    ),
    clicks: Number(measurement?.clicks || 0),
    engagements: Number(
      measurement?.engagements || 0
    ),
    customers: Number(
      measurement?.customers || 0
    ),
    orders: Number(
      measurement?.orders || 0
    ),
    revenue: Number(
      measurement?.revenue || 0
    )
  };
}

async function loadLearningRun(env, runId) {
  const row = await env.DB.prepare(`
    SELECT *
    FROM ai_runs
    WHERE id = ?
      AND run_type = 'LEARNING'
    LIMIT 1
  `)
    .bind(runId)
    .first();

  if (!row) {
    throw new Error(
      `Learning run not found: ${runId}`
    );
  }

  return row;
}

async function loadMeasurement(env, measurementId) {
  if (!measurementId) {
    throw new Error(
      "Measurement ID is missing from Learning Run"
    );
  }

  const row = await env.DB.prepare(`
    SELECT *
    FROM content_measurements
    WHERE id = ?
    LIMIT 1
  `)
    .bind(measurementId)
    .first();

  if (!row) {
    throw new Error(
      `Measurement not found: ${measurementId}`
    );
  }

  return row;
}

async function loadContent(env, contentId) {
  if (!contentId) return null;

  const row = await env.DB.prepare(`
    SELECT *
    FROM content_engine
    WHERE id = ?
    LIMIT 1
  `)
    .bind(contentId)
    .first();

  return row || null;
}

function extractLearning(run) {
  const inputData = safeJson(
    run.input_data,
    {}
  );

  const outputData = safeJson(
    run.output_data,
    {}
  );

  const analysis =
    outputData?.analysis ||
    outputData?.output?.analysis ||
    {};

  const measurementId =
    outputData?.measurement_id ||
    inputData?.measurement?.id ||
    null;

  const contentId =
    outputData?.content_id ||
    inputData?.measurement?.content_id ||
    null;

  return {
    inputData,
    outputData,
    analysis,
    measurementId,
    contentId
  };
}

function makeDecision(
  measurement,
  learning,
  content
) {
  const metrics = getMetrics(
    measurement
  );

  const analysis =
    learning.analysis || {};

  const hasAttention =
    metrics.attention > 0;

  const hasTraffic =
    metrics.clicks > 0;

  const hasProductView =
    metrics.product_views > 0;

  const hasEngagement =
    metrics.engagements > 0;

  const hasCustomer =
    metrics.customers > 0;

  const hasOrder =
    metrics.orders > 0;

  const hasRevenue =
    metrics.revenue > 0;

  /*
   * Decision hierarchy
   *
   * Conversion exists:
   * monitor / continue based on actual result.
   *
   * Traffic exists but downstream does not:
   * continue measurement.
   *
   * Attention exists but no traffic:
   * optimize CTA/content.
   *
   * No meaningful signal:
   * hold / collect more evidence.
   */

  let decisionType;
  let decisionStatus = "PENDING_APPROVAL";
  let priority = normalizePriority(
    analysis.priority
  );
  let reason;
  let recommendation;
  let actionRequired = 1;
  let requiresApproval = 1;

  if (hasRevenue || hasOrder) {
    decisionType =
      "CONTINUE_CONVERSION_SIGNAL";

    reason =
      "Measurement พบ Order หรือ Revenue จริง จึงควรรักษาการวัดผลและติดตาม Conversion ต่อ";

    recommendation = {
      action:
        "CONTINUE_MEASUREMENT",
      direction:
        "ติดตาม Conversion และ Revenue ต่อ",
      evidence_required:
        "Repeat Measurement",
      do_not_change_strategy_yet:
        false
    };

    priority = hasRevenue
      ? "HIGH"
      : "MEDIUM";
  } else if (
    hasTraffic &&
    !hasProductView &&
    !hasCustomer
  ) {
    decisionType =
      "CONTINUE_TRAFFIC_SIGNAL";

    reason =
      "Content สร้าง Attention และ Click แล้ว แต่ยังไม่มี Product View หรือ Customer จึงยังมีข้อมูลปลายทางไม่เพียงพอสำหรับเปลี่ยนกลยุทธ์";

    recommendation = {
      action:
        "CONTINUE_MEASUREMENT",
      direction:
        "เก็บ Measurement และตรวจเส้นทาง Click → Product View → Customer",
      evidence_required:
        "Product View และ Customer",
      do_not_change_strategy_yet:
        true
    };

    priority = "MEDIUM";
  } else if (
    hasProductView &&
    !hasCustomer
  ) {
    decisionType =
      "OPTIMIZE_CONVERSION_PATH";

    reason =
      "Content สามารถสร้าง Product View ได้ แต่ยังไม่เกิด Customer จึงควรตรวจและปรับเส้นทางจาก Product View ไป Customer";

    recommendation = {
      action:
        "OPTIMIZE_CONVERSION_PATH",
      direction:
        "ตรวจ Product Page, Offer และ CTA",
      evidence_required:
        "Customer และ Order",
      do_not_change_strategy_yet:
        false
    };

    priority = "MEDIUM";
  } else if (
    hasAttention &&
    !hasTraffic
  ) {
    decisionType =
      "OPTIMIZE_CONTENT_CTA";

    reason =
      "Content มี Attention แต่ยังไม่เกิด Click จึงควรปรับ Content หรือ CTA เพื่อเพิ่มการเคลื่อนจาก Attention ไป Traffic";

    recommendation = {
      action:
        "OPTIMIZE_CONTENT",
      direction:
        "ปรับ Hook, Angle และ CTA",
      evidence_required:
        "Click",
      do_not_change_strategy_yet:
        false
    };

    priority = "MEDIUM";
  } else if (
    hasEngagement &&
    !hasCustomer
  ) {
    decisionType =
      "OPTIMIZE_NEXT_STEP";

    reason =
      "Content มี Engagement แต่ยังไม่เกิด Customer จึงควรตรวจเส้นทางจาก Engagement ไป Conversion";

    recommendation = {
      action:
        "OPTIMIZE_NEXT_STEP",
      direction:
        "ตรวจ CTA และ Conversion Path",
      evidence_required:
        "Customer และ Order",
      do_not_change_strategy_yet:
        false
    };

    priority = "MEDIUM";
  } else {
    decisionType =
      "HOLD_COLLECT_MORE_DATA";

    reason =
      "Measurement ยังมีหลักฐานไม่เพียงพอสำหรับการเปลี่ยนกลยุทธ์ จึงควรเก็บข้อมูลเพิ่ม";

    recommendation = {
      action:
        "CONTINUE_MEASUREMENT",
      direction:
        "เก็บ Behavior และ Measurement เพิ่ม",
      evidence_required:
        "Attention, Click, Product View และ Conversion",
      do_not_change_strategy_yet:
        true
    };

    priority = "LOW";
  }

  return {
    decision_type: decisionType,
    decision_status: decisionStatus,
    priority,
    reason,
    recommendation,
    action_required: actionRequired,
    requires_approval: requiresApproval,

    evidence: {
      measurement_id:
        measurement.id,

      content_id:
        measurement.content_id,

      learning_run_id:
        learning.run_id,

      metrics,

      signals: {
        attention: hasAttention,
        traffic: hasTraffic,
        product_view:
          hasProductView,
        engagement:
          hasEngagement,
        customer:
          hasCustomer,
        order: hasOrder,
        revenue: hasRevenue
      },

      learning: {
        summary:
          analysis?.summary || "",

        what_we_learned:
          analysis?.learning
            ?.what_we_learned || "",

        confidence:
          analysis?.learning
            ?.confidence || "LOW"
      }
    },

    content: content
      ? {
          id: content.id,
          title: content.title,
          objective:
            content.objective,
          angle: content.angle,
          cta: content.cta
        }
      : null
  };
}

async function checkExistingDecision(
  env,
  learningRunId
) {
  const row = await env.DB.prepare(`
    SELECT *
    FROM decision_runs
    WHERE learning_run_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `)
    .bind(learningRunId)
    .first();

  return row || null;
}

async function saveDecision(
  env,
  decision,
  learningRunId,
  measurementId,
  contentId
) {
  const existing =
    await checkExistingDecision(
      env,
      learningRunId
    );

  if (existing) {
    return {
      duplicate: true,
      row: existing
    };
  }

  const id =
    crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO decision_runs (
      id,
      decision_type,
      decision_status,
      priority,
      content_id,
      measurement_id,
      learning_run_id,
      reason,
      evidence,
      recommendation,
      action_required,
      requires_approval,
      status,
      created_at
    )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
    )
  `)
    .bind(
      id,
      decision.decision_type,
      decision.decision_status,
      decision.priority,
      contentId,
      measurementId,
      learningRunId,
      decision.reason,
      JSON.stringify(
        decision.evidence
      ),
      JSON.stringify(
        decision.recommendation
      ),
      decision.action_required,
      decision.requires_approval,
      "PENDING"
    )
    .run();

  const saved =
    await env.DB.prepare(`
      SELECT *
      FROM decision_runs
      WHERE id = ?
      LIMIT 1
    `)
      .bind(id)
      .first();

  return {
    duplicate: false,
    row: saved
  };
}

async function handle(
  request,
  env
) {
  const url =
    new URL(request.url);

  let body = {};

  if (request.method === "POST") {
    try {
      body =
        await request.json();
    } catch {
      body = {};
    }
  }

  const learningRunId =
    url.searchParams.get(
      "learning_run_id"
    ) ||
    body.learning_run_id ||
    DEFAULT_LEARNING_RUN_ID;

  const mode =
    request.method === "POST"
      ? "execute"
      : "preview";

  const learningRun =
    await loadLearningRun(
      env,
      learningRunId
    );

  const learning =
    extractLearning(
      learningRun
    );

  if (!learning.measurementId) {
    throw new Error(
      "Learning Run does not contain measurement_id"
    );
  }

  const measurement =
    await loadMeasurement(
      env,
      learning.measurementId
    );

  const content =
    await loadContent(
      env,
      learning.contentId ||
        measurement.content_id
    );

  const decision =
    makeDecision(
      measurement,
      {
        ...learning,
        run_id:
          learningRun.id
      },
      content
    );

  const result = {
    success: true,

    layer: LAYER,

    mode,

    status:
      "DECISION_ANALYZED",

    learning_run_id:
      learningRun.id,

    measurement_id:
      measurement.id,

    content_id:
      measurement.content_id,

    decision,

    decision_run_id: null,

    winner_decision:
      "NOT_DECLARED_IN_DECISION_ENGINE_V1.5"
  };

  if (mode === "execute") {
    const saved =
      await saveDecision(
        env,
        decision,
        learningRun.id,
        measurement.id,
        measurement.content_id
      );

    result.decision_run_id =
      saved.row?.id || null;

    result.status =
      saved.duplicate
        ? "DECISION_ALREADY_EXISTS"
        : "DECISION_SAVED";

    result.existing =
      saved.duplicate;
  }

  return result;
}

export async function onRequestGet(
  context
) {
  try {
    return json(
      await handle(
        context.request,
        context.env
      )
    );
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        error: String(
          error?.message ||
            error
        )
      },
      500
    );
  }
}

export async function onRequestPost(
  context
) {
  try {
    return json(
      await handle(
        context.request,
        context.env
      )
    );
  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        error: String(
          error?.message ||
            error
        )
      },
      500
    );
  }
}
