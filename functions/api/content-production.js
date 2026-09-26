// TATO-OS
// Content Production + SEO/GEO Bridge V1.0
// Route: /api/content-production
//
// SEO = Search Engine Optimization.
// GEO = Generative Engine Optimization / answer-engine readiness.
//
// This layer joins Demand -> Content -> Canva Asset -> Discovery -> Measurement.
// It does not publish, contact customers, execute campaigns, or read raw behavior.

const LAYER = "CONTENT_PRODUCTION_SEO_GEO_V1.0";
const VERSION = "1.0";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}

function now() {
  return new Date().toISOString();
}

async function tableExists(db, table) {
  const row = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).bind(table).first();
  return !!row;
}

async function ensureTables(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS content_production (
      id TEXT PRIMARY KEY,
      demand_plan_id TEXT,
      content_id TEXT,
      title TEXT NOT NULL,
      objective TEXT NOT NULL,
      audience TEXT NOT NULL,
      channel TEXT NOT NULL,
      content_format TEXT NOT NULL,
      primary_keyword TEXT NOT NULL,
      secondary_keywords TEXT,
      search_intent TEXT NOT NULL,
      seo_title TEXT NOT NULL,
      meta_description TEXT NOT NULL,
      slug TEXT NOT NULL,
      geo_context TEXT,
      entity_terms TEXT,
      answer_summary TEXT NOT NULL,
      faq_json TEXT,
      cta TEXT NOT NULL,
      success_event TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'BRIEF_READY',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS content_assets (
      id TEXT PRIMARY KEY,
      production_id TEXT NOT NULL,
      content_id TEXT,
      platform TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      external_id TEXT,
      external_url TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      published_url TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_content_production_demand ON content_production(demand_plan_id)"
  ).run();
  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_content_production_status ON content_production(status)"
  ).run();
  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_content_assets_production ON content_assets(production_id)"
  ).run();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9ก-๙]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "tato-coffee";
}

function keywordList(keyword) {
  const base = String(keyword || "coffee").trim();
  return [...new Set([
    base,
    "กาแฟ",
    "TATO Coffee",
    "Arabica 100%",
    "Single Origin",
    "Doi Wiang"
  ].filter(Boolean))];
}

function buildProduction(plan, product) {
  const keyword = String(plan.market_keyword || "coffee").trim();
  const name = String(product?.name || plan.offer || "TATO Coffee").trim();

  return {
    title: "TATO Content · " + keyword,
    objective: String(plan.objective || "Turn verified demand into a real paid order."),
    audience: String(plan.audience || "People or coffee businesses showing verified interest in " + keyword),
    channel: String(plan.channel || "FOUNDER_SELECTED_SOCIAL_OR_SEARCH"),
    content_format: String(plan.content_format || "SHORT_VIDEO_OR_IMAGE"),
    primary_keyword: keyword,
    secondary_keywords: keywordList(keyword),
    search_intent: "COMMERCIAL_INVESTIGATION",
    seo_title: (keyword + " | " + name).slice(0, 60),
    meta_description: (
      "รู้จัก " + name + " จาก TATO Coffee พร้อมรายละเอียดสินค้าและช่องทางทดลอง " +
      "เชื่อมจากความสนใจเรื่อง " + keyword + " ไปสู่การซื้อจริง."
    ).slice(0, 155),
    slug: slugify("tato-coffee-" + keyword),
    geo_context: "Thailand",
    entity_terms: ["TATO Coffee", "Arabica 100%", "Single Origin", "Doi Wiang"],
    answer_summary:
      "TATO Coffee offers " + name +
      ". The content should answer the audience's " + keyword +
      " interest with factual product information and a clear path to view the product and purchase.",
    faq: [
      {
        question: "TATO Coffee คืออะไร?",
        answer: "TATO Coffee เป็นกาแฟ Arabica 100% แบบ Single Origin จาก Doi Wiang."
      },
      {
        question: "สินค้า TATO นี้ราคาเท่าไร?",
        answer: String(plan.offer || "ตรวจสอบราคาจากข้อเสนอที่เชื่อมกับ Demand Plan")
      },
      {
        question: "จะดูรายละเอียดหรือทดลอง TATO ได้อย่างไร?",
        answer: String(plan.cta || "ดูรายละเอียดและทดลอง TATO")
      }
    ],
    cta: String(plan.cta || "ดูรายละเอียดและทดลอง TATO"),
    success_event: String(plan.success_event || "PURCHASE")
  };
}

