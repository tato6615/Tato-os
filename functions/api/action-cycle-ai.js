// TATO-OS
// ACTION CYCLE V1.1
// Route: /api/action-cycle-ai
//
// Chain:
// Measurement V2.2
// -> Intelligence V2.1
// -> Learning V1
// -> Decision V1.1
// -> Action V1.1
// -> Action Cycle V1.1
//
// Purpose:
// Coordinate Decision Cycle + Action Layer into one
// human-approved action-cycle boundary.
//
// IMPORTANT:
// - GET = preview only
// - POST requires approved:true
// - Does NOT execute the real business action
// - Real execution belongs to Execution Layer
// - Does NOT mutate content
// - Does NOT mutate customers
// - Does NOT mutate orders/payments
// - Does NOT declare winner
// - Does NOT change strategy automatically
//
// VERSION RULE:
// Old ACTION_CYCLE_V1 records are intentionally rejected.
// This cycle requires:
//   DECISION_CYCLE_V1.1
//   ACTION_LAYER_V1.1
// ============================================================

const LAYER = "ACTION_CYCLE_V1";
const VERSION = "1.1";

const MEASUREMENT_SOURCE =
  "CONTENT_MEASUREMENT_ENGINE_V2.2";

const INTELLIGENCE_SOURCE =
  "INTELLIGENCE_LAYER_V2.1";

const LEARNING_SOURCE =
  "LEARNING_LAYER_V1";

const DECISION_SOURCE =
  "DECISION_LAYER_V1.1";

const ACTION_SOURCE =
  "ACTION_LAYER_V1.1";

const FEEDBACK_SOURCE =
  "FEEDBACK_LOOP_V1.5";

const EXECUTION_SOURCE =
  "EXECUTION_LAYER_V1";

const DECISION_CYCLE_SOURCE =
  "DECISION_CYCLE_V1.1";

const ACTION_CYCLE_SOURCE =
  "ACTION_CYCLE_V1.1";

const ATTENTION_TYPE =
  "weighted_behavioral_signal";

// ============================================================
// RESPONSE
// ============================================================

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

// ============================================================
// UTILITIES
// ============================================================

function now() {
  return new Date().toISOString();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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

  let text = String(value)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(text);
  } catch (_) {}

  const start =
    text.indexOf("{");

  const end =
    text.lastIndexOf("}");

  if (
    start >= 0 &&
    end > start
  ) {
    try {
      return JSON.parse(
        text.slice(
          start,
          end + 1
        )
      );
    } catch (_) {}
  }

  return fallback;
}

// ============================================================
// RECURSIVE CONTENT ID
// ============================================================

function extractContentId(value) {
  if (!value) {
    return null;
  }

  if (
    typeof value === "string"
  ) {
    const parsed =
      parseJSON(value);

    if (parsed) {
      return extractContentId(
        parsed
      );
    }

    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found =
        extractContentId(item);

      if (found) {
        return found;
      }
    }

    return null;
  }

  if (
    typeof value === "object"
  ) {
    const directCandidates = [
      value.content_id,
      value.contentId,
      value?.content?.id,
      value?.content?.content_id,
      value?.cycle?.content_id,
      value?.action?.target?.content_id,
      value?.decision?.content_id
    ];

    for (
      const candidate
      of directCandidates
    ) {
      if (candidate) {
        return String(candidate);
      }
    }

    const keys = [
      "input_data",
      "output_data",
      "content",
      "data",
      "payload",
      "result",
      "feedback",
      "learning",
      "intelligence",
      "decision",
      "action",
      "cycle",
      "source_decision_cycle"
    ];

    for (const key of keys) {
      if (value[key]) {
        const found =
          extractContentId(
            value[key]
          );

        if (found) {
          return found;
        }
      }
    }
  }

  return null;
}

// ============================================================
// VERSION EXTRACTION
// ============================================================

