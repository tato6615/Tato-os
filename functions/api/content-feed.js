// TATO-OS
// Public Content Feed + Behavior Tracking V1
// Route: /api/content-feed

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: JSON_HEADERS
  });
}

function id() {
  return crypto.randomUUID();
}

function s(value) {
  return value == null ? "" : String(value);
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
      created_at TEXT
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS content_distributions (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT,
      payload TEXT,
      result TEXT,
      created_at TEXT,
      completed_at TEXT
    )
  `).run();
}

async function getPublication(db, distributionId) {
  if (distributionId) {
    return await db.prepare(`
      SELECT
        cd.*,
        ce.title,
        ce.objective,
        ce.attention_type,
        ce.market_keyword,
        ce.angle,
        ce.direction,
        ce.cta,
        ce.content_text
      FROM content_distributions cd
      LEFT JOIN content_engine ce
        ON ce.id = cd.content_id
      WHERE cd.id = ?
        AND cd.status = 'PUBLISHED'
      LIMIT 1
    `).bind(distributionId).first();
  }

  return await db.prepare(`
    SELECT
      cd.*,
      ce.title,
      ce.objective,
      ce.attention_type,
      ce.market_keyword,
      ce.angle,
      ce.direction,
      ce.cta,
      ce.content_text
    FROM content_distributions cd
    LEFT JOIN content_engine ce
      ON ce.id = cd.content_id
    WHERE cd.status = 'PUBLISHED'
    ORDER BY cd.created_at DESC
    LIMIT 1
  `).first();
}

async function getContentById(db, contentId) {
  return await db.prepare(`
    SELECT *
    FROM content_engine
    WHERE id = ?
      AND status = 'PUBLISHED'
    LIMIT 1
  `).bind(contentId).first();
}

async function track(db, {
  eventType,
  page,
  contentId,
  sessionId,
  metadata
}) {
  const now = new Date().toISOString();

  await db.prepare(`
    INSERT INTO behavior_events (
      id,
      customer_id,
      session_id,
      event_type,
      page,
      product_id,
      metadata,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id(),
    null,
    sessionId || id(),
    eventType,
    page,
    null,
    JSON.stringify({
      content_id: contentId,
      ...metadata
    }),
    now
  ).run();

  return {
    event_type: eventType,
    content_id: contentId,
    created_at: now
  };
}

function escapeHtml(value) {
  return s(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderPage(publication, sessionId) {
  const title = escapeHtml(publication.title);
  const objective = escapeHtml(publication.objective);
  const attentionType = escapeHtml(publication.attention_type);
  const keyword = escapeHtml(publication.market_keyword);
  const angle = escapeHtml(publication.angle);
  const contentText = escapeHtml(publication.content_text);
  const cta = escapeHtml(publication.cta || "ดูรายละเอียดและทดลอง TATO");

  const distributionId = escapeHtml(publication.id);
  const contentId = escapeHtml(publication.content_id);
  const safeSessionId = escapeHtml(sessionId);

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${title} — TATO Coffee</title>

  <meta
    name="description"
    content="${escapeHtml(publication.objective || title)}"
  >

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
        sans-serif;
    }

    .container {
      width: min(760px, calc(100% - 32px));
      margin: 0 auto;
      padding: 48px 0 72px;
    }

    .brand {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 2px;
      opacity: .7;
      margin-bottom: 32px;
    }

    h1 {
      font-size: clamp(32px, 7vw, 56px);
      line-height: 1.08;
      margin: 0 0 24px;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 32px;
    }

    .tag {
      border: 1px solid #444;
      border-radius: 999px;
      padding: 7px 12px;
      font-size: 12px;
      color: #ccc;
    }

    .content {
      white-space: pre-wrap;
      line-height: 1.8;
      font-size: 18px;
      color: #dddddd;
      margin-top: 32px;
    }

    .cta {
      display: inline-block;
      margin-top: 36px;
      padding: 15px 22px;
      border-radius: 10px;
      background: #f28c28;
      color: #111;
      text-decoration: none;
      font-weight: 800;
      cursor: pointer;
      border: 0;
      font-size: 16px;
    }

    .footer {
      margin-top: 60px;
      padding-top: 24px;
      border-top: 1px solid #333;
      font-size: 12px;
      color: #777;
    }
  </style>
</head>

<body>

  <main class="container">

    <div class="brand">TATO COFFEE</div>

    <h1>${title}</h1>

    <div class="meta">
      <span class="tag">${keyword}</span>
      <span class="tag">${attentionType}</span>
    </div>

    <div class="content">${contentText}</div>

    <button
      id="cta"
      class="cta"
      type="button"
    >
      ${cta}
    </button>

    <div class="footer">
      TATO Coffee · Arabica 100% · Single Origin
    </div>

  </main>

  <script>
    const CONTENT_ID = "${contentId}";
    const DISTRIBUTION_ID = "${distributionId}";
    const SESSION_ID = "${safeSessionId}";

    async function track(eventType, metadata = {}) {
      try {
        await fetch("/api/content-feed", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            mode: "event",
            event_type: eventType,
            content_id: CONTENT_ID,
            distribution_id: DISTRIBUTION_ID,
            session_id: SESSION_ID,
            metadata
          })
        });
      } catch (_) {}
    }

    // Real page-view event
    track("content_view", {
      source: "PUBLIC_CONTENT_FEED",
      distribution_id: DISTRIBUTION_ID
    });

    // Real CTA click event
    document
      .getElementById("cta")
      .addEventListener("click", async () => {

        await track("content_click", {
          source: "PUBLIC_CONTENT_FEED",
          distribution_id: DISTRIBUTION_ID,
          cta: true
        });

        // TATO product destination can be connected later.
        window.location.href =
          "/api/content-feed?mode=thank_you&content_id=" +
          encodeURIComponent(CONTENT_ID);
      });
  </script>

