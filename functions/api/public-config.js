// TATO-OS: public, non-secret client config. GET /api/public-config
// Only the Turnstile SITE key (public by design). Never put secrets here.
export async function onRequestGet(context) {
  const env = (context && context.env) || {};
  const key = env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY ? String(env.TURNSTILE_SITE_KEY) : "";
  return new Response(JSON.stringify({ turnstile_site_key: key }), {
    headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" }
  });
}