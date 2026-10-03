// TATO-OS marketing brain: pure decision rules (no DB, no network) so they can be unit-tested.
// Philosophy: the system summarises evidence and RECOMMENDS; a human decides and acts.
// It never says SCALE/STOP on thin data (see min_sessions / min_orders_confident).

export const DEFAULTS = {
  cost_per_kg: 390,          // THB. Owner's average cost. Confirm: per kg of roasted or green beans?
  other_cost_per_order: 0,   // THB. Packaging + courier cost per paid order (not included in cost_per_kg)
  min_sessions: 50,          // sessions needed before any verdict (HANDOFF rule: 30-50 real sessions)
  min_orders_confident: 3,   // paid orders needed before the result counts as reliable
  scale_roas: 2,             // gross profit / ad spend needed to recommend SCALE
  test_budget: 1500,         // THB. Stop recommendation if this much is spent with 0 paid orders
  target_kg_month: 500,
  roast_kg_per_day: 30,
  roast_days_per_week: 4,
};

// [min, max, integer?]
export const LIMITS = {
  cost_per_kg: [0, 100000, false], other_cost_per_order: [0, 100000, false],
  min_sessions: [1, 10000, true], min_orders_confident: [1, 1000, true],
  scale_roas: [0.1, 100, false], test_budget: [0, 10000000, false],
  target_kg_month: [1, 100000, false], roast_kg_per_day: [1, 1000, false], roast_days_per_week: [1, 7, true],
};
export const SETTING_KEYS = Object.keys(DEFAULTS);

export function validateSetting(key, raw) {
  if (!Object.prototype.hasOwnProperty.call(LIMITS, key)) return { ok: false, error: "SETTING_NOT_ALLOWED" };
  if (raw === "" || raw == null) return { ok: true, value: null }; // clear -> back to default
  const n = Number(raw);
  const [lo, hi, int] = LIMITS[key];
  if (!Number.isFinite(n) || n < lo || n > hi || (int && !Number.isInteger(n))) return { ok: false, error: "INVALID_VALUE" };
  return { ok: true, value: n };
}

/** rows: [{key:'mb_cost_per_kg', value:'390'}] -> { values, custom:Set } */
export function parseSettings(rows) {
  const values = { ...DEFAULTS }, custom = {};
  for (const r of rows || []) {
    const key = String(r.key || "").replace(/^mb_/, "");
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) continue;
    const v = validateSetting(key, r.value);
    if (v.ok && v.value != null) { values[key] = v.value; custom[key] = true; }
  }
  return { values, custom };
}

const ALIAS = { fb: "facebook", "facebook.com": "facebook", meta: "facebook", ig: "instagram", tt: "tiktok", "google_ads": "google", adwords: "google" };
export function normChannel(v) {
  const s = String(v == null ? "" : v).trim().toLowerCase().slice(0, 60);
  if (!s) return "(direct)";
  return ALIAS[s] || s;
}

/** Month start in Asia/Bangkok (UTC+7) as a UTC Date, plus day counts. */
export function bangkokMonth(now = new Date()) {
  const b = new Date(now.getTime() + 7 * 3600 * 1000);
  const y = b.getUTCFullYear(), m = b.getUTCMonth();
  const startUtc = new Date(Date.UTC(y, m, 1) - 7 * 3600 * 1000);
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const dayOfMonth = b.getUTCDate() + (b.getUTCHours() * 60 + b.getUTCMinutes()) / 1440; // fractional days elapsed
  return { startUtc, daysInMonth, elapsedDays: Math.max(dayOfMonth, 1) };
}

const round = (n, d = 2) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

function merge(into, rows, field, mapFn) {
  for (const r of rows || []) {
    const ch = normChannel(r.channel);
    const t = (into[ch] = into[ch] || { channel: ch, sessions: 0, orders: 0, paid_orders: 0, revenue: 0, kg: 0, pending_amount: 0, leads: 0, spend: 0 });
    mapFn(t, r);
  }
}

/**
 * inputs: { sessions:[{channel,n}], orders:[{channel,orders,paid_orders,revenue,kg,pending_amount}],
 *           leads:[{channel,n}], spend:[{channel,amount}] }
 */
