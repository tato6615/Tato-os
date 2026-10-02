// TATO-OS: admin-only lead management (separate from the public form handler).
//   PATCH  /api/lead-admin        body {id, is_test}  mark / unmark a lead as test
//   DELETE /api/lead-admin?id=..  permanently delete one lead
// Not in the middleware PUBLIC list, so admin auth is always required.
import { ensureSchema } from "../../shared/schema.js";

const LAYER = "LEAD_ADMIN_V1";
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" } });
}
// Defence in depth: a cross-site request cannot add this header without a CORS preflight.
const adminWriteOk = (request) => request.headers.get("x-requested-with") === "tato-hq";
const validLeadId = (v) => typeof v === "string" && /^lead_[0-9a-f-]{36}$/i.test(v);

export async function onRequestPatch(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return json({ success: false, layer: LAYER, status: "DB_BINDING_NOT_FOUND" }, 500);
    if (!adminWriteOk(context.request)) return json({ success: false, layer: LAYER, status: "FORBIDDEN" }, 403);
    await ensureSchema(db);
    const b = await context.request.json().catch(() => ({}));
    if (!validLeadId(b.id) || typeof b.is_test !== "boolean") return json({ success: false, layer: LAYER, status: "BAD_REQUEST" }, 400);
    const r = await db.prepare("UPDATE leads SET is_test=? WHERE id=?").bind(b.is_test ? 1 : 0, b.id).run();
    const n = r && r.meta ? Number(r.meta.changes) : 0;
    if (!n) return json({ success: false, layer: LAYER, status: "NOT_FOUND" }, 404);
    return json({ success: true, layer: LAYER, status: "LEAD_UPDATED", id: b.id, is_test: b.is_test });
  } catch (e) {
    return json({ success: false, layer: LAYER, status: "LEAD_ERROR", error: String(e && e.message || e) }, 500);
  }
}

export async function onRequestDelete(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return json({ success: false, layer: LAYER, status: "DB_BINDING_NOT_FOUND" }, 500);
    if (!adminWriteOk(context.request)) return json({ success: false, layer: LAYER, status: "FORBIDDEN" }, 403);
    await ensureSchema(db);
    const id = new URL(context.request.url).searchParams.get("id");
    if (!validLeadId(id)) return json({ success: false, layer: LAYER, status: "BAD_REQUEST" }, 400);
    const r = await db.prepare("DELETE FROM leads WHERE id=?").bind(id).run();
    const n = r && r.meta ? Number(r.meta.changes) : 0;
    if (!n) return json({ success: false, layer: LAYER, status: "NOT_FOUND" }, 404);
    return json({ success: true, layer: LAYER, status: "LEAD_DELETED", id });
  } catch (e) {
    return json({ success: false, layer: LAYER, status: "LEAD_ERROR", error: String(e && e.message || e) }, 500);
  }
}