function extractVersion(value) {
  if (!value) {
    return null;
  }

  if (
    typeof value === "string"
  ) {
    const parsed =
      parseJSON(value);

    if (parsed) {
      return extractVersion(
        parsed
      );
    }

    return null;
  }

  if (
    typeof value !== "object"
  ) {
    return null;
  }

  const candidates = [
    value.version,
    value?.cycle?.version,
    value?.action?.version,
    value?.decision?.version,
    value?.source_decision_cycle?.version
  ];

  for (
    const candidate
    of candidates
  ) {
    if (
      candidate !== null &&
      candidate !== undefined
    ) {
      return String(candidate);
    }
  }

  return null;
}

// ============================================================
// CONTENT
// ============================================================

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

// ============================================================
// LATEST DECISION CYCLE V1.1
// ============================================================

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
        score,
        priority,
        status,
        created_at
      FROM ai_insights
      WHERE insight_type =
        'DECISION_CYCLE_RESULT'
      ORDER BY created_at DESC
      LIMIT 200
    `).all();

  for (
    const row
    of result?.results || []
  ) {
    const parsed =
      parseJSON(row.content);

    const foundContentId =
      extractContentId(parsed);

    if (
      foundContentId !==
      String(contentId)
    ) {
      continue;
    }

    const version =
      extractVersion(parsed);

    // IMPORTANT:
    // Old Decision Cycle V1 is rejected.
    if (version !== "1.1") {
      continue;
    }

    const sourceChain =
      parsed?.source_chain || {};

    if (
      sourceChain.decision_cycle &&
      sourceChain.decision_cycle !==
        DECISION_CYCLE_SOURCE
    ) {
      continue;
    }

    return {
      id: row.id,
      run_id: row.run_id,
      insight_type:
        row.insight_type,
      title: row.title,
      content: parsed,
      score: num(row.score),
      priority: row.priority,
      status: row.status,
      created_at: row.created_at,
      version
    };
  }

  return null;
}

// ============================================================
// CALL DECISION CYCLE V1.1 PREVIEW
// ============================================================

async function callDecisionCycle(
  request,
  contentId
) {
  const requestUrl =
    new URL(request.url);

  const url =
    `${requestUrl.origin}/api/decision-cycle-ai?content_id=${encodeURIComponent(contentId)}`;

  const response =
    await fetch(
      url,
      {
        method: "GET",
        headers: {
          Accept:
            "application/json"
        }
      }
    );

  let data = null;

  try {
    data =
      await response.json();
  } catch (_) {
    data = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

// ============================================================
// CALL ACTION LAYER V1.1
// ============================================================

async function callActionLayer(
  request,
  contentId,
  mode = "preview"
) {
  const requestUrl =
    new URL(request.url);

  const url =
    `${requestUrl.origin}/api/action-ai?content_id=${encodeURIComponent(contentId)}`;

  if (mode === "execute") {
    const response =
      await fetch(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            Accept:
              "application/json"
          },
          body: JSON.stringify({
            approved: true,
            content_id:
              contentId
          })
        }
      );

    let data = null;

    try {
      data =
        await response.json();
    } catch (_) {
      data = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      data
    };
  }

  const response =
    await fetch(
      url,
      {
        method: "GET",
        headers: {
          Accept:
            "application/json"
        }
      }
    );

  let data = null;

  try {
    data =
      await response.json();
  } catch (_) {
    data = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

// ============================================================
// FIND PREVIOUS ACTION CYCLE V1.1
// ============================================================

async function getPreviousActionCycle(
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
        score,
        priority,
        status,
        created_at
      FROM ai_insights
      WHERE insight_type =
        'ACTION_CYCLE_RESULT'
      ORDER BY created_at DESC
      LIMIT 200
    `).all();

  for (
    const row
    of result?.results || []
  ) {
    const parsed =
      parseJSON(row.content);

    const foundContentId =
      extractContentId(parsed);

    if (
      foundContentId !==
      String(contentId)
    ) {
      continue;
    }

    const version =
      extractVersion(parsed);

    if (version !== "1.1") {
      continue;
    }

    return {
      id: row.id,
      run_id: row.run_id,
      content: parsed,
      priority: row.priority,
      status: row.status,
      created_at: row.created_at,
      version
    };
  }

  return null;
}

