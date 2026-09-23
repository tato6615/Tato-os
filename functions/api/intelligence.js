const LAYER = "INTELLIGENCE_LAYER_V2";
const VERSION = "2.0";

function json(data, status = 200) {
return new Response(JSON.stringify(data, null, 2), {
status,
headers: { "content-type": "application/json; charset=utf-8" }
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
if (!b) return 0;
return Number(((a / b) * 100).toFixed(2));
}

function parseJSON(value, fallback = {}) {
try {
return value ? JSON.parse(value) : fallback;
} catch {
return fallback;
}
}

async function getContent(db, contentId) {
if (!contentId) return null;

return await db
.prepare(`       SELECT *
      FROM content_engine
      WHERE id = ?
      LIMIT 1
    `)
.bind(contentId)
.first();
}

async function getMeasurements(db, contentId) {
if (!contentId) return [];

const result = await db
.prepare(`       SELECT *
      FROM content_measurements
      WHERE content_id = ?
      ORDER BY measured_at ASC, created_at ASC
    `)
.bind(contentId)
.all();

return result.results || [];
}

function measurementMetrics(rows) {
const totals = {
rounds: rows.length,
attention: 0,
clicks: 0,
product_views: 0,
engagements: 0,
customers: 0,
orders: 0,
revenue: 0
};

for (const row of rows) {
totals.attention += n(row.attention);
totals.clicks += n(row.clicks);
totals.product_views += n(row.product_views);
totals.engagements += n(row.engagements);
totals.customers += n(row.customers);
totals.orders += n(row.orders);
totals.revenue += n(row.revenue);
}

totals.revenue = Number(totals.revenue.toFixed(2));

return totals;
}

function latestMetrics(rows) {
if (!rows.length) {
return {
attention: 0,
clicks: 0,
product_views: 0,
engagements: 0,
customers: 0,
orders: 0,
revenue: 0
};
}

const row = rows[rows.length - 1];

return {
attention: n(row.attention),
clicks: n(row.clicks),
product_views: n(row.product_views),
engagements: n(row.engagements),
customers: n(row.customers),
orders: n(row.orders),
revenue: n(row.revenue)
};
}

function calculateRates(metrics) {
return {
click_from_attention_pct: pct(
metrics.clicks,
metrics.attention
),

```
product_view_from_click_pct: pct(
  metrics.product_views,
  metrics.clicks
),

customer_from_product_view_pct: pct(
  metrics.customers,
  metrics.product_views
),

order_from_customer_pct: pct(
  metrics.orders,
  metrics.customers
),

revenue_per_order: metrics.orders
  ? Number((metrics.revenue / metrics.orders).toFixed(2))
  : 0
```

};
}

function detectPatterns(rows, totals, latest) {
const patterns = [];

if (
totals.rounds >= 2 &&
totals.attention > 0 &&
totals.product_views === 0
) {
patterns.push({
code: "PERSISTENT_ATTENTION_WITHOUT_PRODUCT_VIEW",
severity: "HIGH",
evidence: {
rounds: totals.rounds,
attention: totals.attention,
product_views: totals.product_views
}
});
}

if (
totals.clicks > 0 &&
totals.product_views === 0
) {
patterns.push({
code: "CLICK_WITHOUT_PRODUCT_VIEW",
severity: "HIGH",
evidence: {
clicks: totals.clicks,
product_views: totals.product_views
}
});
}

if (
totals.rounds >= 2 &&
totals.attention > 0 &&
totals.customers === 0
) {
patterns.push({
code: "NO_CUSTOMER_AFTER_REPEATED_MEASUREMENT",
severity: "MEDIUM",
evidence: {
rounds: totals.rounds,
attention: totals.attention,
customers: totals.customers
}
});
}

if (
totals.rounds >= 2 &&
totals.orders === 0
) {
patterns.push({
code: "NO_ORDER_AFTER_REPEATED_MEASUREMENT",
severity: "MEDIUM",
evidence: {
rounds: totals.rounds,
orders: totals.orders
}
});
}

if (
totals.rounds >= 2 &&
totals.revenue === 0
) {
patterns.push({
code: "NO_REVENUE_AFTER_REPEATED_MEASUREMENT",
severity: "MEDIUM",
evidence: {
rounds: totals.rounds,
revenue: totals.revenue
}
});
}

if (
latest.clicks > 0 &&
latest.product_views === 0
) {
patterns.push({
code: "CURRENT_FUNNEL_BLOCK_CLICK_TO_PRODUCT_VIEW",
severity: "HIGH",
evidence: {
latest_clicks: latest.clicks,
latest_product_views: latest.product_views
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
patterns.some(
p =>
p.code ===
"PERSISTENT_ATTENTION_WITHOUT_PRODUCT_VIEW"
)
) {
return "PERSISTENT_FUNNEL_BLOCK";
}

if (
patterns.some(
p =>
p.code ===
"NO_CUSTOMER_AFTER_REPEATED_MEASUREMENT"
)
) {
return "PERSISTENT_NO_CUSTOMER";
}

if (patterns.length) {
return "PATTERN_DETECTED";
}

if (totals.rounds >= 1) {
return "OBSERVING";
}

return "NO_DATA";
}

function trend(rows) {
if (rows.length < 2) {
return {
direction: "INSUFFICIENT_DATA",
compared_rounds: rows.length
};
}

const previous = rows[rows.length - 2];
const latest = rows[rows.length - 1];

const fields = [
"attention",
"clicks",
"product_views",
"customers",
"orders",
"revenue"
];

const changes = {};

for (const field of fields) {
const before = n(previous[field]);
const after = n(latest[field]);

```
changes[field] = {
  previous: before,
  latest: after,
  delta: Number((after - before).toFixed(2))
};
```

}

const positive = Object.values(changes)
.filter(x => x.delta > 0).length;

const negative = Object.values(changes)
.filter(x => x.delta < 0).length;

let direction = "STABLE";

if (positive > negative) {
direction = "IMPROVING";
} else if (negative > positive) {
direction = "DECLINING";
}

return {
direction,
compared_rounds: 2,
changes
};
}

function buildRecommendation(
state,
patterns,
totals,
latest
) {
if (state === "NO_DATA") {
return {
type: "WAIT",
priority: "LOW",
reason: "No measurement data available yet.",
next_step: "COLLECT_MEASUREMENT"
};
}

if (
patterns.some(
p =>
p.code ===
"CURRENT_FUNNEL_BLOCK_CLICK_TO_PRODUCT_VIEW"
)
) {
return {
type: "INVESTIGATE_FUNNEL",
priority: "HIGH",
reason:
"Attention and Click exist, but Product View remains zero.",
next_step:
"INSPECT_CLICK_TO_PRODUCT_VIEW_PATH"
};
}

if (
patterns.some(
p =>
p.code ===
"NO_CUSTOMER_AFTER_REPEATED_MEASUREMENT"
)
) {
return {
type: "INVESTIGATE_CONVERSION",
priority: "MEDIUM",
reason:
"Repeated measurements show attention but no customer acquisition.",
next_step:
"INSPECT_PRODUCT_VIEW_TO_CUSTOMER_PATH"
};
}

return {
type: "CONTINUE_MEASUREMENT",
priority: "MEDIUM",
reason:
"Current evidence is not sufficient to justify a strategy change.",
next_step: "MEASURE_AGAIN"
};
}

async function getContradictions(db, contentId) {
if (!contentId) return [];

const result = await db
.prepare(`       SELECT
        id,
        run_type,
        input_data,
        output_data,
        created_at
      FROM ai_runs
      WHERE
        input_data LIKE ?
        OR output_data LIKE ?
      ORDER BY created_at DESC
      LIMIT 20
    `)
.bind(
`%${contentId}%`,
`%${contentId}%`
)
.all();

const contradictions = [];

for (const row of result.results || []) {
const input = s(row.input_data).toLowerCase();
const output = s(row.output_data).toLowerCase();

```
const combined = `${input} ${output}`;

if (
  combined.includes("no click") &&
  (
    combined.includes('"clicks":1') ||
    combined.includes('"clicks": 1')
  )
) {
  contradictions.push({
    run_id: row.id,
    type: "CLICK_COUNT_CONTRADICTION",
    description:
      "AI text appears to describe no click while measured data contains a click.",
    created_at: row.created_at
  });
}
```

}

return contradictions;
}

async function buildIntelligence(env, contentId) {
const db = env.DB;

const content = await getContent(db, contentId);
const measurements = await getMeasurements(
db,
contentId
);

const totals = measurementMetrics(measurements);
const latest = latestMetrics(measurements);
const rates = calculateRates(totals);

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

const measurementTrend = trend(measurements);

const recommendation = buildRecommendation(
state,
patterns,
totals,
latest
);

const contradictions =
await getContradictions(
db,
contentId
);

return {
layer: LAYER,
version: VERSION,

```
content: content
  ? {
      id: content.id,
      title: content.title || "",
      status: content.status || "",
      objective: content.objective || "",
      attention_type:
        content.attention_type || "",
      market_keyword:
        content.market_keyword || "",
      angle: content.angle || "",
      cta: content.cta || ""
    }
  : null,

measurement: {
  rounds: totals.rounds,
  totals,
  latest,
  rates,
  trend: measurementTrend
},

intelligence: {
  state,

  patterns,

  recommendation,

  contradictions
},

guardrails: {
  winner_declared: false,
  automatic_execution: false,
  strategy_change_automatic: false,
  requires_human_approval: true
},

generated_at:
  new Date().toISOString()
```

};
}

async function saveIntelligence(
env,
intelligence
) {
const db = env.DB;

const runId = id();
const insightId = id();

const contentId =
intelligence.content?.id || null;

const payload = JSON.stringify(
intelligence
);

await db
.prepare(`       INSERT INTO ai_runs (
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
"RULE_BASED_V2",
JSON.stringify({
layer: LAYER,
version: VERSION,
content_id: contentId
}),
payload,
"COMPLETED",
0,
new Date().toISOString()
)
.run();

const state =
intelligence.intelligence?.state ||
"UNKNOWN";

const recommendation =
intelligence.intelligence?.recommendation;

const title =
`Intelligence: ${state}`;

const content = JSON.stringify({
state,
patterns:
intelligence.intelligence?.patterns || [],
recommendation:
recommendation || {},
measurement:
intelligence.measurement || {},
guardrails:
intelligence.guardrails || {}
});

await db
.prepare(`       INSERT INTO ai_insights (
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
"INTELLIGENCE",
title,
content,
0,
recommendation?.priority || "normal",
"NEW",
new Date().toISOString()
)
.run();

return {
run_id: runId,
insight_id: insightId
};
}

export async function onRequest(context) {
const { request, env } = context;

try {
const url = new URL(request.url);

```
let contentId =
  url.searchParams.get("content_id");

if (request.method === "GET") {
  if (!contentId) {
    return json({
      success: false,
      layer: LAYER,
      version: VERSION,
      error:
        "content_id is required"
    }, 400);
  }

  const intelligence =
    await buildIntelligence(
      env,
      contentId
    );

  return json({
    success: true,
    mode: "preview",
    ...intelligence
  });
}

if (request.method === "POST") {
  let body = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  contentId =
    body.content_id ||
    contentId;

  if (!contentId) {
    return json({
      success: false,
      layer: LAYER,
      version: VERSION,
      error:
        "content_id is required"
    }, 400);
  }

  const intelligence =
    await buildIntelligence(
      env,
      contentId
    );

  const saved =
    await saveIntelligence(
      env,
      intelligence
    );

  return json({
    success: true,
    mode: "execute",
    ...intelligence,
    saved
  });
}

return json({
  success: false,
  error: "Method not allowed"
}, 405);
```

} catch (error) {
return json({
success: false,
layer: LAYER,
version: VERSION,
error: error.message
}, 500);
}
}
