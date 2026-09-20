export async function onRequestGet(context) {
  try {
    const { results } = await context.env.DB
      .prepare(`
        SELECT *
        FROM ai_runs
        ORDER BY created_at DESC
        LIMIT 200
      `)
      .all();

    return Response.json({
      success: true,
      runs: results
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
        INSERT INTO ai_runs
        (
          id,
          customer_id,
          run_type,
          model,
          input_data,
          output_data,
          status,
          tokens_used
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        body.customer_id || null,
        body.run_type || null,
        body.model || null,
        typeof body.input_data === "string"
          ? body.input_data
          : JSON.stringify(body.input_data || {}),
        typeof body.output_data === "string"
          ? body.output_data
          : JSON.stringify(body.output_data || {}),
        body.status || "pending",
        Number(body.tokens_used || 0)
      )
      .run();

    return Response.json({
      success: true,
      run: { id, ...body }
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
