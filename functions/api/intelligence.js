const json = (d, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { "Content-Type": "application/json" },
  });

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);
  try {
    const funnel = await env.DB.prepare(
      `SELECT event_type, COUNT(*) AS events, COUNT(DISTINCT session_id) AS sessions
       FROM behavior_events
       WHERE datetime(created_at) >= datetime('now','-7 days')
       GROUP BY event_type`
    ).all();

    const revenue = await env.DB.prepare(
      `SELECT COALESCE(SUM(CAST(json_extract(metadata,'$.revenue') AS REAL)),0) AS total,
              COUNT(*) AS paid_orders
       FROM behavior_events
       WHERE event_type = 'payment_completed'
         AND datetime(created_at) >= datetime('now','-7 days')`
    ).first();

    const top = await env.DB.prepare(
      `SELECT json_extract(metadata,'$.content_id') AS content_id,
              COUNT(*) AS intents
       FROM behavior_events
       WHERE event_type = 'purchase_intent'
         AND json_extract(metadata,'$.content_id') IS NOT NULL
         AND datetime(created_at) >= datetime('now','-7 days')
       GROUP BY content_id
       ORDER BY intents DESC
       LIMIT 10`
    ).all();

    const f = {};
    for (const r of funnel.results || []) f[r.event_type] = r;
    const n = (k) => (f[k] ? f[k].events : 0);

    const views = n("product_view") + n("content_view");
    const intents = n("purchase_intent");
    const paid = n("payment_completed");

    return json({
      success: true,
      range: "7d",
      funnel: {
        content_view: n("content_view"),
        product_view: n("product_view"),
        customer_created: n("customer_created"),
        purchase_intent: intents,
        payment_completed: paid,
      },
      revenue: { total: revenue?.total || 0, paid_orders: revenue?.paid_orders || 0 },
      rates: {
        view_to_intent: views ? +(intents / views).toFixed(4) : 0,
        intent_to_paid: intents ? +(paid / intents).toFixed(4) : 0,
      },
      top_content: top.results || [],
      by_event: funnel.results || [],
    });
  } catch (e) {
    return json({ success: false, error: String(e.message || e) }, 500);
  }
}
