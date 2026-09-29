const json = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });

async function ensure(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS content_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_id TEXT NOT NULL,
    event TEXT NOT NULL,
    session_id TEXT,
    value REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "DB binding missing" }, 500);
  let b;
  try { b = await request.json(); } catch { return json({ error: "invalid json" }, 400); }
  if (!b.content_id || !b.event) return json({ error: "content_id and event required" }, 400);
  await ensure(env.DB);
  await env.DB.prepare(
    "INSERT INTO content_events (content_id, event, session_id, value) VALUES (?,?,?,?)"
  ).bind(String(b.content_id), String(b.event), b.session_id ?? null, Number(b.value) || 0).run();
  return json({ ok: true });
}

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: "DB binding missing" }, 500);
  await ensure(env.DB);
  const { results } = await env.DB.prepare(
    "SELECT content_id, event, COUNT(*) AS n FROM content_events GROUP BY content_id, event ORDER BY n DESC LIMIT 200"
  ).all();
  return json({ results });
}
