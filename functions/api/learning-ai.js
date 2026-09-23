// TATO-OS
// Learning AI V2.0
// Route: /api/learning-ai
// Contract:
// CONTENT MEASUREMENT V2.1
//        ↓
// LEARNING AI V2
//        ↓
// DECISION ENGINE V1.5

const MODEL = "@cf/zai-org/glm-4.7-flash";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const LAYER = "LEARNING_AI_V2";
const VERSION = "2.0";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: HEADERS
  });
}

function id() {
  return crypto.randomUUID();
}

function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

function s(value) {
  return value == null ? "" : String(value);
}

function upper(value) {
  return s(value).trim().toUpperCase();
}

function safeJSON(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function extractText(response) {
  if (!response) return null;

  if (typeof response === "string") {
    return response.trim() || null;
  }

  if (typeof response.response === "string") {
    return response.response.trim() || null;
  }

  if (
    response.result &&
    typeof response.result.response === "string"
  ) {
    return response.result.response.trim() || null;
  }

  if (typeof response.content === "string") {
    return response.content.trim() || null;
  }

  if (Array.isArray(response.content)) {
    const value = response.content
      .map(item => {
        if (typeof item === "string") return item;

        if (
          item &&
          typeof item.text === "string"
        ) {
          return item.text;
        }

        if (
          item &&
          typeof item.content === "string"
        ) {
          return item.content;
        }

        return "";
      })
      .join("\n")
      .trim();

    if (value) return value;
  }

  const message = response?.choices?.[0]?.message;

  if (message) {
    if (typeof message.content === "string") {
      return message.content.trim() || null;
    }

    if (Array.isArray(message.content)) {
      const value = message.content
        .map(item => {
          if (typeof item === "string") return item;

          if (
            item &&
            typeof item.text === "string"
          ) {
            return item.text;
          }

          return "";
        })
        .join("\n")
        .trim();

      if (value) return value;
    }
  }

  if (typeof response.output_text === "string") {
    return response.output_text.trim() || null;
  }

  return null;
}

function parseJSON(value) {
  if (!value) return null;

  let text = s(value)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(text);

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed;
    }
  } catch (_) {}

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(
        text.slice(start, end + 1)
      );

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return parsed;
      }
    } catch (_) {}
  }

  return null;
}

function normalizeMeasurement(row) {
  if (!row) return null;

  const metrics = safeJSON(
    row.metrics,
    null
  );

  const learningSignal = safeJSON(
    row.learning_signal,
    null
  );

  const measurement = {
    id: s(row.id),
    content_id: s(row.content_id),
    measured_at: s(row.measured_at),
    measurement_start: s(row.measurement_start),
    attribution_mode: s(row.attribution_mode),

    attention: n(
      row.attention ??
      metrics?.attention
    ),

    product_views: n(
      row.product_views ??
      metrics?.product_views
    ),

    clicks: n(
      row.clicks ??
      metrics?.clicks
    ),

    engagements: n(
      row.engagements ??
      metrics?.engagements
    ),

    customers: n(
      row.customers ??
      metrics?.customers
    ),

    orders: n(
      row.orders ??
      metrics?.orders
    ),

    revenue: n(
      row.revenue ??
      metrics?.revenue
    ),

    learning_signal:
      learningSignal ||
      row.learning_signal ||
      null,

    winner_decision: s(
      row.winner_decision
    )
  };

  return measurement;
}

function conversions(m) {
  const rate = (a, b) =>
    b > 0
      ? Number(((a / b) * 100).toFixed(2))
      : 0;

  return {
    attention_to_product_view:
      rate(
        n(m.product_views),
        n(m.attention)
      ),

    product_view_to_click:
      rate(
        n(m.clicks),
        n(m.product_views)
      ),

    click_to_customer:
      rate(
        n(m.customers),
        n(m.clicks)
      ),

    customer_to_order:
      rate(
        n(m.orders),
        n(m.customers)
      )
  };
}

