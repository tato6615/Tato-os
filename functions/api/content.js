const json = (data, status = 200) => {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
};

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

    return json({
      success: true,
      content: results
    });
  } catch (error) {
    return json(
      {
        success: false,
        error: error.message
      },
      500
    );
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const mode = body.mode || "create";

    // =========================================================
    // CONTENT INTELLIGENCE
    // =========================================================

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
        return json({
          success: true,
          mode: "intelligence",
          created: false,
          message: "No attention or market signals available",
          content: null
        });
      }

      const topAttention = attention[0] || {};
      const topMarket = market[0] || {};

      const attentionType =
        topAttention.event_type || "attention";

      const marketKeyword =
        topMarket.keyword || "coffee";

      const page =
        topAttention.page || "";

      const productId =
        topAttention.product_id || "";

      const marketScore =
        Number(topMarket.score || 0);

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

      const cta =
        "ดูรายละเอียดและทดลอง TATO";

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

      const id =
        crypto.randomUUID();

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

      return json({
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

    // =========================================================
    // AI CONTENT GENERATION
    // =========================================================

    if (mode === "generate") {
      if (!context.env.AI) {
        return json(
          {
            success: false,
            error: "Cloudflare AI binding (AI) is not configured"
          },
          500
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
        return json(
          {
            success: false,
            error: "No content brief found"
          },
          404
        );
      }

      const prompt = `
สร้างโพสต์ Social Media ภาษาไทยสำหรับ TATO Coffee จากข้อมูลด้านล่าง

ข้อมูล Content Intelligence:

Title:
${brief.title || ""}

Objective:
${brief.objective || ""}

Attention Type:
${brief.attention_type || ""}

Market Keyword:
${brief.market_keyword || ""}

Angle:
${brief.angle || ""}

Direction:
${brief.direction || ""}

CTA:
${brief.cta || ""}

Original Brief:
${brief.content_text || ""}

ข้อมูล TATO ที่ใช้ได้:
- TATO Coffee
- Arabica 100%
- Single Origin
- Doi Wiang
- คั่วสดใหม่ทุกออเดอร์

กติกา:
- เขียนภาษาไทยที่เป็นธรรมชาติ
- Hook ต้องดึงความสนใจ
- เน้นความต้องการหรือพฤติกรรมของลูกค้า
- เชื่อม Market Signal อย่างเป็นธรรมชาติ
- ห้ามแต่งส่วนลด
- ห้ามแต่งรีวิว
- ห้ามแต่งรางวัล
- ห้ามแต่งใบรับรอง
- ห้ามสร้างข้อมูลที่ไม่มีใน Brief
- ห้ามเขียนคำอธิบายกระบวนการคิด
- ห้ามเขียน Reasoning
- ส่งเฉพาะโพสต์ที่พร้อมนำไปใช้จริง
- จบด้วย CTA

รูปแบบ:

HOOK

BODY

CTA
      `.trim();

      const aiResult = await context.env.AI.run(
        "@cf/zai-org/glm-4.7-flash",
        {
          messages: [
            {
              role: "system",
              content:
                "You are a Thai marketing content writer for TATO Coffee. Do not reveal reasoning. Return only the final content."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          reasoning_effort: "low",
          max_completion_tokens: 1800,
          temperature: 0.7
        }
      );

      const choice =
        aiResult?.choices?.[0];

      const message =
        choice?.message;

      let generatedText = "";

      if (typeof message?.content === "string") {
        generatedText =
          message.content.trim();
      }

      if (!generatedText && Array.isArray(message?.content)) {
        generatedText = message.content
          .map(item => {
            if (typeof item === "string") {
              return item;
            }

            if (item?.text) {
              return item.text;
            }

            return "";
          })
          .join("")
          .trim();
      }

      if (!generatedText) {
        return json(
          {
            success: false,
            error: "AI did not return final content",
            finish_reason:
              choice?.finish_reason || null,
            reasoning_present:
              Boolean(message?.reasoning),
            ai_result: aiResult
          },
          500
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

      return json({
        success: true,
        mode: "generate",
        generated: true,
        model: "@cf/zai-org/glm-4.7-flash",
        content: {
          ...brief,
          status: "GENERATED",
          content_text: generatedText
        }
      });
    }

    // =========================================================
    // NORMAL CREATE
    // =========================================================

    const title =
      body.title?.trim() || "";

    if (!title) {
      return json(
        {
          success: false,
          error: "Content title is required"
        },
        400
      );
    }

    const id =
      crypto.randomUUID();

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

    return json({
      success: true,
      content
    });

  } catch (error) {
    return json(
      {
        success: false,
        error: error.message
      },
      500
    );
  }
}
