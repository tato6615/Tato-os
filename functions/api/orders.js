export async function onRequestGet(context) {
  try {
    const { results } = await context.env.DB
      .prepare(`
        SELECT
          o.*,
          c.name AS customer_name,
          c.email AS customer_email,
          p.name AS product_name
        FROM orders o
        LEFT JOIN customers c
          ON c.id = o.customer_id
        LEFT JOIN products p
          ON p.id = o.product_id
        ORDER BY o.created_at DESC
      `)
      .all();

    return Response.json({
      success: true,
      orders: results
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

    const customerId = body.customer_id;
    const productId = body.product_id;
    const amount = Number(body.amount || 0);

    if (!customerId) {
      return Response.json(
        { success: false, error: "customer_id is required" },
        { status: 400 }
      );
    }

    if (!productId) {
      return Response.json(
        { success: false, error: "product_id is required" },
        { status: 400 }
      );
    }

    const customer = await context.env.DB
      .prepare(`
        SELECT id
        FROM customers
        WHERE id = ?
        LIMIT 1
      `)
      .bind(customerId)
      .first();

    if (!customer) {
      return Response.json(
        { success: false, error: "Customer not found" },
        { status: 400 }
      );
    }

    const product = await context.env.DB
      .prepare(`
        SELECT id, price
        FROM products
        WHERE id = ?
        LIMIT 1
      `)
      .bind(productId)
      .first();

    if (!product) {
      return Response.json(
        { success: false, error: "Product not found" },
        { status: 400 }
      );
    }

    const finalAmount = amount > 0
      ? amount
      : Number(product.price || 0);

    const id = crypto.randomUUID();

    await context.env.DB
      .prepare(`
        INSERT INTO orders
        (
          id,
          customer_id,
          product_id,
          amount,
          currency,
          status,
          payment_method,
          external_order_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        customerId,
        productId,
        finalAmount,
        body.currency || "THB",
        body.status || "pending",
        body.payment_method || null,
        body.external_order_id || null
      )
      .run();

    return Response.json({
      success: true,
      order: {
        id,
        customer_id: customerId,
        product_id: productId,
        amount: finalAmount,
        currency: body.currency || "THB",
        status: body.status || "pending",
        payment_method: body.payment_method || null,
        external_order_id: body.external_order_id || null
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
