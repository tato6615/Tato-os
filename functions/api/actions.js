const LEARNING_AI_PATH = "/api/learning-ai";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function ensureActionTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS action_runs (
      id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      source TEXT,
      status TEXT NOT NULL,
      input_data TEXT,
      output_data TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )
  `).run();
}

async function getLearningAI(context) {
  try {
    const url = new URL(
      LEARNING_AI_PATH,
      context.request.url
    );

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    const data = await response.json();

    return {
      success: response.ok && data?.success === true,
      data
    };
  } catch (error) {
    return {
      success: false,
      data: {
        success: false,
        error: error?.message || String(error)
      }
    };
  }
}

function buildLearningAction(learningAI) {
  if (!learningAI || learningAI.success !== true) {
    return {
      action_type: "SYSTEM_CHECK",
      title: "ตรวจสอบ Learning AI",
      description: "ไม่สามารถรับผลจาก Learning AI ได้",
      priority: "LOW",
      status: "WAITING_DATA",
      source: "LEARNING_AI",
      reason:
        learningAI?.data?.error ||
        "Learning AI unavailable"
    };
  }

  const ai =
    learningAI.data?.ai?.analysis || {};

  const learning =
    learningAI.data?.learning || {};

  const content =
    learningAI.data?.content || {};

  const action =
    String(
      ai?.next_content?.action ||
      ai?.next_action?.type ||
      ""
    ).toUpperCase();

  const priority =
    String(
      ai?.priority || "LOW"
    ).toUpperCase();

  const direction =
    ai?.next_content?.direction ||
    learning?.recommendation ||
    "";

  const successMetric =
    ai?.next_content?.success_metric ||
    "Product Views";

  if (
    action === "DISTRIBUTE" ||
    action === "PUBLISH" ||
    action === "PUBLISH_CONTENT"
  ) {
    return {
      action_type: "DISTRIBUTE_CONTENT",
      title: "เผยแพร่ Content จาก Learning AI",
      description:
        "นำคำแนะนำจาก Learning AI ไปสร้าง Action สำหรับเผยแพร่ Content",
      priority,
      status: "READY",
      source: "LEARNING_AI",

      content: {
        id: content.id || null,
        title: content.title || null,
        status: content.status || null
      },

      learning: {
        signal_type:
          learning.signal_type || null,
        finding:
          learning.finding || null,
        score:
          num(learning.score)
      },

      ai: {
        direction,
        success_metric: successMetric,
        reason:
          ai?.next_action?.reason ||
          direction
      }
    };
  }

  if (
    action === "ITERATE" ||
    action === "OPTIMIZE"
  ) {
    return {
      action_type: "ITERATE_CONTENT",
      title: "ปรับ Content จาก Learning AI",
      description:
        "นำผลการเรียนรู้ไปปรับ Content รอบถัดไป",
      priority,
      status: "READY",
      source: "LEARNING_AI",

      content: {
        id: content.id || null,
        title: content.title || null,
        status: content.status || null
      },

      learning: {
        signal_type:
          learning.signal_type || null,
        finding:
          learning.finding || null,
        score:
          num(learning.score)
      },

      ai: {
        direction,
        success_metric: successMetric,
        reason:
          ai?.next_action?.reason ||
          direction
      }
    };
  }

  return {
    action_type: "WAIT",
    title: "รอข้อมูลเพิ่มเติมจาก Learning",
    description:
      "Learning AI ยังไม่แนะนำ Action ที่ต้องดำเนินการ",
    priority: "LOW",
    status: "WAITING_DATA",
    source: "LEARNING_AI",

    content: {
      id: content.id || null,
      title: content.title || null,
      status: content.status || null
    },

    learning: {
      signal_type:
        learning.signal_type || null,
      finding:
        learning.finding || null,
      score:
        num(learning.score)
    },

    ai: {
      direction,
      success_metric: successMetric
    }
  };
}

async function executeAction(
  context,
  action,
  learningAI
) {
  const db = context.env.DB;

  await ensureActionTable(db);

  const runId = crypto.randomUUID();

  const startedAt =
    new Date().toISOString();

  let output = {};

  if (
    action.action_type ===
    "DISTRIBUTE_CONTENT"
  ) {
    output = {
      action: "DISTRIBUTE_CONTENT",
      status: "READY_TO_DISTRIBUTE",
      source: "LEARNING_AI",

      content: {
        id:
          action.content?.id || null,

        title:
          action.content?.title || null,

        previous_status:
          action.content?.status || null,

        new_status:
          "READY_TO_DISTRIBUTE"
      },

      learning:
        action.learning,

      ai:
        action.ai,

      next_step:
        "ส่ง Content เข้า Automation / Distribution Engine"
    };
  }

  else if (
    action.action_type ===
    "ITERATE_CONTENT"
  ) {
    output = {
      action: "ITERATE_CONTENT",
      status: "READY_TO_ITERATE",
      source: "LEARNING_AI",

      content: {
        id:
          action.content?.id || null,

        title:
          action.content?.title || null
      },

      learning:
        action.learning,

      ai:
        action.ai,

      next_step:
        "ส่ง Content เข้า Content Engine เพื่อสร้างรอบใหม่"
    };
  }

  else if (
    action.action_type ===
    "WAIT"
  ) {
    output = {
      action: "WAIT",
      status: "WAITING_DATA",
      source: "LEARNING_AI",

      learning:
        action.learning,

      ai:
        action.ai,

      next_step:
        "รอ Traffic / Behavior / Conversion"
    };
  }

  else {
    output = {
      action:
        action.action_type,

      status: "READY",

      source: "LEARNING_AI",

      next_step:
        "รอ Action Engine ดำเนินการต่อ"
    };
  }

  const completedAt =
    new Date().toISOString();

  const inputData = {
    source: "LEARNING_AI",
    action,
    learning_ai_status:
      learningAI?.data?.ai?.status || null
  };

  await db.prepare(`
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
  `)
    .bind(
      runId,
      action.action_type,
      "LEARNING_AI",
      output.status,
      JSON.stringify(inputData),
      JSON.stringify(output),
      startedAt,
      completedAt
    )
    .run();

  return {
    id: runId,

    action_type:
      action.action_type,

    source:
      "LEARNING_AI",

    status:
      output.status,

    started_at:
      startedAt,

    completed_at:
      completedAt
  };
}

async function buildPreview(context) {
  const learningAI =
    await getLearningAI(context);

  const action =
    buildLearningAction(
      learningAI
    );

  return {
    success: true,

    layer:
      "AI_ACTION_ENGINE_V1",

    mode:
      "preview",

    source:
      "LEARNING_AI",

    learning_ai: {
      success:
        learningAI.success,

      status:
        learningAI.data?.ai?.status ||
        null,

      signal:
        learningAI.data?.learning?.signal_type ||
        null
    },

    action,

    next_step:
      action.status === "READY"
        ? "Execute this Action to send it into the Action Engine"
        : "Wait for more learning data"
  };
}

async function buildExecute(context) {
  const learningAI =
    await getLearningAI(context);

  const action =
    buildLearningAction(
      learningAI
    );

  const execution =
    await executeAction(
      context,
      action,
      learningAI
    );

  return {
    success: true,

    layer:
      "AI_ACTION_ENGINE_V1",

    mode:
      "execute",

    source:
      "LEARNING_AI",

    learning_ai: {
      success:
        learningAI.success,

      status:
        learningAI.data?.ai?.status ||
        null,

      signal:
        learningAI.data?.learning?.signal_type ||
        null
    },

    action,

    execution,

    result:
      execution.status ===
      "READY_TO_DISTRIBUTE"
        ? {
            action:
              "DISTRIBUTE_CONTENT",

            status:
              "READY_TO_DISTRIBUTE",

            content_id:
              action.content?.id ||
              null,

            next_step:
              "ส่งเข้า Automation / Distribution Engine"
          }

        : execution.status ===
          "READY_TO_ITERATE"
          ? {
              action:
                "ITERATE_CONTENT",

              status:
                "READY_TO_ITERATE",

              content_id:
                action.content?.id ||
                null,

              next_step:
                "ส่งเข้า Content Engine"
            }

          : {
              action:
                "WAIT",

              status:
                "WAITING_DATA",

              next_step:
                "รอข้อมูลเพิ่มเติม"
            }
  };
}

export async function onRequestGet(context) {
  try {
    const url =
      new URL(context.request.url);

    const mode =
      String(
        url.searchParams.get("mode") ||
        "preview"
      ).toLowerCase();

    if (mode === "execute") {
      return json(
        await buildExecute(context)
      );
    }

    if (mode !== "preview") {
      return json(
        {
          success: false,
          layer:
            "AI_ACTION_ENGINE_V1",
          error:
            `Unknown action mode: ${mode}`
        },
        400
      );
    }

    return json(
      await buildPreview(context)
    );

  } catch (error) {
    return json(
      {
        success: false,
        layer:
          "AI_ACTION_ENGINE_V1",
        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}

export async function onRequestPost(context) {
  try {
    const body =
      await context.request
        .json()
        .catch(() => ({}));

    const mode =
      String(
        body.mode || "preview"
      ).toLowerCase();

    if (mode === "preview") {
      return json(
        await buildPreview(context)
      );
    }

    if (mode === "execute") {
      return json(
        await buildExecute(context)
      );
    }

    return json(
      {
        success: false,
        layer:
          "AI_ACTION_ENGINE_V1",
        error:
          `Unknown action mode: ${mode}`
      },
      400
    );

  } catch (error) {
    return json(
      {
        success: false,
        layer:
          "AI_ACTION_ENGINE_V1",
        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}
