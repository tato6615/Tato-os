```javascript
// TATO OS — Public Content Feed + Tracking V1.1
// Route: /api/content-feed
//
// GET
//   /api/content-feed
//   /api/content-feed?content_id=...
//   /api/content-feed?distribution_id=...
//   /api/content-feed?mode=feed
//   /api/content-feed?mode=thank_you&content_id=...
//
// POST
//   { mode: "event", event_type, content_id, distribution_id,
//     session_id, metadata }
//
// V1.1 FIX
// - content_view is tracked ONLY by browser-side tracking.
// - Prevents duplicate content_view events from server + browser.
// - content_click remains browser-side.
// - content_id + distribution_id remain attached to every event.

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function uid() {
  return crypto.randomUUID();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function first(db, sql, ...params) {
  const result = await db.prepare(sql).bind(...params).first();
  return result || null;
}

async function all(db, sql, ...params) {
  const result = await db.prepare(sql).bind(...params).all();
  return result?.results || [];
}

async function ensureTables(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS behavior_events (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      session_id TEXT,
      event_type TEXT,
      page TEXT,
      product_id TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS content_distributions (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      channel TEXT,
      status TEXT,
      source TEXT,
      payload TEXT,
      result TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    )
  `).run();
}

async function getPublishedContent(db, contentId = null, distributionId = null) {
  if (distributionId) {
    return await first(db, `
      SELECT
        d.id AS distribution_id,
        d.content_id,
        d.channel,
        d.status AS distribution_status,
        d.created_at AS distributed_at,
        c.id,
        c.source,
        c.status,
        c.title,
        c.objective,
        c.attention_type,
        c.market_keyword,
        c.angle,
        c.direction,
        c.cta,
        c.content_text,
        c.created_at
      FROM content_distributions d
      JOIN content_engine c ON c.id = d.content_id
      WHERE d.id = ?
        AND d.status = 'PUBLISHED'
      LIMIT 1
    `, distributionId);
  }

  if (contentId) {
    return await first(db, `
      SELECT
        d.id AS distribution_id,
        d.content_id,
        d.channel,
        d.status AS distribution_status,
        d.created_at AS distributed_at,
        c.id,
        c.source,
        c.status,
        c.title,
        c.objective,
        c.attention_type,
        c.market_keyword,
        c.angle,
        c.direction,
        c.cta,
        c.content_text,
        c.created_at
      FROM content_distributions d
      JOIN content_engine c ON c.id = d.content_id
      WHERE d.content_id = ?
        AND d.status = 'PUBLISHED'
      ORDER BY datetime(d.created_at) DESC
      LIMIT 1
    `, contentId);
  }

  return await first(db, `
    SELECT
      d.id AS distribution_id,
      d.content_id,
      d.channel,
      d.status AS distribution_status,
      d.created_at AS distributed_at,
      c.id,
      c.source,
      c.status,
      c.title,
      c.objective,
      c.attention_type,
      c.market_keyword,
      c.angle,
      c.direction,
      c.cta,
      c.content_text,
      c.created_at
    FROM content_distributions d
    JOIN content_engine c ON c.id = d.content_id
    WHERE d.status = 'PUBLISHED'
    ORDER BY datetime(d.created_at) DESC
    LIMIT 1
  `);
}

async function getFeed(db) {
  return await all(db, `
    SELECT
      d.id AS distribution_id,
      d.content_id,
      d.channel,
      d.status,
      d.created_at,
      d.completed_at,
      c.title,
      c.objective,
      c.attention_type,
      c.market_keyword,
      c.angle,
      c.direction,
      c.cta,
      c.content_text
    FROM content_distributions d
    JOIN content_engine c ON c.id = d.content_id
    WHERE d.status = 'PUBLISHED'
    ORDER BY datetime(d.created_at) DESC
  `);
}

