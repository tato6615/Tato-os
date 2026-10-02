import { accessEnabled, verifyAccess } from "../shared/access.js";

// Public endpoints (everything else under /api, /system, /admin needs admin auth).
const PUBLIC = new Set(["POST /api/checkout", "GET /api/checkout", "POST /api/behavior", "POST /api/event", "GET /api/order-status", "POST /api/lead", "GET /api/public-config"]);
function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (PUBLIC.has(context.request.method + " " + path)) return context.next();
  const env = context.env || {};

  // 1) Cloudflare Access (optional: only when ACCESS_TEAM_DOMAIN + ACCESS_AUD are set)
  const access = accessEnabled(env);
  if (access && await verifyAccess(context.request, env)) return context.next();
  // Once Access works, set ADMIN_BASIC_DISABLED=1 to turn the shared password off completely.
  if (access && String(env.ADMIN_BASIC_DISABLED || "") === "1")
    return new Response("Cloudflare Access login required", { status: 403, headers: { "cache-control": "no-store" } });

  // 2) Basic auth fallback (shared password)
  const pw = env.ADMIN_PASSWORD;
  if (!pw) return new Response("ADMIN_PASSWORD is not configured", { status: 503, headers: { "cache-control": "no-store" } });
  const h = context.request.headers.get("authorization") || "";
  if (h.startsWith("Basic ")) {
    try {
      const dec = atob(h.slice(6));
      const pass = dec.slice(dec.indexOf(":") + 1);
      if (safeEq(pass, String(pw))) return context.next();
    } catch (e) {}
  }
  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="TATO Admin", charset="UTF-8"', "cache-control": "no-store" }
  });
}