const ALLOWED_EVENTS = new Set([
  "session_start",
  "page_view",
  "click",
  "product_view",
  "search",
  "customer_created",
  "order_created",
  "ai_run",
  "workflow_run",
  "session_end"
]);

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

    if (!session_id) {
      return Response.json(
        {
          success: false,
          error: "session_id is required"
        },
        { status: 400 }
      );
    }

    if (!event_type) {
      return Response.json(
        {
          success: false,
          error: "event_type is required"
        },
        { status: 400 }
      );
    }

    if (!ALLOWED_EVENTS.has(event_type)) {
      return Response.json(
        {
          success: false,
          error: "Invalid event_type"
        },
        { status: 400 }
      );
    }

    if (customer_id) {
      const customer = await context.env.DB
        .prepare(`
          SELECT id
          FROM customers
          WHERE id = ?
          LIMIT 1
        `)
        .bind(customer_id)
        .first();

      if (!customer) {
        return Response.json(
          {
            success: false,
            error: "Customer not found"
          },
          { status: 400 }
        );
      }
    }

    if (product_id) {
      const product = await context.env.DB
        .prepare(`
          SELECT id
          FROM products
          WHERE id = ?
          LIMIT 1
        `)
        .bind(product_id)
        .first();

      if (!product) {
        return Response.json(
          {
            success: false,
            error: "Product not found"
          },
          { status: 400 }
        );
      }
    }

    const id = crypto.randomUUID();

    let metadataJson;

    if (typeof metadata === "string") {
      metadataJson = metadata;
    } else {
      metadataJson = JSON.stringify(metadata || {});
    }

    if (metadataJson.length > 10000) {
      return Response.json(
        {
          success: false,
          error: "Metadata too large"
        },
        { status: 400 }
      );
    }

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
        product_id
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