async function recordEvent(db, {
  eventType,
  contentId = null,
  distributionId = null,
  sessionId = null,
  metadata = {},
  customerId = null
}) {
  const id = uid();

  const eventMetadata = {
    ...(
      metadata && typeof metadata === "object"
        ? metadata
        : {}
    ),
    ...(contentId ? { content_id: contentId } : {}),
    ...(distributionId ? { distribution_id: distributionId } : {}),
    source: "PUBLIC_CONTENT_FEED"
  };

  await db.prepare(`
    INSERT INTO behavior_events
      (id, customer_id, session_id, event_type, page, product_id, metadata, created_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    customerId,
    sessionId || uid(),
    eventType,
    "/api/content-feed",
    null,
    JSON.stringify(eventMetadata),
    new Date().toISOString()
  ).run();

  return {
    id,
    event_type: eventType,
    content_id: contentId,
    distribution_id: distributionId,
    session_id: sessionId
  };
}

function renderPage(content) {
  const contentId = escapeHtml(content.content_id || content.id);
  const distributionId = escapeHtml(content.distribution_id || "");
  const title = escapeHtml(content.title || "TATO Coffee");
  const objective = escapeHtml(content.objective || "");
  const attentionType = escapeHtml(content.attention_type || "");
  const marketKeyword = escapeHtml(content.market_keyword || "");
  const angle = escapeHtml(content.angle || "");
  const direction = escapeHtml(content.direction || "");
  const cta = escapeHtml(content.cta || "ดูรายละเอียดและทดลอง TATO");

  const rawText = String(content.content_text || "");

  let hook = "";
  let body = "";
  let contentCta = "";

  const hookMatch = rawText.match(
    /HOOK\s*([\s\S]*?)(?=\n\s*BODY|\n\s*CTA|$)/i
  );

  const bodyMatch = rawText.match(
    /BODY\s*([\s\S]*?)(?=\n\s*CTA|$)/i
  );

  const ctaMatch = rawText.match(
    /CTA\s*([\s\S]*)$/i
  );

  if (hookMatch) hook = hookMatch[1].trim();
  if (bodyMatch) body = bodyMatch[1].trim();
  if (ctaMatch) contentCta = ctaMatch[1].trim();

  if (!hook && !body && !contentCta) {
    body = rawText;
  }

  const safeHook = escapeHtml(hook);
  const safeBody = escapeHtml(body);
  const safeContentCta = escapeHtml(contentCta || cta);

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — TATO Coffee</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #111111;
  color: #f5f5f5;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Arial,
    sans-serif;
}

.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px 16px;
}

.card {
  width: 100%;
  max-width: 720px;
  background: #181818;
  border: 1px solid #333333;
  border-radius: 20px;
  padding: 28px;
  box-shadow: 0 20px 60px rgba(0,0,0,.35);
}

.brand {
  font-size: 13px;
  letter-spacing: 3px;
  color: #ff8a00;
  font-weight: 700;
  margin-bottom: 24px;
}

h1 {
  margin: 0 0 24px;
  font-size: 32px;
  line-height: 1.25;
}

.label {
  color: #999999;
  font-size: 11px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.section {
  margin-top: 24px;
}

.text {
  white-space: pre-line;
  color: #dddddd;
  font-size: 16px;
  line-height: 1.8;
}

.meta {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-top: 24px;
}

.meta-box {
  border: 1px solid #303030;
  background: #141414;
  border-radius: 12px;
  padding: 12px;
}

.meta-value {
  color: #dddddd;
  font-size: 13px;
  line-height: 1.5;
}

.cta {
  display: block;
  width: 100%;
  margin-top: 28px;
  border: 0;
  border-radius: 12px;
  padding: 15px 18px;
  background: #ff8a00;
  color: #111111;
  font-size: 16px;
  font-weight: 800;
  text-align: center;
  cursor: pointer;
  text-decoration: none;
}

.cta:hover {
  opacity: .92;
}

.footer {
  margin-top: 22px;
  text-align: center;
  color: #666666;
  font-size: 11px;
}

@media(max-width:600px) {
  .card {
    padding: 20px;
  }

  h1 {
    font-size: 26px;
  }

  .meta {
    grid-template-columns: 1fr;
  }
}
</style>
</head>

<body>

<div class="page">
  <main class="card">

    <div class="brand">TATO COFFEE</div>

    <h1>${title}</h1>

    ${
      safeHook
        ? `
    <section class="section">
      <div class="label">Hook</div>
      <div class="text">${safeHook}</div>
    </section>
    `
        : ""
    }

    ${
      safeBody
        ? `
    <section class="section">
      <div class="label">Content</div>
      <div class="text">${safeBody}</div>
    </section>
    `
        : ""
    }

    ${
      safeContentCta
        ? `
    <section class="section">
      <div class="label">CTA</div>
      <div class="text">${safeContentCta}</div>
    </section>
    `
        : ""
    }

    <div class="meta">

      ${
        objective
          ? `
      <div class="meta-box">
        <div class="label">Objective</div>
        <div class="meta-value">${objective}</div>
      </div>
      `
          : ""
      }

      ${
        attentionType
          ? `
      <div class="meta-box">
        <div class="label">Attention</div>
        <div class="meta-value">${attentionType}</div>
      </div>
      `
          : ""
      }

      ${
        marketKeyword
          ? `
      <div class="meta-box">
        <div class="label">Market</div>
        <div class="meta-value">${marketKeyword}</div>
      </div>
      `
          : ""
      }

      ${
        angle
          ? `
      <div class="meta-box">
        <div class="label">Angle</div>
        <div class="meta-value">${angle}</div>
      </div>
      `
          : ""
      }

      ${
        direction
          ? `
      <div class="meta-box">
        <div class="label">Direction</div>
        <div class="meta-value">${direction}</div>
      </div>
      `
          : ""
      }

    </div>

    <a
      id="cta"
      class="cta"
      href="/api/content-feed?mode=thank_you&content_id=${contentId}"
    >
      ${cta}
    </a>

    <div class="footer">
      TATO Coffee · Arabica 100% · Single Origin
    </div>

  </main>
</div>

<script>
(function () {
  const contentId = ${JSON.stringify(content.content_id || content.id || null)};
  const distributionId = ${JSON.stringify(content.distribution_id || null)};

  let sessionId = sessionStorage.getItem("tato_content_session");

  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem("tato_content_session", sessionId);
  }

  async function track(eventType, metadata) {
    try {
      await fetch("/api/content-feed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode: "event",
          event_type: eventType,
          content_id: contentId,
          distribution_id: distributionId,
          session_id: sessionId,
          metadata: metadata || {}
        }),
        keepalive: true
      });
    } catch (_) {
      // Tracking failure must never block the user.
    }
  }

  // V1.1:
  // content_view is intentionally recorded ONLY here.
  // Server-side tracking was removed to prevent duplicate events.
  track("content_view", {
    page_type: "public_content"
  });

  const cta = document.getElementById("cta");

  if (cta) {
    cta.addEventListener("click", function () {
      track("content_click", {
        cta: true
      });
    });
  }
})();
</script>

</body>
</html>`;
}

function renderThankYou() {
  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TATO Coffee</title>

<style>
body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #111111;
  color: #f5f5f5;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Arial,
    sans-serif;
}

.card {
  width: calc(100% - 32px);
  max-width: 520px;
  padding: 36px 24px;
  background: #181818;
  border: 1px solid #333333;
  border-radius: 20px;
  text-align: center;
}

.brand {
  color: #ff8a00;
  font-weight: 800;
  letter-spacing: 3px;
  margin-bottom: 24px;
}

h1 {
  font-size: 28px;
  margin: 0 0 14px;
}

p {
  color: #aaaaaa;
  line-height: 1.7;
}

.back {
  display: inline-block;
  margin-top: 20px;
  color: #ff8a00;
  text-decoration: none;
  font-weight: 700;
}
</style>
</head>

<body>
  <main class="card">
    <div class="brand">TATO COFFEE</div>
    <h1>ขอบคุณที่สนใจ TATO Coffee</h1>
    <p>
      ขอบคุณที่สนใจ TATO Coffee
    </p>
    <a class="back" href="/api/content-feed">
      ← กลับไปดู Content
    </a>
  </main>
</body>
</html>`;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!env?.DB) {
    return json({
      success: false,
      error: "D1 binding DB is not available"
    }, 500);
  }

  const db = env.DB;

  try {
    await ensureTables(db);

    const url = new URL(request.url);
    const mode = url.searchParams.get("mode");
    const contentId = url.searchParams.get("content_id");
    const distributionId = url.searchParams.get("distribution_id");

    // ---------------------------------------------------------
    // POST — behavior event
    // ---------------------------------------------------------
    if (request.method === "POST") {
      let body = {};

      try {
        body = await request.json();
      } catch (_) {
        return json({
          success: false,
          error: "Invalid JSON body"
        }, 400);
      }

      if (body.mode !== "event") {
        return json({
          success: false,
          error: "Unsupported POST mode"
        }, 400);
      }

      const eventType = String(body.event_type || "").trim();

      if (!eventType) {
        return json({
          success: false,
          error: "event_type is required"
        }, 400);
      }

      const event = await recordEvent(db, {
        eventType,
        contentId: body.content_id || null,
        distributionId: body.distribution_id || null,
        sessionId: body.session_id || null,
        metadata: body.metadata || {},
        customerId: body.customer_id || null
      });

      return json({
        success: true,
        layer: "CONTENT_FEED_V1",
        mode: "event",
        status: "RECORDED",
        event
      });
    }

    // ---------------------------------------------------------
    // GET — feed JSON
    // ---------------------------------------------------------
    if (mode === "feed") {
      const content = await getFeed(db);

      return json({
        success: true,
        layer: "CONTENT_FEED_V1",
        mode: "feed",
        count: content.length,
        content
      });
    }

    // ---------------------------------------------------------
    // GET — thank you
    // ---------------------------------------------------------
    if (mode === "thank_you") {
      return new Response(renderThankYou(), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store"
        }
      });
    }

    // ---------------------------------------------------------
    // GET — public content page
    // ---------------------------------------------------------
    const content = await getPublishedContent(
      db,
      contentId,
      distributionId
    );

    if (!content) {
      return json({
        success: false,
        layer: "CONTENT_FEED_V1",
        error: "Published content not found"
      }, 404);
    }

    return new Response(renderPage(content), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });

  } catch (error) {
    return json({
      success: false,
      layer: "CONTENT_FEED_V1",
      error: error?.message || String(error)
    }, 500);
  }
}
```
