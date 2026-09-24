// TATO-OS
// Decision Cycle V1.1
// Route: /api/decision-cycle-ai
//
// Chain:
// Feedback Loop
// -> Decision Layer V1.1
// -> Decision Cycle V1.1
//
// SOURCE OF TRUTH:
// Decision Layer V1.1
// -> Learning Layer V1
//
// Guardrails:
// - No winner declaration
// - No strategy change
// - No automatic execution
// - Human approval required

const LAYER = "DECISION_CYCLE_V1";
const VERSION = "1.1";

const MEASUREMENT_SOURCE =
  "CONTENT_MEASUREMENT_ENGINE_V2.2";

const INTELLIGENCE_SOURCE =
  "INTELLIGENCE_LAYER_V2.1";

const LEARNING_SOURCE =
  "LEARNING_LAYER_V1";

const DECISION_SOURCE =
  "DECISION_LAYER_V1";

const FEEDBACK_SOURCE =
  "FEEDBACK_LOOP_V1";

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}

function parseJSON(value, fallback = null) {
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

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function extractContentId(
  data,
  depth = 0
) {
  if (!data || depth > 12) {
    return null;
  }

  if (typeof data === "string") {
    const parsed = parseJSON(data);

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
    data.contentID,
    data?.content?.id,
    data?.content?.content_id
  ];

  for (const value of direct) {
    if (value) {
      return String(value);
    }
  }

  const nestedKeys = [
    "input_data",
    "output_data",
    "content",
    "data",
    "payload",
    "result",
    "feedback",
    "learning",
    "decision",
    "cycle",
    "source_of_truth"
  ];

  for (const key of nestedKeys) {
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

async function getLatestFeedback(
  db,
  contentId
) {
  const result =
    await db.prepare(`
      SELECT
        id,
        run_id,
        insight_type,
        title,
        content,
        priority,
        status,
        created_at
      FROM ai_insights
      WHERE insight_type =
        'FEEDBACK_LOOP_RESULT'
      ORDER BY created_at DESC
      LIMIT 100
    `).all();

  for (
    const row of
      result?.results || []
  ) {
    const content =
      parseJSON(
        row.content,
        {}
      );

    const found =
      extractContentId(
        content
      );

    if (
      found === String(contentId)
    ) {
      return {
        id: row.id,
        run_id: row.run_id,
        insight_type:
          row.insight_type,
        title: row.title,
        content,
        priority: row.priority,
        status: row.status,
        created_at:
          row.created_at
      };
    }
  }

  return null;
}

async function getLatestDecisionCycle(
  db,
  contentId
) {
  const result =
    await db.prepare(`
      SELECT
        id,
        run_id,
        insight_type,
        title,
        content,
        priority,
        status,
        created_at
      FROM ai_insights
      WHERE insight_type =
        'DECISION_CYCLE_RESULT'
      ORDER BY created_at DESC
      LIMIT 100
    `).all();

  for (
    const row of
      result?.results || []
  ) {
    const content =
      parseJSON(
        row.content,
        {}
      );

    const found =
      extractContentId(
        content
      );

    if (
      found === String(contentId)
    ) {
      return {
        id: row.id,
        run_id: row.run_id,
        title: row.title,
        content,
        priority: row.priority,
        status: row.status,
        created_at:
          row.created_at
      };
    }
  }

  return null;
}

async function callDecisionLayer(
  request,
  contentId
) {
  const url =
    new URL(
      "/api/decision-ai",
      request.url
    );

  url.searchParams.set(
    "content_id",
    contentId
  );

  const response =
    await fetch(
      url.toString(),
      {
        method: "GET",
        headers: {
          Accept:
            "application/json"
        }
      }
    );

  const data =
    await response
      .json()
      .catch(() => null);

  if (
    !response.ok ||
    !data?.success
  ) {
    throw new Error(
      data?.error ||
      "DECISION_LAYER_REENTRY_FAILED"
    );
  }

  if (
    data.version !== "1.1"
  ) {
    throw new Error(
      `DECISION_LAYER_VERSION_MISMATCH:${data.version}`
    );
  }

  if (
    data.source_of_truth
      ?.type !==
    LEARNING_SOURCE
  ) {
    throw new Error(
      "DECISION_SOURCE_OF_TRUTH_INVALID"
    );
  }

  if (
    data.source_of_truth
      ?.aggregation_owner !==
    LEARNING_SOURCE
  ) {
    throw new Error(
      "DECISION_AGGREGATION_OWNER_INVALID"
    );
  }

  return data;
}

function buildCycleResult(
  contentId,
  feedback,
  previousCycle,
  decision
) {
  const measurement =
    decision.measurement || {};

  const learning =
    decision.learning || {};

  const decisionResult =
    decision.decision || {};

  const source =
    decision.source_of_truth || {};

  return {
    state:
      "DECISION_CYCLE_READY",

    cycle_type:
      "FEEDBACK_REENTRY",

    trigger:
      feedback
        ? "FEEDBACK_LOOP_RESULT"
        : "DECISION_LAYER_REENTRY",

    content_id:
      contentId,

    feedback: {
      insight_id:
        feedback?.id || null,

      run_id:
        feedback?.run_id || null,

      finding:
        feedback?.content
          ?.finding ||
        feedback?.content
          ?.feedback
          ?.finding ||
        null,

      next_learning_signal:
        feedback?.content
          ?.next_learning_signal ||
        feedback?.content
          ?.feedback
          ?.next_learning_signal ||
        null
    },

    learning_signal: {
      state:
        learning.state ||
        null,

      decision_input:
        learning.decision_input ||
        null,

      rounds:
        num(
          learning.rounds
        )
    },

    decision: {
      state:
        decisionResult.state ||
        null,

      decision_type:
        decisionResult
          .decision_type ||
        null,

      decision:
        decisionResult
          .decision ||
        null,

      priority:
        decisionResult.priority ||
        null,

      confidence:
        decisionResult.confidence ||
        null,

      reason:
        decisionResult.reason ||
        null
    },

    measurement: {
      rounds:
        num(
          measurement.rounds
        ),

      attention:
        num(
          measurement.attention
        ),

      clicks:
        num(
          measurement.clicks
        ),

      product_views:
        num(
          measurement.product_views
        ),

      engagements:
        num(
          measurement.engagements
        ),

      customers:
        num(
          measurement.customers
        ),

      orders:
        num(
          measurement.orders
        ),

      revenue:
        num(
          measurement.revenue
        )
    },

    source_of_truth: {
      decision_layer:
        DECISION_SOURCE,

      decision_layer_version:
        decision.version,

      learning_layer:
        LEARNING_SOURCE,

      learning_run_id:
        source.learning_run_id ||
        learning.run_id ||
        null,

      learning_created_at:
        source.learning_created_at ||
        learning.created_at ||
        null,

      attention_type:
        source.attention_type ||
        "weighted_behavioral_signal",

      aggregation_owner:
        source.aggregation_owner ||
        LEARNING_SOURCE
    },

    previous_cycle:
      previousCycle
        ? {
            insight_id:
              previousCycle.id,

            run_id:
              previousCycle.run_id,

            created_at:
              previousCycle.created_at
          }
        : null,

    guardrails: {
      winner_declared:
        false,

      strategy_change:
        false,

      automatic_execution:
        false,

      action_executed:
        false,

      business_data_mutation:
        false,

      content_mutation:
        false,

      customer_contact:
        false,

      payment_action:
        false,

      requires_human_approval:
        true
    }
  };
}

async function buildPreview(
  context,
  contentId
) {
  const db = context.env.DB;

  if (!db) {
    throw new Error(
      "D1 binding DB is missing"
    );
  }

  const feedback =
    await getLatestFeedback(
      db,
      contentId
    );

  const previousCycle =
    await getLatestDecisionCycle(
      db,
      contentId
    );

  const decision =
    await callDecisionLayer(
      context.request,
      contentId
    );

  const cycle =
    buildCycleResult(
      contentId,
      feedback,
      previousCycle,
      decision
    );

  return {
    success: true,

    layer:
      LAYER,

    version:
      VERSION,

    mode:
      "preview",

    status:
      "READY",

    content:
      decision.content,

    source_chain: {
      measurement:
        MEASUREMENT_SOURCE,

      intelligence:
        INTELLIGENCE_SOURCE,

      learning:
        LEARNING_SOURCE,

      decision:
        DECISION_SOURCE,

      action:
        "ACTION_LAYER_V1",

      execution:
        "EXECUTION_LAYER_V1",

      feedback:
        FEEDBACK_SOURCE,

      decision_cycle:
        LAYER
    },

    feedback,

    learning_signal:
      cycle.learning_signal,

    decision:
      cycle.decision,

    measurement:
      cycle.measurement,

    cycle,

    diagnostics: {
      feedback_found:
        !!feedback,

      decision_layer_reentered:
        true,

      decision_layer_version:
        decision.version,

      previous_cycle_found:
        !!previousCycle,

      previous_cycle_id:
        previousCycle?.id ||
        null,

      previous_cycle_run_id:
        previousCycle?.run_id ||
        null,

      source_of_truth_verified:
        cycle
          .source_of_truth
          .aggregation_owner ===
        LEARNING_SOURCE,

      aggregation_owner:
        cycle
          .source_of_truth
          .aggregation_owner,

      learning_run_id:
        cycle
          .source_of_truth
          .learning_run_id
    },

    persistence:
      null,

    guardrails:
      cycle.guardrails,

    next_step:
      "Decision Cycle preview ready. POST approved:true to persist."
  };
}

async function saveCycle(
  env,
  preview
) {
  const runId =
    crypto.randomUUID();

  const insightId =
    crypto.randomUUID();

  const createdAt =
    new Date().toISOString();

  const inputData = {
    content_id:
      preview.cycle.content_id,

    source_of_truth:
      preview.cycle
        .source_of_truth,

    decision:
      preview.decision,

    learning_signal:
      preview.learning_signal,

    measurement:
      preview.measurement,

    feedback:
      preview.feedback,

    previous_cycle:
      preview.cycle
        .previous_cycle
  };

  const outputData = {
    cycle:
      preview.cycle,

    source_of_truth:
      preview.cycle
        .source_of_truth,

    guardrails:
      preview.guardrails
  };

  await env.DB
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
      "DECISION_CYCLE",
      "TATO-DECISION-CYCLE-V1.1",
      JSON.stringify(
        inputData
      ),
      JSON.stringify(
        outputData
      ),
      "COMPLETED",
      0,
      createdAt
    )
    .run();

  await env.DB
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
      "DECISION_CYCLE_RESULT",
      "Decision Cycle V1.1",
      JSON.stringify(
        outputData
      ),
      1,
      preview.decision
        ?.priority ||
        "NORMAL",
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

export async function onRequestGet(
  context
) {
  try {
    const url =
      new URL(
        context.request.url
      );

    const contentId =
      url.searchParams.get(
        "content_id"
      );

    if (!contentId) {
      return json(
        {
          success: false,
          layer: LAYER,
          version: VERSION,
          error:
            "content_id is required"
        },
        400
      );
    }

    return json(
      await buildPreview(
        context,
        contentId
      )
    );

  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        status: "ERROR",
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

    if (
      body.approved !== true
    ) {
      return json(
        {
          success: false,
          layer: LAYER,
          version: VERSION,
          status:
            "APPROVAL_REQUIRED",
          message:
            "POST requires approved:true"
        },
        403
      );
    }

    const url =
      new URL(
        context.request.url
      );

    const contentId =
      url.searchParams.get(
        "content_id"
      ) ||
      body.content_id;

    if (!contentId) {
      return json(
        {
          success: false,
          layer: LAYER,
          version: VERSION,
          error:
            "content_id is required"
        },
        400
      );
    }

    const preview =
      await buildPreview(
        context,
        contentId
      );

    const persistence =
      await saveCycle(
        context.env,
        preview
      );

    return json({
      ...preview,

      mode:
        "execute",

      status:
        "EXECUTED",

      persistence,

      next_step:
        "Decision Cycle completed. Action Cycle remains separate and requires its own approval."
    });

  } catch (error) {
    return json(
      {
        success: false,
        layer: LAYER,
        version: VERSION,
        status: "ERROR",
        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}
