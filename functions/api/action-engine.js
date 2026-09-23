const LAYER = "ACTION_ENGINE_V1";
const ACTION_STATUS = "PENDING_APPROVAL";

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

function uuid() {
  return crypto.randomUUID();
}

async function ensureActionTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS action_runs (
      id TEXT PRIMARY KEY,
      decision_run_id TEXT,
      measurement_id TEXT,
      content_id TEXT,
      action_type TEXT NOT NULL,
      action_status TEXT NOT NULL,
      priority TEXT NOT NULL,
      reason TEXT NOT NULL,
      action_payload TEXT NOT NULL DEFAULT '{}',
      requires_approval INTEGER NOT NULL DEFAULT 1,
      approved_at TEXT,
      executed_at TEXT,
      result TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

async function getLatestDecision(db) {
  const result = await db.prepare(`
    SELECT *
    FROM decision_runs
    ORDER BY created_at DESC
    LIMIT 1
  `).all();

  return result.results && result.results.length
    ? result.results[0]
    : null;
}

function normalizeDecision(row) {
  if (!row) return null;

  return {
    id: row.id || null,
    decision_type: row.decision_type || null,
    decision_status: row.decision_status || null,
    priority: row.priority || "LOW",
    content_id: row.content_id || null,
    measurement_id: row.measurement_id || null,
    learning_run_id: row.learning_run_id || null,
    reason: row.reason || "",
    evidence: safeJsonParse(row.evidence, {}),
    recommendation: safeJsonParse(row.recommendation, row.recommendation || ""),
    action_required: Number(row.action_required || 0),
    requires_approval: Number(row.requires_approval || 0),
    status: row.status || null,
    created_at: row.created_at || null
  };
}

function buildAction(decision) {
  if (!decision) {
    return {
      action_type: "WAIT_FOR_DECISION",
      action_status: "WAITING",
      priority: "LOW",
      reason: "ยังไม่มี Decision สำหรับสร้าง Action",
      action_payload: {},
      requires_approval: 0
    };
  }

  if (!decision.action_required) {
    return {
      action_type: "NO_ACTION",
      action_status: "NO_ACTION_REQUIRED",
      priority: decision.priority,
      reason: "Decision นี้ไม่ได้กำหนดให้ต้องดำเนินการ",
      action_payload: {},
      requires_approval: 0
    };
  }

  if (decision.decision_type === "CONTINUE_TRAFFIC_SIGNAL") {
    return {
      action_type: "CONTINUE_MEASUREMENT",
      action_status: ACTION_STATUS,
      priority: decision.priority,
      reason:
        "Decision พบสัญญาณ Traffic แต่ข้อมูลปลายทางยังไม่เพียงพอ จึงควรเก็บ Behavior และ Measurement ต่อ",
      action_payload: {
        operation: "MEASURE_CONTENT",
        content_id: decision.content_id,
        measurement_id: decision.measurement_id,
        collect: [
          "attention",
          "product_views",
          "clicks",
          "engagements",
          "customers",
          "orders",
          "revenue"
        ],
        do_not_change_strategy_yet: true
      },
      requires_approval: decision.requires_approval ? 1 : 0
    };
  }

  if (decision.decision_type === "CONTINUE_MEASUREMENT") {
    return {
      action_type: "CONTINUE_MEASUREMENT",
      action_status: ACTION_STATUS,
      priority: decision.priority,
      reason: decision.reason,
      action_payload: {
        operation: "MEASURE_CONTENT",
        content_id: decision.content_id,
        measurement_id: decision.measurement_id
      },
      requires_approval: decision.requires_approval ? 1 : 0
    };
  }

  if (decision.decision_type === "OPTIMIZE_CONVERSION_PATH") {
    return {
      action_type: "OPTIMIZE_CONVERSION_PATH",
      action_status: ACTION_STATUS,
      priority: decision.priority,
      reason: decision.reason,
      action_payload: {
        operation: "REVIEW_CONVERSION_PATH",
        content_id: decision.content_id,
        measurement_id: decision.measurement_id,
        focus: [
          "engagement_to_customer",
          "customer_to_order"
        ]
      },
      requires_approval: decision.requires_approval ? 1 : 0
    };
  }

  if (decision.decision_type === "CONTINUE_CUSTOMER_SIGNAL") {
    return {
      action_type: "CONTINUE_CUSTOMER_MEASUREMENT",
      action_status: ACTION_STATUS,
      priority: decision.priority,
      reason: decision.reason,
      action_payload: {
        operation: "MONITOR_CUSTOMER_TO_ORDER",
        content_id: decision.content_id,
        measurement_id: decision.measurement_id
      },
      requires_approval: decision.requires_approval ? 1 : 0
    };
  }

  if (decision.decision_type === "CONTINUE_AND_SCALE_SIGNAL") {
    return {
      action_type: "REVIEW_SCALE",
      action_status: ACTION_STATUS,
      priority: decision.priority,
      reason: decision.reason,
      action_payload: {
        operation: "REVIEW_FOR_SCALE",
        content_id: decision.content_id,
        measurement_id: decision.measurement_id,
        approval_required: true
      },
      requires_approval: 1
    };
  }

  return {
    action_type: "REVIEW_DECISION",
    action_status: ACTION_STATUS,
    priority: decision.priority,
    reason: decision.reason,
    action_payload: {
      operation: "FOUNDER_REVIEW",
      decision_type: decision.decision_type,
      content_id: decision.content_id,
      measurement_id: decision.measurement_id
    },
    requires_approval: 1
  };
}

async function buildActionResult(db) {
  const decisionRow = await getLatestDecision(db);

  if (!decisionRow) {
    return {
      success: false,
      layer: LAYER,
      mode: "preview",
      status: "WAITING_FOR_DECISION",
      decision: null,
      action: null,
      next_step: "Create Decision first."
    };
  }

  const decision = normalizeDecision(decisionRow);
  const action = buildAction(decision);

  return {
    success: true,
    layer: LAYER,
    mode: "preview",
    status: action.action_status,

    decision: {
      id: decision.id,
      decision_type: decision.decision_type,
      decision_status: decision.decision_status,
      priority: decision.priority,
      content_id: decision.content_id,
      measurement_id: decision.measurement_id,
      action_required: decision.action_required,
      requires_approval: decision.requires_approval
    },

    action,

    control: {
      automatic_execution: false,
      approval_required: action.requires_approval === 1,
      execution_status: "NOT_EXECUTED"
    },

    next_step:
      action.requires_approval === 1
        ? "POST to create the Action and place it in the approval queue."
        : "No execution required."
  };
}

async function saveAction(db, result) {
  await ensureActionTable(db);

  const decision = result.decision;
  const action = result.action;

  const id = uuid();

  await db.prepare(`
    INSERT INTO action_runs (
      id,
      decision_run_id,
      measurement_id,
      content_id,
      action_type,
      action_status,
      priority,
      reason,
      action_payload,
      requires_approval,
      status,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    decision.id,
    decision.measurement_id,
    decision.content_id,
    action.action_type,
    action.action_status,
    action.priority,
    action.reason,
    JSON.stringify(action.action_payload || {}),
    action.requires_approval ? 1 : 0,
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

    return json(
      await buildActionResult(db)
    );
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

    const preview = await buildActionResult(db);

    if (!preview.success) {
      return json({
        ...preview,
        mode: "execute"
      }, 400);
    }

    if (
      preview.action.action_type === "NO_ACTION"
    ) {
      return json({
        success: true,
        layer: LAYER,
        mode: "execute",
        status: "NO_ACTION_REQUIRED",
        decision: preview.decision,
        action: preview.action,
        saved: false
      });
    }

    const actionRunId = await saveAction(
      db,
      preview
    );

    return json({
      success: true,
      layer: LAYER,
      mode: "execute",
      status: "ACTION_CREATED",

      decision: preview.decision,

      action: preview.action,

      control: {
        automatic_execution: false,
        approval_required:
          preview.action.requires_approval === 1,
        execution_status: "NOT_EXECUTED"
      },

      saved: {
        action_run_id: actionRunId,
        status: "PENDING"
      },

      next_step:
        "Action created. Approval is required before execution."
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
