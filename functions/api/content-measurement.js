// TATO-OS
// Content Measurement Engine V2.3
// Route: /api/content-measurement
//
// Pipeline:
//
// Measurement V2.3
//        ↑
// Feedback V1.1
//        ↑
// Automation Execution V1.0
//        ↑
// Action V1.0
//        ↑
// Decision V1.1
//        ↑
// Learning V2.2
//        ↑
// Intelligence V2.0
//
// V2.3 adds:
// - read persisted feedback_records
// - detect pending measurement feedback
// - run normal Measurement V2.2 logic
// - mark feedback measurement_completed = 1
// - expose feedback handoff status
//
// IMPORTANT:
// Feedback is NOT counted as behavior.
// Feedback does NOT become Attention.
// Feedback does NOT alter funnel metrics.
// Feedback only closes the operational handoff into Measurement.

const LAYER = "CONTENT_MEASUREMENT_ENGINE_V2.3";
const PREVIOUS_LAYER = "CONTENT_MEASUREMENT_ENGINE_V2.2";
const ATTRIBUTION_MODE = "CONTENT_ATTRIBUTION_V2";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const ATTENTION_WEIGHTS = {
  content_view: 1,
  content_click: 3,
  product_view: 4,
  engagement: 5
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: HEADERS
  });
}

function makeId() {
  return crypto.randomUUID();
}

function numberValue(value) {
  const valueNumber = Number(value);
  return Number.isFinite(valueNumber) ? valueNumber : 0;
}

function stringValue(value) {
  return value == null ? "" : String(value);
}

function normalizeEventType(value) {
  return stringValue(value).trim().toLowerCase();
}

function getEventContentId(row) {
  if (!row) {
    return null;
  }

  if (row.content_id) {
    return stringValue(row.content_id);
  }

  try {
    const metadata =
      typeof row.metadata === "string"
        ? JSON.parse(row.metadata)
        : row.metadata;

    if (metadata && metadata.content_id) {
      return stringValue(metadata.content_id);
    }
  } catch (_) {}

  return null;
}

function getEventSessionId(row) {
  if (!row || !row.session_id) {
    return null;
  }

  return stringValue(row.session_id);
}

function getEventTime(row) {
  if (!row || !row.created_at) {
    return 0;
  }

  const time = new Date(row.created_at).getTime();

  return Number.isFinite(time) ? time : 0;
}

function isEngagementType(type) {
  return (
    type === "engagement" ||
    type === "like" ||
    type === "comment" ||
    type === "share"
  );
}

function calculateAttentionScore(events) {
  let score = 0;

  for (const event of events) {
    const type = normalizeEventType(event.event_type);

    if (type === "content_view") {
      score += ATTENTION_WEIGHTS.content_view;
    } else if (type === "content_click") {
      score += ATTENTION_WEIGHTS.content_click;
    } else if (type === "product_view") {
      score += ATTENTION_WEIGHTS.product_view;
    } else if (isEngagementType(type)) {
      score += ATTENTION_WEIGHTS.engagement;
    }
  }

  return score;
}

function buildAttentionBreakdown(events) {
  const counts = {
    content_view: 0,
    content_click: 0,
    product_view: 0,
    engagement: 0
  };

  for (const event of events) {
    const type = normalizeEventType(event.event_type);

    if (type === "content_view") {
      counts.content_view += 1;
    } else if (type === "content_click") {
      counts.content_click += 1;
    } else if (type === "product_view") {
      counts.product_view += 1;
    } else if (isEngagementType(type)) {
      counts.engagement += 1;
    }
  }

  const scores = {
    content_view:
      counts.content_view *
      ATTENTION_WEIGHTS.content_view,

    content_click:
      counts.content_click *
      ATTENTION_WEIGHTS.content_click,

    product_view:
      counts.product_view *
      ATTENTION_WEIGHTS.product_view,

    engagement:
      counts.engagement *
      ATTENTION_WEIGHTS.engagement
  };

  return {
    counts,
    weights: ATTENTION_WEIGHTS,
    scores,
    total_attention:
      scores.content_view +
      scores.content_click +
      scores.product_view +
      scores.engagement
  };
}

async function getContent(db, requestedContentId) {
  try {
    if (requestedContentId) {
      return await db
        .prepare(
          "SELECT * FROM content_engine WHERE id = ? LIMIT 1"
        )
        .bind(requestedContentId)
        .first();
    }

    return await db
      .prepare(
        "SELECT * FROM content_engine ORDER BY created_at DESC LIMIT 1"
      )
      .first();
  } catch (_) {
    return null;
  }
}

