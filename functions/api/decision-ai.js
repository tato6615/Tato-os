// TATO-OS
// DECISION LAYER V1.1
// Route: /api/decision-ai
//
// SOURCE OF TRUTH:
// Learning Layer V1
//
// Decision Layer MUST NOT independently aggregate
// content_measurements.
//
// Chain:
// Measurement V2.2
// -> Intelligence V2.1
// -> Learning V1
// -> Decision V1.1
//
// Guardrails:
// - No winner declaration
// - No strategy change
// - No automatic execution
// - Human approval required

const LAYER = "DECISION_LAYER_V1";
const VERSION = "1.1";

const MEASUREMENT_SOURCE =
  "CONTENT_MEASUREMENT_ENGINE_V2.2";

const INTELLIGENCE_SOURCE =
  "INTELLIGENCE_LAYER_V2.1";

const LEARNING_SOURCE =
  "LEARNING_LAYER_V1";

const ATTENTION_TYPE =
  "weighted_behavioral_signal";

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":
          "no-store"
      }
    }
  );
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseJSON(
  value,
  fallback = null
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  if (
    typeof value === "object"
  ) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function extractContentId(
  data,
  depth = 0
) {
  if (!data || depth > 12) {
    return null;
  }

  if (typeof data === "string") {
    const parsed =
      parseJSON(data);

    if (parsed) {
      return extractContentId(
        parsed,
        depth + 1
      );
    }

    return null;
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const found =
        extractContentId(
          item,
          depth + 1
        );

      if (found) {
        return found;
      }
    }

    return null;
  }

  if (
    typeof data !== "object"
  ) {
    return null;
  }

  const direct = [
    data.content_id,
    data.contentId,
    data?.content?.id,
    data?.content?.content_id
  ];

  for (const value of direct) {
    if (value) {
      return String(value);
    }
  }

  const keys = [
    "input_data",
    "output_data",
    "content",
    "data",
    "payload",
    "result",
    "learning",
    "intelligence",
    "decision",
    "cycle",
    "source_of_truth",
    "source_chain"
  ];

  for (const key of keys) {
    if (!data[key]) {
      continue;
    }

    const found =
      extractContentId(
        data[key],
        depth + 1
      );

    if (found) {
      return found;
    }
  }

  return null;
}

async function getContent(
  db,
  contentId
) {
  return await db
    .prepare(`
      SELECT
        id,
        title,
        status,
        objective,
        attention_type,
        market_keyword,
        angle,
        cta
      FROM content_engine
      WHERE id = ?
      LIMIT 1
    `)
    .bind(contentId)
    .first();
}

async function getLatestLearning(
  db,
  contentId
) {
  const result =
    await db
      .prepare(`
        SELECT
          id,
          created_at,
          input_data,
          output_data
        FROM ai_runs
        WHERE run_type = 'LEARNING'
        ORDER BY created_at DESC
        LIMIT 100
      `)
      .all();

  for (
    const row of
      result?.results || []
  ) {
    const input =
      parseJSON(
        row.input_data,
        {}
      );

    const output =
      parseJSON(
        row.output_data,
        {}
      );

    const foundInput =
      extractContentId(input);

    const foundOutput =
      extractContentId(output);

    if (
      foundInput ===
        String(contentId) ||
      foundOutput ===
        String(contentId)
    ) {
      const learning =
        input.learning ||
        output.learning ||
        null;

      const intelligence =
        input.intelligence ||
        output.intelligence ||
        null;

      if (!learning) {
        continue;
      }

      return {
        run_id: row.id,
        created_at:
          row.created_at,
        input,
        output,
        learning,
        intelligence
      };
    }
  }

  return null;
}

