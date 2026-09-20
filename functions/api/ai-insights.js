export async function onRequestGet(context) {
  try {
    const { results } = await context.env.DB
      .prepare(`
        SELECT *
        FROM ai_insights
        ORDER BY created_at DESC
        LIMIT 200
      `)
      .all();

    return Response.json({
      success: true,
      insights: results
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
        INSERT INTO ai_insights
        (
          id,
          customer_id,
          run_id,
          insight_type,
          title,
          content,
          score,
          priority,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        body.customer_id || null,
        body.run_id || null,
        body.insight_type || null,
        body.title || null,
        body.content || null,
        Number(body.score || 0),
        body.priority || "normal",
        body.status || "active"
      )
      .run();

    return Response.json({
      success: true,
      insight: { id, ...body }
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
