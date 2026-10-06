import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import * as behavior from "../functions/api/behavior.js";

function db() {
  const raw = new DatabaseSync(":memory:");
  raw.exec("CREATE TABLE behavior_events (id TEXT PRIMARY KEY, customer_id TEXT, session_id TEXT, event_type TEXT, page TEXT, product_id TEXT, metadata TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))");
  const DB = { raw, prepare(sql) { const st = raw.prepare(sql); let args = []; const o = { bind(...a) { args = a; return o; }, async run() { st.run(...args); return {}; }, async all() { return { results: st.all(...args) }; } }; return o; } };
  return DB;
}
const post = (DB, body, raw) => behavior.onRequestPost({ env: { DB }, request: new Request("https://t.example/api/behavior", { method: "POST", body: raw ?? JSON.stringify(body) }) });

test("behavior: stores a normal event with clipped fields", async () => {
  const DB = db();
  const r = await post(DB, { session_id: "s1", event_type: "x".repeat(200), page: "/", metadata: { src: "line" } });
  assert.equal(r.status, 200);
  const row = DB.raw.prepare("SELECT * FROM behavior_events").get();
  assert.equal(row.event_type.length, 64);
});

test("behavior: rejects oversized payloads and non-object bodies", async () => {
  const DB = db();
  assert.equal((await post(DB, { event_type: "a", metadata: { blob: "y".repeat(5000) } })).status, 413);
  assert.equal((await post(DB, null, "[1,2]")).status, 400);
  assert.equal((await post(DB, null, "x".repeat(9000))).status, 413);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM behavior_events").get().n, 0);
});

test("behavior GET: returns true total, not just the page size", async () => {
  const DB = db();
  const ins = DB.raw.prepare("INSERT INTO behavior_events (id,event_type,metadata) VALUES (?,?,?)");
  for (let i = 0; i < 205; i++) ins.run("e" + i, "view", "{}");
  const withFirst = { ...DB, prepare(sql) { const o = DB.prepare(sql); o.first = async () => DB.raw.prepare(sql).get(); return o; } };
  const r = await behavior.onRequestGet({ env: { DB: withFirst } });
  const j = await r.json();
  assert.equal(j.events.length, 200);
  assert.equal(j.total, 205);
});