export function analyzeChannels(inputs, settings) {
  const s = settings;
  const by = {};
  merge(by, inputs.sessions, "sessions", (t, r) => { t.sessions += Number(r.n) || 0; });
  merge(by, inputs.orders, "orders", (t, r) => {
    t.orders += Number(r.orders) || 0; t.paid_orders += Number(r.paid_orders) || 0; t.revenue += Number(r.revenue) || 0;
    t.kg += Number(r.kg) || 0; t.pending_amount += Number(r.pending_amount) || 0;
  });
  merge(by, inputs.leads, "leads", (t, r) => { t.leads += Number(r.n) || 0; });
  merge(by, inputs.spend, "spend", (t, r) => { t.spend += Number(r.amount) || 0; });

  const rows = Object.values(by).map((t) => {
    const cost = t.kg * s.cost_per_kg + t.paid_orders * s.other_cost_per_order;
    const gross = t.revenue - cost;
    const paid = t.spend > 0;
    const row = {
      ...t, revenue: round(t.revenue), kg: round(t.kg), spend: round(t.spend), pending_amount: round(t.pending_amount),
      gross_profit: round(gross), net_profit: round(gross - t.spend),
      profit_per_order: t.paid_orders ? round(gross / t.paid_orders) : null,
      cac: paid && t.paid_orders ? round(t.spend / t.paid_orders) : null,
      roas: paid ? round(t.revenue / t.spend) : null,
      profit_roas: paid ? round(gross / t.spend) : null,
      session_to_order_pct: t.sessions ? round((t.paid_orders / t.sessions) * 100, 1) : null,
      is_paid: paid, confidence: t.paid_orders >= s.min_orders_confident ? "ok" : "low",
    };
    Object.assign(row, decide(row, s));
    return row;
  });
  const rank = { STOP: 0, FIX: 1, REDUCE: 2, SCALE: 3, KEEP: 4, WORKING: 5, NO_SALES_YET: 6, INSUFFICIENT_DATA: 7, NOT_ACTIONABLE: 8 };
  rows.sort((a, b) => (rank[a.status] - rank[b.status]) || (b.revenue - a.revenue) || (b.sessions - a.sessions));
  return rows;
}

export function decide(r, s) {
  const fmt = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (r.channel === "(direct)")
    return { status: "NOT_ACTIONABLE", action: "ไม่ทราบช่องทาง (เข้าตรง/ไม่มี src หรือ utm) ใช้ลิงก์ที่ติด ?src= หรือ utm_source ทุกครั้งที่แจก" };
  // money guardrail first: independent of session count
  if (r.is_paid && r.paid_orders === 0 && r.spend >= s.test_budget)
    return { status: "STOP", action: "หยุด: ใช้ไป " + fmt(r.spend) + " บาท (ถึงงบทดสอบ " + fmt(s.test_budget) + ") แต่ยังไม่มีออเดอร์ที่จ่ายแล้ว ตรวจโฆษณา กลุ่มเป้าหมาย และหน้าขายก่อนใช้เงินต่อ" };
  if (r.sessions < s.min_sessions)
    return { status: "INSUFFICIENT_DATA", action: "ยังไม่พอตัดสิน (" + r.sessions + "/" + s.min_sessions + " เซสชัน) ให้เก็บข้อมูลต่อ ยังไม่ปรับงบ" };
  if (r.is_paid) {
    if (r.paid_orders === 0)
      return { status: "FIX", action: "มีคนเข้า " + r.sessions + " เซสชัน แต่ยังไม่มีออเดอร์ที่จ่ายแล้ว อย่าเพิ่มงบ ตรวจข้อเสนอ หน้าสินค้า และขั้นตอนชำระเงินก่อน" };
    if (r.profit_roas >= s.scale_roas && r.confidence === "ok")
      return { status: "SCALE", action: "เพิ่มงบได้ทีละไม่เกิน 20% แล้วดูผลอีกรอบ (กำไรต่อค่าโฆษณา " + r.profit_roas + " เท่า จาก " + r.paid_orders + " ออเดอร์)" };
    if (r.profit_roas >= 1)
      return { status: "KEEP", action: "คงงบเดิม" + (r.confidence === "low" ? " (ตัวอย่างยังน้อย เพียง " + r.paid_orders + " ออเดอร์ อย่าเพิ่งเพิ่มงบ)" : " และลองปรับให้ต้นทุนต่อออเดอร์ต่ำลง") };
    return { status: "REDUCE", action: "ค่าโฆษณาสูงกว่ากำไร (ต้นทุนต่อออเดอร์ " + fmt(r.cac) + " บาท มากกว่ากำไรต่อออเดอร์ " + fmt(r.profit_per_order) + " บาท) ลดงบหรือแก้ข้อเสนอ/กลุ่มเป้าหมายก่อน" };
  }
  if (r.paid_orders > 0)
    return { status: "WORKING", action: "ช่องทางฟรีนี้ทำยอดได้ " + r.paid_orders + " ออเดอร์ ทำต่อ และหาช่องทางคล้ายกัน" };
  return { status: "NO_SALES_YET", action: "มีคนเข้า " + r.sessions + " เซสชัน แต่ยังไม่มีออเดอร์ที่จ่ายแล้ว ตรวจข้อเสนอและหน้าสินค้า" };
}

