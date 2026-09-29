const json = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: "DB binding missing" }, 500);
  try {
    const funnel = await env.DB.prepare(
      `SELECT event, COUNT(*) AS n FROM content_events
       WHERE created_at >= datetime('now','-7 days') GROUP BY event`
    ).all();
    const top = await env.DB.prepare(
      `SELECT content_id, COUNT(*) AS n FROM content_events
       WHERE created_at >= datetime('now','-7 days') AND event IN ('order','purchase')
       GROUP BY content_id ORDER BY n DESC LIMIT 10`
    ).all();
    const f = Object.fromEntries((funnel.results || []).map(r => [r.event, r.n]));
    const views = f.view || 0, clicks = f.click || 0, orders = (f.order || 0) + (f.purchase || 0);
    return json({
      range: "7d",
      funnel: { views, clicks, orders },
      rates: {
        ctr: views ? +(clicks / views).toFixed(4) : 0,
        conversion: clicks ? +(orders / clicks).toFixed(4) : 0,
      },
      top_content: top.results || [],
    });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