function buildDecision(
  content,
  learningSource
) {
  const learning =
    learningSource.learning;

  const funnel =
    learning?.funnel || {};

  const attention =
    num(funnel.attention);

  const clicks =
    num(funnel.clicks);

  const productViews =
    num(
      funnel.product_views
    );

  const customers =
    num(funnel.customers);

  const orders =
    num(funnel.orders);

  const revenue =
    num(funnel.revenue);

  const rounds =
    num(learning.rounds);

  let decisionType =
    "OBSERVE_MORE_DATA";

  let decision =
    "CONTINUE_MEASUREMENT";

  let priority =
    "LOW";

  let confidence =
    "LOW";

  const evidence = [];

  if (
    attention > 0 &&
    clicks > 0 &&
    productViews === 0
  ) {
    decisionType =
      "DOWNSTREAM_INVESTIGATION";

    decision =
      "INVESTIGATE_CLICK_TO_PRODUCT_PATH";

    priority =
      "HIGH";

    confidence =
      "HIGH";

    evidence.push({
      signal: "ATTENTION",
      value: attention,
      interpretation:
        "มี Weighted Attention จาก Learning Layer"
    });

    evidence.push({
      signal: "CLICK",
      value: clicks,
      interpretation:
        "มี Click ต่อเนื่อง"
    });

    evidence.push({
      signal: "PRODUCT_VIEW",
      value: productViews,
      interpretation:
        "ยังไม่มี Product View ที่ถูกวัดได้"
    });

    evidence.push({
      signal: "CUSTOMER",
      value: customers,
      interpretation:
        "ยังไม่มี Customer"
    });

    evidence.push({
      signal: "ORDER",
      value: orders,
      interpretation:
        "ยังไม่มี Order"
    });

    evidence.push({
      signal: "REVENUE",
      value: revenue,
      interpretation:
        "ยังไม่มี Revenue"
    });
  }

  return {
    state:
      "DECISION_READY",

    decision_type:
      decisionType,

    decision,

    priority,

    confidence,

    reason:
      decision ===
      "INVESTIGATE_CLICK_TO_PRODUCT_PATH"
        ? "Learning พบ Click ต่อเนื่อง แต่ยังไม่มี Product View จึงควรตรวจสอบเส้นทางหลัง Click ก่อนเปลี่ยนกลยุทธ์"
        : "หลักฐานยังไม่เพียงพอสำหรับ Decision เชิง downstream",

    evidence,

    scope: {
      content_id:
        content?.id || null,

      content_title:
        content?.title || null
    },

    source_of_truth: {
      type:
        LEARNING_SOURCE,

      learning_run_id:
        learningSource.run_id,

      learning_created_at:
        learningSource.created_at,

      attention_type:
        ATTENTION_TYPE,

      aggregation_owner:
        LEARNING_SOURCE
    },

    next_action_candidate:
      decision ===
      "INVESTIGATE_CLICK_TO_PRODUCT_PATH"
        ? {
            type:
              "FUNNEL_PATH_AUDIT",

            target:
              "CLICK_TO_PRODUCT_VIEW",

            status:
              "PROPOSED_ONLY"
          }
        : {
            type:
              "CONTINUE_MEASUREMENT",

            target:
              "CONTENT_FUNNEL",

            status:
              "PROPOSED_ONLY"
          },

    guardrails: {
      winner_declared:
        false,

      strategy_change:
        false,

      automatic_execution:
        false,

      action_executed:
        false,

      requires_human_approval:
        true,

      requires_action_layer:
        true
    }
  };
}

