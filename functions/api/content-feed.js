```javascript
// TATO OS — Public Content Feed + Tracking V1.1
// Parser-safe version
//
// FIX:
// 1. One page open = one content_view
// 2. No server-side duplicate content_view
// 3. content_click remains browser tracked
// 4. No template literals used for SQL strings

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}

function uid() {
  return crypto.randomUUID();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function first(db, sql) {
  var args = Array.prototype.slice.call(arguments, 2);
  var result = await db.prepare(sql).bind.apply(db.prepare(sql), args).first();
  return result || null;
}

async function all(db, sql) {
  var args = Array.prototype.slice.call(arguments, 2);
  var result = await db.prepare(sql).bind.apply(db.prepare(sql), args).all();
  return result && result.results ? result.results : [];
}

async function ensureTables(db) {

  var behaviorSQL =
    "CREATE TABLE IF NOT EXISTS behavior_events (" +
    "id TEXT PRIMARY KEY," +
    "customer_id TEXT," +
    "session_id TEXT," +
    "event_type TEXT," +
    "page TEXT," +
    "product_id TEXT," +
    "metadata TEXT," +
    "created_at TEXT DEFAULT CURRENT_TIMESTAMP" +
    ")";

  await db.prepare(behaviorSQL).run();

  var distributionSQL =
    "CREATE TABLE IF NOT EXISTS content_distributions (" +
    "id TEXT PRIMARY KEY," +
    "content_id TEXT," +
    "channel TEXT," +
    "status TEXT," +
    "source TEXT," +
    "payload TEXT," +
    "result TEXT," +
    "created_at TEXT DEFAULT CURRENT_TIMESTAMP," +
    "completed_at TEXT" +
    ")";

  await db.prepare(distributionSQL).run();
}

async function getPublishedContent(db, contentId, distributionId) {

  if (distributionId) {

    var sql1 =
      "SELECT " +
      "d.id AS distribution_id, " +
      "d.content_id, " +
      "d.channel, " +
      "d.status AS distribution_status, " +
      "d.created_at AS distributed_at, " +
      "c.id, c.source, c.status, c.title, c.objective, " +
      "c.attention_type, c.market_keyword, c.angle, " +
      "c.direction, c.cta, c.content_text, c.created_at " +
      "FROM content_distributions d " +
      "JOIN content_engine c ON c.id = d.content_id " +
      "WHERE d.id = ? AND d.status = 'PUBLISHED' " +
      "LIMIT 1";

    return await first(db, sql1, distributionId);
  }

  if (contentId) {

    var sql2 =
      "SELECT " +
      "d.id AS distribution_id, " +
      "d.content_id, " +
      "d.channel, " +
      "d.status AS distribution_status, " +
      "d.created_at AS distributed_at, " +
      "c.id, c.source, c.status, c.title, c.objective, " +
      "c.attention_type, c.market_keyword, c.angle, " +
      "c.direction, c.cta, c.content_text, c.created_at " +
      "FROM content_distributions d " +
      "JOIN content_engine c ON c.id = d.content_id " +
      "WHERE d.content_id = ? AND d.status = 'PUBLISHED' " +
      "ORDER BY datetime(d.created_at) DESC " +
      "LIMIT 1";

    return await first(db, sql2, contentId);
  }

  var sql3 =
    "SELECT " +
    "d.id AS distribution_id, " +
    "d.content_id, " +
    "d.channel, " +
    "d.status AS distribution_status, " +
    "d.created_at AS distributed_at, " +
    "c.id, c.source, c.status, c.title, c.objective, " +
    "c.attention_type, c.market_keyword, c.angle, " +
    "c.direction, c.cta, c.content_text, c.created_at " +
    "FROM content_distributions d " +
    "JOIN content_engine c ON c.id = d.content_id " +
    "WHERE d.status = 'PUBLISHED' " +
    "ORDER BY datetime(d.created_at) DESC " +
    "LIMIT 1";

  return await first(db, sql3);
}

async function getFeed(db) {

  var sql =
    "SELECT " +
    "d.id AS distribution_id, " +
    "d.content_id, " +
    "d.channel, " +
    "d.status, " +
    "d.created_at, " +
    "d.completed_at, " +
    "c.title, c.objective, c.attention_type, " +
    "c.market_keyword, c.angle, c.direction, c.cta, " +
    "c.content_text " +
    "FROM content_distributions d " +
    "JOIN content_engine c ON c.id = d.content_id " +
    "WHERE d.status = 'PUBLISHED' " +
    "ORDER BY datetime(d.created_at) DESC";

  return await all(db, sql);
}

async function recordEvent(db, options) {

  var eventType = options.eventType;
  var contentId = options.contentId || null;
  var distributionId = options.distributionId || null;
  var sessionId = options.sessionId || null;
  var metadata = options.metadata || {};
  var customerId = options.customerId || null;

  var id = uid();
  var finalSessionId = sessionId || uid();

  var eventMetadata = {};

  if (metadata && typeof metadata === "object") {
    eventMetadata = metadata;
  }

  if (contentId) {
    eventMetadata.content_id = contentId;
  }

  if (distributionId) {
    eventMetadata.distribution_id = distributionId;
  }

  eventMetadata.source = "PUBLIC_CONTENT_FEED";

  var sql =
    "INSERT INTO behavior_events " +
    "(id, customer_id, session_id, event_type, page, product_id, metadata, created_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

  await db.prepare(sql)
    .bind(
      id,
      customerId,
      finalSessionId,
      eventType,
      "/api/content-feed",
      null,
      JSON.stringify(eventMetadata),
      new Date().toISOString()
    )
    .run();

  return {
    id: id,
    event_type: eventType,
    content_id: contentId,
    distribution_id: distributionId,
    session_id: finalSessionId
  };
}

function parseContentText(text) {

  var raw = String(text || "");

  var hook = "";
  var body = "";
  var cta = "";

  var hookMatch = raw.match(
    /HOOK\s*([\s\S]*?)(?=\n\s*BODY|\n\s*CTA|$)/i
  );

  var bodyMatch = raw.match(
    /BODY\s*([\s\S]*?)(?=\n\s*CTA|$)/i
  );

  var ctaMatch = raw.match(
    /CTA\s*([\s\S]*)$/i
  );

  if (hookMatch) {
    hook = hookMatch[1].trim();
  }

  if (bodyMatch) {
    body = bodyMatch[1].trim();
  }

  if (ctaMatch) {
    cta = ctaMatch[1].trim();
  }

  if (!hook && !body && !cta) {
    body = raw;
  }

  return {
    hook: hook,
    body: body,
    cta: cta
  };
}

function renderPage(content) {

  var contentId = content.content_id || content.id || "";
  var distributionId = content.distribution_id || "";

  var title = escapeHtml(
    content.title || "TATO Coffee"
  );

  var objective = escapeHtml(
    content.objective || ""
  );

  var attentionType = escapeHtml(
    content.attention_type || ""
  );

  var marketKeyword = escapeHtml(
    content.market_keyword || ""
  );

  var angle = escapeHtml(
    content.angle || ""
  );

  var direction = escapeHtml(
    content.direction || ""
  );

  var cta = escapeHtml(
    content.cta || "ดูรายละเอียดและทดลอง TATO"
  );

  var parsed = parseContentText(
    content.content_text
  );

  var hook = escapeHtml(parsed.hook);
  var body = escapeHtml(parsed.body);
  var contentCta = escapeHtml(
    parsed.cta || content.cta || ""
  );

  var html = "";

  html += "<!DOCTYPE html>";
  html += '<html lang="th">';
  html += "<head>";
  html += '<meta charset="UTF-8">';
  html += '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
  html += "<title>" + title + " — TATO Coffee</title>";

  html += "<style>";

  html += "*{box-sizing:border-box}";
  html += "body{margin:0;background:#111;color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif}";
  html += ".page{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:28px 16px}";
  html += ".card{width:100%;max-width:720px;background:#181818;border:1px solid #333;border-radius:20px;padding:28px;box
```
