export async function onRequestGet(context) {
  try {
    const { results } = await context.env.DB
      .prepare(`
        SELECT *
        FROM behavior_events
        ORDER BY created_at DESC
        LIMIT 200
      `)
      .all();

    let total = results.length;
    try {
      const c = await context.env.DB.prepare("SELECT COUNT(*) AS n FROM behavior_events").first();
      if (c && Number.isFinite(Number(c.n))) total = Number(c.n);
    } catch (e) {}
    return Response.json({ success: true, events: results, total });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function onRequestPost(context) {
  try {
    const raw = await context.request.text();
    if (raw.length > 8192) {
      return Response.json({ success: false, error: "payload too large" }, { status: 413 });
    }
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ success: false, error: "invalid body" }, { status: 400 });
    }
    const clip = (v, n) => (v == null ? null : String(v).slice(0, n));
    const metaStr = typeof body.metadata === "string" ? body.metadata : JSON.stringify(body.metadata || {});
    if (metaStr.length > 4096) {
      return Response.json({ success: false, error: "metadata too large" }, { status: 413 });
    }

    const id = crypto.randomUUID();

    await context.env.DB
      .prepare(`
        INSERT INTO behavior_events
        (id, customer_id, session_id, event_type, page, product_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        clip(body.customer_id, 100),
        clip(body.session_id, 100),
        clip(body.event_type, 64),
        clip(body.page, 300),
        clip(body.product_id, 100),
        metaStr
      )
      .run();

    return Response.json({
      success: true,
      event: { id }
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
