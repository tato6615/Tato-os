// TATO-OS AI Team: the eight HQ roles, each working on real (non-test) data. Route: /api/ai-team (admin auth via _middleware.js)
//   GET                       -> roles, last run of each, whether Workers AI is bound, evidence level
//   POST {agent:"research"|"market"|"behavior"|"strategy"|"product"|"growth"|"data"|"automation"|"all"}
//        (header x-requested-with: tato-hq)
// Rules: AI only summarises evidence and RECOMMENDS; a human decides and sends anything (nothing is executed here).
// Privacy: names and phone numbers are NEVER sent to the model. Leads/customers go in as opaque refs (L1, L2, ...)
//          and the refs are swapped back to shop names only in the admin response.
// Works without the AI binding too: every role then returns a rule-based summary with status RULES_ONLY.
import { ensureSchema } from "../../shared/schema.js";
import { onRequestGet as marketingGet } from "./marketing-brain.js";
import { onRequestGet as reorderGet } from "./cafe-reorder.js";

const MODEL = "@cf/zai-org/glm-4.7-flash";
const COOLDOWN_MS = 15000;
const PROMPT_VERSION = "AI_TEAM_V1";

export const ROLES = {
  research: { label: "Research AI", job: "จัดระเบียบสัญญาณตลาดที่บันทึกไว้ในระบบ (ไม่มีการค้นเว็บเอง) พร้อมบอกว่ายังขาดข้อมูลอะไรที่คนต้องไปเก็บ" },
  market: { label: "Market AI", job: "แบ่งกลุ่มร้านกาแฟที่ติดต่อเข้ามา (ระยะเปิดร้าน, ปริมาณต่อสัปดาห์, เครื่อง, ช่องทาง) และบอกกลุ่มที่น่าไล่ตามก่อน" },
  behavior: { label: "Behavior AI", job: "อ่านทางเดินของผู้เข้าชม (เข้าหน้า > คลิก > เริ่มสั่ง > สั่งสำเร็จ / เครื่องคำนวณ / เช็กลิสต์ / ขอตัวอย่าง) บอกว่าหลุดตรงไหน" },
  strategy: { label: "Strategy AI", job: "เสนอสมมติฐานและการทดลอง 1-3 ข้อสำหรับสัปดาห์นี้ จากผล Marketing Brain และข้อมูลจริง ตัดสินใจโดยเจ้าของ" },
  product: { label: "Product AI", job: "จากออเดอร์และความต้องการของ lead เสนอแนวคิดข้อเสนอ ขนาดแพ็ก ราคา และคำถามที่ควรถามลูกค้า" },
  growth: { label: "Growth AI", job: "ร่างข้อความทัก/โพสต์ภาษาไทยสำหรับ lead ที่ยังไม่ได้ติดต่อ และช่องทางที่ควรโพสต์ เจ้าของเป็นคนส่งเอง" },
  data: { label: "Data AI", job: "ตรวจคุณภาพข้อมูลและความผิดปกติ (ข้อมูลทดสอบ ช่องทางหาย ตัวเลขน้อยเกินสรุป) แล้วบอกว่าตัวเลขไหนเชื่อได้แค่ไหน" },
  automation: { label: "Automation AI", job: "รวบรวมงานที่ควรทำวันนี้ (lead ค้างไม่ติดต่อ ออเดอร์ค้างจ่าย ร้านถึงรอบสั่งซ้ำ) เป็นเช็กลิสต์รออนุมัติ ไม่ส่งข้อความเอง" },
};

