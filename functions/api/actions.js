// TATO-OS
// Action Layer V1.0
// Route: /api/action
//
// Architecture:
//
// Measurement V2.2
//        ↓
// Intelligence V2.0
//        ↓
// Learning V2.2
//        ↓
// Decision V1.1
//        ↓
// Action V1.0
//        ↓
// Automation / Execution
//
// Action Layer DOES:
// - read Decision Layer
// - validate Decision contract
// - translate decision into an executable action definition
// - optionally save action into action_queue
//
// Action Layer DOES NOT:
// - read raw behavior_events
// - recalculate measurement
// - recalculate intelligence
// - recalculate learning
// - change strategy
// - declare winners
// - execute external actions
//
// V1.0 = QUEUE ONLY / NO EXTERNAL EXECUTION

const VERSION = "1.0";
const LAYER = "ACTION_LAYER_V1";

const DECISION_LAYER = "DECISION_LAYER_V1";
const DECISION_VERSION = "1.1";

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

function normalizeDecision(root) {
  if (!root || root.success !== true) {
    throw new Error("Decision Layer response is invalid");
  }

  if (root.layer !== DECISION_LAYER) {
    throw new Error(
      `Invalid Decision Layer: expected ${DECISION_LAYER}, received ${s(root.layer)}`
    );
  }

  if (root.version !== DECISION_VERSION) {
    throw new Error(
      `Invalid Decision version: expected ${DECISION_VERSION}, received ${s(root.version)}`
    );
  }

  if (root.status !== "DECISION_READY") {
    throw new Error(
      `Decision is not ready: ${s(root.status)}`
    );
  }

  const decision = root.decision || {};
  const evidence = root.evidence || {};
  const learning = root.learning || {};
  const intelligence = root.intelligence || {};
  const funnel = root.funnel || {};

  const decisionType = s(decision.type);
  const target = s(decision.target);

  if (!decisionType) {
    throw new Error("Decision type is missing");
  }

  if (!target) {
    throw new Error("Decision target is missing");
  }

  if (!root.guardrails) {
    throw new Error("Decision guardrails are missing");
  }

  if (root.guardrails.decision_is_executable !== false) {
    throw new Error(
      "Decision contract violation: decision_is_executable must be false"
    );
  }

  if (root.guardrails.automatic_execution !== false) {
    throw new Error(
      "Decision contract violation: automatic_execution must be false"
    );
  }

  return {
    content: root.content || null,

    decision: {
      priority: s(decision.priority || "LOW").toUpperCase(),
      type: decisionType,
      target,
      reason: s(decision.reason)
    },

    required_action: root.required_action || {
      type: "INVESTIGATE",
      execute: false
    },

    evidence: {
      attention: n(evidence.attention),
      clicks: n(evidence.clicks),
      product_views: n(evidence.product_views),
      engagements: n(evidence.engagements),
      customers: n(evidence.customers),
      orders: n(evidence.orders),
      revenue: n(evidence.revenue)
    },

    learning: {
      layer: s(learning.layer),
      version: s(learning.version),
      state: s(learning.state),
      confidence: s(learning.confidence),
      evidence_available: learning.evidence_available === true,
      measurement_rounds: n(learning.measurement_rounds),
      decision_input: learning.decision_input || null,
      signals: Array.isArray(learning.signals)
        ? learning.signals
        : [],
      hypotheses: Array.isArray(learning.hypotheses)
        ? learning.hypotheses
        : []
    },

    intelligence: {
      source: s(intelligence.source),
      version: s(intelligence.version),
      state: s(intelligence.state),
      patterns: intelligence.patterns || {},
      conversions: intelligence.conversions || {}
    },

    funnel: {
      attention: n(funnel.attention),
      clicks: n(funnel.clicks),
      product_views: n(funnel.product_views),
      engagements: n(funnel.engagements),
      customers: n(funnel.customers),
      orders: n(funnel.orders),
      revenue: n(funnel.revenue)
    },

    source_chain: Array.isArray(root.source_chain)
      ? root.source_chain
      : [],

    source_contract: root.source_contract || {},

    guardrails: root.guardrails,

    handoff: root.handoff || {},

    execution: root.execution || {},

    timestamp: root.timestamp || null
  };
}

function validateSourceContract(decision) {
  const learning = decision.learning;
  const intelligence = decision.intelligence;

  if (learning.layer !== "LEARNING_ENGINE_V2") {
    throw new Error(
      `Invalid Learning Layer: expected LEARNING_ENGINE_V2, received ${learning.layer}`
    );
  }

  if (learning.version !== "2.2") {
    throw new Error(
      `Invalid Learning version: expected 2.2, received ${learning.version}`
    );
  }

  if (intelligence.source !== "INTELLIGENCE_LAYER_V2") {
    throw new Error(
      `Invalid Intelligence Layer: expected INTELLIGENCE_LAYER_V2, received ${intelligence.source}`
    );
  }

  if (intelligence.version !== "2.0") {
    throw new Error(
      `Invalid Intelligence version: expected 2.0, received ${intelligence.version}`
    );
  }

  return true;
}

