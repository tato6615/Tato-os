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

    const name = body.name?.trim() || "";

    if (!name) {
      return Response.json(
        {
          success: false,
          error: "Product name is required"
        },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();
    const slug =
      body.slug?.trim() ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    const category = body.category?.trim() || null;
    const description = body.description?.trim() || null;
    const price = Number(body.price || 0);
    const currency = body.currency?.trim() || "THB";
    const status = body.status || "active";

    await context.env.DB
      .prepare(`
        INSERT INTO products
        (
          id,
          name,
          slug,
          category,
          description,
          price,
          currency,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        name,
        slug || null,
        category,
        description,
        price,
        currency,
        status
      )
      .run();

    return Response.json({
      success: true,
      product: {
        id,
        name,
        slug: slug || null,
        category,
        description,
        price,
        currency,
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