export function pace({ kgMonthToDate, target, rate, now = new Date() }) {
  const m = bangkokMonth(now);
  const projected = (kgMonthToDate / m.elapsedDays) * m.daysInMonth;
  const capMonth = rate.roast_kg_per_day * rate.roast_days_per_week * (m.daysInMonth / 7);
  const daysLeft = Math.max(m.daysInMonth - m.elapsedDays, 0);
  const remaining = Math.max(target - kgMonthToDate, 0);
  return {
    target_kg: target, kg_month_to_date: round(kgMonthToDate), projected_kg: round(projected),
    pct_of_target: round((kgMonthToDate / target) * 100, 1), remaining_kg: round(remaining),
    needed_kg_per_week: daysLeft > 0 ? round(remaining / (daysLeft / 7)) : null,
    capacity_kg_month: round(capMonth), capacity_ok: target <= capMonth,
  };
}

export function buildWarnings({ settings, custom, rows, totals, spendRowCount, sessionsAvailable }) {
  const w = [];
  if (!sessionsAvailable) w.push("อ่านจำนวนผู้เข้าชมจากตาราง behavior_events ไม่ได้ ตัวเลขเซสชันจึงเป็น 0 ทั้งหมด");
  if (!custom.cost_per_kg) w.push("ใช้ต้นทุน " + settings.cost_per_kg + " บาท/กก. ซึ่งเป็นค่าเริ่มต้น ยืนยันว่าหมายถึงเมล็ดคั่วหรือเมล็ดสาร แล้วตั้งค่าให้ตรง (เมล็ดสูญเสียน้ำหนักตอนคั่ว ต้นทุนเมล็ดคั่วจริงจะสูงกว่า)");
  if (!custom.other_cost_per_order) w.push("กำไรยังไม่รวมค่าบรรจุภัณฑ์/ค่าส่งต่อออเดอร์ ตั้งค่า 'ต้นทุนอื่นต่อออเดอร์' เพื่อให้กำไรใกล้ความจริง");
  const direct = rows.find((r) => r.channel === "(direct)");
  if (direct && totals.orders >= 5 && direct.orders / totals.orders > 0.4)
    w.push("ออเดอร์ " + Math.round((direct.orders / totals.orders) * 100) + "% ไม่มีช่องทาง ตรวจว่าทุกลิงก์ที่แจกติด ?src= หรือ utm_source");
  if (!spendRowCount) w.push("ยังไม่ได้บันทึกค่าโฆษณา ระบบจึงคำนวณต้นทุนต่อออเดอร์และกำไรต่อค่าโฆษณาไม่ได้");
  if (totals.sessions < settings.min_sessions) w.push("เซสชันรวม " + totals.sessions + " ยังน้อยกว่า " + settings.min_sessions + " ผลยังเป็นแค่ตัวชี้นำ อย่าตัดสินใจจากตัวเลขนี้");
  return w;
}
