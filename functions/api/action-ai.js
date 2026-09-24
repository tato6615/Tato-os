// TATO-OS
// Action Layer V1.0
// Route: /api/action
//
// Pipeline:
//
// Measurement V2.2
//        ↓
// Intelligence V2.1
//        ↓
// Learning AI V1.4
//        ↓
// Decision Layer V1.0
//        ↓
// Action Layer V1.0
//        ↓
// Action Queue
//        ↓
// Feedback
//
// Action Layer DOES:
// - read Decision Layer
// - validate the decision
// - translate decision into an executable action definition
// - create an action queue record
// - prepare handoff to execution
//
// Action Layer DOES NOT:
// - invent decisions
// - change strategy
// - declare winners
// - execute external actions automatically
//
// Cloudflare Pages Functions
// Path: functions/api/action.js

const VERSION = "1.0";
const LAYER = "ACTION_LAYER_V1";

const DECISION_SOURCE = "DECISION_LAYER_V1";
const LEARNING_SOURCE = "LEARNING_AI_V1.4";
const INTELLIGENCE_SOURCE = "INTELLIGENCE_LAYER_V2.1";
const MEASUREMENT_SOURCE = "CONTENT_MEASUREMENT_ENGINE_V2.2";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

// --------------------------------------------------
// BASIC HELPERS
// --------------------------------------------------

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: HEADERS
  });
}

function id(prefix = "action") {
  return `${prefix}_${crypto.randomUUID()}`;
}

function now() {
  return new Date().toISOString();
}

function s(value) {
  return value == null ? "" : String(value);
}

function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

// --------------------------------------------------
// DATABASE
// --------------------------------------------------

