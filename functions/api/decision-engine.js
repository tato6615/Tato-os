// TATO OS
// Decision Engine V1.2
// MEASUREMENT -> LEARNING -> DECISION -> ACTION

const LAYER = "DECISION_ENGINE_V1.2";
const ATTRIBUTION_MODE = "CONTENT_ATTRIBUTION_V2";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pct(a, b) {
  return b > 0 ? Math.round((a / b) * 10000) / 100 : 0;
}

function uid() {
  return crypto.randomUUID();
}

function safeJson(value) {
  if (value && typeof value === "object") return value;

  if (typeof value !== "string") return null;

  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function textBlob(value) {
  if (value === null || value === undefined) return "";

  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

function containsRef(row, refs) {
  const blob = textBlob(row).toLowerCase();

  return refs.some(function(ref) {
    if (!ref) return false;
    return blob.includes(String(ref).toLowerCase());
  });
}

async function first(db, sql, ...params) {
  return await db.prepare(sql).bind(...params).first();
}

async function all(db, sql, ...params) {
  const result = await db.prepare(sql).bind(...params).all();
  return result?.results || [];
}

async function ensureDecisionTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS decision_runs (
      id TEXT PRIMARY KEY,
      measurement_id TEXT,
      content_id TEXT,
      learning_run_id TEXT,
      learning_insight_id TEXT,
      decision_type TEXT NOT NULL,
      decision_status TEXT NOT NULL,
      priority TEXT,
      reason TEXT,
      evidence TEXT NOT NULL DEFAULT '{}',
      recommendation TEXT,
      action_required INTEGER NOT NULL DEFAULT 0,
      requires_approval INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS decision_runs_measurement_idx
    ON decision_runs(measurement_id)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS decision_runs_status_idx
    ON decision_runs(status)
  `).run();
}

async function getLatestMeasurement(db, requestedMeasurementId) {
  if (requestedMeasurementId) {
    return await first(
      db,
      `
      SELECT *
      FROM content_measurements
      WHERE id = ?
      LIMIT 1
      `,
      requestedMeasurementId
    );
  }

  return await first(
    db,
    `
    SELECT *
    FROM content_measurements
    WHERE attribution_mode = ?
    ORDER BY datetime(measured_at) DESC,
             datetime(created_at) DESC
    LIMIT 1
    `,
    ATTRIBUTION_MODE
  );
}

async function getRelatedLearning(db, measurement) {
  if (!measurement) {
    return {
      run: null,
      insight: null,
      parsedOutput: null
    };
  }

  const refs = [
    measurement.id,
    measurement.content_id
  ].filter(Boolean);

  let runs = [];

  try {
    runs = await all(
      db,
      `
      SELECT *
      FROM ai_runs
      ORDER BY id DESC
      LIMIT 100
      `
    );
  } catch (_) {
    runs = [];
  }

  let learningRun = null;

  for (const row of runs) {
    if (!containsRef(row, refs)) continue;

    const agent = String(row.agent_name || "").toUpperCase();

    if (
      agent.includes("LEARNING") ||
      agent.includes("AI")
    ) {
      learningRun = row;
      break;
    }
  }

  if (!learningRun) {
    for (const row of runs) {
      if (containsRef(row, refs)) {
        learningRun = row;
        break;
      }
    }
  }

  let parsedOutput = null;

  if (learningRun) {
    parsedOutput =
      safeJson(learningRun.output) ||
      safeJson(learningRun.result) ||
      safeJson(learningRun.output_json);
  }

  let insights = [];

  try {
    insights = await all(
      db,
      `
      SELECT *
      FROM ai_insights
      ORDER BY id DESC
      LIMIT 100
      `
    );
  } catch (_) {
    insights = [];
  }

  let learningInsight = null;

  for (const row of insights) {
    if (containsRef(row, refs)) {
      learningInsight = row;
      break;
    }
  }

  if (!learningInsight && learningRun?.id) {
    for (const row of insights) {
      if (
        textBlob(row)
          .toLowerCase()
          .includes(String(learningRun.id).toLowerCase())
      ) {
        learningInsight = row;
        break;
      }
    }
  }

  return {
    run: learningRun,
    insight: learningInsight,
    parsedOutput
  };
}

function normalizeLearning(learningData) {
  const output = learningData?.parsedOutput;

  if (!output || typeof output !== "object") {
    return null;
  }

  return {
    summary: output.summary || null,

    observed_signals:
      Array.isArray(output.observed_signals)
        ? output.observed_signals
        : [],

    learning:
      output.learning || null,

    problems:
      Array.isArray(output.problems)
        ? output.problems
        : [],

    next_content:
      output.next_content || null,

    next_action:
      output.next_action || null,

    priority:
      output.priority || null
  };
}

/*
 * IMPORTANT:
 * This function calculates the Decision.
 * It is intentionally NOT named buildDecision,
 * so there is no duplicate top-level declaration.
 */
function calculateDecision(measurement, learning) {
  const attention = num(measurement?.attention);
  const productViews = num(measurement?.product_views);
  const clicks = num(measurement?.clicks);
  const engagements = num(measurement?.engagements);
  const customers = num(measurement?.customers);
  const orders = num(measurement?.orders);
  const revenue = num(measurement?.revenue);

  const attentionToView =
    pct(productViews, attention);

  const viewToClick =
    pct(clicks, productViews);

  const clickToCustomer =
    pct(customers, clicks);

  const customerToOrder =
    pct(orders, customers);

  const evidence = {
    attention,
    product_views: productViews,
    clicks,
    engagements,
    customers,
    orders,
    revenue,
    attention_to_view: attentionToView,
    view_to_click: viewToClick,
    click_to_customer: clickToCustomer,
    customer_to_order: customerToOrder
  };

  /*
   * Decision hierarchy:
   *
   * Revenue / Order
   * -> Customer
   * -> Engagement
   * -> Traffic / Click
   * -> Attention only
   * -> No data
   */

  if (orders > 0 || revenue > 0) {
    return {
      decision_type: "ITERATE_FROM_CONVERSION",
      decision_status: "READY_FOR_ACTION_REVIEW",
      priority: "HIGH",
      reason:
        "มีหลักฐานการเกิด Conversion จาก Content",
      recommendation:
        "ตรวจสอบองค์ประกอบของ Content และ Customer Journey ที่สัมพันธ์กับ Conversion แล้วสร้างรอบทดสอบถัดไป",
      action_required: 1,
      requires_approval: 1,
      evidence
    };
  }

  if (customers > 0) {
    return {
      decision_type: "OPTIMIZE_CUSTOMER_CONVERSION",
      decision_status: "READY_FOR_ACTION_REVIEW",
      priority: "HIGH",
      reason:
        "เกิด Customer Signal แต่ยังไม่เกิด Order",
      recommendation:
        "ปรับขั้นตอนจาก Customer Interest ไปสู่ Purchase และเก็บข้อมูลต่อ",
      action_required: 1,
      requires_approval: 1,
      evidence
    };
  }

  if (engagements > 0) {
    return {
      decision_type: "OPTIMIZE_NEXT_CONTENT",
      decision_status: "READY_FOR_ACTION_REVIEW",
      priority: "MEDIUM",
      reason:
        "Content สร้าง Engagement แต่ยังไม่มี Customer หรือ Order",
      recommendation:
        "นำองค์ประกอบที่สร้าง Engagement ไปทดสอบต่อ โดยเพิ่มเส้นทางไปยัง Product และ CTA",
      action_required: 1,
      requires_approval: 1,
      evidence
    };
  }

  if (clicks > 0 || productViews > 0) {
    return {
      decision_type: "OPTIMIZE_CONVERSION_PATH",
      decision_status: "EARLY_SIGNAL",
      priority: "MEDIUM",
      reason:
        "มี Traffic หรือ Click แต่ยังไม่เกิด Customer หรือ Order",
      recommendation:
        "ปรับ Product View และ CTA เพื่อเพิ่มคุณภาพของ Conversion Path พร้อมเก็บข้อมูลเพิ่ม",
      action_required: 1,
      requires_approval: 1,
      evidence
    };
  }

  if (attention > 0) {
    return {
      decision_type: "CONTINUE_MEASUREMENT",
      decision_status: "EARLY_SIGNAL",
      priority: "LOW",
      reason:
        "มี Attention แต่ยังไม่มี Downstream Behavior เพียงพอ",
      recommendation:
        "ยังไม่ควรเปลี่ยนกลยุทธ์จากข้อมูลชุดเล็ก ให้เก็บ Behavior เพิ่มก่อนตัดสินใจ",
      action_required: 0,
      requires_approval: 1,
      evidence
    };
  }

  return {
    decision_type: "WAIT_FOR_DATA",
    decision_status: "WAITING_FOR_MEASUREMENT",
    priority: "LOW",
    reason:
      "ยังไม่มี Behavior Signal เพียงพอสำหรับ Decision",
    recommendation:
      "รอ Attention และ Behavior เพิ่มก่อนสร้าง Decision",
    action_required: 0,
    requires_approval: 1,
    evidence
  };
}

function learningSummary(learning) {
  if (!learning) return null;

  return {
    summary: learning.summary,

    observed_signals:
      learning.observed_signals,

    learning:
      learning.learning,

    problems:
      learning.problems,

    next_content:
      learning.next_content,

    next_action:
      learning.next_action,

    priority:
      learning.priority
  };
}

async function buildDecisionResult(context) {
  const db = context.env?.DB;

  if (!db) {
    return {
      success: false,
      error: "D1 binding DB not found"
    };
  }

  await ensureDecisionTable(db);

  const url = new URL(context.request.url);

  const measurementId =
    url.searchParams.get("measurement_id") || null;

  const measurement =
    await getLatestMeasurement(
      db,
      measurementId
    );

  if (!measurement) {
    return {
      success: false,
      layer: LAYER,
      mode: "preview",
      status: "WAITING_FOR_MEASUREMENT",
      reason:
        "ยังไม่พบ CONTENT_ATTRIBUTION_V2 measurement",

      measurement: null,

      learning: null,

      decision: {
        decision_type: "WAIT_FOR_DATA",
        decision_status:
          "WAITING_FOR_MEASUREMENT"
      },

      winner_decision:
        "NOT_DECLARED_IN_DECISION_ENGINE_V1.2",

      next_step:
        "Run /api/content-measurement first."
    };
  }

  const learningData =
    await getRelatedLearning(
      db,
      measurement
    );

  const learning =
    normalizeLearning(learningData);

  if (!learning) {
    return {
      success: false,
      layer: LAYER,
      mode: "preview",
      status: "WAITING_FOR_LEARNING",

      reason:
        "พบ Measurement แล้ว แต่ยังหา Learning AI ที่เชื่อมกับ measurement/content นี้ไม่พบ",

      measurement: {
        id: measurement.id,

        content_id:
          measurement.content_id,

        attribution_mode:
          measurement.attribution_mode || null
      },

      learning: null,

      learning_lookup: {
        ai_run_id:
          learningData?.run?.id || null,

        ai_insight_id:
          learningData?.insight?.id || null,

        agent_name:
          learningData?.run?.agent_name || null
      },

      decision: null,

      winner_decision:
        "NOT_DECLARED_IN_DECISION_ENGINE_V1.2",

      next_step:
        "ตรวจสอบ ai_runs.input_ref/output ที่เชื่อมกับ measurement_id หรือ content_id"
    };
  }

  const decision =
    calculateDecision(
      measurement,
      learning
    );

  return {
    success: true,

    layer: LAYER,

    mode: "preview",

    status: "DECISION_READY",

    measurement: {
      id: measurement.id,

      content_id:
        measurement.content_id,

      measured_at:
        measurement.measured_at,

      measurement_start:
        measurement.measurement_start,

      attribution_mode:
        measurement.attribution_mode || null
    },

    metrics: {
      attention:
        num(measurement.attention),

      product_views:
        num(measurement.product_views),

      clicks:
        num(measurement.clicks),

      engagements:
        num(measurement.engagements),

      customers:
        num(measurement.customers),

      orders:
        num(measurement.orders),

      revenue:
        num(measurement.revenue)
    },

    conversion: {
      attention_to_view:
        pct(
          num(measurement.product_views),
          num(measurement.attention)
        ),

      view_to_click:
        pct(
          num(measurement.clicks),
          num(measurement.product_views)
        ),

      click_to_customer:
        pct(
          num(measurement.customers),
          num(measurement.clicks)
        ),

      customer_to_order:
        pct(
          num(measurement.orders),
          num(measurement.customers)
        )
    },

    learning: {
      run_id:
        learningData.run?.id || null,

      insight_id:
        learningData.insight?.id || null,

      agent_name:
        learningData.run?.agent_name ||
        learningData.insight?.agent_name ||
        null,

      result:
        learningSummary(learning)
    },

    decision,

    winner_decision:
      "NOT_DECLARED_IN_DECISION_ENGINE_V1.2",

    next_step:
      "POST this decision to save it. Action layer comes after approval."
  };
}

async function executeDecision(context, result) {
  const db = context.env?.DB;

  if (!db) {
    return {
      success: false,
      error: "D1 binding DB not found"
    };
  }

  if (
    !result?.success ||
    !result?.decision
  ) {
    return result;
  }

  const measurement =
    result.measurement;

  const learning =
    result.learning;

  const decision =
    result.decision;

  const id = uid();

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

    measurement?.id || null,

    measurement?.content_id || null,

    learning?.run_id || null,

    learning?.insight_id || null,

    decision.decision_type,

    decision.decision_status,

    decision.priority || "LOW",

    decision.reason || "",

    JSON.stringify(
      decision.evidence || {}
    ),

    decision.recommendation || "",

    decision.action_required ? 1 : 0,

    decision.requires_approval ? 1 : 0,

    "pending",

    new Date().toISOString()
  ).run();

  return {
    ...result,

    mode: "execute",

    saved: {
      decision_id: id,

      status: "pending",

      requires_approval:
        decision.requires_approval
          ? true
          : false
    },

    next_step:
      "Decision saved. Review/approve before Action layer executes anything."
  };
}

export async function onRequestGet(context) {
  try {
    return json(
      await buildDecisionResult(context)
    );
  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      error:
        error?.message ||
        String(error)
    }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const result =
      await buildDecisionResult(context);

    if (!result.success) {
      return json(result);
    }

    const saved =
      await executeDecision(
        context,
        result
      );

    return json(saved);
  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      error:
        error?.message ||
        String(error)
    }, 500);
  }
}