const GUARD = [
  "คุณคือผู้ช่วยวิเคราะห์ของ TATO Coffee (กาแฟอาราบิก้าสายพันธุ์เดียว ดอยเวียงผา เชียงใหม่ ราคา 550 บาท/กก. คั่วสดตามออเดอร์)",
  "ตอบเป็นภาษาไทย กระชับ ไม่เกิน 180 คำ ใช้หัวข้อสั้น ๆ หรือข้อ 1-2-3 ได้",
  "ใช้เฉพาะหลักฐานที่ให้มาเท่านั้น ห้ามแต่งตัวเลข ห้ามเดา ถ้าข้อมูลน้อยให้บอกตรง ๆ ว่ายังสรุปไม่ได้",
  "ห้ามอ้างว่า \"เก็บด้วยมือ\" \"หมักกลางคืน\" หรือรางวัล/ใบรับรองใด ๆ เพราะยังไม่ได้ยืนยัน",
  "เสนอแนะเท่านั้น ไม่ตัดสินใจแทนเจ้าของ ไม่บอกว่าได้ลงมือทำสิ่งใดไปแล้ว",
  "อ้างลูกค้าด้วยรหัส L1, L2 ตามที่ให้มา ห้ามเดาชื่อหรือเบอร์",
  "รูปแบบคำตอบ: ภาษาไทยทางการ ประโยคสั้น ไม่เกิน 3 ข้อ ขึ้นต้นแต่ละข้อด้วย - ห้ามใช้ Markdown ห้ามใช้เครื่องหมาย ** หรือ #",
  "ห้ามเสนอส่วนลด ราคา โปรโมชัน การแจกฟรี หรือการเปลี่ยนราคา เพราะเป็นอำนาจตัดสินใจของเจ้าของ",
  "ห้ามคำนวณเปอร์เซ็นต์ ค่าเฉลี่ย หรือตัวเลขใหม่เอง ใช้เฉพาะตัวเลขที่ปรากฏในข้อมูลที่ให้ตามที่เขียนไว้เท่านั้น",
  "ใช้ศัพท์ภาษาไทยที่เข้าใจง่าย หลีกเลี่ยงศัพท์อังกฤษที่ไม่จำเป็น ห้ามใช้ชื่อฟิลด์ในระบบ เช่น total_real_leads ในคำตอบ",
  "ถ้าข้อมูลไม่พอ ให้ตอบสั้น ๆ ว่า ข้อมูลยังไม่เพียงพอ พร้อมระบุว่าต้องเก็บข้อมูลอะไรเพิ่ม ห้ามเดาหรือคาดการณ์",
].join(" ");

function json(d, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" } });
}
const adminWriteOk = (r) => r.headers.get("x-requested-with") === "tato-hq";
const hoursSince = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 3600000)) : null; };

async function safe(fn, fallback) { try { return await fn(); } catch (e) { return fallback; } }

async function ensureRunsTable(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS ai_team_runs (id TEXT PRIMARY KEY, agent TEXT NOT NULL, status TEXT NOT NULL, evidence_level TEXT, output TEXT, error TEXT, created_at TEXT NOT NULL)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS ai_team_runs_agent_idx ON ai_team_runs(agent, created_at)").run();
}

