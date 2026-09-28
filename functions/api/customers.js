export async function onRequestGet(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) {
      return Response.json({ success: false, error: "DB_BINDING_NOT_FOUND" }, { status: 500 });
    }

    const { results } = await db
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
  } catch (error) {
    return Response.json({
      success: false,
      error: error && error.message ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) {
      return Response.json({ success: false, error: "DB_BINDING_NOT_FOUND" }, { status: 500 });
    }

    const body = await context.request.json();

    const id = crypto.randomUUID();
    const email = body.email || null;
    const name = body.name || null;
    const phone = body.phone || null;
    const source = body.source || null;

    await db
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
