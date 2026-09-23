const HEADERS = {
"Content-Type": "application/json; charset=utf-8",
"Cache-Control": "no-store"
};

const LAYER = "INTELLIGENCE_LAYER_V2";
const VERSION = "2.0";

function json(data, status = 200) {
return new Response(JSON.stringify(data, null, 2), {
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

function pct(a, b) {
return b > 0 ? Number(((a / b) * 100).toFixed(2)) : 0;
}

function parseJSON(value, fallback = {}) {
if (!value) return fallback;

try {
const parsed = JSON.parse(value);
return parsed && typeof parsed === "object" ? parsed : fallback;
} catch (_) {
return fallback;
}
}

async function getContent(db, contentId) {
if (contentId) {
return await db.prepare(`       SELECT *
      FROM content_engine
      WHERE id = ?
      LIMIT 1
    `).bind(contentId).first();
}

return await db.prepare(`     SELECT *
    FROM content_engine
    ORDER BY created_at DESC
    LIMIT 1
  `).first();
}

async function getMeasurements(db, contentId) {
if (contentId) {
const result = await db.prepare(`       SELECT *
      FROM content_measurements
      WHERE content_id = ?
      ORDER BY measured_at ASC
    `).bind(contentId).all();

```
return result.results || [];
```

}

const result = await db.prepare(`     SELECT *
    FROM content_measurements
    ORDER BY measured_at ASC
  `).all();

return result.results || [];
}

function measurementMetrics(rows) {
const totals = {
attention: 0,
product_views: 0,
clicks: 0,
engagements: 0,
customers: 0,
orders: 0,
revenue: 0
};

for (const row of rows) {
totals.attention += n(row.attention);
totals.product_views += n(row.product_views);
totals.clicks += n(row.clicks);
totals.engagements += n(row.engagements);
totals.customers += n(row.customers);
totals.orders += n(row.orders);
totals.revenue += n(row.revenue);
}

return totals;
}

function latestMetrics(rows) {
if (!rows.length) {
return {
attention: 0,
product_views: 0,
clicks: 0,
engagements: 0,
customers: 0,
orders: 0,
revenue: 0
};
}

const row = rows[rows.length - 1];

return {
attention: n(row.attention),
product_views: n(row.product_views),
clicks: n(row.clicks),
engagements: n(row.engagements),
customers: n(row.customers),
orders: n(row.orders),
revenue: n(row.revenue)
};
}

function calculateRates(metrics) {
return {
attention_to_product_view: pct(
metrics.product_views,
metrics.attention
),

```
product_view_to_click: pct(
  metrics.clicks,
  metrics.product_views
),

click_to_customer: pct(
  metrics.customers,
  metrics.clicks
),

customer_to_order: pct(
  metrics.orders,
  metrics.customers
),

engagement_to_order: pct(
  metrics.orders,
  metrics.engagements
)
```

};
}

function detectPatterns(rows, totals, latest) {
const patterns = [];

const count = rows.length;

if (
count >= 2 &&
totals.attention > 0 &&
totals.product_views === 0
) {
patterns.push({
type: "PERSISTENT_ATTENTION_WITHOUT_PRODUCT_VIEW",
severity: "HIGH",
evidence: {
measurement_rounds: count,
attention: totals.attention,
product_views: totals.product_views
}
});
}

if (
count >= 2 &&
totals.clicks > 0 &&
totals.product_views === 0
) {
patterns.push({
type: "CLICK_WITHOUT_PRODUCT_VIEW",
severity: "HIGH",
evidence: {
measurement_rounds: count,
clicks: totals.clicks,
product_views: totals.product_views
}
});
}

if (
count >= 3 &&
totals.attention > 0 &&
totals.customers === 0
) {
patterns.push({
type: "NO_CUSTOMER_AFTER_REPEATED_MEASUREMENT",
severity: "MEDIUM",
evidence: {
measurement_rounds: count,
attention: totals.attention,
customers: totals.customers
}
});
}

if (
count >= 3 &&
totals.attention > 0 &&
totals.orders === 0
) {
patterns.push({
type: "NO_ORDER_AFTER_REPEATED_MEASUREMENT",
severity: "MEDIUM",
evidence: {
measurement_rounds: count,
attention: totals.attention,
orders: totals.orders
}
});
}

if (
count >= 3 &&
totals.attention > 0 &&
totals.revenue === 0
) {
patterns.push({
type: "NO_REVENUE_AFTER_REPEATED_MEASUREMENT",
severity: "MEDIUM",
evidence: {
measurement_rounds: count,
attention: totals.attention,
revenue: totals.revenue
}
});
}

if (
latest.attention > 0 &&
latest.clicks > 0 &&
latest.product_views === 0
) {
patterns.push({
type: "CURRENT_FUNNEL_BLOCK_CLICK_TO_PRODUCT_VIEW",
severity: "HIGH",
evidence: {
attention: latest.attention,
clicks: latest.clicks,
product_views: latest.product_views
}
});
}

return patterns;
}

function determineState(rows, totals, patterns) {
if (!rows.length) {
return "NO_DATA";
}

if (
totals.attention > 0 &&
totals.clicks > 0 &&
totals.product_views === 0 &&
rows.length >= 2
) {
return "PERSISTENT_FUNNEL_BLOCK";
}

if (
totals.attention > 0 &&
totals.customers === 0 &&
rows.length >= 3
) {
return "PERSISTENT_NO_CUSTOMER";
}

if (patterns.length > 0) {
return "PATTERN_DETECTED";
}

return "OBSERVING";
}

function trend(rows) {
if (rows.length < 2) {
return {
available: false,
direction: "INSUFFICIENT_DATA"
};
}

const first = rows[0];
const last = rows[rows.length - 1];

const firstAttention = n(first.attention);
const lastAttention = n(last.attention);

const firstClicks = n(first.clicks);
const lastClicks = n(last.clicks);

const firstViews = n(first.product_views);
const lastViews = n(last.product_views);

return {
available: true,

```
attention: {
  first: firstAttention,
  latest: lastAttention,
  change: lastAttention - firstAttention
},

clicks: {
  first: firstClicks,
  latest: lastClicks,
  change: lastClicks - firstClicks
},

product_views: {
  first: firstViews,
  latest: lastViews,
  change: lastViews - firstViews
}
```

};
}

function buildRecommendation(state, patterns, totals, latest) {
if (state === "NO_DATA") {
return {
type: "WAIT",
reason: "ยังไม่มี Measurement data เพียงพอสำหรับ Intelligence",
priority: "LOW"
};
}

if (state === "PERSISTENT_FUNNEL_BLOCK") {
return {
type: "INVESTIGATE_FUNNEL",
reason:
"พบ Attention และ Click ซ้ำหลายรอบ แต่ยังไม่มี Product View จึงควรตรวจสอบเส้นทาง Click → Product View ก่อนเปลี่ยนกลยุทธ์",
priority: "HIGH"
};
}

if (state === "PERSISTENT_NO_CUSTOMER") {
return {
type: "INVESTIGATE_CONVERSION",
reason:
"มี Attention ต่อเนื่องแต่ยังไม่มี Customer หลังหลายรอบ Measurement ควรตรวจสอบข้อเสนอ CTA และเส้นทางการเปลี่ยนความสนใจเป็นลูกค้า",
priority: "MEDIUM"
};
}

if (
totals.orders > 0 ||
totals.revenue > 0
) {
return {
type: "CONTINUE_MEASUREMENT",
reason:
"มีหลักฐาน Conversion แล้ว ควรเก็บ Measurement ต่อเพื่อดูความสม่ำเสมอของผล",
priority: "HIGH"
};
}

if (
latest.attention > 0 ||
latest.clicks > 0 ||
latest.product_views > 0
) {
return {
type: "CONTINUE_MEASUREMENT",
reason:
"ระบบตรวจพบ Behavioral Signal แล้ว แต่ยังมีข้อมูลไม่เพียงพอสำหรับสรุปผลระยะยาว",
priority: "MEDIUM"
};
}

return {
type: "CONTINUE_MEASUREMENT",
reason:
"ยังไม่พบหลักฐานเพียงพอสำหรับเปลี่ยนกลยุทธ์",
priority: "LOW"
};
}

async function getContradictions(db, contentId) {
const contradictions = [];

try {
let result;

```
if (contentId) {
  result = await db.prepare(`
    SELECT *
    FROM ai_runs
    WHERE run_type = 'LEARNING'
      AND (
        output_data LIKE ?
        OR input_data LIKE ?
      )
    ORDER BY created_at DESC
    LIMIT 20
  `)
  .bind(`%${contentId}%`, `%${contentId}%`)
  .all();
} else {
  result = await db.prepare(`
    SELECT *
    FROM ai_runs
    WHERE run_type = 'LEARNING'
    ORDER BY created_at DESC
    LIMIT 20
  `).all();
}

for (const row of result.results || []) {
  const output = parseJSON(row.output_data, {});
  const text = JSON.stringify(output).toLowerCase();

  if (
    text.includes("no click") &&
    !text.includes('"clicks":0')
  ) {
    contradictions.push({
      type: "AI_TEXT_METRIC_CONTRADICTION",
      run_id: row.id,
      note:
        "AI narrative mentions no click while stored measurement may contain click activity"
    });
  }
}
```

} catch (_) {}

return contradictions;
}

async function buildIntelligence(env, contentId) {
if (!env.DB) {
throw new Error("D1 binding DB is missing");
}

const content = await getContent(env.DB, contentId);
const measurements = await getMeasurements(
env.DB,
content?.id || contentId || null
);

const totals = measurementMetrics(measurements);
const latest = latestMetrics(measurements);
const rates = calculateRates(totals);
const latestRates = calculateRates(latest);
const patterns = detectPatterns(
measurements,
totals,
latest
);

const state = determineState(
measurements,
totals,
patterns
);

const trendData = trend(measurements);

const recommendation = buildRecommendation(
state,
patterns,
totals,
latest
);

const contradictions = await getContradictions(
env.DB,
content?.id || contentId || null
);

return {
state,

```
content: content
  ? {
      id: content.id,
      title: content.title,
      status: content.status,
      objective: content.objective,
      attention_type: content.attention_type,
      market_keyword: content.market_keyword,
      angle: content.angle,
      cta: content.cta
    }
  : null,

measurement: {
  rounds: measurements.length,
  first_measurement_id:
    measurements[0]?.id || null,
  latest_measurement_id:
    measurements[measurements.length - 1]?.id || null,
  first_measured_at:
    measurements[0]?.measured_at || null,
  latest_measured_at:
    measurements[measurements.length - 1]?.measured_at || null
},

cumulative_metrics: totals,

latest_metrics: latest,

cumulative_conversion: rates,

latest_conversion: latestRates,

trend: trendData,

patterns,

contradictions,

recommendation,

guardrails: {
  winner_declared: false,
  automatic_execution: false,
  strategy_change_automatic: false,
  requires_human_approval: true
}
```

};
}

async function saveIntelligence(env, intelligence) {
const runId = id();
const insightId = id();
const now = new Date().toISOString();

const output = JSON.stringify(intelligence);

await env.DB.prepare(`     INSERT INTO ai_runs (
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
"INTELLIGENCE",
"RULE_BASED_INTELLIGENCE_V2",
JSON.stringify({
content_id: intelligence.content?.id || null,
measurement_rounds:
intelligence.measurement.rounds
}),
output,
"COMPLETED",
null,
now
)
.run();

const priority =
s(intelligence.recommendation?.priority)
.toUpperCase() || "LOW";

const score =
priority === "HIGH"
? 90
: priority === "MEDIUM"
? 60
: 30;

await env.DB.prepare(`     INSERT INTO ai_insights (
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
"INTELLIGENCE",
"INTELLIGENCE",
"TATO Intelligence Layer V2",
output,
score,
priority,
"NEW",
now
)
.run();

return {
run_id: runId,
insight_id: insightId
};
}

export async function onRequestGet(context) {
try {
const url = new URL(context.request.url);
const contentId =
url.searchParams.get("content_id") || null;

```
const intelligence = await buildIntelligence(
  context.env,
  contentId
);

return json({
  success: true,
  layer: LAYER,
  version: VERSION,
  mode: "preview",
  intelligence
});
```

} catch (error) {
return json(
{
success: false,
layer: LAYER,
version: VERSION,
error: error?.message || String(error)
},
500
);
}
}

export async function onRequestPost(context) {
try {
let body = {};

```
try {
  body = await context.request.json();
} catch (_) {}

const contentId =
  body?.content_id || null;

const intelligence = await buildIntelligence(
  context.env,
  contentId
);

const saved = await saveIntelligence(
  context.env,
  intelligence
);

return json({
  success: true,
  layer: LAYER,
  version: VERSION,
  mode: "execute",
  status: "SAVED",
  intelligence,
  saved,
  next_step:
    "Use Intelligence output as evidence for cumulative Decision Policy."
});
```

} catch (error) {
return json(
{
success: false,
layer: LAYER,
version: VERSION,
error: error?.message || String(error)
},
500
);
}
}
