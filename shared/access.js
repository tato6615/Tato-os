// Cloudflare Access (Zero Trust) JWT verification for Pages Functions.
// Off unless BOTH env vars are set:
//   ACCESS_TEAM_DOMAIN  e.g. "yourteam.cloudflareaccess.com"
//   ACCESS_AUD          the Application Audience (AUD) tag of the Access application
// The token is read from the Cf-Access-Jwt-Assertion header or the CF_Authorization cookie.

const CERTS_TTL_MS = 60 * 60 * 1000;
let certCache = { host: "", at: 0, keys: [] };

export function teamHost(env) {
  return String((env && env.ACCESS_TEAM_DOMAIN) || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}
export function accessEnabled(env) {
  return !!(teamHost(env) && env && env.ACCESS_AUD);
}

function b64urlToBytes(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlToJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

function readToken(request) {
  const h = request.headers.get("cf-access-jwt-assertion");
  if (h) return h.trim();
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return m ? m[1] : "";
}

async function getKeys(host, force) {
  if (!force && certCache.host === host && Date.now() - certCache.at < CERTS_TTL_MS && certCache.keys.length) return certCache.keys;
  const r = await fetch("https://" + host + "/cdn-cgi/access/certs");
  if (!r.ok) throw new Error("certs fetch failed");
  const d = await r.json();
  certCache = { host, at: Date.now(), keys: Array.isArray(d.keys) ? d.keys : [] };
  return certCache.keys;
}

/** Returns { email, sub } when the request carries a valid Access token, otherwise null. Never throws. */
export async function verifyAccess(request, env) {
  try {
    if (!accessEnabled(env)) return null;
    const token = readToken(request);
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = b64urlToJson(parts[0]);
    if (header.alg !== "RS256" || !header.kid) return null;
    const host = teamHost(env);

    let jwk = (await getKeys(host, false)).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await getKeys(host, true)).find((k) => k.kid === header.kid); // key rotation
    if (!jwk) return null;

    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
    if (!ok) return null;

    const p = b64urlToJson(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    if (p.iss !== "https://" + host) return null;
    const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
    if (!aud.includes(String(env.ACCESS_AUD))) return null;
    if (typeof p.exp !== "number" || p.exp <= now) return null;
    if (typeof p.nbf === "number" && p.nbf > now + 30) return null;
    return { email: p.email || "", sub: p.sub || "" };
  } catch (_) {
    return null;
  }
}

export const _test = { reset() { certCache = { host: "", at: 0, keys: [] }; } };