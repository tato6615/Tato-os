// TATO-OS: public, non-secret client config. GET /api/public-config
// Turnstile SITE key (public by design) and the LINE OA id (already sent to customers by checkout/order-status). Never put secrets here.
export async function onRequestGet(context) {
  const env = (context && context.env) || {};
  const key = env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY ? String(env.TURNSTILE_SITE_KEY) : "";
  const oaRaw = String(env.PAYMENT_LINE_OA || "").trim();
  const oa = /^@?[A-Za-z0-9._-]{1,40}$/.test(oaRaw) ? oaRaw : "";
  return new Response(JSON.stringify({ turnstile_site_key: key, line_oa: oa }), {
    headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" }
  });
}