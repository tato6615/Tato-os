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

    return Response.json({ success: true, events: results });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const id = crypto.randomUUID();

    await context.env.DB
      .prepare(`
        INSERT INTO behavior_events
        (id, customer_id, session_id, event_type, page, product_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        body.customer_id || null,
        body.session_id || null,
        body.event_type || null,
        body.page || null,
        body.product_id || null,
        typeof body.metadata === "string"
          ? body.metadata
          : JSON.stringify(body.metadata || {})
      )
      .run();

    return Response.json({
      success: true,
      event: { id, ...body }
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