function buildAction(decision) {
  const type = decision.decision.type;
  const target = decision.decision.target;
  const priority = decision.decision.priority;

  /*
   * V1.0 supports the current Decision contract.
   *
   * INVESTIGATE_DOWNSTREAM_PATH
   * →
   * INVESTIGATE
   *
   * The Action Layer describes what should be investigated.
   * It does NOT perform the investigation automatically.
   */

  if (
    type === "INVESTIGATE_DOWNSTREAM_PATH" &&
    target === "CLICK_TO_PRODUCT_VIEW_PATH"
  ) {
    return {
      action_type: "INVESTIGATE",
      action_code: "INVESTIGATE_CLICK_TO_PRODUCT_VIEW",
      priority,
      target,
      title: "ตรวจสอบเส้นทาง Click → Product View",
      description:
        "ตรวจสอบว่า Click จาก Content สามารถนำผู้ใช้เข้าสู่ Product View ได้จริงหรือไม่",
      objective:
        "ระบุจุดที่ทำให้ Click ไม่เกิด Product View",
      execution_mode: "MANUAL_INVESTIGATION",
      requires_human_approval: true,
      external_execution: false
    };
  }

  /*
   * Generic fallback for future Decision types.
   * It still never executes automatically.
   */

  return {
    action_type: "INVESTIGATE",
    action_code: "INVESTIGATE_DECISION",
    priority,
    target,
    title: `ตรวจสอบ Decision: ${target}`,
    description:
      decision.decision.reason ||
      "ตรวจสอบ Decision ที่ส่งมาจาก Decision Layer",
    objective:
      "ตรวจสอบหลักฐานและเส้นทางที่เกี่ยวข้องก่อนดำเนินการจริง",
    execution_mode: "MANUAL_INVESTIGATION",
    requires_human_approval: true,
    external_execution: false
  };
}

async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS action_queue (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      decision_type TEXT,
      decision_target TEXT,
      action_type TEXT,
      action_code TEXT,
      priority TEXT,
      title TEXT,
      description TEXT,
      objective TEXT,
      execution_mode TEXT,
      requires_human_approval INTEGER,
      external_execution INTEGER,
      status TEXT,
      decision_payload TEXT,
      action_payload TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `).run();
}

async function getDecision(env, contentId) {
  const baseUrl = new URL(env?.REQUEST_URL || "https://tato-os.pages.dev");

  /*
   * Cloudflare Pages Functions normally provides the current request
   * through context.request. This fallback exists only for safety.
   */
  const url = new URL(
    "/api/decision",
    baseUrl
  );

  if (contentId) {
    url.searchParams.set("content_id", contentId);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Cache-Control": "no-cache"
    }
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new Error(
      `Decision Layer returned invalid JSON: ${text.slice(0, 300)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      `Decision Layer HTTP ${response.status}`
    );
  }

  return data;
}