/** Real data only: test rows and cancelled orders are excluded. Returns plain data + a private refs map (ref -> shop name). */
export async function gather(context) {
  const env = context.env, db = env.DB;
  const refs = {};
  const leadsRaw = await safe(async () => ((await db.prepare("SELECT id,name,shop_name,stage,menu,machine,kg_week,src,status,note,created_at FROM leads WHERE is_test=0 ORDER BY created_at DESC LIMIT 60").all()).results || []), []);
  const leads = leadsRaw.map((l, i) => {
    const ref = "L" + (i + 1);
    refs[ref] = l.shop_name || l.name || ref;
    return { ref, stage: l.stage || null, menu: l.menu || null, machine: l.machine || null, kg_week: l.kg_week || null, src: l.src || "(direct)", status: l.status || "new", hours_old: hoursSince(l.created_at), has_note: !!l.note };
  });

  const orders = await safe(async () => {
    const r = (await db.prepare("SELECT status, COUNT(*) AS n, COALESCE(SUM(total_kg),0) AS kg, COALESCE(SUM(total_amount),0) AS amt FROM orders WHERE COALESCE(is_test,0)=0 AND status!='cancelled' GROUP BY status").all()).results || [];
    const pend = (await db.prepare("SELECT created_at FROM orders WHERE COALESCE(is_test,0)=0 AND status='pending' ORDER BY created_at ASC LIMIT 20").all()).results || [];
    return { by_status: r, pending_hours: pend.map((p) => hoursSince(p.created_at)) };
  }, { by_status: [], pending_hours: [] });

  const funnel = await safe(async () => {
    const cols = new Set(((await db.prepare("PRAGMA table_info(behavior_events)").all()).results || []).map((c) => c.name));
    const ev = cols.has("event_type") ? "event_type" : cols.has("event_name") ? "event_name" : null;
    const sid = cols.has("session_id") ? "session_id" : cols.has("anonymous_id") ? "anonymous_id" : null;
    if (!ev || !sid || !cols.has("metadata")) return { available: false, events: {} };
    const rows = (await db.prepare(
      "SELECT ev, COUNT(DISTINCT sid) AS sessions FROM (SELECT " + ev + " AS ev, " + sid + " AS sid, CASE WHEN json_valid(metadata) THEN metadata ELSE '{}' END AS m FROM behavior_events WHERE julianday(created_at) >= julianday('now','-30 days')) " +
      "WHERE COALESCE(CAST(json_extract(m,'$.is_test') AS TEXT),'0') NOT IN ('1','true') AND sid IS NOT NULL GROUP BY ev"
    ).all()).results || [];
    const events = {}; for (const r of rows) events[r.ev] = r.sessions;
    return { available: true, events };
  }, { available: false, events: {} });

  const ads = await safe(async () => (await db.prepare("SELECT channel, ROUND(SUM(amount),2) AS spend FROM ad_spend WHERE spend_date >= date('now','-30 days') GROUP BY channel").all()).results || [], []);
  const signals = await safe(async () => (await db.prepare("SELECT * FROM market_signals ORDER BY rowid DESC LIMIT 20").all()).results || [], []);
  const testCounts = await safe(async () => ({
    leads: (await db.prepare("SELECT COUNT(*) AS n FROM leads WHERE is_test=1").first()).n,
    orders: (await db.prepare("SELECT COUNT(*) AS n FROM orders WHERE COALESCE(is_test,0)=1").first()).n,
  }), { leads: 0, orders: 0 });

  const brain = await safe(async () => {
    const res = await marketingGet({ env, request: new Request(new URL("/api/marketing-brain", context.request.url)) });
    const j = await res.json();
    return { channels: (j.channels || []).slice(0, 8), actions: (j.actions || []).slice(0, 8), pace: j.pace || null, warnings: j.warnings || [] };
  }, null);

  const reorderRaw = await safe(async () => {
    const res = await reorderGet({ env, request: new Request(new URL("/api/cafe-reorder", context.request.url)) });
    const j = await res.json();
    return j.customers || j.cafes || j.rows || [];
  }, []);
  const reorder = reorderRaw.filter((r) => r.state === "due" || r.state === "soon").slice(0, 10).map((r, i) => {
    const ref = "R" + (i + 1); refs[ref] = r.shop || r.name || ref;
    return { ref, state: r.state, days_left: r.days_left, orders: r.orders, last_kg: r.last_kg };
  });

  const paidOrders = (orders.by_status.find((o) => o.status === "paid") || {}).n || 0;
  const sessions = funnel.events.content_view || 0;
  const real = leads.length + orders.by_status.reduce((a, o) => a + o.n, 0) + sessions;
  const evidence_level = real === 0 ? "none" : (leads.length + paidOrders < 5 || sessions < 30) ? "thin" : "ok";
  return { refs, evidence_level, counts: { real_leads: leads.length, paid_orders: paidOrders, sessions_30d: sessions, test_leads: testCounts.leads, test_orders: testCounts.orders }, leads, orders, funnel, ads, signals, brain, reorder };
}