async function getContent(
  db,
  contentId = null
) {
  if (contentId) {
    try {
      const row = await db
        .prepare(`
          SELECT *
          FROM content_engine
          WHERE id = ?
          LIMIT 1
        `)
        .bind(contentId)
        .first();

      if (row) return row;
    } catch (_) {}
  }

  try {
    return await db
      .prepare(`
        SELECT *
        FROM content_engine
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .first();
  } catch (_) {
    return null;
  }
}

async function getLatestMeasurement(
  db,
  contentId = null
) {
  let row = null;

  if (contentId) {
    try {
      row = await db
        .prepare(`
          SELECT *
          FROM content_measurements
          WHERE content_id = ?
          ORDER BY measured_at DESC
          LIMIT 1
        `)
        .bind(contentId)
        .first();
    } catch (_) {}
  }

  if (!row) {
    try {
      row = await db
        .prepare(`
          SELECT *
          FROM content_measurements
          ORDER BY measured_at DESC
          LIMIT 1
        `)
        .first();
    } catch (_) {}
  }

  return normalizeMeasurement(row);
}

async function getMeasurementHistory(
  db,
  contentId,
  limit = 20
) {
  try {
    const rows = await db
      .prepare(`
        SELECT *
        FROM content_measurements
        WHERE content_id = ?
        ORDER BY measured_at DESC
        LIMIT ?
      `)
      .bind(contentId, limit)
      .all();

    return (rows.results || [])
      .map(normalizeMeasurement)
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function aggregateHistory(history) {
  const totals = {
    attention: 0,
    product_views: 0,
    clicks: 0,
    engagements: 0,
    customers: 0,
    orders: 0,
    revenue: 0
  };

  for (const m of history) {
    totals.attention += n(m.attention);
    totals.product_views += n(m.product_views);
    totals.clicks += n(m.clicks);
    totals.engagements += n(m.engagements);
    totals.customers += n(m.customers);
    totals.orders += n(m.orders);
    totals.revenue += n(m.revenue);
  }

  return totals;
}

function buildEvidence(
  latest,
  history,
  totals
) {
  const rounds = history.length;

  const persistentAttention =
    rounds >= 2 &&
    totals.attention > 0;

  const hasClick =
    totals.clicks > 0;

  const noProductView =
    totals.product_views === 0;

  const noCustomer =
    totals.customers === 0;

  const noOrder =
    totals.orders === 0;

  const noRevenue =
    totals.revenue === 0;

  const clickWithoutProductView =
    hasClick &&
    noProductView;

  const persistentFunnelBlock =
    persistentAttention &&
    clickWithoutProductView &&
    rounds >= 2;

  return {
    rounds,

    persistent_attention:
      persistentAttention,

    has_click:
      hasClick,

    no_product_view:
      noProductView,

    no_customer:
      noCustomer,

    no_order:
      noOrder,

    no_revenue:
      noRevenue,

    click_without_product_view:
      clickWithoutProductView,

    persistent_funnel_block:
      persistentFunnelBlock,

    latest_measurement_id:
      latest?.id || null,

    latest_measured_at:
      latest?.measured_at || null
  };
}

function fallbackAnalysis(
  content,
  latest,
  history,
  totals,
  evidence
) {
  let state = "OBSERVING";
  let confidence = "LOW";
  let priority = "LOW";

  let action = "WAIT";
  let direction =
    "เก็บ Measurement ต่อเพื่อเพิ่มหลักฐาน";

  let problem =
    "ยังมีข้อมูลไม่เพียงพอสำหรับเปลี่ยนกลยุทธ์";

  if (history.length === 0) {
    state = "NO_DATA";
    confidence = "LOW";
    priority = "LOW";
    action = "CONTINUE_MEASUREMENT";
    direction =
      "เริ่มเก็บ Measurement ของ Content";
    problem =
      "ยังไม่มี Content Measurement";
  } else if (
    evidence.persistent_funnel_block
  ) {
    state = "PERSISTENT_FUNNEL_BLOCK";
    confidence = "HIGH";
    priority = "HIGH";
    action = "INVESTIGATE_FUNNEL";
    direction =
      "ตรวจเส้นทางจาก Click ไป Product View";
    problem =
      "มี Attention และ Click แต่ยังไม่มี Product View ต่อเนื่อง";
  } else if (
    evidence.no_customer &&
    history.length >= 2
  ) {
    state = "PERSISTENT_NO_CUSTOMER";
    confidence = "MEDIUM";
    priority = "MEDIUM";
    action = "INVESTIGATE_CONVERSION";
    direction =
      "ตรวจเส้นทางจากพฤติกรรมไป Customer";
    problem =
      "ยังไม่มี Customer จาก Measurement ที่เก็บต่อเนื่อง";
  } else if (
    totals.attention > 0 ||
    totals.clicks > 0
  ) {
    state = "PATTERN_DETECTED";
    confidence = "MEDIUM";
    priority = "MEDIUM";
    action = "CONTINUE_MEASUREMENT";
    direction =
      "ติดตามพฤติกรรม downstream เพิ่ม";
    problem =
      "เริ่มมี behavioral signal แต่หลักฐาน conversion ยังไม่เพียงพอ";
  }

  return {
    measurement_id:
      latest?.id || null,

    content_id:
      content?.id || latest?.content_id || null,

    state,

    summary:
      state === "PERSISTENT_FUNNEL_BLOCK"
        ? "พบ Funnel Block ต่อเนื่องหลัง Click แต่ยังไม่เกิด Product View"
        : state === "PERSISTENT_NO_CUSTOMER"
        ? "พบพฤติกรรมจาก Content แต่ยังไม่เกิด Customer ต่อเนื่อง"
        : state === "NO_DATA"
        ? "ยังไม่มี Measurement สำหรับเรียนรู้"
        : "พบสัญญาณจาก Content แต่ยังต้องเก็บหลักฐานเพิ่ม",

    observed_signals: [
      `Measurement rounds = ${evidence.rounds}`,
      `Attention = ${totals.attention}`,
      `Clicks = ${totals.clicks}`,
      `Product Views = ${totals.product_views}`,
      `Customers = ${totals.customers}`,
      `Orders = ${totals.orders}`,
      `Revenue = ${totals.revenue}`
    ],

    learning: {
      what_we_learned:
        problem,
      confidence
    },

    problems: [
      problem
    ],

    next_content: {
      action,
      direction,
      angle:
        content?.angle ||
        "เชื่อมความสนใจของลูกค้ากับความต้องการเรื่องกาแฟ",
      cta:
        content?.cta ||
        "ดูรายละเอียดและทดลอง TATO",
      success_metric:
        evidence.click_without_product_view
          ? "Product Views"
          : "Customers"
    },

    next_action: {
      type: action,
      reason: direction
    },

    priority,

    evidence: {
      ...evidence,
      totals
    },

    guardrails: {
      winner_declared: false,
      automatic_execution: false,
      strategy_change_automatic: false,
      requires_human_approval: true
    }
  };
}

function buildPrompt(
  content,
  latest,
  history,
  totals,
  conversionsData,
  evidence
) {
  return `
คุณคือ Learning AI ของ TATO Coffee

วิเคราะห์เฉพาะหลักฐานจาก Content Measurement
ห้ามสร้างข้อมูลขึ้นเอง
ห้ามประกาศ Winner
ห้ามสั่ง Execute อัตโนมัติ
ห้ามเปลี่ยน Strategy โดยอัตโนมัติ

Content:
${JSON.stringify({
  id: content?.id || null,
  title: content?.title || null,
  status: content?.status || null,
  objective: content?.objective || null,
  attention_type: content?.attention_type || null,
  market_keyword: content?.market_keyword || null,
  angle: content?.angle || null,
  cta: content?.cta || null
})}

Latest Measurement:
${JSON.stringify(latest)}

Measurement History:
${JSON.stringify(history)}

Aggregated Evidence:
${JSON.stringify({
  totals,
  conversions: conversionsData,
  evidence
})}

ตอบ JSON เท่านั้น ตามโครงสร้างนี้:

{
  "measurement_id": "${s(latest?.id)}",
  "content_id": "${s(content?.id || latest?.content_id)}",
  "state": "OBSERVING",
  "summary": "สรุปสั้นภาษาไทย",
  "observed_signals": ["หลักฐาน"],
  "learning": {
    "what_we_learned": "สิ่งที่เรียนรู้จากหลักฐาน",
    "confidence": "LOW"
  },
  "problems": ["ปัญหาที่พบ"],
  "next_content": {
    "action": "CONTINUE_MEASUREMENT",
    "direction": "ทิศทาง",
    "angle": "มุม Content",
    "cta": "CTA",
    "success_metric": "Product Views"
  },
  "next_action": {
    "type": "CONTINUE_MEASUREMENT",
    "reason": "เหตุผล"
  },
  "priority": "LOW",
  "evidence": {
    "rounds": ${evidence.rounds},
    "attention": ${totals.attention},
    "clicks": ${totals.clicks},
    "product_views": ${totals.product_views},
    "customers": ${totals.customers},
    "orders": ${totals.orders},
    "revenue": ${totals.revenue}
  }
}

Allowed state:
NO_DATA
OBSERVING
PATTERN_DETECTED
PERSISTENT_FUNNEL_BLOCK
PERSISTENT_NO_CUSTOMER

Allowed action:
WAIT
CONTINUE_MEASUREMENT
INVESTIGATE_FUNNEL
INVESTIGATE_CONVERSION

Allowed priority:
LOW
MEDIUM
HIGH

ห้ามใช้ action:
DISTRIBUTE
OPTIMIZE
SCALE

เพราะ Learning AI มีหน้าที่เรียนรู้
ไม่ใช่ Execute
`;
}

async function analyze(env, requestedContentId = null) {
  if (!env.DB) {
    throw new Error(
      "D1 binding DB is missing"
    );
  }

  const content =
    await getContent(
      env.DB,
      requestedContentId
    );

  const contentId =
    content?.id ||
    requestedContentId ||
    null;

  const latest =
    await getLatestMeasurement(
      env.DB,
      contentId
    );

  if (!latest) {
    return {
      content,
      measurement: null,
      history: [],
      totals: {
        attention: 0,
        product_views: 0,
        clicks: 0,
        engagements: 0,
        customers: 0,
        orders: 0,
        revenue: 0
      },
      conversions: {},
      evidence: {
        rounds: 0
      },
      ai: {
        status: "NO_MEASUREMENT",
        model: MODEL,
        analysis: fallbackAnalysis(
          content,
          null,
          [],
          {
            attention: 0,
            product_views: 0,
            clicks: 0,
            engagements: 0,
            customers: 0,
            orders: 0,
            revenue: 0
          },
          {
            rounds: 0
          }
        ),
        debug: {
          ai_called: false,
          response_text_received: false,
          parsed_json: false,
          error: null
        }
      }
    };
  }

  const history =
    await getMeasurementHistory(
      env.DB,
      latest.content_id || contentId,
      20
    );

  const totals =
    aggregateHistory(history);

  const conversionData =
    conversions(latest);

  const evidence =
    buildEvidence(
      latest,
      history,
      totals
    );

  let analysisResult =
    fallbackAnalysis(
      content,
      latest,
      history,
      totals,
      evidence
    );

  let aiStatus =
    "FALLBACK_ANALYZED";

  let aiText = null;
  let aiError = null;

  if (env.AI) {
    try {
      const response =
        await env.AI.run(
          MODEL,
          {
            messages: [
              {
                role: "system",
                content:
                  "Return ONLY valid JSON. No markdown. Do not invent evidence."
              },
              {
                role: "user",
                content:
                  buildPrompt(
                    content,
                    latest,
                    history,
                    totals,
                    conversionData,
                    evidence
                  )
              }
            ],
            reasoning_effort: "low",
            max_completion_tokens: 1400,
            temperature: 0.1,
            response_format: {
              type: "json_object"
            }
          }
        );

      aiText =
        extractText(response);

      const parsed =
        parseJSON(aiText);

      if (parsed) {
        analysisResult = {
          ...analysisResult,
          ...parsed,

          measurement_id:
            latest.id,

          content_id:
            content?.id ||
            latest.content_id ||
            null,

          evidence: {
            ...analysisResult.evidence,
            ...(parsed.evidence || {})
          },

          guardrails: {
            winner_declared: false,
            automatic_execution: false,
            strategy_change_automatic: false,
            requires_human_approval: true
          }
        };

        aiStatus =
          "AI_ANALYZED";
      }
    } catch (error) {
      aiError =
        error?.message ||
        String(error);
    }
  } else {
    aiError =
      "Workers AI binding AI is missing; fallback analysis used";
  }

  return {
    content,
    measurement: latest,
    history,
    totals,
    conversions: conversionData,
    evidence,

    ai: {
      status: aiStatus,
      model: MODEL,
      analysis: analysisResult,

      debug: {
        ai_called:
          aiText !== null,

        response_text_received:
          !!aiText,

        parsed_json:
          aiStatus ===
          "AI_ANALYZED",

        error:
          aiError
      }
    }
  };
}

async function save(
  env,
  result
) {
  const runId = id();
  const insightId = id();
  const now =
    new Date().toISOString();

  const measurementId =
    result.measurement?.id ||
    result.ai?.analysis?.measurement_id ||
    null;

  const contentId =
    result.content?.id ||
    result.measurement?.content_id ||
    result.ai?.analysis?.content_id ||
    null;

  const input =
    JSON.stringify({
      layer: LAYER,
      version: VERSION,
      measurement_id: measurementId,
      content_id: contentId,
      measurement:
        result.measurement,
      history:
        result.history,
      totals:
        result.totals,
      conversions:
        result.conversions,
      evidence:
        result.evidence
    });

  const output =
    JSON.stringify({
      layer: LAYER,
      version: VERSION,

      measurement_id:
        measurementId,

      content_id:
        contentId,

      learning:
        result.ai.analysis,

      metrics: {
        latest:
          result.measurement,
        totals:
          result.totals
      },

      evidence:
        result.evidence,

      guardrails: {
        winner_declared: false,
        automatic_execution: false,
        strategy_change_automatic: false,
        requires_human_approval: true
      }
    });

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
      "LEARNING",
      result.ai.model ||
        MODEL,
      input,
      output,
      result.ai.status,
      null,
      now
    )
    .run();

  const priority =
    upper(
      result.ai.analysis?.priority
    ) || "LOW";

  const score =
    priority === "HIGH"
      ? 90
      : priority === "MEDIUM"
      ? 60
      : 30;

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
      "LEARNING",
      "Learning AI V2 Analysis",
      output,
      score,
      priority,
      "NEW",
      now
    )
    .run();

  return {
    ...result,
    ai: {
      ...result.ai,
      run_id: runId,
      insight_id: insightId
    }
  };
}

export async function onRequestGet(context) {
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
      await analyze(
        context.env,
        contentId
      );

    return json({
      success: true,

      layer: LAYER,
      version: VERSION,

      mode: "preview",
      status: "ANALYZED",

      content:
        result.content
          ? {
              id:
                result.content.id,
              title:
                result.content.title,
              status:
                result.content.status
            }
          : null,

      measurement:
        result.measurement
          ? {
              id:
                result.measurement.id,
              content_id:
                result.measurement.content_id,
              measured_at:
                result.measurement.measured_at,
              attribution_mode:
                result.measurement.attribution_mode
            }
          : null,

      metrics: {
        latest:
          result.measurement,
        totals:
          result.totals
      },

      history: {
        rounds:
          result.history.length
      },

      conversion:
        result.conversions,

      evidence:
        result.evidence,

      ai:
        result.ai,

      next_step:
        result.ai.status ===
        "AI_ANALYZED"
          ? "AI Learning V2 preview ready. Run POST mode=execute to save."
          : "Fallback/measurement analysis ready."
    });
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

export async function onRequestPost(context) {
  try {
    let body = {};

    try {
      body =
        await context.request.json();
    } catch (_) {}

    const mode =
      body?.mode ||
      "preview";

    const contentId =
      body?.content_id ||
      null;

    const result =
      await analyze(
        context.env,
        contentId
      );

    if (mode === "execute") {
      const saved =
        await save(
          context.env,
          result
        );

      return json({
        success: true,

        layer: LAYER,
        version: VERSION,

        mode: "execute",
        status: "EXECUTED",

        content:
          saved.content
            ? {
                id:
                  saved.content.id,
                title:
                  saved.content.title,
                status:
                  saved.content.status
              }
            : null,

        measurement:
          saved.measurement,

        metrics: {
          latest:
            saved.measurement,
          totals:
            saved.totals
        },

        evidence:
          saved.evidence,

        ai:
          saved.ai,

        contract: {
          run_type:
            "LEARNING",
          measurement_id:
            saved.measurement?.id ||
            null,
          content_id:
            saved.content?.id ||
            saved.measurement?.content_id ||
            null
        },

        next_step:
          "Learning AI V2 saved. Decision Engine V1.5 can consume run_type=LEARNING."
      });
    }

    return json({
      success: true,

      layer: LAYER,
      version: VERSION,

      mode: "preview",
      status: "ANALYZED",

      content:
        result.content
          ? {
              id:
                result.content.id,
              title:
                result.content.title,
              status:
                result.content.status
            }
          : null,

      measurement:
        result.measurement,

      metrics: {
        latest:
          result.measurement,
        totals:
          result.totals
      },

      evidence:
        result.evidence,

      ai:
        result.ai,

      next_step:
        "Learning AI V2 preview ready. Run POST mode=execute to save."
    });
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
