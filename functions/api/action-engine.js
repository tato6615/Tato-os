const LAYER = "ACTION_ENGINE_V1.1";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8"
    }
  });
}

function now() {
  return new Date().toISOString();
}

function uuid() {
  return crypto.randomUUID();
}

async function tableExists(DB, table) {
  const row = await DB.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).bind(table).first();

  return !!row;
}

async function getColumns(DB, table) {
  const result = await DB.prepare(`PRAGMA table_info(${table})`).all();
  return (result.results || []).map(row => row.name);
}

async function ensureActionRunsSchema(DB) {
  const exists = await tableExists(DB, "action_runs");

  if (!exists) {
    await DB.prepare(`
      CREATE TABLE action_runs (
        id TEXT PRIMARY KEY,
        decision_run_id TEXT,
        measurement_id TEXT,
        content_id TEXT,
        action_type TEXT,
        action_status TEXT,
        priority TEXT,
        reason TEXT,
        action_payload TEXT,
        requires_approval INTEGER DEFAULT 1,
        approved_at TEXT,
        executed_at TEXT,
        result TEXT,
        status TEXT DEFAULT 'PENDING',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    return {
      created: true,
      added_columns: [
        "id",
        "decision_run_id",
        "measurement_id",
        "content_id",
        "action_type",
        "action_status",
        "priority",
        "reason",
        "action_payload",
        "requires_approval",
        "approved_at",
        "executed_at",
        "result",
        "status",
        "created_at"
      ]
    };
  }

  const existing = await getColumns(DB, "action_runs");
  const added = [];

  const requiredColumns = [
    ["decision_run_id", "TEXT"],
    ["measurement_id", "TEXT"],
    ["content_id", "TEXT"],
    ["action_type", "TEXT"],
    ["action_status", "TEXT"],
    ["priority", "TEXT"],
    ["reason", "TEXT"],
    ["action_payload", "TEXT"],
    ["requires_approval", "INTEGER DEFAULT 1"],
    ["approved_at", "TEXT"],
    ["executed_at", "TEXT"],
    ["result", "TEXT"],
    ["status", "TEXT DEFAULT 'PENDING'"],
    ["created_at", "TEXT"]
  ];

  for (const [column, definition] of requiredColumns) {
    if (!existing.includes(column)) {
      await DB.prepare(
        `ALTER TABLE action_runs ADD COLUMN ${column} ${definition}`
      ).run();

      added.push(column);
    }
  }

  return {
    created: false,
    existing_columns: existing,
    added_columns: added
  };
}

async function getLatestDecision(DB) {
  return await DB.prepare(`
    SELECT
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
    FROM decision_runs
    ORDER BY created_at DESC
    LIMIT 1
  `).first();
}

function buildAction(decision) {
  const type = decision.decision_type;

  if (type === "CONTINUE_TRAFFIC_SIGNAL") {
    return {
      action_type: "CONTINUE_MEASUREMENT",
      action_status: "PENDING_APPROVAL",
      priority: decision.priority || "LOW",
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
      requires_approval: 1
    };
  }

  if (type === "OPTIMIZE_CONTENT") {
    return {
      action_type: "OPTIMIZE_CONTENT",
      action_status: "PENDING_APPROVAL",
      priority: decision.priority || "MEDIUM",
      reason:
        "Decision พบสัญญาณที่มีข้อมูลเพียงพอสำหรับเสนอการปรับ Content แต่ยังต้องได้รับ Approval",
      action_payload: {
        operation: "REVIEW_CONTENT_OPTIMIZATION",
        content_id: decision.content_id,
        measurement_id: decision.measurement_id,
        recommendation: decision.recommendation || {}
      },
      requires_approval: 1
    };
  }

  if (type === "MONITOR_CONTENT") {
    return {
      action_type: "MONITOR_CONTENT",
      action_status: "PENDING_APPROVAL",
      priority: decision.priority || "LOW",
      reason:
        "Decision ระบุให้ติดตามสัญญาณเพิ่มเติมก่อนเปลี่ยนกลยุทธ์",
      action_payload: {
        operation: "MONITOR",
        content_id: decision.content_id,
        measurement_id: decision.measurement_id
      },
      requires_approval: 1
    };
  }

  return {
    action_type: "REVIEW_DECISION",
    action_status: "PENDING_APPROVAL",
    priority: decision.priority || "MEDIUM",
    reason:
      "Decision type นี้ยังไม่มี execution mapping แบบอัตโนมัติ จึงส่งเข้า Approval Queue",
    action_payload: {
      operation: "REVIEW",
      decision_type: type,
      content_id: decision.content_id,
      measurement_id: decision.measurement_id
    },
    requires_approval: 1
  };
}

async function createAction(DB, decision, action) {
  const actionRunId = uuid();
  const createdAt = now();

  const columns = await getColumns(DB, "action_runs");

  const values = {
    id: actionRunId,
    decision_run_id: decision.id,
    measurement_id: decision.measurement_id || null,
    content_id: decision.content_id || null,
    action_type: action.action_type,
    action_status: action.action_status,
    priority: action.priority,
    reason: action.reason,
    action_payload: JSON.stringify(action.action_payload),
    requires_approval: action.requires_approval,
    approved_at: null,
    executed_at: null,
    result: null,
    status: "PENDING",
    created_at: createdAt
  };

  const insertColumns = [];
  const placeholders = [];
  const bindings = [];

  for (const [column, value] of Object.entries(values)) {
    if (columns.includes(column)) {
      insertColumns.push(column);
      placeholders.push("?");
      bindings.push(value);
    }
  }

  if (!columns.includes("id")) {
    throw new Error("action_runs table is missing required primary key column: id");
  }

  const sql = `
    INSERT INTO action_runs
    (${insertColumns.join(", ")})
    VALUES
    (${placeholders.join(", ")})
  `;

  await DB.prepare(sql).bind(...bindings).run();

  return {
    action_run_id: actionRunId,
    status: "PENDING",
    created_at: createdAt
  };
}

export async function onRequestGet(context) {
  try {
    const { env } = context;
    const DB = env.DB;

    if (!DB) {
      return json({
        success: false,
        layer: LAYER,
        status: "ERROR",
        error: "D1 binding DB not found"
      }, 500);
    }

    const decision = await getLatestDecision(DB);

    if (!decision) {
      return json({
        success: true,
        layer: LAYER,
        mode: "preview",
        status: "WAITING_FOR_DECISION",
        decision: null,
        action: null,
        control: {
          automatic_execution: false,
          approval_required: true,
          execution_status: "NOT_EXECUTED"
        }
      });
    }

    const action = buildAction(decision);

    return json({
      success: true,
      layer: LAYER,
      mode: "preview",
      status: "PENDING_APPROVAL",
      decision: {
        id: decision.id,
        decision_type: decision.decision_type,
        decision_status: decision.decision_status,
        priority: decision.priority,
        content_id: decision.content_id,
        measurement_id: decision.measurement_id,
        learning_run_id: decision.learning_run_id,
        action_required: decision.action_required,
        requires_approval: decision.requires_approval
      },
      action,
      control: {
        automatic_execution: false,
        approval_required: true,
        execution_status: "NOT_EXECUTED"
      },
      next_step: "POST to create the Action and place it in the approval queue."
    });

  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      mode: "preview",
      status: "ERROR",
      error: error.message
    }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const DB = env.DB;

    if (!DB) {
      return json({
        success: false,
        layer: LAYER,
        mode: "execute",
        status: "ERROR",
        error: "D1 binding DB not found"
      }, 500);
    }

    /*
      IMPORTANT:
      This endpoint creates an Action only.
      It does NOT execute the action.
    */

    const schemaRepair = await ensureActionRunsSchema(DB);

    const decision = await getLatestDecision(DB);

    if (!decision) {
      return json({
        success: false,
        layer: LAYER,
        mode: "execute",
        status: "WAITING_FOR_DECISION",
        error: "No decision found"
      }, 400);
    }

    const action = buildAction(decision);

    const saved = await createAction(
      DB,
      decision,
      action
    );

    return json({
      success: true,
      layer: LAYER,
      mode: "execute",
      status: "ACTION_CREATED",
      decision: {
        id: decision.id,
        decision_type: decision.decision_type,
        decision_status: decision.decision_status,
        content_id: decision.content_id,
        measurement_id: decision.measurement_id
      },
      action,
      saved,
      schema: {
        repaired: schemaRepair.created || schemaRepair.added_columns.length > 0,
        added_columns: schemaRepair.added_columns
      },
      control: {
        automatic_execution: false,
        approval_required: true,
        execution_status: "NOT_EXECUTED"
      },
      next_step:
        "Approval is required before Execution. The action has NOT been executed."
    });

  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      mode: "execute",
      status: "ERROR",
      error: error.message
    }, 500);
  }
}
