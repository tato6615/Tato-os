
// TATO OS — Public Content Feed + Tracking V1.5
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
// V1.2
// - One page open = one content_view
// - No server-side duplicate content_view
// - content_click remains browser tracked
// - product_view requires a prior content_click in the same page session
// - Offer is revealed only after content_click
// - product_view is recorded when the revealed Offer becomes visible
// - product_view is recorded at most once per page session
// - server enforces product_view attribution and idempotency
// - content_id + distribution_id + session_id preserved

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

async function getPublishedContent(
  db,
  contentId = null,
  distributionId = null
) {
  if (distributionId) {
    return await first(
      db,
      `
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
      `,
      distributionId
    );
  }

  if (contentId) {
    return await first(
      db,
      `
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
      `,
      contentId
    );
  }

  return await first(
    db,
    `
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
    `
  );
}

async function getFeed(db) {
  return await all(
    db,
    `
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
    `
  );
}

async function recordEvent(db, options) {
  const {
    eventType,
    contentId = null,
    distributionId = null,
    sessionId = null,
    metadata = {},
    customerId = null
  } = options;

  // Product view is a session-level funnel milestone.
  // Enforce idempotency server-side so reloads/retries cannot
  // create a second product_view for the same content session.
  if (
    eventType === "product_view" &&
    contentId &&
    distributionId &&
    sessionId
  ) {
    const existing = await first(
      db,
      `
      SELECT id, event_type, session_id
      FROM behavior_events
      WHERE event_type = 'product_view'
        AND session_id = ?
        AND json_extract(metadata, '$.content_id') = ?
        AND json_extract(metadata, '$.distribution_id') = ?
      ORDER BY datetime(created_at) ASC
      LIMIT 1
      `,
      sessionId,
      contentId,
      distributionId
    );

    if (existing) {
      return {
        id: existing.id,
        event_type: "product_view",
        content_id: contentId,
        distribution_id: distributionId,
        session_id: sessionId,
        duplicate: true
      };
    }
  }

  // Server-side attribution guard:
  // product_view is valid only when a content_click already exists
  // for the same content, distribution and session.
  if (
    eventType === "product_view" &&
    contentId &&
    distributionId &&
    sessionId
  ) {
    const priorClick = await first(
      db,
      `
      SELECT id
      FROM behavior_events
      WHERE event_type = 'content_click'
        AND session_id = ?
        AND json_extract(metadata, '$.content_id') = ?
        AND json_extract(metadata, '$.distribution_id') = ?
      ORDER BY datetime(created_at) ASC
      LIMIT 1
      `,
      sessionId,
      contentId,
      distributionId
    );

    if (!priorClick) {
      return {
        id: null,
        event_type: "product_view",
        content_id: contentId,
        distribution_id: distributionId,
        session_id: sessionId,
        rejected: true,
        reason: "CONTENT_CLICK_REQUIRED"
      };
    }
  }

  const id = uid();

  const eventMetadata = {
    ...(metadata && typeof metadata === "object" ? metadata : {}),
    ...(contentId ? { content_id: contentId } : {}),
    ...(distributionId ? { distribution_id: distributionId } : {}),
    source: "PUBLIC_CONTENT_FEED"
  };

  const finalSessionId = sessionId || uid();

  await db
    .prepare(`
      INSERT INTO behavior_events
        (
          id,
          customer_id,
          session_id,
          event_type,
          page,
          product_id,
          metadata,
          created_at
        )
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
    `)
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
    id,
    event_type: eventType,
    content_id: contentId,
    distribution_id: distributionId,
    session_id: finalSessionId
  };
}

function parseContentText(contentText) {
  const raw = String(contentText || "");

  let hook = "";
  let body = "";
  let cta = "";

  const hookMatch = raw.match(
    /HOOK\s*([\s\S]*?)(?=\n\s*BODY|\n\s*CTA|$)/i
  );

  const bodyMatch = raw.match(
    /BODY\s*([\s\S]*?)(?=\n\s*CTA|$)/i
  );

  const ctaMatch = raw.match(
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
    hook,
    body,
    cta
  };
}

