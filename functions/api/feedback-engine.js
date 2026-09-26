// TATO-OS
// Feedback Engine V1.0
// Route: /api/feedback-engine

const LAYER = "FEEDBACK_ENGINE_V1.0";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}

function parseJSON(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

async function getExecution(DB, id) {
  return await DB.prepare(
    "SELECT * FROM execution_runs WHERE id = ? LIMIT 1"
  ).bind(id).first();
}

async function getAction(DB, id) {
  if (!id) return null;
  return await DB.prepare(
    "SELECT * FROM action_runs WHERE id = ? LIMIT 1"
  ).bind(id).first();
}

function resolveContentId(execution, action) {
  const input = parseJSON(execution?.input_data);
  const output = parseJSON(execution?.output_data);
  return (
    output.content_id ||
    output.investigation?.content_id ||
    input.content_id ||
    action?.content_id ||
    null
  );
}

async function callJSON(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    throw new Error(data?.error || data?.status || `HTTP ${response.status}`);
  }
  return data;
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
  const investigation = output.investigation || {};

  return {
    contentId,
    action,
    investigation,
    measurement,
    learning
  };
}

export async function onRequestGet(context) {
  try {
    const DB = context.env?.DB;
    if (!DB) return json({
      success: false,
      layer: LAYER,
      status: "DB_BINDING_NOT_FOUND"
    }, 500);

    const url = new URL(context.request.url);
    const executionRunId = url.searchParams.get("execution_run_id");

    if (!executionRunId) return json({
      success: false,
      layer: LAYER,
      status: "ERROR",
      error: "execution_run_id is required"
    }, 400);

    const execution = await getExecution(DB, executionRunId);
    if (!execution) return json({
      success: false,
      layer: LAYER,
      status: "EXECUTION_NOT_FOUND"
    }, 404);

    const data = await buildFeedback(context, execution);

    return json({
      success: true,
      layer: LAYER,
      version: "1.0",
      mode: "preview",
      status: "FEEDBACK_READY",
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
      guardrails: {
        strategy_change: false,
        winner_declared: false,
        automatic_execution: false,
        business_data_mutation: false,
        requires_human_approval: true
      },
      next_step: "POST approved:true to persist feedback."
    });
  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      version: "1.0",
      status: "ERROR",
      error: error?.message || String(error)
    }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const DB = context.env?.DB;
    if (!DB) return json({
      success: false,
      layer: LAYER,
      status: "DB_BINDING_NOT_FOUND"
    }, 500);

    let body = {};
    try { body = await context.request.json(); } catch (_) {}

    if (body.approved !== true) return json({
      success: false,
      layer: LAYER,
      status: "APPROVAL_REQUIRED",
      error: "approved:true is required"
    }, 403);

    const executionRunId = body.execution_run_id;
    if (!executionRunId) return json({
      success: false,
      layer: LAYER,
      status: "ERROR",
      error: "execution_run_id is required"
    }, 400);

    const execution = await getExecution(DB, executionRunId);
    if (!execution) return json({
      success: false,
      layer: LAYER,
      status: "EXECUTION_NOT_FOUND"
    }, 404);

    const data = await buildFeedback(context, execution);

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

    const feedbackId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await DB.prepare(`
      INSERT INTO feedback_runs
      (id, execution_run_id, action_run_id, content_id, status,
       input_data, output_data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      feedbackId,
      execution.id,
      execution.action_run_id || null,
      data.contentId,
      "COMPLETED",
      JSON.stringify({
        approved: true,
        approval_source: body.approval_source || "HUMAN"
      }),
      JSON.stringify({
        investigation: data.investigation,
        measurement: data.measurement,
        learning: data.learning
      }),
      createdAt
    ).run();

    return json({
      success: true,
      layer: LAYER,
      version: "1.0",
      mode: "execute",
      status: "FEEDBACK_REENTERED",
      feedback_run_id: feedbackId,
      content_id: data.contentId,
      execution_run_id: execution.id,
      feedback_signal: {
        finding: data.investigation.finding || null,
        next_action: data.investigation.next_action || null
      },
      measurement: data.measurement.metrics || {},
      learning: data.learning.learning || null,
      guardrails: {
        strategy_change: false,
        winner_declared: false,
        automatic_execution: false,
        business_data_mutation: false,
        requires_decision_layer: true
      },
      next_stage: "DECISION_LAYER"
    });
  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      version: "1.0",
      status: "ERROR",
      error: error?.message || String(error)
    }, 500);
  }
}