async function readLatestProduct(db) {
  if (!await tableExists(db, "products")) return null;
  const info = await db.prepare("PRAGMA table_info(products)").all();
  const names = (info.results || []).map(row => row.name);
  const saleColumn = names.includes("sale_price")
    ? "sale_price"
    : names.includes("price")
      ? "price"
      : null;

  if (!saleColumn) {
    return await db.prepare(
      "SELECT id, name FROM products ORDER BY created_at DESC LIMIT 1"
    ).first();
  }

  return await db.prepare(
    "SELECT id, name, " + saleColumn + " AS sale_price FROM products ORDER BY created_at DESC LIMIT 1"
  ).first();
}

export async function onRequestGet(context) {
  try {
    if (!context.env?.DB) {
      return json({ success: false, layer: LAYER, status: "DB_BINDING_NOT_FOUND" }, 500);
    }

    const db = context.env.DB;
    await ensureTables(db);

    const [production, assets, plans] = await Promise.all([
      db.prepare("SELECT * FROM content_production ORDER BY created_at DESC LIMIT 50").all(),
      db.prepare("SELECT * FROM content_assets ORDER BY created_at DESC LIMIT 50").all(),
      tableExists(db, "demand_plans")
        .then(exists => exists
          ? db.prepare("SELECT * FROM demand_plans ORDER BY created_at DESC LIMIT 20").all()
          : { results: [] })
    ]);

    return json({
      success: true,
      layer: LAYER,
      version: VERSION,
      status: "CONTENT_PRODUCTION_READY",
      definitions: {
        seo: "Search Engine Optimization: make content discoverable and structurally clear for search.",
        geo: "Generative Engine Optimization: make factual entities, answers, context, and evidence easy for answer engines to interpret.",
        principle: "SEO/GEO support discovery; Measurement decides whether discovery becomes product interaction and purchase."
      },
      production: production.results || [],
      assets: assets.results || [],
      demand_plans: plans.results || [],
      next: "Select one Demand Plan -> create production brief -> create/edit Canva asset -> register asset -> publish manually -> measure first-party events.",
      guardrails: {
        reads_raw_behavior_events: false,
        modifies_measurement: false,
        modifies_intelligence: false,
        modifies_learning: false,
        modifies_decision: false,
        modifies_action: false,
        publishes_content: false,
        contacts_customers: false,
        automatic_execution: false,
        invents_claims: false
      }
    });
  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      status: "ERROR",
      error: error?.message || String(error)
    }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    if (!context.env?.DB) {
      return json({ success: false, layer: LAYER, status: "DB_BINDING_NOT_FOUND" }, 500);
    }

    const db = context.env.DB;
    await ensureTables(db);
    const body = await context.request.json().catch(() => ({}));
    const mode = String(body.mode || "create_brief").toLowerCase();

    if (mode === "launch") {
      if (!body.demand_plan_id) {
        return json({
          success: false,
          layer: LAYER,
          status: "DEMAND_PLAN_REQUIRED",
          error: "demand_plan_id is required"
        }, 400);
      }

      const plan = await db.prepare(
        "SELECT * FROM demand_plans WHERE id=? LIMIT 1"
      ).bind(body.demand_plan_id).first();

      if (!plan) {
        return json({
          success: false,
          layer: LAYER,
          status: "DEMAND_PLAN_NOT_FOUND"
        }, 404);
      }

      const product = await readLatestProduct(db);
      const brief = buildProduction(plan, product);
      const productionId = crypto.randomUUID();
      const contentId = crypto.randomUUID();
      const timestamp = now();

      // Create a NEW Content Intelligence record for every Run Production Loop.
      // Never reuse the previous content or Canva asset.
      if (!await tableExists(db, "content_engine")) {
        return json({
          success: false,
          layer: LAYER,
          status: "CONTENT_ENGINE_NOT_FOUND",
          error: "content_engine table is required for new content production"
        }, 500);
      }

      const contentTitle = "TATO Content · " + brief.primary_keyword + " · " +
        new Date().toISOString().slice(0, 10) + " · " + contentId.slice(0, 8);

      const contentBrief = [
        "HOOK:",
        "ลูกค้ากำลังสนใจเรื่อง " + brief.primary_keyword,
        "",
        "INSIGHT:",
        "สร้าง Content จาก Demand ที่ตรวจพบ แล้วเชื่อมเข้าสู่ TATO",
        "",
        "PRODUCT:",
        String(product?.name || plan.offer || "TATO Coffee"),
        "",
        "ANGLE:",
        brief.answer_summary,
        "",
        "CTA:",
        brief.cta
      ].join("\n");

      await db.prepare(`
        INSERT INTO content_engine
        (id, source, status, title, objective, attention_type, market_keyword, angle, direction, cta, content_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        contentId,
        "DEMAND_ENGINE",
        "IDEA",
        contentTitle,
        brief.objective,
        "market_demand",
        brief.primary_keyword,
        brief.answer_summary,
        "Connect verified demand to a specific TATO product and purchase path.",
        brief.cta,
        contentBrief
      ).run();

      // Generate the actual new content inside TATO-OS when Cloudflare AI is available.
      let finalContent = contentBrief;
      let aiGenerated = false;

      if (context.env.AI) {
        const aiPrompt = `
สร้างโพสต์ Social Media ภาษาไทยสำหรับ TATO Coffee จากข้อมูลด้านล่าง

Demand:
${plan.name || ""}

Keyword:
${brief.primary_keyword}

Audience:
${brief.audience}

Product:
${String(product?.name || plan.offer || "TATO Coffee")}

ข้อมูลจริงที่อนุญาต:
- TATO Coffee
- Arabica 100%
- Single Origin
- Doi Wiang
- คั่วสดใหม่ทุกออเดอร์

CTA:
${brief.cta}

กฎ:
- ภาษาไทยธรรมชาติ
- ต้องเชื่อมกับความสนใจเรื่อง ${brief.primary_keyword}
- ต้องทำให้คนอยากรู้จักสินค้าและไปดูรายละเอียด
- ห้ามแต่งรีวิว รางวัล ส่วนลด ผลลัพธ์ หรือคุณสมบัติที่ไม่ได้ให้มา
- ห้ามเปรียบเทียบคู่แข่ง
- ส่งเฉพาะโพสต์พร้อมใช้
- รูปแบบ HOOK / BODY / CTA
        `.trim();

        const aiResult = await context.env.AI.run("@cf/zai-org/glm-4.7-flash", {
          messages: [
            {
              role: "system",
              content: "You are a Thai content writer for TATO Coffee. Return only the final post."
            },
            { role: "user", content: aiPrompt }
          ],
          reasoning_effort: "low",
          max_completion_tokens: 1400,
          temperature: 0.6
        });

        const msg = aiResult?.choices?.[0]?.message;
        if (typeof msg?.content === "string" && msg.content.trim()) {
          finalContent = msg.content.trim();
          aiGenerated = true;
        } else if (Array.isArray(msg?.content)) {
          const textContent = msg.content.map(item =>
            typeof item === "string" ? item : (item?.text || "")
          ).join("").trim();
          if (textContent) {
            finalContent = textContent;
            aiGenerated = true;
          }
        }
      }

      await db.prepare(
        "UPDATE content_engine SET status=?, content_text=? WHERE id=?"
      ).bind("GENERATED", finalContent, contentId).run();

      await db.prepare(`
        INSERT INTO content_production (
          id, demand_plan_id, content_id, title, objective, audience, channel,
          content_format, primary_keyword, secondary_keywords, search_intent,
          seo_title, meta_description, slug, geo_context, entity_terms,
          answer_summary, faq_json, cta, success_event, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        productionId,
        plan.id,
        contentId,
        brief.title,
        brief.objective,
        brief.audience,
        brief.channel,
        brief.content_format,
        brief.primary_keyword,
        JSON.stringify(brief.secondary_keywords),
        brief.search_intent,
        brief.seo_title,
        brief.meta_description,
        brief.slug + "-" + productionId.slice(0, 8),
        brief.geo_context,
        JSON.stringify(brief.entity_terms),
        brief.answer_summary,
        JSON.stringify(brief.faq),
        brief.cta,
        brief.success_event,
        "CONTENT_READY",
        timestamp,
        timestamp
      ).run();

      return json({
        success: true,
        layer: LAYER,
        version: VERSION,
        status: "PRODUCTION_LOOP_READY",
        production: {
          id: productionId,
          demand_plan_id: plan.id,
          content_id: contentId,
          title: brief.title,
          primary_keyword: brief.primary_keyword,
          search_intent: brief.search_intent,
          seo_title: brief.seo_title,
          meta_description: brief.meta_description,
          slug: brief.slug + "-" + productionId.slice(0, 8),
          geo_context: brief.geo_context,
          entity_terms: JSON.stringify(brief.entity_terms),
          answer_summary: brief.answer_summary,
          faq_json: JSON.stringify(brief.faq),
          cta: brief.cta,
          success_event: brief.success_event,
          status: "CONTENT_READY"
        },
        content: {
          id: contentId,
          title: contentTitle,
          status: "GENERATED",
          content_text: finalContent,
          ai_generated: aiGenerated
        },
        asset: null,
        next: {
          canva: "Create a NEW Canva asset from this newly generated content; do not reuse a previous asset.",
          publish: "Founder publishes the new asset manually after review.",
          measurement: "Send first-party Product View -> Customer -> Order -> Payment events using this new content_id.",
          success_event: brief.success_event
        },
        guardrails: {
          creates_new_content: true,
          reuses_previous_content: false,
          creates_duplicate_brief: false,
          reuses_previous_asset: false,
          publishes_content: false,
          contacts_customers: false,
          reads_raw_behavior_events: false,
          modifies_measurement: false,
          automatic_execution: false
        }
      });
    }

    if (mode === "mark_published") {
      if (!body.production_id || !body.asset_id) {
        return json({
          success: false,
          layer: LAYER,
          status: "PUBLISH_FIELDS_REQUIRED",
          error: "production_id and asset_id are required"
        }, 400);
      }

      const asset = await db.prepare(
        "SELECT * FROM content_assets WHERE id=? AND production_id=? LIMIT 1"
      ).bind(body.asset_id, body.production_id).first();

      if (!asset) {
        return json({
          success: false,
          layer: LAYER,
          status: "ASSET_NOT_FOUND"
        }, 404);
      }

      const publishedAt = body.published_at || now();
      const publishedUrl = body.published_url || null;

      await db.prepare(
        "UPDATE content_assets SET status='PUBLISHED', published_url=?, published_at=?, updated_at=? WHERE id=?"
      ).bind(publishedUrl, publishedAt, now(), asset.id).run();

      return json({
        success: true,
        layer: LAYER,
        version: VERSION,
        status: "ASSET_MARKED_PUBLISHED",
        asset: {
          id: asset.id,
          production_id: asset.production_id,
          platform: asset.platform,
          asset_type: asset.asset_type,
          external_id: asset.external_id,
          external_url: asset.external_url,
          status: "PUBLISHED",
          published_url: publishedUrl,
          published_at: publishedAt
        },
        next: "Real first-party events can now be measured against the linked content_id."
      });
    }

    if (mode === "create_brief") {
      if (!body.demand_plan_id) {
        return json({
          success: false,
          layer: LAYER,
          status: "DEMAND_PLAN_REQUIRED",
          error: "demand_plan_id is required"
        }, 400);
      }

      const plan = await db.prepare(
        "SELECT * FROM demand_plans WHERE id=? LIMIT 1"
      ).bind(body.demand_plan_id).first();

      if (!plan) {
        return json({
          success: false,
          layer: LAYER,
          status: "DEMAND_PLAN_NOT_FOUND"
        }, 404);
      }

      const product = await readLatestProduct(db);
      const brief = buildProduction(plan, product);
      const id = crypto.randomUUID();
      const timestamp = now();

      await db.prepare(`
        INSERT INTO content_production (
          id, demand_plan_id, content_id, title, objective, audience, channel,
          content_format, primary_keyword, secondary_keywords, search_intent,
          seo_title, meta_description, slug, geo_context, entity_terms,
          answer_summary, faq_json, cta, success_event, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        plan.id,
        body.content_id || null,
        brief.title,
        brief.objective,
        brief.audience,
        brief.channel,
        brief.content_format,
        brief.primary_keyword,
        JSON.stringify(brief.secondary_keywords),
        brief.search_intent,
        brief.seo_title,
        brief.meta_description,
        brief.slug,
        brief.geo_context,
        JSON.stringify(brief.entity_terms),
        brief.answer_summary,
        JSON.stringify(brief.faq),
        brief.cta,
        brief.success_event,
        "BRIEF_READY",
        timestamp,
        timestamp
      ).run();

      return json({
        success: true,
        layer: LAYER,
        version: VERSION,
        status: "PRODUCTION_BRIEF_CREATED",
        production: { id, demand_plan_id: plan.id, content_id: body.content_id || null, ...brief, status: "BRIEF_READY" },
        next: {
          canva: "Create the visual asset from this brief in Canva.",
          register_asset: "Register the Canva design ID and URL with mode=register_asset.",
          publish: "Founder publishes manually after review.",
          measurement: "Measure Product View -> Customer -> Order -> Payment.",
          success_event: brief.success_event
        }
      });
    }

    if (mode === "register_asset") {
      if (!body.production_id || !body.platform || !body.asset_type) {
        return json({
          success: false,
          layer: LAYER,
          status: "ASSET_FIELDS_REQUIRED",
          error: "production_id, platform, and asset_type are required"
        }, 400);
      }

      const production = await db.prepare(
        "SELECT * FROM content_production WHERE id=? LIMIT 1"
      ).bind(body.production_id).first();

      if (!production) {
        return json({
          success: false,
          layer: LAYER,
          status: "PRODUCTION_NOT_FOUND"
        }, 404);
      }

      const id = crypto.randomUUID();
      const timestamp = now();

      await db.prepare(`
        INSERT INTO content_assets (
          id, production_id, content_id, platform, asset_type, external_id,
          external_url, status, published_url, published_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        production.id,
        production.content_id || null,
        String(body.platform),
        String(body.asset_type),
        body.external_id || null,
        body.external_url || null,
        body.status || "DRAFT",
        body.published_url || null,
        body.published_at || null,
        timestamp,
        timestamp
      ).run();

      return json({
        success: true,
        layer: LAYER,
        version: VERSION,
        status: "ASSET_REGISTERED",
        asset: {
          id,
          production_id: production.id,
          platform: String(body.platform),
          asset_type: String(body.asset_type),
          external_id: body.external_id || null,
          external_url: body.external_url || null,
          status: body.status || "DRAFT"
        },
        next: "Review the asset, publish manually, then send first-party events into Measurement."
      });
    }

    return json({
      success: false,
      layer: LAYER,
      status: "INVALID_MODE",
      allowed_modes: ["launch", "create_brief", "register_asset", "mark_published"]
    }, 400);
  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      status: "ERROR",
      error: error?.message || String(error)
    }, 400);
  }
}