async function ensureTables(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS action_queue (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      decision_id TEXT,
      action_type TEXT,
      action_target TEXT,
      priority TEXT,
      status TEXT,
      execute_allowed INTEGER,
      executed INTEGER,
      input_data TEXT,
      result_data TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `).run();
}

// --------------------------------------------------
// CONTENT
// --------------------------------------------------

async function getContent(db, contentId) {
  if (!contentId) return null;

  try {
    return await db.prepare(`
      SELECT *
      FROM content_engine
      WHERE id = ?
      LIMIT 1
    `).bind(contentId).first();
  } catch (_) {
    return null;
  }
}

// --------------------------------------------------
// DECISION LAYER
// --------------------------------------------------

async function getDecision(request, contentId) {
  if (!contentId) {
    return {
      success: false,
      error: "content_id_required"
    };
  }

  try {
    const url = new URL(request.url);

    const decisionURL =
      `${url.origin}/api/decision?content_id=${encodeURIComponent(contentId)}`;

    const response = await fetch(decisionURL, {
      method: "GET",
      headers: {
        "accept": "application/json"
      }
    });

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch (_) {
      return {
        success: false,
        error: "decision_invalid_json",
        http_status: response.status
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: "decision_http_error",
        http_status: response.status,
        data
      };
    }

    return data;

  } catch (error) {
    return {
      success: false,
      error: "decision_fetch_failed",
      message: error?.message || String(error)
    };
  }
}

// --------------------------------------------------
// DECISION VALIDATION
// --------------------------------------------------

function validateDecision(decision) {
  const errors = [];

  if (!decision?.success) {
    errors.push("decision_layer_not_successful");
  }

  if (decision?.layer !== DECISION_SOURCE) {
    errors.push("invalid_decision_source");
  }

  if (!decision?.version) {
    errors.push("decision_version_missing");
  }

  if (!decision?.decision?.type) {
    errors.push("decision_type_missing");
  }

  if (!decision?.decision?.target) {
    errors.push("decision_target_missing");
  }

  if (!decision?.required_action?.type) {
    errors.push("required_action_missing");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// --------------------------------------------------
// ACTION TRANSLATION
// --------------------------------------------------

function translateAction(decision) {
  const decisionType =
    s(decision?.decision?.type).toUpperCase();

  const target =
    s(decision?.decision?.target).toUpperCase();

  const priority =
    s(decision?.decision?.priority).toUpperCase() || "LOW";

  // ----------------------------------------------
  // DOWNSTREAM INVESTIGATION
  // ----------------------------------------------

  if (
    decisionType === "INVESTIGATE_DOWNSTREAM_PATH" &&
    target === "CLICK_TO_PRODUCT_VIEW_PATH"
  ) {
    return {
      action_type: "INVESTIGATE",
      action_target: "CLICK_TO_PRODUCT_VIEW_PATH",
      action_name: "INVESTIGATE_CLICK_TO_PRODUCT_VIEW",
      description:
        "ตรวจสอบเส้นทางจาก Content Click ไปยัง Product View",
      priority,
      execution_mode: "MANUAL_REVIEW",
      execute_allowed: false
    };
  }

  // ----------------------------------------------
  // PRODUCT → CUSTOMER
  // ----------------------------------------------

  if (
    decisionType === "INVESTIGATE_PRODUCT_TO_CUSTOMER"
  ) {
    return {
      action_type: "INVESTIGATE",
      action_target: "PRODUCT_TO_CUSTOMER_PATH",
      action_name: "INVESTIGATE_PRODUCT_TO_CUSTOMER",
      description:
        "ตรวจสอบเส้นทางจาก Product View ไป Customer",
      priority,
      execution_mode: "MANUAL_REVIEW",
      execute_allowed: false
    };
  }

  // ----------------------------------------------
  // CUSTOMER → ORDER
  // ----------------------------------------------

  if (
    decisionType === "INVESTIGATE_CUSTOMER_TO_ORDER"
  ) {
    return {
      action_type: "INVESTIGATE",
      action_target: "CUSTOMER_TO_ORDER_PATH",
      action_name: "INVESTIGATE_CUSTOMER_TO_ORDER",
      description:
        "ตรวจสอบเส้นทางจาก Customer ไป Order",
      priority,
      execution_mode: "MANUAL_REVIEW",
      execute_allowed: false
    };
  }

  // ----------------------------------------------
  // ORDER → REVENUE
  // ----------------------------------------------

  if (
    decisionType === "INVESTIGATE_ORDER_TO_REVENUE"
  ) {
    return {
      action_type: "INVESTIGATE",
      action_target: "ORDER_TO_REVENUE_PATH",
      action_name: "INVESTIGATE_ORDER_TO_REVENUE",
      description:
        "ตรวจสอบเส้นทางจาก Order ไป Revenue",
      priority,
      execution_mode: "MANUAL_REVIEW",
      execute_allowed: false
    };
  }

  // ----------------------------------------------
  // WAIT
  // ----------------------------------------------

  if (
    decisionType === "WAIT_FOR_BEHAVIORAL_DATA"
  ) {
    return {
      action_type: "WAIT",
      action_target: "BEHAVIORAL_DATA",
      action_name: "WAIT_FOR_BEHAVIOR",
      description:
        "รอข้อมูลพฤติกรรมเพิ่มเติมก่อนดำเนินการ",
      priority: "LOW",
      execution_mode: "OBSERVE",
      execute_allowed: false
    };
  }

  // ----------------------------------------------
  // CONTINUE OBSERVATION
  // ----------------------------------------------

  if (
    decisionType === "CONTINUE_OBSERVATION"
  ) {
    return {
      action_type: "WAIT",
      action_target: "BEHAVIOR",
      action_name: "CONTINUE_OBSERVATION",
      description:
        "ติดตามพฤติกรรมต่อเพื่อเพิ่มหลักฐาน",
      priority,
      execution_mode: "OBSERVE",
      execute_allowed: false
    };
  }

  // ----------------------------------------------
  // UNKNOWN DECISION
  // ----------------------------------------------

  return {
    action_type: "REVIEW",
    action_target: "UNKNOWN_DECISION",
    action_name: "MANUAL_REVIEW_REQUIRED",
    description:
      "Decision ไม่ตรงกับ Action Mapping ที่ระบบรองรับ",
    priority: "HIGH",
    execution_mode: "MANUAL_REVIEW",
    execute_allowed: false
  };
}

// --------------------------------------------------
// ACTION OBJECT
// --------------------------------------------------

function buildAction(decision, contentId, content) {
  const translated =
    translateAction(decision);

  return {
    id: id("action"),

    content_id: contentId,

    decision: {
      type:
        decision?.decision?.type || null,

      target:
        decision?.decision?.target || null,

      priority:
        decision?.decision?.priority || null
    },

    action: {
      type: translated.action_type,
      target: translated.action_target,
      name: translated.action_name,
      description: translated.description
    },

    execution: {
      mode: translated.execution_mode,

      allowed:
        translated.execute_allowed === true,

      execute:
        false,

      executed:
        false
    },

    content: {
      id: content?.id || contentId,
      title: content?.title || null,
      status: content?.status || null
    },

    source_chain: [
      MEASUREMENT_SOURCE,
      INTELLIGENCE_SOURCE,
      LEARNING_SOURCE,
      DECISION_SOURCE,
      LAYER
    ],

    guardrails: {
      decision_revalidated: true,
      winner_declared: false,
      strategy_changed: false,
      automatic_execution: false,
      external_action_executed: false,
      execute_allowed: false,
      requires_execution_layer: true
    },

    handoff: {
      next_layer: "EXECUTION_LAYER",
      action_ready: true,
      execute: false
    },

    created_at: now()
  };
}

// --------------------------------------------------
// SAVE ACTION
// --------------------------------------------------

async function saveAction(db, action, decision) {
  const createdAt = now();

  await db.prepare(`
    INSERT INTO action_queue (
      id,
      content_id,
      decision_id,
      action_type,
      action_target,
      priority,
      status,
      execute_allowed,
      executed,
      input_data,
      result_data,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    action.id,
    action.content_id,
    decision?.persistence?.insight_id ||
      decision?.persistence?.run_id ||
      null,
    action.action.type,
    action.action.target,
    action.decision.priority,
    "READY",
    0,
    0,
    JSON.stringify(decision),
    JSON.stringify(action),
    createdAt,
    createdAt
  ).run();

  return {
    action_queue_id: action.id,
    status: "READY",
    created_at: createdAt
  };
}

// --------------------------------------------------
// MAIN
// --------------------------------------------------

async function runAction(context, contentId) {
  const { request, env } = context;

  if (!env?.DB) {
    throw new Error("D1 binding DB is missing");
  }

  const db = env.DB;

  await ensureTables(db);

  // ----------------------------------------------
  // GET DECISION
  // ----------------------------------------------

  const decision =
    await getDecision(
      request,
      contentId
    );

  // ----------------------------------------------
  // VALIDATE DECISION
  // ----------------------------------------------

  const validation =
    validateDecision(decision);

  if (!validation.valid) {
    return {
      success: false,
      error: "INVALID_DECISION_INPUT",
      validation,
      decision
    };
  }

  // ----------------------------------------------
  // GET CONTENT
  // ----------------------------------------------

  const content =
    await getContent(
      db,
      contentId
    );

  // ----------------------------------------------
  // TRANSLATE DECISION → ACTION
  // ----------------------------------------------

  const action =
    buildAction(
      decision,
      contentId,
      content
    );

  return {
    success: true,
    action,
    decision,
    validation
  };
}

// --------------------------------------------------
// CONTENT ID
// --------------------------------------------------

function resolveContentId(request, body = {}) {
  const url = new URL(request.url);

  return (
    body?.content_id ||
    url.searchParams.get("content_id") ||
    null
  );
}

// --------------------------------------------------
// GET
// --------------------------------------------------

export async function onRequestGet(context) {
  try {
    const contentId =
      resolveContentId(
        context.request
      );

    if (!contentId) {
      return json({
        success: false,
        layer: LAYER,
        version: VERSION,
        error: "content_id_required",
        usage:
          "/api/action?content_id=YOUR_CONTENT_ID"
      }, 400);
    }

    const result =
      await runAction(
        context,
        contentId
      );

    if (!result.success) {
      return json({
        ...result,
        layer: LAYER,
        version: VERSION
      }, 422);
    }

    return json({
      success: true,
      layer: LAYER,
      version: VERSION,
      status: "ACTION_READY",
      mode: "PREVIEW",

      content_id: contentId,

      action: result.action,

      source: {
        decision_layer:
          result.decision.layer,
        decision_version:
          result.decision.version,
        decision_type:
          result.decision.decision?.type,
        decision_target:
          result.decision.decision?.target
      },

      guardrails:
        result.action.guardrails,

      handoff:
        result.action.handoff,

      saved: false,

      next_step:
        "POST mode=save to create an Action Queue record."
    });

  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      version: VERSION,
      error: "ACTION_LAYER_ERROR",
      message:
        error?.message ||
        String(error)
    }, 500);
  }
}

