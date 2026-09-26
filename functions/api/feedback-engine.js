// TATO-OS
// Feedback Engine V1.2
// Route: /api/feedback-engine
// Purpose: persist verified execution feedback and hand it back to the loop.
// Guardrails: no strategy change, no winner declaration, no automatic execution.

const LAYER = "FEEDBACK_ENGINE_V1.2";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" }
  });
}

function parseJSON(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

async function getExecution(DB, id, actionRunId = null) {
  if (id) return await DB.prepare("SELECT * FROM execution_runs WHERE id = ? LIMIT 1").bind(id).first();
  if (actionRunId) {
    return await DB.prepare(
      "SELECT * FROM execution_runs WHERE action_run_id = ? ORDER BY created_at DESC LIMIT 1"
    ).bind(actionRunId).first();
  }
  return null;
}

async function getAction(DB, id) {
  if (!id) return null;
  return await DB.prepare("SELECT * FROM action_runs WHERE id = ? LIMIT 1").bind(id).first();
}

function resolveContentId(execution, action) {
  const input = parseJSON(execution?.input_data);
  const output = parseJSON(execution?.output_data);
  return output.content_id || output.investigation?.content_id || input.content_id || action?.content_id || null;
}

async function callJSON(url) {
  const response = await fetch(url, { method: "GET", headers: { accept: "application/json" } });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) throw new Error(data?.error || data?.status || `HTTP ${response.status}`);
  return data;
}

async function ensureFeedbackTable(DB) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS feedback_runs (
      id TEXT PRIMARY KEY,
      execution_run_id TEXT NOT NULL,
      action_run_id TEXT,
      content_id TEXT NOT NULL,
      status TEXT NOT NULL,
      input_data TEXT,
      output_data TEXT,
      created_at TEXT NOT NULL
    )
  `).run();

  // Existing TATO-OS installations may already have feedback_runs
  // with an older schema. Upgrade only missing columns; never delete data.
  const info = await DB.prepare("PRAGMA table_info(feedback_runs)").all();
  const columns = new Set((info.results || []).map(row => row.name));

  const additions = [
    ["execution_run_id", "TEXT"],
    ["action_run_id", "TEXT"],
    ["content_id", "TEXT"],
    ["status", "TEXT"],
    ["input_data", "TEXT"],
    ["output_data", "TEXT"],
    ["created_at", "TEXT"]
  ];

  for (const [name, type] of additions) {
    if (!columns.has(name)) {
      await DB.prepare(`ALTER TABLE feedback_runs ADD COLUMN ${name} ${type}`).run();
    }
  }
}

async function buildFeedback(context, execution) {
  const DB = context.env.DB;
  const url = new URL(context.request.url);
  const action = await getAction(DB, execution.action_run_id);
  const contentId = resolveContentId(execution, action);

  if (!contentId) throw new Error("CONTENT_ID_NOT_FOUND");
  if (execution.status !== "SUCCESS") throw new Error("EXECUTION_NOT_COMPLETED");

  const measurementUrl = new URL("/api/content-measurement", url.origin);
  measurementUrl.searchParams.set("content_id", contentId);
  const measurement = await callJSON(measurementUrl);

  const learningUrl = new URL("/api/learning-ai", url.origin);
  learningUrl.searchParams.set("content_id", contentId);
  const learning = await callJSON(learningUrl);

  const output = parseJSON(execution.output_data);
  return {
    contentId,
    action,
    investigation: output.investigation || {},
    measurement,
    learning
  };
}

async function persistFeedback(DB, execution, data, approvalSource = "HUMAN") {
  await ensureFeedbackTable(DB);

  const existing = await DB.prepare(
    "SELECT * FROM feedback_runs WHERE execution_run_id = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(execution.id).first();

  if (existing) return { id: existing.id, duplicate: true, created_at: existing.created_at };

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await DB.prepare(`
    INSERT INTO feedback_runs
    (id, execution_run_id, action_run_id, content_id, status, input_data, output_data, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    execution.id,
    execution.action_run_id || null,
    data.contentId,
    "COMPLETED",
    JSON.stringify({ approved: true, approval_source: approvalSource }),
    JSON.stringify({
      investigation: data.investigation,
      measurement: data.measurement,
      learning: data.learning
    }),
    createdAt
  ).run();

  return { id, duplicate: false, created_at: createdAt };
}

