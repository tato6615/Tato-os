export async function onRequestGet(context) {
  try {
    const { results } = await context.env.DB
      .prepare(`
        SELECT *
        FROM workflows
        ORDER BY created_at DESC
      `)
      .all();

    return Response.json({
      success: true,
      workflows: results
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

    const name = body.name?.trim() || "";

    if (!name) {
      return Response.json(
        {
          success: false,
          error: "Workflow name is required"
        },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();

    await context.env.DB
      .prepare(`
        INSERT INTO workflows
        (
          id,
          name,
          description,
          trigger_type,
          status,
          config
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        name,
        body.description || null,
        body.trigger_type || null,
        body.status || "active",
        typeof body.config === "string"
          ? body.config
          : JSON.stringify(body.config || {})
      )
      .run();

    return Response.json({
      success: true,
      workflow: {
        id,
        name,
        description: body.description || null,
        trigger_type: body.trigger_type || null,
        status: body.status || "active",
        config: body.config || {}
      }
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