/** Per-role evidence slice (what the model may see) + deterministic fallback text. */
export function sliceFor(role, ev) {
  const uncontacted = ev.leads.filter((l) => l.status === "new");
  const stale = uncontacted.filter((l) => (l.hours_old || 0) >= 24);
  const pendingOld = ev.orders.pending_hours.filter((h) => h >= 24);
  const f = ev.funnel.events || {};
  const countBy = (k) => ev.leads.reduce((m, l) => { const v = l[k] || "(ไม่ระบุ)"; m[v] = (m[v] || 0) + 1; return m; }, {});
  switch (role) {
    case "research": return {
      data: { signals: ev.signals, counts: ev.counts },
      fallback: ev.signals.length ? "มีสัญญาณตลาดในระบบ " + ev.signals.length + " รายการ ให้เจ้าของไล่ดูในหน้า Market" : "ยังไม่มีสัญญาณตลาดในระบบ (0 รายการ) ควรเก็บเอง: ร้านกาแฟเปิดใหม่ในเชียงใหม่ ราคาเมล็ดของคู่แข่ง และคำถามที่ร้านถามบ่อย แล้วบันทึกผ่าน POST /api/market",
    };
    case "market": return {
      data: { leads_by_stage: countBy("stage"), leads_by_src: countBy("src"), leads_by_kg_week: countBy("kg_week"), leads_by_machine: countBy("machine"), total_real_leads: ev.leads.length },
      fallback: ev.leads.length ? "lead จริง " + ev.leads.length + " ราย แยกตามระยะ: " + JSON.stringify(countBy("stage")) : "ยังไม่มี lead จริง จึงยังแบ่งกลุ่มไม่ได้",
    };
    case "behavior": return {
      data: { sessions_by_event_30d: f, note: "จำนวนเซสชันที่ไม่ซ้ำต่ออีเวนต์ ไม่รวมข้อมูลทดสอบ" },
      fallback: ev.funnel.available ? "เซสชัน 30 วัน: เข้าหน้า " + (f.content_view || 0) + " เริ่มสั่ง " + (f.checkout_start || 0) + " ขอตัวอย่าง " + (f.cafe_sample_toggle || 0) : "ยังอ่านตารางพฤติกรรมไม่ได้",
    };
    case "strategy": return {
      data: { marketing_brain: ev.brain, ads_30d: ev.ads, counts: ev.counts, funnel: f },
      fallback: ev.brain && ev.brain.warnings.length ? "Marketing Brain เตือน: " + ev.brain.warnings.slice(0, 3).map((w) => (typeof w === "string" ? w : w.message || JSON.stringify(w))).join(" | ") : "ยังไม่มีข้อมูลพอเสนอการทดลอง ให้เน้นหาเซสชันและ lead จริงก่อน",
    };
    case "product": return {
      data: { orders: ev.orders.by_status, leads_by_kg_week: countBy("kg_week"), leads_by_menu: countBy("menu"), leads_with_note: ev.leads.filter((l) => l.has_note).length },
      fallback: "ออเดอร์แยกสถานะ: " + (ev.orders.by_status.length ? JSON.stringify(ev.orders.by_status) : "ยังไม่มี") + " ข้อเสนอแนะต้องรอข้อมูลคำสั่งซื้อจริงเพิ่ม",
    };
    case "growth": return {
      data: { uncontacted_leads: uncontacted.slice(0, 10), channels_with_leads: countBy("src"), reorder_due: ev.reorder },
      fallback: uncontacted.length ? "มี lead ยังไม่ติดต่อ " + uncontacted.length + " ราย (ค้างเกิน 24 ชม. " + stale.length + ") ใช้สคริปต์ทักในแชตกับผมได้" : "ไม่มี lead ค้างติดต่อ ใช้เวลากับการทักร้านใหม่และโพสต์ในกลุ่ม",
    };
    case "data": return {
      data: { counts: ev.counts, warnings_from_marketing_brain: ev.brain ? ev.brain.warnings : null, leads_without_src: ev.leads.filter((l) => l.src === "(direct)").length, funnel_available: ev.funnel.available },
      fallback: "ข้อมูลทดสอบที่ถูกแยกออก: lead " + ev.counts.test_leads + " ออเดอร์ " + ev.counts.test_orders + " | ข้อมูลจริง: lead " + ev.counts.real_leads + " ออเดอร์จ่ายแล้ว " + ev.counts.paid_orders + " เซสชัน 30 วัน " + ev.counts.sessions_30d + (ev.evidence_level !== "ok" ? " (น้อยเกินกว่าจะสรุปแนวโน้ม)" : ""),
    };
    case "automation": return {
      data: { leads_uncontacted_over_24h: stale.length, leads_uncontacted_total: uncontacted.length, orders_pending_over_24h: pendingOld.length, reorder_due_or_soon: ev.reorder },
      fallback: "งานรออนุมัติ: lead ค้างติดต่อ >24 ชม. " + stale.length + " | ออเดอร์ค้างจ่าย >24 ชม. " + pendingOld.length + " | ร้านถึง/ใกล้รอบสั่งซ้ำ " + ev.reorder.length,
    };
    default: return null;
  }
}

