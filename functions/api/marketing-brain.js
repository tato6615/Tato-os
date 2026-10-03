// TATO-OS marketing brain (rule-based Decision layer). Route: /api/marketing-brain (admin auth via _middleware.js)
//   GET  ?from=YYYY-MM-DD&to=YYYY-MM-DD   default: last 30 days
//        -> per-channel sessions / orders / revenue / gross profit / ad spend / CAC / profit-ROAS + a recommended action,
//           month pace vs target, data-quality warnings. It RECOMMENDS only; a human decides.
//   POST {action:"set_setting", key, value}  (header x-requested-with: tato-hq) value "" resets to default
// Real data only: test orders/events/leads and cancelled orders are excluded.

import { ensureSchema } from "../../shared/schema.js";
import { expirePending } from "../../shared/orders.js";
import { SETTING_KEYS, validateSetting, parseSettings, analyzeChannels, pace, buildWarnings, bangkokMonth } from "../../shared/marketing.js";

function json(d, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" } });
}
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T00:00:00Z").getTime());
const ymd = (d) => d.toISOString().slice(0, 10);

async function behaviorCols(db) {
  const r = await db.prepare("PRAGMA table_info(behavior_events)").all();
  return new Set((r.results || []).map((x) => x.name));
}

export async function onRequestGet(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return json({ success: false, status: "DB_BINDING_NOT_FOUND" }, 500);
    await ensureSchema(db);
    await expirePending(db, context.env || {}, new URL(context.request.url).origin).catch(() => {});
    const u = new URL(context.request.url);
    const now = new Date();
    const to = isDate(u.searchParams.get("to")) ? u.searchParams.get("to") : ymd(now);
    const from = isDate(u.searchParams.get("from")) ? u.searchParams.get("from") : ymd(new Date(now.getTime() - 29 * 86400000));

    const st = parseSettings(((await db.prepare("SELECT key, value FROM settings WHERE key LIKE 'mb\\_%' ESCAPE '\\'").all()).results) || []);

    // ---- sessions (real only), attributed to utm_source, falling back to the ?src= value ----
    let sessions = [], checkoutSessions = 0, sessionsAvailable = false;
    const cols = await behaviorCols(db);
    const ev = cols.has("event_type") ? "event_type" : cols.has("event_name") ? "event_name" : null;
    const sid = cols.has("session_id") ? "session_id" : cols.has("anonymous_id") ? "anonymous_id" : null;
    if (ev && sid && cols.has("metadata") && cols.has("created_at")) {
      sessionsAvailable = true;
      const base = "FROM (SELECT " + sid + " AS sid, " + ev + " AS ev, CASE WHEN json_valid(metadata) THEN metadata ELSE '{}' END AS m FROM behavior_events " +
        "WHERE julianday(created_at) >= julianday(?) AND julianday(created_at) < julianday(?, '+1 day')) " +
        "WHERE COALESCE(CAST(json_extract(m,'$.is_test') AS TEXT),'0') NOT IN ('1','true') AND sid IS NOT NULL ";
      sessions = ((await db.prepare(
        "SELECT LOWER(COALESCE(NULLIF(json_extract(m,'$.utm_source'),''), NULLIF(json_extract(m,'$.src'),''), '(direct)')) AS channel, COUNT(DISTINCT sid) AS n " + base + "AND ev='content_view' GROUP BY 1"
      ).bind(from, to).all()).results) || [];
      const cs = await db.prepare("SELECT COUNT(DISTINCT sid) AS n " + base + "AND ev='checkout_start'").bind(from, to).first();
      checkoutSessions = (cs && cs.n) || 0;
    }

    // ---- orders (real, not cancelled) ----
    const orders = ((await db.prepare(
      "SELECT LOWER(COALESCE(NULLIF(utm_source,''),'(direct)')) AS channel, COUNT(*) AS orders, SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) AS paid_orders, " +
      "COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END),0) AS revenue, COALESCE(SUM(CASE WHEN status='paid' THEN total_kg ELSE 0 END),0) AS kg, " +
      "COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0) AS pending_amount FROM orders " +
      "WHERE COALESCE(is_test,0)=0 AND status<>'cancelled' AND julianday(created_at) >= julianday(?) AND julianday(created_at) < julianday(?, '+1 day') GROUP BY 1"
    ).bind(from, to).all()).results) || [];

    // ---- café leads by channel (B2B) ----
    const leads = ((await db.prepare(
      "SELECT LOWER(COALESCE(NULLIF(src,''), NULLIF(utm_source,''), '(direct)')) AS channel, COUNT(*) AS n FROM leads WHERE is_test=0 AND julianday(created_at) >= julianday(?) AND julianday(created_at) < julianday(?, '+1 day') GROUP BY 1"
    ).bind(from, to).all()).results) || [];

    // ---- ad spend ----
    const spend = ((await db.prepare("SELECT LOWER(channel) AS channel, SUM(amount) AS amount FROM ad_spend WHERE spend_date >= ? AND spend_date <= ? GROUP BY 1").bind(from, to).all()).results) || [];
    const spendRowCount = ((await db.prepare("SELECT COUNT(*) AS n FROM ad_spend WHERE spend_date >= ? AND spend_date <= ?").bind(from, to).first()) || {}).n || 0;

    const rows = analyzeChannels({ sessions, orders, leads, spend }, st.values);
    const totals = rows.reduce((a, r) => ({
      sessions: a.sessions + r.sessions, orders: a.orders + r.orders, paid_orders: a.paid_orders + r.paid_orders, revenue: a.revenue + r.revenue,
      kg: a.kg + r.kg, spend: a.spend + r.spend, gross_profit: a.gross_profit + r.gross_profit, leads: a.leads + r.leads,
    }), { sessions: 0, orders: 0, paid_orders: 0, revenue: 0, kg: 0, spend: 0, gross_profit: 0, leads: 0 });
    totals.net_profit = totals.gross_profit - totals.spend;
    totals.checkout_sessions = checkoutSessions;

    // ---- month pace vs target (Bangkok month, real paid kg) ----
    const bm = bangkokMonth(now);
    const m = await db.prepare("SELECT COALESCE(SUM(total_kg),0) AS kg FROM orders WHERE COALESCE(is_test,0)=0 AND status='paid' AND julianday(created_at) >= julianday(?)").bind(bm.startUtc.toISOString()).first();
    const monthPace = pace({ kgMonthToDate: (m && m.kg) || 0, target: st.values.target_kg_month, rate: st.values, now });

    const warnings = buildWarnings({ settings: st.values, custom: st.custom, rows, totals, spendRowCount, sessionsAvailable });
    if (!monthPace.capacity_ok) warnings.push("เป้า " + monthPace.target_kg + " กก./เดือน มากกว่ากำลังคั่วตามที่ตั้งไว้ (" + monthPace.capacity_kg_month + " กก.) ปรับกำลังคั่วหรือเป้า");
    const actions = rows.filter((r) => !["NOT_ACTIONABLE", "INSUFFICIENT_DATA"].includes(r.status)).slice(0, 5).map((r) => ({ channel: r.channel, status: r.status, text: r.action }));

    return json({ success: true, period: { from, to }, settings: { values: st.values, custom: st.custom }, pace: monthPace, totals, channels: rows, actions, warnings });
  } catch (e) { return json({ success: false, status: "ERROR", error: String(e && e.message || e) }, 500); }
}

export async function onRequestPost(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return json({ success: false, status: "DB_BINDING_NOT_FOUND" }, 500);
    if (context.request.headers.get("x-requested-with") !== "tato-hq") return json({ success: false, status: "FORBIDDEN" }, 403);
    await ensureSchema(db);
    const b = await context.request.json().catch(() => ({}));
    if (b.action !== "set_setting" || !SETTING_KEYS.includes(String(b.key))) return json({ success: false, status: "SETTING_NOT_ALLOWED" }, 400);
    const v = validateSetting(String(b.key), b.value);
    if (!v.ok) return json({ success: false, status: v.error }, 400);
    if (v.value == null) await db.prepare("DELETE FROM settings WHERE key=?").bind("mb_" + b.key).run();
    else await db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind("mb_" + b.key, String(v.value)).run();
    return json({ success: true, status: "SETTING_SAVED" });
  } catch (e) { return json({ success: false, status: "ERROR", error: String(e && e.message || e) }, 500); }
}
