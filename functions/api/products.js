export async function onRequestGet(context) {
  try {
    const { results } = await context.env.DB
      .prepare(`
        SELECT *
        FROM products
        ORDER BY created_at DESC
      `)
      .all();

    return Response.json({
      success: true,
      products: results
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

    const id = crypto.randomUUID();

    const name = body.name || null;
    const category = body.category || null;
    const price = Number(body.price || 0);
    const cost = Number(body.cost || 0);
    const stock = Number(body.stock || 0);
    const status = body.status || "active";

    if (!name) {
      return Response.json(
        {
          success: false,
          error: "Product name is required"
        },
        { status: 400 }
      );
    }

    await context.env.DB
      .prepare(`
        INSERT INTO products
        (id, name, category, price, cost, stock, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        name,
        category,
        price,
        cost,
        stock,
        status
      )
      .run();

    return Response.json({
      success: true,
      product: {
        id,
        name,
        category,
        price,
        cost,
        stock,
        status
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