export function extractText(r) {
  if (!r) return "";
  if (typeof r === "string") return r;
  const c = r.response ?? r.result?.response ?? r.choices?.[0]?.message?.content ?? r.output_text ?? "";
  return typeof c === "string" ? c : JSON.stringify(c);
}

function cleanOutput(t) {
  return String(t || "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]*/gm, "")
    .replace(/^[ \t]*[*\-•][ \t]+/gm, "• ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function qualityIssue(text) {
  if (text.length > 900) return "ยาวเกินกำหนด " + text.length + " ตัวอักษร";
  if (/\uFFFD/.test(text)) return "พบอักขระเสีย";
  if (/\b[a-z]+_[a-z_]+\b/i.test(text) || /(^|\s)_[a-z]/i.test(text)) return "พบชื่อฟิลด์ระบบ";
  if (/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]{3,}/.test(text)) return "สระ/วรรณยุกต์ซ้อนผิดปกติ";
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const heads = lines.filter((l) => l.length < 60 && !/^[•\d]/.test(l));
  if (new Set(heads).size < heads.length) return "มีหัวข้อซ้ำ";
  if (!/[.!?ๆ\u0E01-\u0E4E)\d]$/.test(text)) return "ประโยคจบไม่สมบูรณ์";
  return null;
}

function unsupportedNumbers(text, data) {
  const norm = (x) => String(x).replace(/,/g, "");
  const allowed = new Set((JSON.stringify(data).match(/\d+(?:\.\d+)?/g) || []).map(norm));
  const body = norm(text)
    .replace(/^[ \t]*(?:•[ \t]*)?\d+[.)][ \t]+/gm, "")
    .replace(/\b[LR]\d{1,2}\b/g, "");
  const found = body.match(/\d+(?:\.\d+)?/g) || [];
  return found.filter((n) => !allowed.has(n) && !(Number.isInteger(+n) && +n <= 3));
}

async function runRole(role, ev, env) {
  const meta = ROLES[role], slice = sliceFor(role, ev);
  const out = { agent: role, label: meta.label, evidence_level: ev.evidence_level, prompt_version: PROMPT_VERSION };
  const needsData = role !== "growth" && role !== "research";
  if (ev.evidence_level === "none" && needsData) return { ...out, status: "NO_DATA", output: "ยังไม่มีข้อมูลจริง (ไม่มี lead ออเดอร์ หรือเซสชัน) จึงไม่เรียก AI เพื่อไม่ให้เดา", rules_summary: slice.fallback };
  if (!env.AI || typeof env.AI.run !== "function") return { ...out, status: "RULES_ONLY", output: slice.fallback, rules_summary: slice.fallback, note: "ยังไม่ได้ผูก Workers AI (Binding ชื่อ AI) จึงแสดงสรุปจากกฎ" };
  try {
    const messages = [
        { role: "system", content: GUARD + " หน้าที่ของคุณ: " + meta.job + (ev.evidence_level === "thin" ? " ข้อมูลตอนนี้น้อย ให้ระบุว่าเป็นข้อสังเกตเบื้องต้น" : "") },
        { role: "user", content: JSON.stringify(slice.data) },
      ];
    const call = (opts) => env.AI.run(MODEL, { messages, ...opts });
    let r = await call({ max_tokens: 1500, temperature: 0.1, repetition_penalty: 1.15, chat_template_kwargs: { enable_thinking: false } });
    let text = extractText(r).trim();
    if (!text) {
      r = await call({ max_tokens: 4000 });
      text = extractText(r).trim();
    }
    if (!text) return { ...out, status: "AI_EMPTY", output: slice.fallback, rules_summary: slice.fallback };
    text = cleanOutput(text);
    const qi = text ? qualityIssue(text) : null;
    if (qi) return { ...out, status: "AI_UNVERIFIED", output: slice.fallback, rules_summary: slice.fallback, note: "คุณภาพข้อความ AI ไม่ผ่านเกณฑ์ (" + qi + ") จึงแสดงสรุปจากกฎแทน" };
    if (!text) return { ...out, status: "AI_EMPTY", output: slice.fallback, rules_summary: slice.fallback };
    const bad = unsupportedNumbers(text, slice.data);
    if (bad.length) return { ...out, status: "AI_UNVERIFIED", output: slice.fallback, rules_summary: slice.fallback, note: "ตัวเลขที่ AI อ้างไม่พบในข้อมูลจริง จึงแสดงสรุปจากกฎแทน", unverified: bad.slice(0, 5) };
    text = text.replace(/\b([LR]\d{1,2})\b/g, (m) => (ev.refs[m] ? ev.refs[m] : m));
    return { ...out, status: "AI_ANALYZED", model: MODEL, output: text, rules_summary: slice.fallback };
  } catch (e) {
    return { ...out, status: "AI_ERROR", output: slice.fallback, rules_summary: slice.fallback, error: String(e && e.message || e).slice(0, 200) };
  }
}

