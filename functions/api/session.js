export async function onRequestPost(context) {
  try {
    const id = crypto.randomUUID();

    return Response.json({
      success: true,
      session: {
        id
      }
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
