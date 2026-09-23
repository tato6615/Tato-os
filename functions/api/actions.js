export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  try {
    // =========================================================
    // AI → ACTION ENGINE V1
    // AI → ACTION → AUTOMATION BRIDGE
    // =========================================================

    const mode =
      request.method === "POST"
        ? ((await safeJson(request))?.mode || "preview")
        : (url.searchParams.get("mode") || "preview");

    // ---------------------------------------------------------
    // 1. Get Learning AI
    // ---------------------------------------------------------
    const learningUrl = new URL("/api/learning-ai", request.url);

    const learningResponse = await fetch(learningUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    const learningAI = await safeResponseJson(learningResponse);

    if (!learningAI || learningAI.success !== true) {
      return json({
        success: false,
        layer: "AI_ACTION_ENGINE_V1",
        mode,
        error: "Learning AI unavailable",
        learning_ai: learningAI
      }, 500);
    }

    // ---------------------------------------------------------
    // 2. Build Action from Learning AI
    // ---------------------------------------------------------
    const action = buildAction(learningAI);

    // ---------------------------------------------------------
    // 3. Preview
    // ---------------------------------------------------------
    if (mode !== "execute") {
      return json({
        success: true,
        layer: "AI_ACTION_ENGINE_V1",
        mode: "preview",
        source: "LEARNING_AI",
        learning_ai: learningAI,
        action
      });
    }

    // ---------------------------------------------------------
    // 4. Ensure action_runs table
    // ---------------------------------------------------------
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS action_runs (
        id TEXT PRIMARY KEY,
        action_type TEXT,
        source TEXT,
        status TEXT,
        input_data TEXT,
        output_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      )
    `).run();

    // ---------------------------------------------------------
    // 5. Create Action Execution
    // ---------------------------------------------------------
    const executionId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    let executionStatus = "WAITING";

    if (action.action_type === "DISTRIBUTE_CONTENT") {
      executionStatus = "READY_TO_DISTRIBUTE";
    } else if (action.action_type === "ITERATE_CONTENT") {
      executionStatus = "READY_TO_ITERATE";
    } else if (action.action_type === "WAIT") {
      executionStatus = "WAITING_DATA";
    }

    const execution = {
      id: executionId,
      action_type: action.action_type,
      source: "LEARNING_AI",
      status: executionStatus,
      started_at: startedAt,
      completed_at: new Date().toISOString()
    };

    await env.DB.prepare(`
      INSERT INTO action_runs
      (
        id,
        action_type,
        source,
        status,
        input_data,
        output_data,
        created_at,
        completed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      execution.id,
      execution.action_type,
      execution.source,
      execution.status,
      JSON.stringify({
        learning_ai: learningAI,
        action
      }),
      JSON.stringify(execution),
      startedAt,
      execution.completed_at
    ).run();

    // ---------------------------------------------------------
    // 6. Default result
    // ---------------------------------------------------------
    const result = buildResult(action);

    // ---------------------------------------------------------
    // 7. AI → Automation Bridge
    //
    // IMPORTANT:
    // Do NOT call old /api/automation here.
    // That could create:
    //
    // Action → Automation → Action
    //
    // Instead use the dedicated AI Automation Bridge.
    // ---------------------------------------------------------
    let automation = null;

    if (
      action.action_type === "DISTRIBUTE_CONTENT" ||
      action.action_type === "ITERATE_CONTENT"
    ) {
      const automationUrl = new URL("/api/ai-automation", request.url);

      const automationPayload = {
        action_run_id: execution.id,
        action_type: action.action_type,
        source: "AI_ACTION_ENGINE",

        // ส่ง Content จริงจาก Action Engine
        content: action.content || null,

        // ส่ง Learning จริง
        learning: action.learning || null,

        // ส่ง AI recommendation จริง
        ai: action.ai || null
      };

      try {
        const automationResponse = await fetch(
          automationUrl.toString(),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json"
            },
            body: JSON.stringify(automationPayload)
          }
        );

        automation = await safeResponseJson(automationResponse);

        if (!automation) {
          automation = {
            success: false,
            error: "Automation Bridge returned invalid JSON"
          };
        }
      } catch (automationError) {
        automation = {
          success: false,
          error: automationError?.message || "Automation Bridge request failed"
        };
      }
    }

    // ---------------------------------------------------------
    // 8. Update result based on Automation Bridge
    // ---------------------------------------------------------
    if (automation) {
      if (automation.success === true) {
        result.next_step = "Automation Bridge executed successfully";

        if (automation.run_id) {
          result.automation_run_id = automation.run_id;
        }
      } else {
        result.next_step =
          "Action executed, but Automation Bridge failed";
      }
    }

    // ---------------------------------------------------------
    // 9. Final response
    // ---------------------------------------------------------
    return json({
      success: true,
      layer: "AI_ACTION_ENGINE_V1",
      mode: "execute",
      source: "LEARNING_AI",

      learning_ai: learningAI,

      action,

      execution,

      automation,

      result
    });

  } catch (error) {
    return json({
      success: false,
      layer: "AI_ACTION_ENGINE_V1",
      error: error?.message || "Unknown error"
    }, 500);
  }
}


// =============================================================
// BUILD ACTION
// =============================================================