// ============================================================
// BUILD ACTION CYCLE
// ============================================================

async function buildCycle(
  context,
  contentId,
  mode = "preview"
) {
  const db =
    context.env.DB;

  if (!db) {
    throw new Error(
      "D1 binding DB is missing"
    );
  }

  // ----------------------------------------------------------
  // 1. Content
  // ----------------------------------------------------------

  const content =
    await getContent(
      db,
      contentId
    );

  if (!content) {
    return {
      success: false,
      status:
        "CONTENT_NOT_FOUND",
      content: {
        id: contentId
      }
    };
  }

  // ----------------------------------------------------------
  // 2. Decision Cycle V1.1
  //
  // Always re-enter the current Decision Cycle.
  // Never use old V1 as fallback.
  // ----------------------------------------------------------

  const decisionCycleResponse =
    await callDecisionCycle(
      context.request,
      contentId
    );

  if (
    !decisionCycleResponse.ok ||
    !decisionCycleResponse.data?.success
  ) {
    return {
      success: false,
      status:
        "DECISION_CYCLE_REENTRY_FAILED",

      content: {
        id: contentId,
        title: content.title,
        status: content.status
      },

      decision_cycle_response:
        decisionCycleResponse.data,

      diagnostics: {
        decision_cycle_reentered:
          true,
        decision_cycle_status:
          decisionCycleResponse.status
      }
    };
  }

  const decisionCycle =
    decisionCycleResponse.data;

  // ----------------------------------------------------------
  // 3. HARD VERSION CHECK
  // ----------------------------------------------------------

  if (
    String(
      decisionCycle.version
    ) !== "1.1"
  ) {
    return {
      success: false,
      status:
        "INVALID_DECISION_CYCLE_VERSION",

      content: {
        id: contentId,
        title: content.title,
        status: content.status
      },

      diagnostics: {
        received_version:
          decisionCycle.version ||
          null,
        required_version:
          "1.1",
        old_v1_fallback:
          false
      }
    };
  }

  if (
    decisionCycle.source_chain
      ?.decision_cycle &&
    decisionCycle.source_chain
      .decision_cycle !==
      DECISION_CYCLE_SOURCE
  ) {
    return {
      success: false,
      status:
        "INVALID_DECISION_CYCLE_SOURCE",

      content: {
        id: contentId,
        title: content.title,
        status: content.status
      },

      diagnostics: {
        received_source:
          decisionCycle.source_chain
            .decision_cycle,
        required_source:
          DECISION_CYCLE_SOURCE
      }
    };
  }

  // ----------------------------------------------------------
  // 4. Current persisted Decision Cycle check
  //
  // This verifies that the cycle being consumed is also
  // represented by a persisted V1.1 result when available.
  // ----------------------------------------------------------

  const persistedDecisionCycle =
    await getLatestDecisionCycle(
      db,
      contentId
    );

  // ----------------------------------------------------------
  // 5. Action Layer V1.1
  // ----------------------------------------------------------

  const actionResponse =
    await callActionLayer(
      context.request,
      contentId,
      mode
    );

  if (
    !actionResponse.ok ||
    !actionResponse.data?.success
  ) {
    return {
      success: false,
      status:
        "ACTION_LAYER_FAILED",

      content: {
        id: contentId,
        title: content.title,
        status: content.status
      },

      decision_cycle:
        decisionCycle,

      action_response:
        actionResponse.data,

      diagnostics: {
        action_layer_status:
          actionResponse.status,
        required_action_version:
          "1.1"
      }
    };
  }

  const actionResult =
    actionResponse.data;

  // ----------------------------------------------------------
  // 6. HARD ACTION VERSION CHECK
  // ----------------------------------------------------------

  if (
    String(
      actionResult.version
    ) !== "1.1"
  ) {
    return {
      success: false,
      status:
        "INVALID_ACTION_LAYER_VERSION",

      content: {
        id: contentId,
        title: content.title,
        status: content.status
      },

      decision_cycle:
        decisionCycle,

      action:
        actionResult,

      diagnostics: {
        received_version:
          actionResult.version ||
          null,
        required_version:
          "1.1"
      }
    };
  }

  // ----------------------------------------------------------
  // 7. Validate Action source of truth
  // ----------------------------------------------------------

  const actionSource =
    actionResult.source_of_truth ||
    {};

  if (
    actionSource.type &&
    actionSource.type !==
      LEARNING_SOURCE
  ) {
    return {
      success: false,
      status:
        "INVALID_ACTION_SOURCE_OF_TRUTH",

      content: {
        id: contentId,
        title: content.title,
        status: content.status
      },

      diagnostics: {
        received_type:
          actionSource.type,
        required_type:
          LEARNING_SOURCE
      }
    };
  }

  // ----------------------------------------------------------
  // 8. Extract Action
  // ----------------------------------------------------------

  const action =
    actionResult.action ||
    {};

  const learning =
    actionResult.learning ||
    {};

  const measurement =
    actionResult.measurement ||
    {};

  const sourceOfTruth =
    actionResult.source_of_truth ||
    {};

  // ----------------------------------------------------------
  // 9. Evidence
  // ----------------------------------------------------------

  const evidence = {
    rounds:
      num(
        actionResult.measurement
          ?.rounds
      ) ||
      num(
        learning.rounds
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
  };

  // ----------------------------------------------------------
  // 10. Build Cycle
  // ----------------------------------------------------------

  const cycle = {
    state:
      "ACTION_CYCLE_READY",

    cycle_type:
      "DECISION_TO_ACTION",

    trigger:
      "DECISION_CYCLE_V1.1",

    content_id:
      contentId,

    decision_cycle: {
      version: "1.1",

      source:
        DECISION_CYCLE_SOURCE,

      insight_id:
        decisionCycle.feedback
          ?.insight_id ||
        null,

      run_id:
        decisionCycle.feedback
          ?.run_id ||
        null,

      decision:
        decisionCycle.decision ||
        null
    },

    decision: {
      state:
        decisionCycle.decision
          ?.state ||
        null,

      decision_type:
        decisionCycle.decision
          ?.decision_type ||
        null,

      decision:
        decisionCycle.decision
          ?.decision ||
        null,

      priority:
        decisionCycle.decision
          ?.priority ||
        null,

      confidence:
        decisionCycle.decision
          ?.confidence ||
        null
    },

    action: {
      state:
        action.state ||
        "ACTION_PROPOSED",

      action_type:
        action.action_type ||
        null,

      action_name:
        action.action_name ||
        null,

      objective:
        action.objective ||
        null,

      target:
        action.target ||
        {
          content_id:
            contentId
        },

      proposed_steps:
        action.proposed_steps ||
        [],

      expected_signal:
        action.expected_signal ||
        null,

      status:
        action.status ||
        "PENDING_APPROVAL"
    },

    evidence,

    source_of_truth: {
      type:
        LEARNING_SOURCE,

      learning_run_id:
        sourceOfTruth
          .learning_run_id ||
        null,

      learning_created_at:
        sourceOfTruth
          .learning_created_at ||
        null,

      attention_type:
        sourceOfTruth
          .attention_type ||
        ATTENTION_TYPE,

      aggregation_owner:
        LEARNING_SOURCE
    },

    previous_cycle:
      null,

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

  // ----------------------------------------------------------
  // 11. Previous Action Cycle V1.1
  // ----------------------------------------------------------

  const previousCycle =
    await getPreviousActionCycle(
      db,
      contentId
    );

  if (previousCycle) {
    cycle.previous_cycle = {
      insight_id:
        previousCycle.id,

      run_id:
        previousCycle.run_id,

      created_at:
        previousCycle.created_at,

      version:
        previousCycle.version
    };
  }

  // ----------------------------------------------------------
  // 12. Result
  // ----------------------------------------------------------

  return {
    success: true,

    layer:
      LAYER,

    version:
      VERSION,

    mode,

    status:
      "READY",

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
        DECISION_SOURCE,

      action:
        ACTION_SOURCE,

      execution:
        EXECUTION_SOURCE,

      feedback:
        FEEDBACK_SOURCE,

      decision_cycle:
        DECISION_CYCLE_SOURCE,

      action_cycle:
        ACTION_CYCLE_SOURCE
    },

    source_of_truth:
      cycle.source_of_truth,

    decision_cycle:
      decisionCycle,

    action:
      action,

    learning:
      learning,

    measurement:
      measurement,

    evidence:
      evidence,

    cycle:
      cycle,

    diagnostics: {
      decision_cycle_reentered:
        true,

      decision_cycle_version:
        decisionCycle.version,

      decision_cycle_source_valid:
        true,

      persisted_decision_cycle_found:
        !!persistedDecisionCycle,

      persisted_decision_cycle_version:
        persistedDecisionCycle?.version ||
        null,

      action_layer_reentered:
        true,

      action_layer_version:
        actionResult.version,

      action_source_of_truth_valid:
        true,

      old_action_cycle_fallback:
        false,

      previous_action_cycle_found:
        !!previousCycle,

      previous_action_cycle_version:
        previousCycle?.version ||
        null
    },

    persistence:
      null,

    guardrails:
      cycle.guardrails
  };
}

// ============================================================
// SAVE ACTION CYCLE
// ============================================================

async function saveCycle(
  env,
  result
) {
  const db =
    env.DB;

  const runId =
    crypto.randomUUID();

  const insightId =
    crypto.randomUUID();

  const createdAt =
    now();

  const inputData = {
    layer:
      LAYER,

    version:
      VERSION,

    content_id:
      result.content.id,

    source_chain:
      result.source_chain,

    source_of_truth:
      result.source_of_truth,

    decision_cycle:
      {
        version:
          result.decision_cycle
            ?.version ||
          null,

        status:
          result.decision_cycle
            ?.status ||
          null
      },

    action:
      result.action,

    evidence:
      result.evidence,

    previous_cycle:
      result.cycle
        ?.previous_cycle ||
      null
  };

  const outputData = {
    layer:
      LAYER,

    version:
      VERSION,

    cycle:
      result.cycle,

    action:
      result.action,

    evidence:
      result.evidence,

    source_decision_cycle:
      result.decision_cycle,

    source_of_truth:
      result.source_of_truth,

    guardrails:
      result.guardrails
  };

  await db.prepare(`
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
  `).bind(
    runId,
    null,
    "ACTION_CYCLE",
    "TATO_OS_ACTION_CYCLE_V1.1",
    JSON.stringify(inputData),
    JSON.stringify(outputData),
    "COMPLETED",
    0,
    createdAt
  ).run();

  await db.prepare(`
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
  `).bind(
    insightId,
    null,
    runId,
    "ACTION_CYCLE_RESULT",
    "Action Cycle V1.1",
    JSON.stringify(outputData),
    1,
    result.cycle
      ?.decision
      ?.priority ||
      "NORMAL",
    "PENDING_APPROVAL",
    createdAt
  ).run();

  return {
    run_id:
      runId,

    insight_id:
      insightId,

    saved_at:
      createdAt
  };
}

// ============================================================
// GET = PREVIEW
// ============================================================

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
      return json({
        success: false,

        layer:
          LAYER,

        version:
          VERSION,

        error:
          "content_id is required"
      }, 400);
    }

    const result =
      await buildCycle(
        context,
        contentId,
        "preview"
      );

    if (!result.success) {
      return json(
        {
          success: false,

          layer:
            LAYER,

          version:
            VERSION,

          status:
            result.status,

          content:
            result.content ||
            {
              id:
                contentId
            },

          diagnostics:
            result.diagnostics ||
            null,

          decision_cycle:
            result.decision_cycle ||
            null,

          action:
            result.action ||
            null
        },
        result.status ===
          "CONTENT_NOT_FOUND"
          ? 404
          : 500
      );
    }

    return json({
      success:
        true,

      layer:
        LAYER,

      version:
        VERSION,

      mode:
        "preview",

      status:
        "READY",

      content:
        result.content,

      source_chain:
        result.source_chain,

      source_of_truth:
        result.source_of_truth,

      decision_cycle: {
        version:
          result.decision_cycle
            ?.version ||
          null,

        status:
          result.decision_cycle
            ?.status ||
          null,

        decision:
          result.decision_cycle
            ?.decision ||
          null,

        cycle:
          result.decision_cycle
            ?.cycle ||
          null
      },

      action:
        result.action,

      learning:
        result.learning,

      measurement:
        result.measurement,

      evidence:
        result.evidence,

      cycle:
        result.cycle,

      persistence:
        null,

      guardrails:
        result.guardrails,

      diagnostics:
        result.diagnostics,

      next_step:
        "Action Cycle V1.1 preview ready. POST approved:true to persist the cycle."
    });
  } catch (error) {
    return json({
      success: false,

      layer:
        LAYER,

      version:
        VERSION,

      status:
        "ERROR",

      error:
        error?.message ||
        String(error)
    }, 500);
  }
}

