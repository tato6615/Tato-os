export async function onRequestGet(context) {
  try {
    const { results } = await context.env.DB
      .prepare(`
        SELECT *
        FROM content_engine
        ORDER BY created_at DESC
      `)
      .all();

    return Response.json({
      success: true,
      content: results
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const title = body.title?.trim() || "";

    if (!title) {
      return Response.json(
        {
          success: false,
          error: "Content title is required"
        },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();

    await context.env.DB
      .prepare(`
        INSERT INTO content_engine
        (
          id,
          source,
          status,
          title,
          objective,
          attention_type,
          market_keyword,
          angle,
          direction,
          cta,
          content_text
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        body.source || null,
        body.status || "IDEA",
        title,
        body.objective || null,
        body.attention_type || null,
        body.market_keyword || null,
        body.angle || null,
        body.direction || null,
        body.cta || null,
        body.content_text || null
      )
      .run();

    return Response.json({
      success: true,
      content: {
        id,
        source: body.source || null,
        status: body.status || "IDEA",
        title,
        objective: body.objective || null,
        attention_type: body.attention_type || null,
        market_keyword: body.market_keyword || null,
        angle: body.angle || null,
        direction: body.direction || null,
        cta: body.cta || null,
        content_text: body.content_text || null
      }
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message
      },
      { status: 400 }
    );
  }
}