async function fetchDecisionFromRequest(context, contentId) {
  const currentUrl = new URL(context.request.url);

  const url = new URL(
    "/api/decision",
    currentUrl.origin
  );

  if (contentId) {
    url.searchParams.set("content_id", contentId);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Cache-Control": "no-cache"
    }
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new Error(
      `Decision Layer returned invalid JSON: ${text.slice(0, 300)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      `Decision Layer HTTP ${response.status}`
    );
  }

  return data;
}

async function saveAction(env, decision, action) {
  if (!env.DB) {
    throw new Error("D1 binding DB is missing");
  }

  await ensureTable(env.DB);

  const now = new Date().toISOString();
  const actionId = id();

  const contentId = decision.content?.id || null;

  await env.DB.prepare(`
    INSERT INTO action_queue (
      id,
      content_id,
      decision_type,
      decision_target,
      action_type,
      action_code,
      priority,
      title,
      description,
      objective,
      execution_mode,
      requires_human_approval,
      external_execution,
      status,
      decision_payload,
      action_payload,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      actionId,
      contentId,
      decision.decision.type,
      decision.decision.target,
      action.action_type,
      action.action_code,
      action.priority,
      action.title,
      action.description,
      action.objective,
      action.execution_mode,
      action.requires_human_approval ? 1 : 0,
      action.external_execution ? 1 : 0,
      "QUEUED",
      JSON.stringify(decision),
      JSON.stringify(action),
      now,
      now
    )
    .run();

  return {
    id: actionId,
    status: "QUEUED",
    created_at: now
  };
}

async function buildResult(context) {
  const url = new URL(context.request.url);

  const contentId =
    url.searchParams.get("content_id") ||
    null;

  /*
   * IMPORTANT:
   * Action reads Decision.
   * Action does not read raw behavior data.
   */
  const rawDecision = await fetchDecisionFromRequest(
    context,
    contentId
  );

  const decision = normalizeDecision(rawDecision);

  validateSourceContract(decision);

  const action = buildAction(decision);

  return {
    decision,
    action
  };
}

export async function onRequestGet(context) {
  try {
    const result = await buildResult(context);

    return json({
      success: true,

      layer: LAYER,
      version: VERSION,

      mode: "PREVIEW",
      status: "ACTION_READY",

      content: result.decision.content,

      decision: result.decision.decision,

      action: result.action,

      evidence: result.decision.evidence,

      learning: result.decision.learning,

      intelligence: result.decision.intelligence,

      funnel: result.decision.funnel,

      source_chain: [
        "CONTENT_MEASUREMENT_ENGINE_V2.2",
        "INTELLIGENCE_LAYER_V2",
        "LEARNING_ENGINE_V2",
        "DECISION_LAYER_V1",
        "ACTION_LAYER_V1"
      ],

      guardrails: {
        reads_raw_behavior_events: false,
        recalculates_measurement: false,
        recalculates_intelligence: false,
        recalculates_learning: false,
        changes_strategy: false,
        winner_declared: false,
        automatic_execution: false,
        action_executed: false,
        external_execution: false,
        requires_human_approval: true
      },

      execution: {
        allowed: false,
        executed: false,
        mode: "QUEUE_ONLY",
        reason:
          "Action Layer V1.0 prepares and queues actions. External execution belongs to the Automation / Execution Layer."
      },

      handoff: {
        next_layer: "AUTOMATION_EXECUTION",
        action_ready: true,
        execute: false
      },

      saved: false,

      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        status: "ERROR",
        error: error?.message || String(error),
        guardrails: {
          automatic_execution: false,
          action_executed: false,
          external_execution: false
        }
      },
      500
    );
  }
}

export async function onRequestPost(context) {
  try {
    let body = {};

    try {
      body = await context.request.json();
    } catch (_) {
      body = {};
    }

    const mode = s(body?.mode || "preview").toLowerCase();

    if (!["preview", "execute"].includes(mode)) {
      return json(
        {
          success: false,
          layer: LAYER,
          version: VERSION,
          status: "ERROR",
          error: "Invalid mode. Allowed: preview, execute"
        },
        400
      );
    }

    const result = await buildResult(context);

    /*
     * "execute" in Action V1.0 means:
     * SAVE TO QUEUE ONLY.
     *
     * It does NOT execute the action externally.
     */
    if (mode === "execute") {
      const saved = await saveAction(
        context.env,
        result.decision,
        result.action
      );

      return json({
        success: true,

        layer: LAYER,
        version: VERSION,

        mode: "EXECUTE",
        status: "QUEUED",

        content: result.decision.content,

        decision: result.decision.decision,

        action: result.action,

        evidence: result.decision.evidence,

        learning: result.decision.learning,

        intelligence: result.decision.intelligence,

        queue: saved,

        guardrails: {
          reads_raw_behavior_events: false,
          recalculates_measurement: false,
          recalculates_intelligence: false,
          recalculates_learning: false,
          changes_strategy: false,
          winner_declared: false,
          automatic_execution: false,
          action_executed: false,
          external_execution: false,
          requires_human_approval: true
        },

        execution: {
          allowed: false,
          executed: false,
          mode: "QUEUE_ONLY",
          reason:
            "Action was queued only. External execution is disabled in Action Layer V1.0."
        },

        handoff: {
          next_layer: "AUTOMATION_EXECUTION",
          action_ready: true,
          execute: false
        },

        saved: true,

        timestamp: new Date().toISOString()
      });
    }

    return json({
      success: true,

      layer: LAYER,
      version: VERSION,

      mode: "PREVIEW",
      status: "ACTION_READY",

      content: result.decision.content,

      decision: result.decision.decision,

      action: result.action,

      evidence: result.decision.evidence,

      learning: result.decision.learning,

      intelligence: result.decision.intelligence,

      queue: {
        status: "NOT_SAVED"
      },

      guardrails: {
        reads_raw_behavior_events: false,
        recalculates_measurement: false,
        recalculates_intelligence: false,
        recalculates_learning: false,
        changes_strategy: false,
        winner_declared: false,
        automatic_execution: false,
        action_executed: false,
        external_execution: false,
        requires_human_approval: true
      },

      execution: {
        allowed: false,
        executed: false,
        mode: "QUEUE_ONLY",
        reason:
          "Preview mode does not save or execute the action."
      },

      handoff: {
        next_layer: "AUTOMATION_EXECUTION",
        action_ready: true,
        execute: false
      },

      saved: false,

      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        status: "ERROR",
        error: error?.message || String(error),
        guardrails: {
          automatic_execution: false,
          action_executed: false,
          external_execution: false
        }
      },
      500
    );
  }
}