// --------------------------------------------------
// POST
// --------------------------------------------------

export async function onRequestPost(context) {
  try {
    let body = {};

    try {
      body =
        await context.request.json();
    } catch (_) {
      body = {};
    }

    const contentId =
      resolveContentId(
        context.request,
        body
      );

    if (!contentId) {
      return json({
        success: false,
        layer: LAYER,
        version: VERSION,
        error: "content_id_required"
      }, 400);
    }

    const mode =
      s(body?.mode).toLowerCase() ||
      "preview";

    const result =
      await runAction(
        context,
        contentId
      );

    if (!result.success) {
      return json({
        ...result,
        layer: LAYER,
        version: VERSION
      }, 422);
    }

    // ----------------------------------------------
    // PREVIEW
    // ----------------------------------------------

    if (mode !== "save") {
      return json({
        success: true,
        layer: LAYER,
        version: VERSION,
        status: "ACTION_READY",
        mode: "PREVIEW",
        content_id: contentId,
        action: result.action,

        guardrails:
          result.action.guardrails,

        handoff:
          result.action.handoff,

        saved: false,

        next_step:
          "POST mode=save to create an Action Queue record."
      });
    }

    // ----------------------------------------------
    // SAVE
    // ----------------------------------------------

    const saved =
      await saveAction(
        context.env.DB,
        result.action,
        result.decision
      );

    return json({
      success: true,
      layer: LAYER,
      version: VERSION,
      status: "ACTION_QUEUED",
      mode: "SAVE",

      content_id: contentId,

      action: result.action,

      persistence: saved,

      guardrails:
        result.action.guardrails,

      handoff:
        result.action.handoff,

      saved: true,

      next_step:
        "Action is queued. Execution remains disabled until the Execution Layer explicitly handles it."
    });

  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      version: VERSION,
      error: "ACTION_LAYER_ERROR",
      message:
        error?.message ||
        String(error)
    }, 500);
  }
}
