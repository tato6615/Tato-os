export async function onRequestGet(context) {
  const result = await context.env.DB
    .prepare("SELECT COUNT(*) AS count FROM customers")
    .first();

  return Response.json({
    success: true,
    database: "os_tato",
    customers: result.count
  });
}
