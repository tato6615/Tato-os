export async function onRequestGet(context) {
  try {
    const { results } = await context.env.DB
      .prepare(`
        SELECT *
        FROM market_signals
        ORDER BY detected_at DESC
        LIMIT 200
      `)
      .all();

    return Response.json({
      success: true,
      signals: results
    });
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
        INSERT INTO market_signals
        (
          id,
          source,
          signal_type,
          keyword,
          title,
          content,
          url,
          score,
          metadata
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        body.source || null,
        body.signal_type || null,
        body.keyword || null,
        body.title || null,
        body.content || null,
        body.url || null,
        Number(body.score || 0),
        typeof body.metadata === "string"
          ? body.metadata
          : JSON.stringify(body.metadata || {})
      )
      .run();

    return Response.json({
      success: true,
      signal: { id, ...body }
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
