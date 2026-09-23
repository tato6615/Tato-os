const LAYER = "INTELLIGENCE_LAYER_V2";
const VERSION = "2.0";

const HEADERS = {
"Content-Type": "application/json; charset=utf-8",
"Cache-Control": "no-store"
};

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
if (!b) return 0;
return Number(((a / b) * 100).toFixed(2));
}

function parseJSON(value, fallback = {}) {
if (!value) return fallback;

try {
const parsed = JSON.parse(value);
return parsed && typeof parsed === "object"
? parsed
: fallback;
} catch (_) {
return fallback;
}
}

async function getContent(db, contentId) {
if (!contentId) return null;

return await db.prepare(`     SELECT *
    FROM content_engine
    WHERE id = ?
    LIMIT 1
  `)
.bind(contentId)
.first();
}

async function getMeasurements(db, contentId) {
if (!contentId) return [];

const result = await db.prepare(`     SELECT *
    FROM content_measurements
    WHERE content_id = ?
    ORDER BY measured_at ASC, created_at ASC
  `)
.bind(contentId)
.all();

return result.results || [];
}

function calculateTotals(rows) {
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

totals.revenue = Number(
totals.revenue.toFixed(2)
);

return totals;
}

function getLatest(rows) {
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

function calculateRates(totals) {
return {
click_from_attention_pct:
pct(
totals.clicks,
totals.attention
),

```
product_view_from_click_pct:
  pct(
    totals.product_views,
    totals.clicks
  ),

customer_from_product_view_pct:
  pct(
    totals.customers,
    totals.product_views
  ),

order_from_customer_pct:
  pct(
    totals.orders,
    totals.customers
  ),

revenue_per_order:
  totals.orders > 0
    ? Number(
        (
          totals.revenue /
          totals.orders
        ).toFixed(2)
      )
    : 0
```

};
}

function detectPatterns(
rows,
totals,
latest
) {
const patterns = [];

if (
totals.rounds >= 2 &&
totals.attention > 0 &&
totals.product_views === 0
) {
patterns.push({
code:
"PERSISTENT_ATTENTION_WITHOUT_PRODUCT_VIEW",
severity: "HIGH",
evidence: {
rounds: totals.rounds,
attention: totals.attention,
product_views:
totals.product_views
}
});
}

if (
totals.clicks > 0 &&
totals.product_views === 0
) {
patterns.push({
code:
"CLICK_WITHOUT_PRODUCT_VIEW",
severity: "HIGH",
evidence: {
clicks: totals.clicks,
product_views:
totals.product_views
}
});
}

if (
totals.rounds >= 2 &&
totals.attention > 0 &&
totals.customers === 0
) {
patterns.push({
code:
"NO_CUSTOMER_AFTER_REPEATED_MEASUREMENT",
severity: "MEDIUM",
evidence: {
rounds: totals.rounds,
attention: totals.attention,
customers:
totals.customers
}
});
}

if (
totals.rounds >= 2 &&
totals.orders === 0
) {
patterns.push({
code:
"NO_ORDER_AFTER_REPEATED_MEASUREMENT",
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
code:
"NO_REVENUE_AFTER_REPEATED_MEASUREMENT",
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
code:
"CURRENT_FUNNEL_BLOCK_CLICK_TO_PRODUCT_VIEW",
severity: "HIGH",
evidence: {
clicks: latest.clicks,
product_views:
latest.product_views
}
});
}

return patterns;
}

function determineState(
rows,
totals,
patterns
) {
if (!rows.length) {
return "NO_DATA";
}

if (
patterns.some(
pattern =>
pattern.code ===
"PERSISTENT_ATTENTION_WITHOUT_PRODUCT_VIEW"
)
) {
return "PERSISTENT_FUNNEL_BLOCK";
}

if (
patterns.some(
pattern =>
pattern.code ===
"NO_CUSTOMER_AFTER_REPEATED_MEASUREMENT"
)
) {
return "PERSISTENT_NO_CUSTOMER";
}

if (patterns.length > 0) {
return "PATTERN_DETECTED";
}

return "OBSERVING";
}

function calculateTrend(rows) {
if (rows.length < 2) {
return {
direction: "INSUFFICIENT_DATA",
compared_rounds: rows.length,
changes: {}
};
}

const previous =
rows[rows.length - 2];

const latest =
rows[rows.length - 1];

const fields = [
"attention",
"clicks",
"product_views",
"engagements",
"customers",
"orders",
"revenue"
];

const changes = {};

for (const field of fields) {
const before = n(
previous[field]
);

```
const after = n(
  latest[field]
);

changes[field] = {
  previous: before,
  latest: after,
  delta: Number(
    (
      after - before
    ).toFixed(2)
  )
};
```

}

const positive =
Object.values(changes)
.filter(
item => item.delta > 0
).length;

const negative =
Object.values(changes)
.filter(
item => item.delta < 0
).length;

let direction = "STABLE";

if (positive > negative) {
direction = "IMPROVING";
}

if (negative > positive) {
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
totals
) {
if (state === "NO_DATA") {
return {
type: "WAIT",
priority: "LOW",
reason:
"ยังไม่มี Measurement ของ Content",
next_step:
"COLLECT_MEASUREMENT"
};
}

const funnelBlock =
patterns.some(
pattern =>
pattern.code ===
"CURRENT_FUNNEL_BLOCK_CLICK_TO_PRODUCT_VIEW"
);

if (funnelBlock) {
return {
type: "INVESTIGATE_FUNNEL",
priority: "HIGH",
reason:
"มี Click แต่ไม่พบ Product View",
next_step:
"INSPECT_CLICK_TO_PRODUCT_VIEW_PATH"
};
}

const noCustomer =
patterns.some(
pattern =>
pattern.code ===
"NO_CUSTOMER_AFTER_REPEATED_MEASUREMENT"
);

if (noCustomer) {
return {
type: "INVESTIGATE_CONVERSION",
priority: "MEDIUM",
reason:
"มี Attention แต่ยังไม่มี Customer หลังวัดซ้ำ",
next_step:
"INSPECT_PRODUCT_VIEW_TO_CUSTOMER_PATH"
};
}

return {
type: "CONTINUE_MEASUREMENT",
priority: "MEDIUM",
reason:
"ข้อมูลยังไม่เพียงพอสำหรับเปลี่ยน Strategy",
next_step:
"MEASURE_AGAIN"
};
}

async function findContradictions(
db,
contentId
) {
if (!contentId) return [];

try {
const result =
await db.prepare(`         SELECT
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
        LIMIT 30
      `)
.bind(
`%${contentId}%`,
`%${contentId}%`
)
.all();

```
const contradictions = [];

for (
  const row
  of result.results || []
) {
  const input =
    s(
      row.input_data
    ).toLowerCase();

  const output =
    s(
      row.output_data
    ).toLowerCase();

  const text =
    `${input} ${output}`;

  const noClick =
    text.includes(
      "no click"
    ) ||
    text.includes(
      "ไม่มี click"
    ) ||
    text.includes(
      "ไม่มีคลิก"
    );

  const clickOne =
    text.includes(
      '"clicks":1'
    ) ||
    text.includes(
      '"clicks": 1'
    );

  if (
    noClick &&
    clickOne
  ) {
    contradictions.push({
      run_id: row.id,
      type:
        "CLICK_COUNT_CONTRADICTION",
      description:
        "AI text conflicts with measured Click data.",
      created_at:
        row.created_at
    });
  }
}

return contradictions;
```

} catch (_) {
return [];
}
}

async function buildIntelligence(
env,
contentId
) {
if (!env.DB) {
throw new Error(
"D1 binding DB is missing"
);
}

const db = env.DB;

const content =
await getContent(
db,
contentId
);

const measurements =
await getMeasurements(
db,
contentId
);

const totals =
calculateTotals(
measurements
);

const latest =
getLatest(
measurements
);

const rates =
calculateRates(
totals
);

const patterns =
detectPatterns(
measurements,
totals,
latest
);

const state =
determineState(
measurements,
totals,
patterns
);

const trend =
calculateTrend(
measurements
);

const recommendation =
buildRecommendation(
state,
patterns,
totals
);

const contradictions =
await findContradictions(
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
      title:
        s(content.title),
      status:
        s(content.status),
      objective:
        s(content.objective),
      attention_type:
        s(
          content.attention_type
        ),
      market_keyword:
        s(
          content.market_keyword
        ),
      angle:
        s(content.angle),
      cta:
        s(content.cta)
    }
  : null,

measurement: {
  rounds: totals.rounds,
  totals,
  latest,
  rates,
  trend
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
const now =
new Date().toISOString();

const contentId =
intelligence.content?.id ||
null;

const inputData =
JSON.stringify({
layer: LAYER,
version: VERSION,
content_id: contentId
});

const outputData =
JSON.stringify(
intelligence
);

await db.prepare(`     INSERT INTO ai_runs (
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
inputData,
outputData,
"COMPLETED",
0,
now
)
.run();

const state =
intelligence
.intelligence
?.state ||
"UNKNOWN";

const recommendation =
intelligence
.intelligence
?.recommendation ||
{};

const priority =
s(
recommendation.priority
).toUpperCase() ||
"LOW";

const score =
priority === "HIGH"
? 90
: priority === "MEDIUM"
? 60
: 30;

const insightContent =
JSON.stringify({
state,
patterns:
intelligence
.intelligence
?.patterns || [],
recommendation,
measurement:
intelligence.measurement ||
{},
guardrails:
intelligence.guardrails ||
{}
});

await db.prepare(`     INSERT INTO ai_insights (
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
`Intelligence: ${state}`,
insightContent,
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

export async function onRequestGet(
context
) {
try {
const url =
new URL(
context.request.url
);

```
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

const intelligence =
  await buildIntelligence(
    context.env,
    contentId
  );

return json({
  success: true,
  mode: "preview",
  ...intelligence
});
```

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
let body = {};

```
try {
  body =
    await context.request.json();
} catch (_) {
  body = {};
}

const url =
  new URL(
    context.request.url
  );

const contentId =
  body?.content_id ||
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

const intelligence =
  await buildIntelligence(
    context.env,
    contentId
  );

const saved =
  await saveIntelligence(
    context.env,
    intelligence
  );

return json({
  success: true,
  mode: "execute",
  ...intelligence,
  saved
});
```

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