async function saveDecision(
  db,
  content,
  learningSource,
  decision
) {
  const runId =
    crypto.randomUUID();

  const insightId =
    crypto.randomUUID();

  const createdAt =
    new Date().toISOString();

  const funnel =
    learningSource.learning
      ?.funnel || {};

  const inputData = {
    content_id:
      content.id,

    source_of_truth: {
      type:
        LEARNING_SOURCE,

      learning_run_id:
        learningSource.run_id,

      learning_created_at:
        learningSource.created_at,

      aggregation_owner:
        LEARNING_SOURCE
    },

    learning: {
      rounds:
        num(
          learningSource
            .learning
            ?.rounds
        ),

      funnel: {
        attention:
          num(
            funnel.attention
          ),

        clicks:
          num(
            funnel.clicks
          ),

        product_views:
          num(
            funnel.product_views
          ),

        customers:
          num(
            funnel.customers
          ),

        orders:
          num(
            funnel.orders
          ),

        revenue:
          num(
            funnel.revenue
          )
      }
    }
  };

  await db
    .prepare(`
      INSERT INTO ai_runs (
        id,
        customer_id,
        run_type,
        model,
        input_data,
        output_data,
        status,
        tokens_used,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      runId,
      null,
      "DECISION_LAYER_V1",
      "TATO-DECISION-ENGINE-V1.1",
      JSON.stringify(
        inputData
      ),
      JSON.stringify(
        decision
      ),
      "COMPLETED",
      0,
      createdAt
    )
    .run();

  await db
    .prepare(`
      INSERT INTO ai_insights (
        id,
        customer_id,
        run_id,
        insight_type,
        title,
        content,
        score,
        priority,
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      insightId,
      null,
      runId,
      "DECISION",
      decision.decision,
      JSON.stringify(
        decision
      ),
      decision.confidence ===
        "HIGH"
        ? 1
        : 0.5,
      decision.priority,
      "READY",
      createdAt
    )
    .run();

  return {
    run_id:
      runId,

    insight_id:
      insightId,

    saved_at:
      createdAt
  };
}

async function analyze(
  request,
  env,
  mode = "preview"
) {
  const db = env.DB;

  if (!db) {
    throw new Error(
      "D1 binding DB not found"
    );
  }

  const url =
    new URL(request.url);

  let body = {};

  if (
    request.method ===
    "POST"
  ) {
    body =
      await request
        .clone()
        .json()
        .catch(() => ({}));
  }

  const contentId =
    url.searchParams.get(
      "content_id"
    ) ||
    body.content_id;

  if (!contentId) {
    throw new Error(
      "content_id is required"
    );
  }

  const content =
    await getContent(
      db,
      contentId
    );

  if (!content) {
    throw new Error(
      "Content not found"
    );
  }

  const learningSource =
    await getLatestLearning(
      db,
      contentId
    );

  if (!learningSource) {
    throw new Error(
      "No persisted Learning result found for content"
    );
  }

  const learning =
    learningSource.learning;

  if (
    !learning.funnel
  ) {
    throw new Error(
      "Learning result does not contain funnel source"
    );
  }

  const decision =
    buildDecision(
      content,
      learningSource
    );

  let persistence = null;

  if (
    mode === "execute"
  ) {
    persistence =
      await saveDecision(
        db,
        content,
        learningSource,
        decision
      );
  }

  const funnel =
    learning.funnel;

  return {
    success: true,

    layer: LAYER,

    version: VERSION,

    mode,

    status:
      "DECIDED",

    content: {
      id:
        content.id,

      title:
        content.title,

      status:
        content.status
    },

    source_chain: {
      measurement:
        MEASUREMENT_SOURCE,

      intelligence:
        INTELLIGENCE_SOURCE,

      learning:
        LEARNING_SOURCE,

      decision:
        LAYER
    },

    source_of_truth:
      decision.source_of_truth,

    measurement: {
      rounds:
        num(learning.rounds),

      attention:
        num(funnel.attention),

      clicks:
        num(funnel.clicks),

      product_views:
        num(
          funnel.product_views
        ),

      engagements:
        num(
          funnel.engagements
        ),

      customers:
        num(
          funnel.customers
        ),

      orders:
        num(funnel.orders),

      revenue:
        num(funnel.revenue)
    },

    learning: {
      run_id:
        learningSource.run_id,

      created_at:
        learningSource.created_at,

      state:
        learning.state,

      confidence:
        learning.confidence ||
        null,

      decision_input:
        learning.decision_input,

      rounds:
        num(learning.rounds)
    },

    decision,

    persistence,

    next_step:
      "Decision ready. Action Layer must be designed separately."
  };
}

export async function onRequestGet(
  context
) {
  try {
    const result =
      await analyze(
        context.request,
        context.env,
        "preview"
      );

    return json(result);

  } catch (error) {
    return json(
      {
        success: false,

        layer: LAYER,

        version: VERSION,

        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}

export async function onRequestPost(
  context
) {
  try {
    const body =
      await context.request
        .clone()
        .json()
        .catch(() => ({}));

    const mode =
      body?.mode ===
      "execute"
        ? "execute"
        : "preview";

    const result =
      await analyze(
        context.request,
        context.env,
        mode
      );

    return json(result);

  } catch (error) {
    return json(
      {
        success: false,

        layer: LAYER,

        version: VERSION,

        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}
