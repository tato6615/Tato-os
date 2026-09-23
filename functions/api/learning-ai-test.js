```javascript
// TATO-OS
// Temporary route test for Learning AI

export async function onRequestGet(context) {
  return new Response(
    JSON.stringify({
      success: true,
      test: "LEARNING_AI_ROUTE",
      route: "/api/learning-ai-test",
      message: "Learning AI Functions route is working",
      hasDB: !!context.env.DB,
      hasAI: !!context.env.AI,
      timestamp: new Date().toISOString()
    }),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}
```
