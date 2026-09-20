export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const id = crypto.randomUUID();

    const customerId = body.customer_id || null;
    const sessionId = body.session_id || null;
    const eventType = body.event_type || null;
    const page = body.page || null;
    const productId = body.product_id || null;

    if (!eventType) {
      return Response.json(
        {
          success: false,
          error: "event_type is required"
        },
        { status: 400 }
      );
    }

    const metadata =
      typeof body.metadata === "string"
        ? body.metadata
        : JSON.stringify(body.metadata || {});

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
        customerId,
        sessionId,
        eventType,
        page,
        productId,
        metadata
      )
      .run();

    return Response.json({
      success: true,
      event: {
        id,
        customer_id: customerId,
        session_id: sessionId,
        event_type: eventType,
        page,
        product_id: productId
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
