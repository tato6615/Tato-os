// Minimal Cloudflare D1 stand-in on top of node:sqlite (Node >= 22.5) for local tests.
import { DatabaseSync } from "node:sqlite";

class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...a) { const s = new Stmt(this.db, this.sql); s.args = a; return s; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args), success: true }; }
  async first() { return this.db.prepare(this.sql).get(...this.args) || null; }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { success: true, meta: { changes: Number(r.changes) } }; }
}
export function makeD1() {
  const db = new DatabaseSync(":memory:");
  return {
    raw: db,
    prepare: (sql) => new Stmt(db, sql),
    async batch(stmts) {
      db.exec("BEGIN");
      try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec("COMMIT"); return out; }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}
// Mirrors the production tables as far as the code touches them (legacy orders lack the new columns).
export function seedLegacy(d1) {
  d1.raw.exec(`
    CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT, business_name TEXT, email TEXT, phone TEXT, segment TEXT, status TEXT NOT NULL DEFAULT 'active', intent_score INTEGER NOT NULL DEFAULT 0, source TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL, currency TEXT, status TEXT, created_at TEXT);
    CREATE TABLE orders (id TEXT PRIMARY KEY, customer_id TEXT, total_amount REAL NOT NULL DEFAULT 0, amount REAL, total_kg REAL NOT NULL DEFAULT 0, quantity REAL, qty REAL, currency TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT (datetime('now')), product_id TEXT, source TEXT, shipping_fee REAL, is_test INTEGER DEFAULT 0);
    CREATE TABLE behavior_events (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id TEXT, anonymous_id TEXT, event_name TEXT NOT NULL, page TEXT, object_type TEXT, object_id TEXT, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')));
    INSERT INTO products (id,name,price,currency,status) VALUES ('p1','TATO Coffee',550,'THB','active');
  `);
}
