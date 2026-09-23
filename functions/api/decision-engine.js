const LAYER = "DECISION_ENGINE_V1.3";
const ATTRIBUTION_MODE = "CONTENT_ATTRIBUTION_V2";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

function safeJsonParse(value, fallback = null) {
  if (value === null || value === undefined) return fallback;

  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function uuid() {
  return crypto.randomUUID();
}

async function ensureDecisionTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS decision_runs (
      id TEXT PRIMARY KEY,
      measurement_id TEXT,
      content_id TEXT,
      learning_run_id TEXT,
      learning_insight_id TEXT,
      decision_type TEXT,
      decision_status TEXT,
      priority TEXT,
      reason TEXT,
      evidence TEXT,
      recommendation TEXT,
      action_required TEXT,
      requires_approval INTEGER DEFAULT 1,
      status TEXT DEFAULT 'PENDING',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

async function getLatestMeasurement(db) {
  const result = await db.prepare(`
    SELECT *
    FROM content_measurements
    WHERE attribution_mode = ?
    ORDER BY measured_at DESC, created_at DESC
    LIMIT 1
  `).bind(ATTRIBUTION_MODE).all();

  return result.results && result.results.length
    ? result.results[0]
    : null;
}

function normalizeMeasurement(row) {
  if (!row) return null;

  return {
    id: row.id || null,
    content_id: row.content_id || null,
    status: row.status || null,
    attribution_mode: row.attribution_mode || null,
    measured_at: row.measured_at || null,
    measurement_start: row.measurement_start || null,
    attention: toNumber(row.attention),
    product_views: toNumber(row.product_views),
    clicks: toNumber(row.clicks),
    engagements: toNumber(row.engagements),
    customers: toNumber(row.customers),
    orders: toNumber(row.orders),
    revenue: toNumber(row.revenue),
    attention_to_view: toNumber(row.attention_to_view),
    view_to_click: toNumber(row.view_to_click),
    click_to_customer: toNumber(row.click_to_customer),
    customer_to_order: toNumber(row.customer_to_order)
  };
}

async function findLearningRun(db, measurement) {
  if (!measurement) {
    return {
      run: null,
      input: null,
      output: null
    };
  }

  const measurementId = String(measurement.id || "");
  const contentId = String(measurement.content_id || "");

  const result = await db.prepare(`
    SELECT *
    FROM ai_runs
    WHERE run_type = 'LEARNING'
    ORDER BY created_at DESC
    LIMIT 100
  `).all();

  const rows = result.results || [];

  for (const row of rows) {
    const input = safeJsonParse(row.input_data, {});
    const inputMeasurement = input && input.measurement
      ? input.measurement
      : {};

    const inputMeasurementId = String(inputMeasurement.id || "");
    const inputContentId = String(inputMeasurement.content_id || "");

    if (
      (measurementId && inputMeasurementId === measurementId) ||
      (contentId && inputContentId === contentId)
    ) {
      return {
        run: row,
        input,
        output: safeJsonParse(row.output_data, {})
      };
    }
  }

  return {
    run: null,
    input: null,
    output: null
  };
}

async function findLearningInsight(db, learningRun, measurement) {
  if (!learningRun || !measurement) return null;

  const runId = String(learningRun.id || "");
  const measurementId = String(measurement.id || "");
  const contentId = String(measurement.content_id || "");

  const result = await db.prepare(`
    SELECT *
    FROM ai_insights
    ORDER BY created_at DESC
    LIMIT 100
  `).all();

  const rows = result.results || [];

  for (const row of rows) {
    const rowRunId = String(
      row.run_id ||
      row.learning_run_id ||
      ""
    );

    if (runId && rowRunId === runId) {
      return row;
    }

    const evidence = safeJsonParse(row.evidence, {});
    const evidenceText = JSON.stringify(evidence || {});

    if (
      (measurementId && evidenceText.includes(measurementId)) ||
      (contentId && evidenceText.includes(contentId))
    ) {
      return row;
    }
  }

  return null;
}

function extractLearning(learningRun, learningInsight) {
  if (!learningRun && !learningInsight) {
    return null;
  }

  const output = learningRun
    ? safeJsonParse(learningRun.output_data, {})
    : {};

  const analysis = output && output.analysis
    ? output.analysis
    : output;

  const insightEvidence = learningInsight
    ? safeJsonParse(learningInsight.evidence, {})
    : {};

  return {
    source: "LEARNING_AI_V1.9",
    run_id: learningRun ? learningRun.id : null,
    insight_id: learningInsight ? learningInsight.id : null,
    status: learningRun ? learningRun.status : null,
    analysis: analysis || {},
    insight: learningInsight
      ? {
          title: learningInsight.title || null,
          insight: learningInsight.insight || null,
          confidence: learningInsight.confidence || null,
          priority: learningInsight.priority || null,
          status: learningInsight.status || null,
          evidence: insightEvidence
        }
      : null
  };
}

function calculateDecision(measurement, learning) {
  const m = measurement;

  if (!m) {
    return {
      decision_type: "NO_DATA",
      decision_status: "WAITING",
      priority: "LOW",
      reason: "ยังไม่มี Measurement สำหรับตัดสินใจ",
      evidence: {},
      recommendation: "สร้าง Measurement ก่อน",
      action_required: "NONE",
      requires_approval: 0
    };
  }

  if (!learning) {
    return {
      decision_type: "WAIT_FOR_LEARNING",
      decision_status: "WAITING",
      priority: "LOW",
      reason: "มี Measurement แล้ว แต่ยังไม่มี Learning AI ที่เชื่อมกับ Measurement นี้",
      evidence: {
        measurement_id: m.id,
        content_id: m.content_id
      },
      recommendation: "ให้ Learning AI วิเคราะห์ Measurement ก่อน",
      action_required: "RUN_LEARNING_AI",
      requires_approval: 0
    };
  }

  const evidence = {
    attention: m.attention,
    product_views: m.product_views,
    clicks: m.clicks,
    engagements: m.engagements,
    customers: m.customers,
    orders: m.orders,
    revenue: m.revenue,
    attention_to_view: m.attention_to_view,
    view_to_click: m.view_to_click,
    click_to_customer: m.click_to_customer,
    customer_to_order: m.customer_to_order
  };

  if (m.revenue > 0 || m.orders > 0) {
    return {
      decision_type: "CONTINUE_AND_SCALE_SIGNAL",
      decision_status: "PENDING_APPROVAL",
      priority: "HIGH",
      reason: "Content มีสัญญาณปลายทางจากคำสั่งซื้อหรือรายได้",
      evidence,
      recommendation: "เก็บข้อมูลเพิ่มและพิจารณาขยายการทำงานของแนวทางนี้",
      action_required: "REVIEW_FOR_SCALE",
      requires_approval: 1
    };
  }

  if (m.customers > 0) {
    return {
      decision_type: "CONTINUE_CUSTOMER_SIGNAL",
      decision_status: "PENDING_APPROVAL",
      priority: "MEDIUM",
      reason: "Content สร้าง Customer ได้ แต่ยังไม่มี Order หรือ Revenue",
      evidence,
      recommendation: "รักษาแนวทางและเก็บข้อมูลต่อเพื่อดู Customer-to-Order",
      action_required: "CONTINUE_MEASUREMENT",
      requires_approval: 1
    };
  }

  if (m.engagements > 0) {
    return {
      decision_type: "CONTINUE_ENGAGEMENT_SIGNAL",
      decision_status: "PENDING_APPROVAL",
      priority: "MEDIUM",
      reason: "Content มี Engagement แต่ยังไม่เกิด Customer หรือ Order",
      evidence,
      recommendation: "รักษาแนวทางไว้และเก็บข้อมูลต่อ โดยเน้นการเปลี่ยน Engagement ไปสู่ Customer",
      action_required: "OPTIMIZE_CONVERSION_PATH",
      requires_approval: 1
    };
  }

  if (m.product_views > 0 || m.clicks > 0) {
    return {
      decision_type: "CONTINUE_TRAFFIC_SIGNAL",
      decision_status: "PENDING_APPROVAL",
      priority: "LOW",
      reason: "Content สร้างสัญญาณการสนใจระดับ Traffic แต่ยังไม่มี Customer หรือ Conversion",
      evidence,
      recommendation: "เก็บ Measurement เพิ่มและตรวจเส้นทางจาก Click ไป Product View และ Customer",
      action_required: "CONTINUE_MEASUREMENT",
      requires_approval: 1
    };
  }

  if (m.attention > 0) {
    return {
      decision_type: "CONTINUE_MEASUREMENT",
      decision_status: "PENDING_APPROVAL",
      priority: "LOW",
      reason: "Content มี Attention แต่ยังมีข้อมูลปลายทางไม่เพียงพอสำหรับการเปลี่ยนกลยุทธ์",
      evidence,
      recommendation: "ยังไม่ควรตัดสินว่า Content ดีหรือแย่ ให้เก็บ Behavior เพิ่มก่อน",
      action_required: "CONTINUE_MEASUREMENT",
      requires_approval: 1
    };
  }

  return {
    decision_type: "NO_SIGNAL",
    decision_status: "PENDING_APPROVAL",
    priority: "LOW",
    reason: "ยังไม่พบสัญญาณจาก Attention หรือ Behavior",
    evidence,
    recommendation: "ตรวจสอบการกระจาย Content และระบบเก็บ Behavior",
    action_required: "CHECK_DATA_COLLECTION",
    requires_approval: 1
  };
}

async function buildDecisionResult(db) {
  const measurementRow = await getLatestMeasurement(db);

  if (!measurementRow) {
    return {
      success: false,
      layer: LAYER,
      mode: "preview",
      status: "WAITING_FOR_MEASUREMENT",
      reason: "ยังไม่พบ CONTENT_ATTRIBUTION_V2 Measurement",
      measurement: null,
      learning: null,
      decision: null,
      winner_decision: "NOT_DECLARED_IN_DECISION_ENGINE_V1.3",
      next_step: "Create CONTENT_ATTRIBUTION_V2 measurement first."
    };
  }

  const measurement = normalizeMeasurement(measurementRow);

  const learningResult = await findLearningRun(db, measurement);

  const learningRun = learningResult.run;
  const learningInsight = await findLearningInsight(
    db,
    learningRun,
    measurement
  );

  const learning = extractLearning(
    learningRun,
    learningInsight
  );

  const decision = calculateDecision(
    measurement,
    learning
  );

  return {
    success: true,
    layer: LAYER,
    mode: "preview",
    status: learning
      ? "DECISION_READY"
      : "WAITING_FOR_LEARNING",

    measurement: {
      id: measurement.id,
      content_id: measurement.content_id,
      attribution_mode: measurement.attribution_mode,
      measured_at: measurement.measured_at,
      metrics: {
        attention: measurement.attention,
        product_views: measurement.product_views,
        clicks: measurement.clicks,
        engagements: measurement.engagements,
        customers: measurement.customers,
        orders: measurement.orders,
        revenue: measurement.revenue
      }
    },

    learning: learning
      ? {
          source: learning.source,
          run_id: learning.run_id,
          insight_id: learning.insight_id,
          status: learning.status,
          analysis: learning.analysis
        }
      : null,

    learning_lookup: {
      ai_run_id: learningRun
        ? learningRun.id
        : null,
      ai_insight_id: learningInsight
        ? learningInsight.id
        : null,
      run_type: learningRun
        ? learningRun.run_type
        : null,
      lookup_method: "ai_runs.run_type + input_data.measurement.id/content_id",
      insight_method: "ai_insights.run_id"
    },

    decision,

    winner_decision:
      "NOT_DECLARED_IN_DECISION_ENGINE_V1.3",

    next_step: learning
      ? "POST to save this Decision."
      : "Learning AI V1.9 result must exist for this measurement."
  };
}

async function saveDecision(db, result) {
  await ensureDecisionTable(db);

  const decision = result.decision;
  const measurement = result.measurement;
  const learning = result.learning;

  const id = uuid();

  await db.prepare(`
    INSERT INTO decision_runs (
      id,
      measurement_id,
      content_id,
      learning_run_id,
      learning_insight_id,
      decision_type,
      decision_status,
      priority,
      reason,
      evidence,
      recommendation,
      action_required,
      requires_approval,
      status,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    measurement ? measurement.id : null,
    measurement ? measurement.content_id : null,
    learning ? learning.run_id : null,
    learning ? learning.insight_id : null,
    decision.decision_type,
    decision.decision_status,
    decision.priority,
    decision.reason,
    JSON.stringify(decision.evidence || {}),
    decision.recommendation,
    decision.action_required,
    decision.requires_approval ? 1 : 0,
    "PENDING",
    new Date().toISOString()
  ).run();

  return id;
}

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;

    if (!db) {
      return json({
        success: false,
        layer: LAYER,
        error: "D1 binding DB not found"
      }, 500);
    }

    const result = await buildDecisionResult(db);

    return json(result);
  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      mode: "preview",
      status: "ERROR",
      error: error && error.message
        ? error.message
        : String(error)
    }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;

    if (!db) {
      return json({
        success: false,
        layer: LAYER,
        error: "D1 binding DB not found"
      }, 500);
    }

    const preview = await buildDecisionResult(db);

    if (!preview.success) {
      return json({
        ...preview,
        mode: "execute"
      }, 400);
    }

    if (!preview.learning) {
      return json({
        ...preview,
        mode: "execute",
        status: "WAITING_FOR_LEARNING",
        saved: false
      }, 400);
    }

    const decisionRunId = await saveDecision(
      db,
      preview
    );

    return json({
      success: true,
      layer: LAYER,
      mode: "execute",
      status: "DECISION_SAVED",

      measurement: preview.measurement,

      learning: preview.learning,

      decision: preview.decision,

      saved: {
        decision_run_id: decisionRunId,
        status: "PENDING"
      },

      winner_decision:
        "NOT_DECLARED_IN_DECISION_ENGINE_V1.3",

      next_step:
        "Decision saved. Next layer is Action/Automation after approval."
    });
  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      mode: "execute",
      status: "ERROR",
      error: error && error.message
        ? error.message
        : String(error)
    }, 500);
  }
}