// ============================================================
// POST = EXECUTE / PERSIST CYCLE
// ============================================================

export async function onRequestPost(
  context
) {
  try {
    const url =
      new URL(
        context.request.url
      );

    let body = {};

    try {
      body =
        await context.request
          .json();
    } catch (_) {
      body = {};
    }

    const contentId =
      url.searchParams.get(
        "content_id"
      ) ||
      body.content_id;

    if (!contentId) {
      return json({
        success: false,

        layer:
          LAYER,

        version:
          VERSION,

        error:
          "content_id is required"
      }, 400);
    }

    if (
      body.approved !== true
    ) {
      return json({
        success: false,

        layer:
          LAYER,

        version:
          VERSION,

        status:
          "APPROVAL_REQUIRED",

        message:
          "POST execution requires explicit approved:true."
      }, 403);
    }

    // --------------------------------------------------------
    // Build fresh cycle.
    // This also re-enters Decision Cycle V1.1.
    // --------------------------------------------------------

    const result =
      await buildCycle(
        context,
        contentId,
        "execute"
      );

    if (!result.success) {
      return json(
        {
          success: false,

          layer:
            LAYER,

          version:
            VERSION,

          status:
            result.status,

          content:
            result.content ||
            {
              id:
                contentId
            },

          diagnostics:
            result.diagnostics ||
            null,

          decision_cycle:
            result.decision_cycle ||
            null,

          action:
            result.action ||
            null
        },
        result.status ===
          "CONTENT_NOT_FOUND"
          ? 404
          : 500
      );
    }

    // --------------------------------------------------------
    // Persist Action Cycle
    // --------------------------------------------------------

    const persistence =
      await saveCycle(
        context.env,
        result
      );

    return json({
      success:
        true,

      layer:
        LAYER,

      version:
        VERSION,

      mode:
        "execute",

      status:
        "EXECUTED",

      content:
        result.content,

      source_chain:
        result.source_chain,

      source_of_truth:
        result.source_of_truth,

      decision_cycle:
        {
          version:
            result.decision_cycle
              ?.version ||
            null,

          status:
            result.decision_cycle
              ?.status ||
            null,

          decision:
            result.decision_cycle
              ?.decision ||
            null
        },

      action:
        result.action,

      learning:
        result.learning,

      measurement:
        result.measurement,

      evidence:
        result.evidence,

      cycle:
        result.cycle,

      persistence,

      guardrails:
        result.guardrails,

      next_step:
        "Action Cycle V1.1 persisted. Execution Cycle V1.1 may now consume ACTION_CYCLE_V1.1."
    });
  } catch (error) {
    return json({
      success: false,

      layer:
        LAYER,

      version:
        VERSION,

      status:
        "ERROR",

      error:
        error?.message ||
        String(error)
    }, 500);
  }
}