</body>
</html>`;
}

async function event(context, body) {
  if (!context.env.DB) {
    throw new Error("D1 binding DB is missing");
  }

  await ensureTables(context.env.DB);

  const eventType = s(body?.event_type).trim();

  if (!eventType) {
    return json({
      success: false,
      layer: "CONTENT_FEED_V1",
      error: "event_type is required"
    }, 400);
  }

  const result = await track(context.env.DB, {
    eventType,
    page: "/api/content-feed",
    contentId: body?.content_id || null,
    sessionId: body?.session_id || id(),
    metadata: body?.metadata || {}
  });

  return json({
    success: true,
    layer: "CONTENT_FEED_V1",
    mode: "event",
    event: result
  });
}

export async function onRequestGet(context) {
  try {
    if (!context.env.DB) {
      throw new Error("D1 binding DB is missing");
    }

    await ensureTables(context.env.DB);

    const url = new URL(context.request.url);

    const mode = url.searchParams.get("mode") || "page";

    if (mode === "feed") {
      const rows = await context.env.DB.prepare(`
        SELECT
          cd.id AS distribution_id,
          cd.content_id,
          cd.channel,
          cd.status,
          cd.created_at,
          cd.completed_at,
          ce.title,
          ce.objective,
          ce.cta
        FROM content_distributions cd
        LEFT JOIN content_engine ce
          ON ce.id = cd.content_id
        WHERE cd.status = 'PUBLISHED'
        ORDER BY cd.created_at DESC
        LIMIT 20
      `).all();

      return json({
        success: true,
        layer: "CONTENT_FEED_V1",
        mode: "feed",
        count: rows.results?.length || 0,
        content: rows.results || []
      });
    }

    if (mode === "thank_you") {
      return new Response(`
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>TATO Coffee</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #111;
      color: #fff;
      font-family: sans-serif;
      text-align: center;
    }
    .box {
      padding: 32px;
    }
  </style>
</head>
<body>
  <div class="box">
    <h1>TATO Coffee</h1>
    <p>ขอบคุณที่สนใจ TATO Coffee</p>
  </div>
</body>
</html>
      `, {
        headers: HTML_HEADERS
      });
    }

    const distributionId =
      url.searchParams.get("distribution_id");

    const contentId =
      url.searchParams.get("content_id");

    let publication = null;

    if (distributionId) {
      publication = await getPublication(
        context.env.DB,
        distributionId
      );
    } else if (contentId) {
      const content = await getContentById(
        context.env.DB,
        contentId
      );

      if (content) {
        publication = {
          id: null,
          content_id: content.id,
          title: content.title,
          objective: content.objective,
          attention_type: content.attention_type,
          market_keyword: content.market_keyword,
          angle: content.angle,
          direction: content.direction,
          cta: content.cta,
          content_text: content.content_text
        };
      }
    } else {
      publication = await getPublication(
        context.env.DB,
        null
      );
    }

    if (!publication) {
      return json({
        success: false,
        layer: "CONTENT_FEED_V1",
        status: "NO_PUBLISHED_CONTENT",
        error: "No published content found."
      }, 404);
    }

    const sessionId = id();

    // Track first visit immediately
    await track(context.env.DB, {
      eventType: "content_view",
      page: "/api/content-feed",
      contentId: publication.content_id,
      sessionId,
      metadata: {
        source: "PUBLIC_CONTENT_FEED",
        distribution_id: publication.id || null
      }
    });

    return new Response(
      renderPage(publication, sessionId),
      {
        status: 200,
        headers: HTML_HEADERS
      }
    );

  } catch (error) {
    return json({
      success: false,
      layer: "CONTENT_FEED_V1",
      error: error?.message || String(error)
    }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    let body = {};

    try {
      body = await context.request.json();
    } catch (_) {}

    const mode = body?.mode || "event";

    if (mode === "event") {
      return await event(context, body);
    }

    return json({
      success: false,
      layer: "CONTENT_FEED_V1",
      error: `Unsupported mode: ${mode}`
    }, 400);

  } catch (error) {
    return json({
      success: false,
      layer: "CONTENT_FEED_V1",
      error: error?.message || String(error)
    }, 500);
  }
}
