// TATO-OS idempotent schema upgrade. Safe to call on every request (cached per isolate).
// The same statements exist in migrations/2026-09-30_order_hardening.sql for manual runs.

const ORDER_COLS = {
  product_id: "TEXT", source: "TEXT", content_id: "TEXT", payment_method: "TEXT",
  shipping_fee: "REAL DEFAULT 0", is_test: "INTEGER NOT NULL DEFAULT 0",
  utm_source: "TEXT", utm_medium: "TEXT", utm_campaign: "TEXT",
  subtotal: "REAL", discount_code: "TEXT", discount_amount: "REAL DEFAULT 0",
  fulfillment_status: "TEXT", tracking_no: "TEXT", courier: "TEXT", shipped_at: "TEXT",
  cancel_reason: "TEXT", cancelled_at: "TEXT",
};
const DETAIL_COLS = {
  postal_code: "TEXT", consent_at: "TEXT", consent_version: "TEXT",
  request_id: "TEXT", lookup_token: "TEXT", ip_hash: "TEXT",
  reminder_sent_at: "TEXT", slip_ref: "TEXT", slip_checked_at: "TEXT", slip_result: "TEXT",
};

let ready = false;

async function colNames(db, table) {
  const r = await db.prepare("PRAGMA table_info(" + table + ")").all();
  return new Set((r.results || []).map((x) => x.name));
}

async function addMissing(db, table, want) {
  const have = await colNames(db, table);
  for (const [name, def] of Object.entries(want)) {
    if (!have.has(name)) {
      try { await db.prepare("ALTER TABLE " + table + " ADD COLUMN " + name + " " + def).run(); }
      catch (e) { if (!/duplicate column/i.test(String(e && e.message))) throw e; }
    }
  }
}

export async function ensureSchema(db) {
  if (ready) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS order_details (order_id TEXT PRIMARY KEY, name TEXT, phone TEXT, email TEXT, address TEXT, roast TEXT, grind TEXT, note TEXT, payment_method TEXT, created_at TEXT)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS checkout_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, ip_hash TEXT NOT NULL, created_at TEXT NOT NULL)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS checkout_attempts_ip_idx ON checkout_attempts(ip_hash, created_at)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS discount_codes (code TEXT PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('percent','fixed')), value REAL NOT NULL, min_kg REAL NOT NULL DEFAULT 0, max_uses INTEGER, used_count INTEGER NOT NULL DEFAULT 0, expires_at TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, name TEXT, phone TEXT, shop_name TEXT, stage TEXT, menu TEXT, machine TEXT, kg_week TEXT, note TEXT, src TEXT, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, is_test INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'new', consent_at TEXT, consent_version TEXT, ip_hash TEXT, created_at TEXT NOT NULL)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS leads_created_idx ON leads(created_at)").run();
  const ordersExists = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'").first();
  if (ordersExists) await addMissing(db, "orders", ORDER_COLS);
  await addMissing(db, "order_details", DETAIL_COLS);
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS order_details_request_idx ON order_details(request_id) WHERE request_id IS NOT NULL").run();
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS order_details_slip_idx ON order_details(slip_ref) WHERE slip_ref IS NOT NULL").run();
  ready = true;
}

export const _test = { reset() { ready = false; } };
