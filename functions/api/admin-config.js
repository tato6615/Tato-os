// TATO-OS admin config. Route: /api/admin-config (Basic auth via _middleware.js)
//   GET  -> {codes:[...], settings:{max_open_kg, ...}}
//   POST -> {action:"save_code", code, type, value, min_kg, max_uses, expires_at}
//           {action:"toggle_code", code, active}
//           {action:"delete_code", code}
//           {action:"set_setting", key:"max_open_kg", value:"" | number}

import { ensureSchema } from "../../shared/schema.js";
import { capacity } from "../../shared/orders.js";

function json(d, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" } });
}
const ALLOWED_SETTINGS = ["max_open_kg"];

export async function onRequestGet(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return json({ success: false, status: "DB_BINDING_NOT_FOUND" }, 500);
    await ensureSchema(db);
    const codes = (await db.prepare("SELECT * FROM discount_codes ORDER BY created_at DESC LIMIT 100").all()).results || [];
    const rows = (await db.prepare("SELECT key, value FROM settings").all()).results || [];
    const settings = {}; rows.forEach((r) => { settings[r.key] = r.value; });
    return json({ success: true, codes, settings, capacity: await capacity(db) });
  } catch (e) { return json({ success: false, status: "ERROR", error: e && e.message ? e.message : String(e) }, 500); }
}

export async function onRequestPost(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return json({ success: false, status: "DB_BINDING_NOT_FOUND" }, 500);
    await ensureSchema(db);
    const b = await context.request.json().catch(() => ({}));
    if (b.action === "save_code") {
      const code = String(b.code || "").trim().toUpperCase();
      const type = String(b.type || "");
      const value = Number(b.value), minKg = Number(b.min_kg || 0);
      const maxUses = b.max_uses === "" || b.max_uses == null ? null : Number(b.max_uses);
      const exp = b.expires_at ? new Date(b.expires_at) : null;
      if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return json({ success: false, status: "INVALID_CODE", error: "รหัสต้องเป็น A-Z 0-9 _ - ยาว 3-30 ตัว" }, 400);
      if (type !== "percent" && type !== "fixed") return json({ success: false, status: "INVALID_TYPE" }, 400);
      if (!(value > 0) || (type === "percent" && value > 100)) return json({ success: false, status: "INVALID_VALUE" }, 400);
      if (maxUses != null && !(maxUses >= 1)) return json({ success: false, status: "INVALID_MAX_USES" }, 400);
      if (exp && isNaN(exp.getTime())) return json({ success: false, status: "INVALID_EXPIRY" }, 400);
      await db.prepare(
        "INSERT INTO discount_codes (code,type,value,min_kg,max_uses,used_count,expires_at,active,created_at) VALUES (?,?,?,?,?,0,?,1,?) " +
        "ON CONFLICT(code) DO UPDATE SET type=excluded.type, value=excluded.value, min_kg=excluded.min_kg, max_uses=excluded.max_uses, expires_at=excluded.expires_at"
      ).bind(code, type, value, minKg >= 0 ? minKg : 0, maxUses, exp ? exp.toISOString() : null, new Date().toISOString()).run();
      return json({ success: true, status: "CODE_SAVED" });
    }
    if (b.action === "toggle_code") {
      await db.prepare("UPDATE discount_codes SET active=? WHERE code=?").bind(b.active ? 1 : 0, String(b.code || "").toUpperCase()).run();
      return json({ success: true, status: "CODE_UPDATED" });
    }
    if (b.action === "delete_code") {
      const code = String(b.code || "").trim().toUpperCase();
      if (!code) return json({ success: false, status: "INVALID_CODE" }, 400);
      await db.prepare("DELETE FROM discount_codes WHERE code=?").bind(code).run();
      return json({ success: true, status: "CODE_DELETED" });
    }
    if (b.action === "set_setting") {
      const key = String(b.key || "");
      if (!ALLOWED_SETTINGS.includes(key)) return json({ success: false, status: "SETTING_NOT_ALLOWED" }, 400);
      const v = b.value === "" || b.value == null ? "" : String(Number(b.value));
      if (v !== "" && !(Number(v) > 0)) return json({ success: false, status: "INVALID_VALUE" }, 400);
      await db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, v).run();
      return json({ success: true, status: "SETTING_SAVED" });
    }
    return json({ success: false, status: "UNSUPPORTED_ACTION" }, 400);
  } catch (e) { return json({ success: false, status: "ERROR", error: e && e.message ? e.message : String(e) }, 500); }
}
