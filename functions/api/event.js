export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const {
      customer_id = null,
      session_id = null,
      event_type,
      page = null,
      product_id = null,
      metadata = {}
    } = body;

    if (!event_type) {
      return Response.json(
        {
          success: false,
          error: "event_type is required"
        },
        { status: 400 }
      );
    }

    if (!session_id) {
      return Response.json(
        {
          success: false,
          error: "session_id is required"
        },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();

    const metadataJson =
      typeof metadata === "string"
        ? metadata
        : JSON.stringify(metadata);

    await context.env.DB
      .prepare(`
        INSERT INTO behavior_events
        (
          id,
          customer_id,
          session_id,
          event_type,
          page,
          product_id,
          metadata
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        customer_id,
        session_id,
        event_type,
        page,
        product_id,
        metadataJson
      )
      .run();

    return Response.json({
      success: true,
      event: {
        id,
        customer_id,
        session_id,
        event_type,
        page,
        product_id,
        metadata
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
