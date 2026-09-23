// TATO-OS
// Distribution Engine V1
// Route: /api/distribution

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: HEADERS
  });
}

function id() {
  return crypto.randomUUID();
}

function s(value) {
  return value == null ? "" : String(value);
}

async function ensureTable(db) {
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

async function getContent(db, contentId = null) {
  if (contentId) {
    return await db.prepare(`
      SELECT *
      FROM content_engine
      WHERE id = ?
      LIMIT 1
    `).bind(contentId).first();
  }

  return await db.prepare(`
    SELECT *
    FROM content_engine
    WHERE status = 'READY_TO_PUBLISH'
    ORDER BY created_at DESC
    LIMIT 1
  `).first();
}

async function getExistingDistribution(db, contentId) {
  return await db.prepare(`
    SELECT *
    FROM content_distributions
    WHERE content_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(contentId).first();
}

async function preview(env, contentId) {
  if (!env.DB) {
    throw new Error("D1 binding DB is missing");
  }

  await ensureTable(env.DB);

  const content = await getContent(env.DB, contentId);

  if (!content) {
    return {
      success: true,
      layer: "DISTRIBUTION_V1",
      mode: "preview",
      status: "NO_CONTENT",
      content: null,
      next_step: "Create or prepare content before distribution."
    };
  }

  return {
    success: true,
    layer: "DISTRIBUTION_V1",
    mode: "preview",
    status: "READY",
    content: {
      id: content.id,
      title: content.title,
      status: content.status,
      objective: content.objective,
      attention_type: content.attention_type,
      market_keyword: content.market_keyword,
      angle: content.angle,
      cta: content.cta,
      content_text: content.content_text
    },
    channel: "FIRST_PARTY_FEED",
    next_step: "Run ?mode=execute to publish."
  };
}

async function execute(env, contentId) {
  if (!env.DB) {
    throw new Error("D1 binding DB is missing");
  }

  await ensureTable(env.DB);

  const content = await getContent(env.DB, contentId);

  if (!content) {
    return {
      success: false,
      layer: "DISTRIBUTION_V1",
      mode: "execute",
      status: "NO_CONTENT",
      error: "No READY_TO_PUBLISH content found."
    };
  }

  const existing = await getExistingDistribution(env.DB, content.id);

  if (existing && existing.status === "PUBLISHED") {
    return {
      success: true,
      layer: "DISTRIBUTION_V1",
      mode: "execute",
      status: "ALREADY_PUBLISHED",
      content: {
        id: content.id,
        title: content.title,
        status: "PUBLISHED"
      },
      distribution: {
        id: existing.id,
        channel: existing.channel,
        status: existing.status,
        created_at: existing.created_at,
        completed_at: existing.completed_at
      },
      next_step: "Content is already distributed."
    };
  }

  const distributionId = id();
  const now = new Date().toISOString();

  const payload = {
    id: content.id,
    title: content.title,
    objective: content.objective,
    attention_type: content.attention_type,
    market_keyword: content.market_keyword,
    angle: content.angle,
    direction: content.direction,
    cta: content.cta,
    content_text: content.content_text
  };

  await env.DB.prepare(`
    INSERT INTO content_distributions (
      id,
      content_id,
      channel,
      status,
      source,
      payload,
      result,
      created_at,
      completed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    distributionId,
    content.id,
    "FIRST_PARTY_FEED",
    "PUBLISHED",
    "TATO_DISTRIBUTION_ENGINE",
    JSON.stringify(payload),
    JSON.stringify({
      published: true,
      content_id: content.id,
      channel: "FIRST_PARTY_FEED"
    }),
    now,
    now
  ).run();

  await env.DB.prepare(`
    UPDATE content_engine
    SET status = ?
    WHERE id = ?
  `).bind(
    "PUBLISHED",
    content.id
  ).run();

  return {
    success: true,
    layer: "DISTRIBUTION_V1",
    mode: "execute",
    status: "PUBLISHED",
    content: {
      id: content.id,
      title: content.title,
      status: "PUBLISHED"
    },
    distribution: {
      id: distributionId,
      channel: "FIRST_PARTY_FEED",
      status: "PUBLISHED",
      published_at: now
    },
    next_step: "Content published. Next: connect distribution to Core Loop."
  };
}

async function feed(env, contentId) {
  if (!env.DB) {
    throw new Error("D1 binding DB is missing");
  }

  await ensureTable(env.DB);

  if (contentId) {
    const row = await env.DB.prepare(`
      SELECT *
      FROM content_distributions
      WHERE id = ?
      LIMIT 1
    `).bind(contentId).first();

    return json({
      success: true,
      layer: "DISTRIBUTION_V1",
      mode: "feed",
      content: row || null
    });
  }

  const rows = await env.DB.prepare(`
    SELECT *
    FROM content_distributions
    WHERE status = 'PUBLISHED'
    ORDER BY created_at DESC
    LIMIT 20
  `).all();

  return json({
    success: true,
    layer: "DISTRIBUTION_V1",
    mode: "feed",
    count: rows.results?.length || 0,
    content: rows.results || []
  });
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);

    const mode = url.searchParams.get("mode") || "preview";
    const contentId = url.searchParams.get("content_id");

    if (mode === "execute") {
      return json(
        await execute(context.env, contentId)
      );
    }

    if (mode === "feed") {
      return await feed(context.env, contentId);
    }

    return json(
      await preview(context.env, contentId)
    );
  } catch (error) {
    return json(
      {
        success: false,
        layer: "DISTRIBUTION_V1",
        error: error?.message || String(error)
      },
      500
    );
  }
}

export async function onRequestPost(context) {
  try {
    let body = {};

    try {
      body = await context.request.json();
    } catch (_) {}

    const mode = body?.mode || "preview";
    const contentId = body?.content_id || null;

    if (mode === "execute") {
      return json(
        await execute(context.env, contentId)
      );
    }

    if (mode === "feed") {
      return await feed(context.env, contentId);
    }

    return json(
      await preview(context.env, contentId)
    );
  } catch (error) {
    return json(
      {
        success: false,
        layer: "DISTRIBUTION_V1",
        error: error?.message || String(error)
      },
      500
    );
  }
}