function buildAction(learningAI) {
  const signal =
    learningAI?.signal ||
    learningAI?.learning?.signal_type ||
    learningAI?.analysis?.signal ||
    "WAIT";

  const learning =
    learningAI?.learning ||
    learningAI?.analysis ||
    {};

  const ai =
    learningAI?.ai ||
    learningAI?.recommendation ||
    {};

  const content =
    learningAI?.content ||
    learningAI?.latest_content ||
    learningAI?.content_data ||
    null;

  // -----------------------------------------------------------
  // DISTRIBUTE / PUBLISH
  // -----------------------------------------------------------
  if (
    signal === "NO_TRAFFIC" ||
    signal === "PUBLISH" ||
    signal === "DISTRIBUTE" ||
    signal === "PUBLISH_CONTENT"
  ) {
    return {
      action_type: "DISTRIBUTE_CONTENT",

      title: "เผยแพร่ Content จาก Learning AI",

      description:
        "นำคำแนะนำจาก Learning AI ไปสร้าง Action สำหรับเผยแพร่ Content",

      priority: "LOW",

      status: "READY",

      source: "LEARNING_AI",

      content: normalizeContent(content),

      learning: {
        signal_type:
          learning?.signal_type ||
          signal,

        finding:
          learning?.finding ||
          "ยังไม่พบกิจกรรมที่ใช้เรียนรู้จาก Content",

        score:
          learning?.score ??
          20
      },

      ai: {
        direction:
          ai?.direction ||
          "Release content to generate initial traffic.",

        success_metric:
          ai?.success_metric ||
          "Product Views",

        reason:
          ai?.reason ||
          "Need to expose content to audience to gather behavioral data."
      }
    };
  }

  // -----------------------------------------------------------
  // ITERATE / OPTIMIZE
  // -----------------------------------------------------------
  if (
    signal === "ITERATE" ||
    signal === "OPTIMIZE" ||
    signal === "ITERATE_CONTENT"
  ) {
    return {
      action_type: "ITERATE_CONTENT",

      title: "ปรับปรุง Content จาก Learning AI",

      description:
        "นำข้อมูล Feedback และ Measurement มาปรับปรุง Content",

      priority: "MEDIUM",

      status: "READY",

      source: "LEARNING_AI",

      content: normalizeContent(content),

      learning: {
        signal_type:
          learning?.signal_type ||
          signal,

        finding:
          learning?.finding ||
          "พบข้อมูลที่สามารถนำไปปรับปรุง Content",

        score:
          learning?.score ??
          50
      },

      ai: {
        direction:
          ai?.direction ||
          "Optimize existing content based on observed behavior.",

        success_metric:
          ai?.success_metric ||
          "Engagement",

        reason:
          ai?.reason ||
          "Use behavioral feedback to improve content performance."
      }
    };
  }

  // -----------------------------------------------------------
  // WAIT
  // -----------------------------------------------------------
  return {
    action_type: "WAIT",

    title: "รอข้อมูลเพิ่มเติม",

    description:
      "ยังไม่มีข้อมูลเพียงพอสำหรับการดำเนิน Action",

    priority: "LOW",

    status: "WAITING",

    source: "LEARNING_AI",

    content: normalizeContent(content),

    learning: {
      signal_type:
        learning?.signal_type ||
        signal,

      finding:
        learning?.finding ||
        "Insufficient data",

      score:
        learning?.score ??
        0
    },

    ai: {
      direction:
        ai?.direction ||
        "Wait for additional behavioral data.",

      success_metric:
        ai?.success_metric ||
        "Behavior Data",

      reason:
        ai?.reason ||
        "More data is required before taking action."
    }
  };
}


// =============================================================
// BUILD RESULT
// =============================================================

function buildResult(action) {
  if (action.action_type === "DISTRIBUTE_CONTENT") {
    return {
      action: "DISTRIBUTE_CONTENT",
      status: "READY_TO_DISTRIBUTE",
      content_id: action?.content?.id || null,
      next_step: "ส่งเข้า Automation / Distribution Engine"
    };
  }

  if (action.action_type === "ITERATE_CONTENT") {
    return {
      action: "ITERATE_CONTENT",
      status: "READY_TO_ITERATE",
      content_id: action?.content?.id || null,
      next_step: "ส่งเข้า Automation / Content Iteration Engine"
    };
  }

  return {
    action: "WAIT",
    status: "WAITING_DATA",
    content_id: action?.content?.id || null,
    next_step: "รอ Behavioral / Measurement Data"
  };
}


// =============================================================
// NORMALIZE CONTENT
// =============================================================

function normalizeContent(content) {
  if (!content) {
    return null;
  }

  return {
    id:
      content.id ||
      content.content_id ||
      null,

    title:
      content.title ||
      content.name ||
      null,

    status:
      content.status ||
      null,

    objective:
      content.objective ||
      null,

    attention_type:
      content.attention_type ||
      null,

    market_keyword:
      content.market_keyword ||
      null,

    angle:
      content.angle ||
      null,

    direction:
      content.direction ||
      null,

    cta:
      content.cta ||
      null,

    content_text:
      content.content_text ||
      content.text ||
      null
  };
}


// =============================================================
// SAFE JSON
// =============================================================

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}


// =============================================================
// SAFE RESPONSE JSON
// =============================================================

async function safeResponseJson(response) {
  try {
    return await response.json();
  } catch {
    return {
      success: false,
      error: `Invalid JSON response (${response.status})`
    };
  }
}


// =============================================================
// JSON RESPONSE
// =============================================================

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}
