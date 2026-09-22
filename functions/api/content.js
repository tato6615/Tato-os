export async function onRequestGet(context) {
  try {
    const { results } = await context.env.DB
      .prepare(`
        SELECT *
        FROM content_engine
        ORDER BY created_at DESC
        LIMIT 200
      `)
      .all();

    return Response.json({
      success: true,
      content: results
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const mode = body.mode || "create";

    /*
     * ============================================================
     * INTELLIGENCE
     * Attention + Market → Content Brief
     * ============================================================
     */
    if (mode === "intelligence") {
      const attentionResult = await context.env.DB
        .prepare(`
          SELECT
            event_type,
            page,
            product_id,
            COUNT(*) AS count
          FROM behavior_events
          WHERE event_type IN (
            'view',
            'page_view',
            'product_view',
            'click',
            'engagement',
            'interest'
          )
          GROUP BY event_type, page, product_id
          ORDER BY count DESC
          LIMIT 10
        `)
        .all();

      const marketResult = await context.env.DB
        .prepare(`
          SELECT
            id,
            source,
            signal_type,
            keyword,
            title,
            content,
            url,
            score,
            metadata,
            detected_at
          FROM market_signals
          ORDER BY score DESC, detected_at DESC
          LIMIT 10
        `)
        .all();

      const attention = attentionResult.results || [];
      const market = marketResult.results || [];

      if (!attention.length && !market.length) {
        return Response.json({
          success: true,
          mode: "intelligence",
          created: false,
          message: "No attention or market signals available",
          content: null
        });
      }

      const topAttention = attention[0] || {};
      const topMarket = market[0] || {};

      const attentionType = topAttention.event_type || "attention";
      const marketKeyword = topMarket.keyword || "coffee";
      const page = topAttention.page || "";
      const productId = topAttention.product_id || "";
      const marketScore = Number(topMarket.score || 0);

      const title = productId
        ? `ทำไมลูกค้าถึงสนใจ ${marketKeyword} ตอนนี้`
        : `เจาะ Attention ลูกค้าจากกระแส ${marketKeyword}`;

      const objective =
        "เปลี่ยน Customer Attention ให้เป็นความสนใจและโอกาสในการซื้อ";

      const angle =
        marketScore >= 70
          ? `ใช้ความสนใจเรื่อง ${marketKeyword} เชื่อมกับสิ่งที่ลูกค้ากำลังสนใจ`
          : `ใช้พฤติกรรม ${attentionType} เป็นจุดเริ่มต้นของ Content`;

      const direction = productId
        ? "นำเสนอประโยชน์ของสินค้าโดยเชื่อมกับความสนใจของลูกค้า"
        : "สร้าง Content จากความต้องการที่ตรวจพบ แล้วเชื่อมเข้าสู่ TATO";

      const cta = "ดูรายละเอียดและทดลอง TATO";

      const contentText = `
HOOK:
ลูกค้ากำลังสนใจเรื่อง ${marketKeyword}

INSIGHT:
ระบบตรวจพบ Attention ประเภท ${attentionType}
${productId ? `และเกี่ยวข้องกับสินค้า ${productId}` : ""}
${page ? `จากหน้า ${page}` : ""}

CONTENT ANGLE:
${angle}

DIRECTION:
${direction}

CTA:
${cta}
      `.trim();

      const id = crypto.randomUUID();

      await context.env.DB
        .prepare(`
          INSERT INTO content_engine
          (
            id,
            source,
            status,
            title,
            objective,
            attention_type,
            market_keyword,
            angle,
            direction,
            cta,
            content_text
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          id,
          "INTELLIGENCE",
          "IDEA",
          title,
          objective,
          attentionType,
          marketKeyword,
          angle,
          direction,
          cta,
          contentText
        )
        .run();

      return Response.json({
        success: true,
        mode: "intelligence",
        created: true,
        content: {
          id,
          source: "INTELLIGENCE",
          status: "IDEA",
          title,
          objective,
          attention_type: attentionType,
          market_keyword: marketKeyword,
          angle,
          direction,
          cta,
          content_text: contentText
        },
        intelligence: {
          attention,
          market
        }
      });
    }

    /*
     * ============================================================
     * AI GENERATE
     * Content Brief → AI-ready generation
     * ============================================================
     *
     * Requires:
     * context.env.AI
     *
     * Cloudflare Workers AI binding:
     * AI
     *
     * Model:
     * @cf/meta/llama-3.1-8b-instruct
     */
    if (mode === "generate") {
      if (!context.env.AI) {
        return Response.json(
          {
            success: false,
            error: "Cloudflare AI binding (AI) is not configured"
          },
          { status: 500 }
        );
      }

      let brief = null;

      if (body.id) {
        brief = await context.env.DB
          .prepare(`
            SELECT *
            FROM content_engine
            WHERE id = ?
            LIMIT 1
          `)
          .bind(body.id)
          .first();
      } else {
        brief = await context.env.DB
          .prepare(`
            SELECT *
            FROM content_engine
            ORDER BY created_at DESC
            LIMIT 1
          `)
          .first();
      }

      if (!brief) {
        return Response.json(
          {
            success: false,
            error: "No content brief found"
          },
          { status: 404 }
        );
      }

      const prompt = `
You are the Content Intelligence AI for TATO Coffee.

Create a high-converting Thai social media content draft from this business intelligence.

CONTENT BRIEF
Title: ${brief.title || ""}
Objective: ${brief.objective || ""}
Attention Type: ${brief.attention_type || ""}
Market Keyword: ${brief.market_keyword || ""}
Angle: ${brief.angle || ""}
Direction: ${brief.direction || ""}
CTA: ${brief.cta || ""}
Original Brief:
${brief.content_text || ""}

TATO CONTEXT
- Brand: TATO Coffee
- Arabica 100%
- Single Origin
- Doi Wiang
- Fresh roasted per order
- Premium coffee positioning

OUTPUT RULES
1. Write in natural Thai.
2. Start with a strong hook.
3. Focus on the customer's attention/problem/desire.
4. Do not invent discounts, reviews, awards, certifications, or facts.
5. Connect the market signal naturally.
6. Mention TATO only when relevant.
7. End with a clear CTA.
8. Do not explain your reasoning.
9. Return only the finished post.

FORMAT:
HOOK

BODY

CTA
      `.trim();

      const aiResult = await context.env.AI.run(
        "@cf/meta/llama-3.1-8b-instruct",
        {
          messages: [
            {
              role: "system",
              content:
                "You are a Thai marketing content strategist for TATO Coffee."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          max_tokens: 1000,
          temperature: 0.7
        }
      );

      const generatedText =
        aiResult?.response ||
        aiResult?.result?.response ||
        "";

      if (!generatedText) {
        return Response.json(
          {
            success: false,
            error: "AI returned empty content"
          },
          { status: 500 }
        );
      }

      await context.env.DB
        .prepare(`
          UPDATE content_engine
          SET
            status = ?,
            content_text = ?
          WHERE id = ?
        `)
        .bind(
          "GENERATED",
          generatedText,
          brief.id
        )
        .run();

      return Response.json({
        success: true,
        mode: "generate",
        generated: true,
        content: {
          ...brief,
          status: "GENERATED",
          content_text: generatedText
        }
      });
    }

    /*
     * ============================================================
     * NORMAL CREATE
     * ============================================================
     */

    const title = body.title?.trim() || "";

    if (!title) {
      return Response.json(
        {
          success: false,
          error: "Content title is required"
        },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();

    const content = {
      id,
      source: body.source || null,
      status: body.status || "IDEA",
      title,
      objective: body.objective || null,
      attention_type: body.attention_type || null,
      market_keyword: body.market_keyword || null,
      angle: body.angle || null,
      direction: body.direction || null,
      cta: body.cta || null,
      content_text: body.content_text || null
    };

    await context.env.DB
      .prepare(`
        INSERT INTO content_engine
        (
          id,
          source,
          status,
          title,
          objective,
          attention_type,
          market_keyword,
          angle,
          direction,
          cta,
          content_text
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        content.id,
        content.source,
        content.status,
        content.title,
        content.objective,
        content.attention_type,
        content.market_keyword,
        content.angle,
        content.direction,
        content.cta,
        content.content_text
      )
      .run();

    return Response.json({
      success: true,
      content
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}