/*
 * V2.2 measurement start
 *
 * Priority:
 * 1. Earliest Decision Cycle / content decision timestamp
 * 2. Content created_at
 * 3. Current timestamp
 *
 * IMPORTANT:
 * Never fall back to Unix epoch / 1970.
 */
async function getMeasurementStart(
  db,
  contentId,
  contentCreatedAt
) {
  try {
    const row = await db
      .prepare(
        `SELECT *
         FROM content_decision_runs
         WHERE content_id = ?
         ORDER BY created_at ASC
         LIMIT 1`
      )
      .bind(contentId)
      .first();

    if (row && row.created_at) {
      const decisionTime =
        new Date(row.created_at).getTime();

      if (Number.isFinite(decisionTime)) {
        return new Date(decisionTime).toISOString();
      }
    }
  } catch (_) {}

  if (contentCreatedAt) {
    const contentTime =
      new Date(contentCreatedAt).getTime();

    if (Number.isFinite(contentTime)) {
      return new Date(contentTime).toISOString();
    }
  }

  return new Date().toISOString();
}

/*
 * FEEDBACK INTEGRATION V2.3
 *
 * Feedback is operational state only.
 * It is NEVER included in behavior metrics.
 */
async function getPendingFeedback(
  db,
  contentId
) {
  try {
    const row = await db
      .prepare(
        `SELECT
          id,
          execution_id,
          content_id,
          action_name AS action_code,
          NULL AS action_target,
          NULL AS execution_code,
          execution_status,
          NULL AS expected_outcome,
          outcome AS actual_outcome,
          outcome_status,
          operator_note,
          measurement_required,
          measurement_completed,
          result_payload AS feedback_payload,
          created_at,
          created_at AS updated_at
         FROM feedback_records
         WHERE content_id = ?
           AND measurement_required = 1
           AND measurement_completed = 0
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .bind(contentId)
      .first();

    return row || null;
  } catch (_) {
    return null;
  }
}

async function markFeedbackMeasurementCompleted(
  db,
  feedbackId
) {
  if (!feedbackId) {
    return {
      success: false,
      updated: false,
      reason: "NO_FEEDBACK_ID"
    };
  }

  try {
    const updatedAt =
      new Date().toISOString();

    await db
      .prepare(
        `UPDATE feedback_records SET measurement_completed = 1 WHERE id = ?`)
      .bind(feedbackId)
      .run();

    const row =
      await db
        .prepare(
          `SELECT
            id,
            measurement_required,
            measurement_completed,
            created_at AS updated_at
           FROM feedback_records
           WHERE id = ?
           LIMIT 1`
        )
        .bind(feedbackId)
        .first();

    if (!row) {
      return {
        success: false,
        updated: false,
        verified: false,
        reason:
          "FEEDBACK_RECORD_NOT_FOUND_AFTER_UPDATE"
      };
    }

    return {
      success: true,
      updated:
        Number(row.measurement_completed) === 1,
      verified:
        Number(row.measurement_completed) === 1,
      record_id:
        row.id,
      measurement_required:
        Number(row.measurement_required) === 1,
      measurement_completed:
        Number(row.measurement_completed) === 1,
      updated_at:
        row.updated_at
    };
  } catch (error) {
    return {
      success: false,
      updated: false,
      verified: false,
      reason:
        error?.message ||
        String(error)
    };
  }
}

async function getBehaviorEvents(db, measurementStart) {
  try {
    const result = await db
      .prepare(
        `SELECT *
         FROM behavior_events
         WHERE created_at >= ?
         ORDER BY created_at ASC`
      )
      .bind(measurementStart)
      .all();

    return result.results || [];
  } catch (_) {
    return [];
  }
}

function getContentEvents(events, contentId) {
  const targetContentId =
    stringValue(contentId);

  return events.filter((event) => {
    return (
      getEventContentId(event) ===
      targetContentId
    );
  });
}

function getClicks(events) {
  return events.filter((event) => {
    return (
      normalizeEventType(
        event.event_type
      ) ===
      "content_click"
    );
  });
}

function isAfterClick(event, click) {
  const eventTime =
    getEventTime(event);

  const clickTime =
    getEventTime(click);

  if (!eventTime || !clickTime) {
    return false;
  }

  const eventSession =
    getEventSessionId(event);

  const clickSession =
    getEventSessionId(click);

  if (!eventSession || !clickSession) {
    return false;
  }

  return (
    eventSession === clickSession &&
    eventTime >= clickTime
  );
}

function getDownstreamEvents(
  allEvents,
  clicks
) {
  if (!clicks.length) {
    return [];
  }

  return allEvents.filter((event) => {
    return clicks.some((click) => {
      return isAfterClick(
        event,
        click
      );
    });
  });
}

function uniqueValues(values) {
  return [
    ...new Set(
      values
        .filter(
          (value) =>
            value !== null &&
            value !== undefined &&
            stringValue(value) !== ""
        )
        .map((value) =>
          stringValue(value)
        )
    )
  ];
}

function getCustomerIdsFromEvents(events) {
  const ids = [];

  for (const event of events) {
    const type =
      normalizeEventType(
        event.event_type
      );

    if (
      type === "customer" ||
      type === "customer_created" ||
      type === "lead_created"
    ) {
      if (event.customer_id) {
        ids.push(
          event.customer_id
        );
      }
    }
  }

  return uniqueValues(ids);
}

async function getCustomerIds(
  db,
  downstreamEvents,
  clicks
) {
  const eventCustomerIds =
    getCustomerIdsFromEvents(
      downstreamEvents
    );

  if (eventCustomerIds.length) {
    return eventCustomerIds;
  }

  const clickSessions =
    uniqueValues(
      clicks.map((event) =>
        getEventSessionId(event)
      )
    );

  if (!clickSessions.length) {
    return [];
  }

  try {
    const placeholders =
      clickSessions
        .map(() => "?")
        .join(",");

    const result =
      await db
        .prepare(
          `SELECT id
           FROM customers
           WHERE session_id IN (${placeholders})`
        )
        .bind(
          ...clickSessions
        )
        .all();

    return uniqueValues(
      (result.results || []).map(
        (row) => row.id
      )
    );
  } catch (_) {
    return [];
  }
}

async function getOrders(
  db,
  customerIds,
  measurementStart
) {
  if (!customerIds.length) {
    return {
      orders: 0,
      revenue: 0
    };
  }

  try {
    const placeholders =
      customerIds
        .map(() => "?")
        .join(",");

    const row =
      await db
        .prepare(
          `SELECT
             COUNT(*) AS orders,
             COALESCE(
               SUM(amount),
               0
             ) AS revenue
           FROM orders
           WHERE customer_id IN (${placeholders})
             AND created_at >= ?`
        )
        .bind(
          ...customerIds,
          measurementStart
        )
        .first();

    return {
      orders:
        numberValue(
          row &&
          row.orders
        ),

      revenue:
        numberValue(
          row &&
          row.revenue
        )
    };
  } catch (_) {
    return {
      orders: 0,
      revenue: 0
    };
  }
}

function percentage(
  numerator,
  denominator
) {
  if (denominator <= 0) {
    return 0;
  }

  return Number(
    (
      (numerator / denominator) *
      100
    ).toFixed(2)
  );
}

function determineStatus(metrics) {
  if (
    metrics.orders > 0 &&
    metrics.revenue > 0
  ) {
    return "CONVERTING";
  }

  if (
    metrics.attention > 0 ||
    metrics.clicks > 0 ||
    metrics.product_views > 0 ||
    metrics.engagements > 0
  ) {
    return "MEASURED";
  }

  return "WAITING_FOR_TRAFFIC";
}

async function insertMeasurement(
  db,
  measurement
) {
  await db
    .prepare(
      `INSERT INTO content_measurements (
        id,
        content_id,
        measured_at,
        measurement_start,
        attention,
        product_views,
        clicks,
        engagements,
        customers,
        orders,
        revenue,
        attention_to_view,
        view_to_click,
        click_to_customer,
        customer_to_order,
        status,
        attribution_mode,
        created_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?
      )`
    )
    .bind(
      measurement.id,
      measurement.content_id,
      measurement.measured_at,
      measurement.measurement_start,
      measurement.attention,
      measurement.product_views,
      measurement.clicks,
      measurement.engagements,
      measurement.customers,
      measurement.orders,
      measurement.revenue,
      measurement.attention_to_view,
      measurement.view_to_click,
      measurement.click_to_customer,
      measurement.customer_to_order,
      measurement.status,
      measurement.attribution_mode,
      measurement.created_at
    )
    .run();
}

async function measure(
  db,
  requestedContentId
) {
  const content =
    await getContent(
      db,
      requestedContentId
    );

  if (!content) {
    throw new Error(
      "No content found in content_engine"
    );
  }

  const contentId =
    stringValue(content.id);

  /*
   * STEP 1
   * Read pending Feedback before measurement.
   */
  const pendingFeedback =
    await getPendingFeedback(
      db,
      contentId
    );

  const measurementStart =
    await getMeasurementStart(
      db,
      contentId,
      content.created_at
    );

  /*
   * STEP 2
   * Normal Measurement V2.2 behavior pipeline.
   *
   * Feedback is NOT read as behavior.
   */
  const allEvents =
    await getBehaviorEvents(
      db,
      measurementStart
    );

  const contentEvents =
    getContentEvents(
      allEvents,
      contentId
    );

  const clicks =
    getClicks(
      contentEvents
    );

  const downstreamEvents =
    getDownstreamEvents(
      allEvents,
      clicks
    );

  const productViews =
    downstreamEvents.filter(
      (event) => {
        return (
          normalizeEventType(
            event.event_type
          ) ===
          "product_view"
        );
      }
    );

  const engagements =
    contentEvents.filter(
      (event) => {
        return isEngagementType(
          normalizeEventType(
            event.event_type
          )
        );
      }
    );

  const downstreamEngagements =
    downstreamEvents.filter(
      (event) => {
        return isEngagementType(
          normalizeEventType(
            event.event_type
          )
        );
      }
    );

  const customerIds =
    await getCustomerIds(
      db,
      downstreamEvents,
      clicks
    );

  const orderData =
    await getOrders(
      db,
      customerIds,
      measurementStart
    );

  /*
   * ATTENTION V2.2
   *
   * content_view  = 1
   * content_click = 3
   * product_view  = 4
   * engagement    = 5
   */
  const attention =
    calculateAttentionScore(
      contentEvents
    );

  const attentionBreakdown =
    buildAttentionBreakdown(
      contentEvents
    );

  const metrics = {
    attention,

    product_views:
      productViews.length,

    clicks:
      clicks.length,

    engagements:
      engagements.length +
      downstreamEngagements.length,

    customers:
      customerIds.length,

    orders:
      orderData.orders,

    revenue:
      orderData.revenue
  };

  const conversions = {
    attention_to_view:
      percentage(
        metrics.product_views,
        metrics.attention
      ),

    view_to_click:
      percentage(
        metrics.clicks,
        metrics.product_views
      ),

    click_to_customer:
      percentage(
        metrics.customers,
        metrics.clicks
      ),

    customer_to_order:
      percentage(
        metrics.orders,
        metrics.customers
      )
  };

  const status =
    determineStatus(
      metrics
    );

  const measuredAt =
    new Date().toISOString();

  const measurementId =
    makeId();

  /*
   * STEP 3
   * Persist normal Measurement.
   */
  await insertMeasurement(
    db,
    {
      id:
        measurementId,

      content_id:
        contentId,

      measured_at:
        measuredAt,

      measurement_start:
        measurementStart,

      attention:
        metrics.attention,

      product_views:
        metrics.product_views,

      clicks:
        metrics.clicks,

      engagements:
        metrics.engagements,

      customers:
        metrics.customers,

      orders:
        metrics.orders,

      revenue:
        metrics.revenue,

      attention_to_view:
        conversions.attention_to_view,

      view_to_click:
        conversions.view_to_click,

      click_to_customer:
        conversions.click_to_customer,

      customer_to_order:
        conversions.customer_to_order,

      status,

      attribution_mode:
        ATTRIBUTION_MODE,

      created_at:
        measuredAt
    }
  );

  /*
   * STEP 4
   * If Feedback requested a Measurement cycle,
   * mark that Feedback as completed ONLY AFTER
   * the Measurement record has been successfully saved.
   */
  let feedbackIntegration = {
    detected: false,
    completed: false,
    verified: false,
    record_id: null,
    measurement_required: false,
    measurement_completed: false
  };

  if (pendingFeedback) {
    const completion =
      await markFeedbackMeasurementCompleted(
        db,
        pendingFeedback.id
      );

    feedbackIntegration = {
      detected: true,

      completed:
        Boolean(
          completion.updated
        ),

      verified:
        Boolean(
          completion.verified
        ),

      record_id:
        pendingFeedback.id,

      execution_id:
        pendingFeedback.execution_id ||
        null,

      action_code:
        pendingFeedback.action_code ||
        null,

      action_target:
        pendingFeedback.action_target ||
        null,

      actual_outcome:
        pendingFeedback.actual_outcome ||
        null,

      outcome_status:
        pendingFeedback.outcome_status ||
        null,

      measurement_required:
        completion.measurement_required !==
        undefined
          ? completion.measurement_required
          : true,

      measurement_completed:
        Boolean(
          completion.measurement_completed
        ),

      updated_at:
        completion.updated_at ||
        null
    };
  }

  return {
    success: true,

    layer:
      LAYER,

    version:
      "2.3",

    previous_version:
      PREVIOUS_LAYER,

    content: {
      id:
        content.id,

      title:
        content.title || null,

      status:
        content.status || null
    },

    measurement: {
      id:
        measurementId,

      content_id:
        contentId,

      measured_at:
        measuredAt,

      measurement_start:
        measurementStart,

      attention:
        metrics.attention,

      product_views:
        metrics.product_views,

      clicks:
        metrics.clicks,

      engagements:
        metrics.engagements,

      customers:
        metrics.customers,

      orders:
        metrics.orders,

      revenue:
        metrics.revenue,

      attention_to_view:
        conversions.attention_to_view,

      view_to_click:
        conversions.view_to_click,

      click_to_customer:
        conversions.click_to_customer,

      customer_to_order:
        conversions.customer_to_order,

      status,

      attribution_mode:
        ATTRIBUTION_MODE
    },

    attention: {
      definition:
        "Weighted behavioral signal, not content_view count",

      formula:
        "content_view×1 + content_click×3 + product_view×4 + engagement×5",

      weights:
        ATTENTION_WEIGHTS,

      breakdown:
        attentionBreakdown
    },

    feedback_integration: {
      layer:
        "FEEDBACK_LAYER_V1.1",

      role:
        "Operational handoff only",

      counted_as_behavior:
        false,

      counted_as_attention:
        false,

      alters_funnel_metrics:
        false,

      pending_feedback_before_measurement:
        Boolean(pendingFeedback),

      result:
        feedbackIntegration
    },

    diagnostics: {
      total_behavior_events:
        allEvents.length,

      content_events:
        contentEvents.length,

      content_views:
        contentEvents.filter(
          (event) =>
            normalizeEventType(
              event.event_type
            ) ===
            "content_view"
        ).length,

      content_clicks:
        clicks.length,

      downstream_events:
        downstreamEvents.length,

      attributed_product_views:
        productViews.length,

      attributed_customers:
        customerIds.length,

      attributed_orders:
        orderData.orders,

      attribution_mode:
        ATTRIBUTION_MODE,

      winner_decision:
        "NOT_DECLARED_IN_V2.3"
    },

    source_chain: [
      "FEEDBACK_LAYER_V1.1",
      "CONTENT_MEASUREMENT_ENGINE_V2.3"
    ],

    guardrails: {
      reads_raw_behavior_events:
        true,

      feedback_used_as_behavior:
        false,

      feedback_used_as_attention:
        false,

      recalculates_from_feedback:
        false,

      winner_declared:
        false,

      strategy_changed:
        false,

      decision_created:
        false,

      action_executed:
        false,

      automatic_execution:
        false,

      feedback_measurement_completed:
        Boolean(
          feedbackIntegration.completed &&
          feedbackIntegration.verified
        )
    },

    loop: {
      current_layer:
        "MEASUREMENT_V2.3",

      previous_layer:
        "FEEDBACK_V1.1",

      next_layer:
        "INTELLIGENCE_V2",

      feedback_detected:
        Boolean(pendingFeedback),

      feedback_completed:
        Boolean(
          feedbackIntegration.completed &&
          feedbackIntegration.verified
        ),

      closed:
        Boolean(
          pendingFeedback &&
          feedbackIntegration.completed &&
          feedbackIntegration.verified
        )
    }
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

    const result =
      await measure(
        context.env.DB,
        contentId
      );

    return json({
      ...result,
      mode:
        "preview"
    });
  } catch (error) {
    return json(
      {
        success: false,

        layer:
          LAYER,

        version:
          "2.3",

        error:
          error &&
          error.message
            ? error.message
            : String(error)
      },
      500
    );
  }
}

export async function onRequestPost(
  context
) {
  try {
    let body = {};

    try {
      body =
        await context.request.json();
    } catch (_) {}

    const contentId =
      body &&
      body.content_id
        ? body.content_id
        : null;

    const result =
      await measure(
        context.env.DB,
        contentId
      );

    return json({
      ...result,
      mode:
        "execute"
    });
  } catch (error) {
    return json(
      {
        success: false,

        layer:
          LAYER,

        version:
          "2.3",

        error:
          error &&
          error.message
            ? error.message
            : String(error)
      },
      500
    );
  }
}
