export async function onRequestGet(context) {
  const { results } = await context.env.DB
    .prepare(`
      SELECT *
      FROM customers
      ORDER BY created_at DESC
    `)
    .all();

  return Response.json({
    success: true,
    customers: results
  });
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const id = crypto.randomUUID();
    const email = body.email || null;
    const name = body.name || null;
    const phone = body.phone || null;
    const source = body.source || null;

    await context.env.DB
      .prepare(`
        INSERT INTO customers
        (id, email, name, phone, source)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(id, email, name, phone, source)
      .run();

    return Response.json({
      success: true,
      customer: {
        id,
        email,
        name,
        phone,
        source
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