function renderPage(content) {
  const contentId = content.content_id || content.id || "";
  const distributionId = content.distribution_id || "";

  const title = escapeHtml(
    content.title || "TATO Coffee"
  );

  const objective = escapeHtml(
    content.objective || ""
  );

  const attentionType = escapeHtml(
    content.attention_type || ""
  );

  const marketKeyword = escapeHtml(
    content.market_keyword || ""
  );

  const angle = escapeHtml(
    content.angle || ""
  );

  const direction = escapeHtml(
    content.direction || ""
  );

  const cta = escapeHtml(
    content.cta || "ดูรายละเอียดและทดลอง TATO"
  );

  const parsed = parseContentText(
    content.content_text
  );

  const hook = escapeHtml(parsed.hook);
  const body = escapeHtml(parsed.body);
  const contentCta = escapeHtml(
    parsed.cta || content.cta || ""
  );

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
  background: #111;
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
  border: 1px solid #333;
  border-radius: 20px;
  padding: 28px;
  box-shadow: 0 20px 60px rgba(0,0,0,.35);
}

.brand {
  font-size: 13px;
  letter-spacing: 3px;
  color: #ff8a00;
  font-weight: 800;
  margin-bottom: 24px;
}

h1 {
  margin: 0 0 24px;
  font-size: 32px;
  line-height: 1.25;
}

.section {
  margin-top: 24px;
}