function responsePayload(data, execution, mode, persisted = null) {
  return {
    success: true,
    layer: LAYER,
    version: "1.2",
    mode,
    status: mode === "execute" ? "FEEDBACK_REENTERED" : "FEEDBACK_READY",
    content_id: data.contentId,
    execution: {
      execution_run_id: execution.id,
      action_run_id: execution.action_run_id,
      status: execution.status,
      investigation: data.investigation
    },
    measurement: {
      measurement_id: data.measurement.measurement_id || null,
      status: data.measurement.status || null,
      metrics: data.measurement.metrics || {}
    },
    learning: {
      state: data.learning.learning?.state || null,
      decision_input: data.learning.learning?.decision_input || null,
      confidence: data.learning.learning?.confidence || null
    },
    feedback_signal: {
      finding: data.investigation.finding || null,
      next_action: data.investigation.next_action || null
    },
    persisted: persisted ? { feedback_run_id: persisted.id, duplicate: persisted.duplicate } : false,
    guardrails: {
      strategy_change: false,
      winner_declared: false,
      automatic_execution: false,
      business_data_mutation: false,
      requires_human_approval: true
    },
    next_step: mode === "execute" ? "MEASUREMENT_REENTRY" : "POST approved:true to persist feedback."
  };
}

export async function onRequestGet(context) {
  try {
    const DB = context.env?.DB;
    if (!DB) return json({ success: false, layer: LAYER, status: "DB_BINDING_NOT_FOUND" }, 500);

    const url = new URL(context.request.url);
    const executionRunId = url.searchParams.get("execution_run_id");
    const actionRunId = url.searchParams.get("action_run_id");
    const persist = url.searchParams.get("persist") === "1";

    if (!executionRunId && !actionRunId) {
      return json({ success: false, layer: LAYER, status: "ERROR", error: "execution_run_id or action_run_id is required" }, 400);
    }

    const execution = await getExecution(DB, executionRunId, actionRunId);
    if (!execution) return json({ success: false, layer: LAYER, status: "EXECUTION_NOT_FOUND" }, 404);

    const data = await buildFeedback(context, execution);

    if (persist) {
      const persisted = await persistFeedback(DB, execution, data, "HUMAN_BROWSER");
      return json(responsePayload(data, execution, "execute", persisted));
    }

    return json(responsePayload(data, execution, "preview"));
  } catch (error) {
    return json({ success: false, layer: LAYER, version: "1.2", status: "ERROR", error: error?.message || String(error) }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const DB = context.env?.DB;
    if (!DB) return json({ success: false, layer: LAYER, status: "DB_BINDING_NOT_FOUND" }, 500);

    let body = {};
    try { body = await context.request.json(); } catch (_) {}

    if (body.approved !== true) {
      return json({ success: false, layer: LAYER, status: "APPROVAL_REQUIRED", error: "approved:true is required" }, 403);
    }

    const executionRunId = body.execution_run_id;
    if (!executionRunId) {
      return json({ success: false, layer: LAYER, status: "ERROR", error: "execution_run_id is required" }, 400);
    }

    const execution = await getExecution(DB, executionRunId);
    if (!execution) return json({ success: false, layer: LAYER, status: "EXECUTION_NOT_FOUND" }, 404);

    const data = await buildFeedback(context, execution);
    const persisted = await persistFeedback(DB, execution, data, body.approval_source || "HUMAN");

    return json(responsePayload(data, execution, "execute", persisted));
  } catch (error) {
    return json({ success: false, layer: LAYER, version: "1.2", status: "ERROR", error: error?.message || String(error) }, 500);
  }
}