async function save(db, r) {
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO ai_team_runs (id,agent,status,evidence_level,output,error,created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(id, r.agent, r.status, r.evidence_level || null, r.output || null, r.error || null, new Date().toISOString()).run();
  return id;
}

export async function onRequestGet(context) {
  try {
    const db = context.env && context.env.DB;
    if (!db) return json({ success: false, status: "DB_BINDING_NOT_FOUND" }, 500);
    await ensureSchema(db); await ensureRunsTable(db);
    const last = {};
    for (const k of Object.keys(ROLES)) {
      last[k] = await db.prepare("SELECT status, evidence_level, output, created_at FROM ai_team_runs WHERE agent=? ORDER BY created_at DESC LIMIT 1").bind(k).first();
    }
    const ev = await gather(context);
    return json({ success: true, layer: PROMPT_VERSION, ai_bound: !!(context.env.AI && typeof context.env.AI.run === "function"), model: MODEL, evidence_level: ev.evidence_level, counts: ev.counts, roles: Object.entries(ROLES).map(([k, v]) => ({ agent: k, label: v.label, job: v.job, last: last[k] || null })) });
  } catch (e) { return json({ success: false, error: String(e && e.message || e) }, 500); }
}

export async function onRequestPost(context) {
  try {
    if (!adminWriteOk(context.request)) return json({ success: false, status: "FORBIDDEN" }, 403);
    const db = context.env && context.env.DB;
    if (!db) return json({ success: false, status: "DB_BINDING_NOT_FOUND" }, 500);
    const body = await context.request.json().catch(() => ({}));
    const want = String(body.agent || "");
    const roles = want === "all" ? Object.keys(ROLES) : ROLES[want] ? [want] : null;
    if (!roles) return json({ success: false, status: "UNKNOWN_AGENT", valid: [...Object.keys(ROLES), "all"] }, 400);
    await ensureSchema(db); await ensureRunsTable(db);

    // cooldown: protect the AI quota from double clicks / repeated "Run team"
    const results = [];
    const toRun = [];
    for (const k of roles) {
      const last = await db.prepare("SELECT status, evidence_level, output, created_at FROM ai_team_runs WHERE agent=? ORDER BY created_at DESC LIMIT 1").bind(k).first();
      if (last && Date.now() - Date.parse(last.created_at) < COOLDOWN_MS) results.push({ agent: k, label: ROLES[k].label, status: last.status, evidence_level: last.evidence_level, output: last.output, cached: true });
      else toRun.push(k);
    }
    if (toRun.length) {
      const ev = await gather(context);
      const fresh = await Promise.all(toRun.map((k) => runRole(k, ev, context.env)));
      for (const r of fresh) { await save(db, r); results.push(r); }
    }
    results.sort((a, b) => Object.keys(ROLES).indexOf(a.agent) - Object.keys(ROLES).indexOf(b.agent));
    return json({ success: true, layer: PROMPT_VERSION, ai_bound: !!(context.env.AI && typeof context.env.AI.run === "function"), results });
  } catch (e) { return json({ success: false, error: String(e && e.message || e) }, 500); }
}