.label {
  color: #888;
  font-size: 11px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.text {
  white-space: pre-line;
  color: #ddd;
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
  color: #ddd;
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
  color: #111;
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
  color: #666;
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

    <div class="brand">
      TATO COFFEE
    </div>

    <h1>${title}</h1>

    ${
      hook
        ? `
    <section class="section">
      <div class="label">Hook</div>
      <div class="text">${hook}</div>
    </section>
    `
        : ""
    }

    ${
      body
        ? `
    <section class="section">
      <div class="label">Content</div>
      <div class="text">${body}</div>
    </section>
    `
        : ""
    }

    ${
      contentCta
        ? `
    <section class="section">
      <div class="label">CTA</div>
      <div class="text">${contentCta}</div>
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
      href="#offer"
    >
      ${cta}
    </a>

    <div
      id="offer"
      class="section"
      data-product-view="true"
      hidden
    >
      <div class="label">Offer</div>
      <div class="text">ดูรายละเอียดข้อเสนอ TATO Coffee</div>

      <a
        class="cta"
        href="/api/content-feed?mode=thank_you&content_id=${encodeURIComponent(contentId)}"
      >
        ดูรายละเอียดข้อเสนอ TATO Coffee
      </a>
    </div>

    <div class="footer">
      TATO Coffee · Arabica 100% · Single Origin
    </div>

  </main>

</div>

<script>
(function () {

  const contentId = ${JSON.stringify(contentId)};
  const distributionId = ${JSON.stringify(distributionId)};

  let sessionId =
    sessionStorage.getItem("tato_content_session");

  if (!sessionId) {
    sessionId = crypto.randomUUID();

    sessionStorage.setItem(
      "tato_content_session",
      sessionId
    );
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
      // Tracking must never block the visitor.
    }
  }

  // IMPORTANT:
  // content_view is recorded ONLY here.
  // No server-side content_view exists.
  // Keep the request promise so CTA interaction cannot be persisted
  // before the initial content_view has completed.
  const contentViewReady = track("content_view", {
    page_type: "public_content"
  });

  const offer = document.getElementById("offer");
  const cta = document.getElementById("cta");

  let contentClicked = false;
  let productViewTracked = false;

  function trackProductView() {
    if (!contentClicked || productViewTracked) return;

    productViewTracked = true;

    track("product_view", {
      page_type: "public_content_offer",
      source_event: "content_click"
    });
  }

  let offerObserver = null;

  if (offer && "IntersectionObserver" in window) {

    offerObserver = new IntersectionObserver(function (entries) {

      if (
        contentClicked &&
        entries.some(function (entry) {
          return entry.isIntersecting;
        })
      ) {

        trackProductView();

        offerObserver.disconnect();

      }

    }, { threshold: 0.25 });

  }

  if (cta) {

    cta.addEventListener(
      "click",
      function (event) {

        if (contentClicked) return;

        event.preventDefault();

        contentViewReady.then(function () {

          contentClicked = true;

          return track("content_click", {
            cta: true
          });

        }).then(function () {

          if (offer) {

            offer.hidden = false;

            if (offerObserver) {
              offerObserver.observe(offer);
            }

            offer.scrollIntoView({
              behavior: "smooth",
              block: "start"
            });

          }

        });

      }
    );

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

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>TATO Coffee</title>

<style>

body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #111;
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
  border: 1px solid #333;
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
  color: #aaa;
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

  <div class="brand">
    TATO COFFEE
  </div>

  <h1>
    ขอบคุณที่สนใจ TATO Coffee
  </h1>

  <p>
    ขอบคุณที่สนใจ TATO Coffee
  </p>

  <a
    class="back"
    href="/api/content-feed"
  >
    ← กลับไปดู Content
  </a>

</main>

</body>

</html>`;
}

export async function onRequest(context) {

  const {
    request,
    env
  } = context;

  if (!env || !env.DB) {

    return json(
      {
        success: false,
        error: "D1 binding DB is not available"
      },
      500
    );

  }

  const db = env.DB;

  try {

    await ensureTables(db);

    const url =
      new URL(request.url);

    const mode =
      url.searchParams.get("mode");

    const contentId =
      url.searchParams.get("content_id");

    const distributionId =
      url.searchParams.get("distribution_id");

    // --------------------------------------------------
    // POST — Behavior Event
    // --------------------------------------------------

    if (request.method === "POST") {

      let body = {};

      try {

        body =
          await request.json();

      } catch (_) {

        return json(
          {
            success: false,
            error: "Invalid JSON body"
          },
          400
        );

      }

      if (body.mode !== "event") {

        return json(
          {
            success: false,
            error: "Unsupported POST mode"
          },
          400
        );

      }

      const eventType =
        String(
          body.event_type || ""
        ).trim();

      if (!eventType) {

        return json(
          {
            success: false,
            error: "event_type is required"
          },
          400
        );

      }

      const event =
        await recordEvent(
          db,
          {
            eventType,
            contentId:
              body.content_id || null,
            distributionId:
              body.distribution_id || null,
            sessionId:
              body.session_id || null,
            metadata:
              body.metadata || {},
            customerId:
              body.customer_id || null
          }
        );

      if (event.rejected) {
        return json({
          success: false,
          layer: "CONTENT_FEED_V1",
          mode: "event",
          status: "REJECTED",
          event
        }, 409);
      }

      return json({
        success: true,
        layer: "CONTENT_FEED_V1",
        mode: "event",
        status: event.duplicate ? "DUPLICATE_IGNORED" : "RECORDED",
        event
      });

    }

    // --------------------------------------------------
    // GET — Feed JSON
    // --------------------------------------------------

    if (mode === "feed") {

      const content =
        await getFeed(db);

      return json({
        success: true,
        layer: "CONTENT_FEED_V1",
        mode: "feed",
        count: content.length,
        content
      });

    }

    // --------------------------------------------------
    // GET — Thank You
    // --------------------------------------------------

    if (mode === "thank_you") {

      return new Response(
        renderThankYou(),
        {
          status: 200,
          headers: {
            "Content-Type":
              "text/html; charset=utf-8",
            "Cache-Control":
              "no-store"
          }
        }
      );

    }

    // --------------------------------------------------
    // GET — Public Content
    // --------------------------------------------------

    const content =
      await getPublishedContent(
        db,
        contentId,
        distributionId
      );

    if (!content) {

      return json(
        {
          success: false,
          layer: "CONTENT_FEED_V1",
          error:
            "Published content not found"
        },
        404
      );

    }

    return new Response(
      renderPage(content),
      {
        status: 200,
        headers: {
          "Content-Type":
            "text/html; charset=utf-8",
          "Cache-Control":
            "no-store"
        }
      }
    );

  } catch (error) {

    return json(
      {
        success: false,
        layer: "CONTENT_FEED_V1",
        error:
          error?.message ||
          String(error)
      },
      500
    );

  }
}