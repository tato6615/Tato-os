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


// =============================================================
// GET CONTENT
// =============================================================

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


// =============================================================
// POST CONTENT
// =============================================================

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


      const attention =
        attentionResult.results || [];

      const market =
        marketResult.results || [];


      if (!attention.length && !market.length) {
        return json({
          success: true,
          mode: "intelligence",
          created: false,
          message: "No attention or market signals available",
          content: null
        });
      }


      const topAttention =
        attention[0] || {};

      const topMarket =
        market[0] || {};


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
    // AI GENERATE + QUALITY ENGINE
    // =========================================================

    if (mode === "generate") {

      if (!context.env.AI) {
        return json(
          {
            success: false,
            error:
              "Cloudflare AI binding (AI) is not configured"
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


      // =======================================================
      // GENERATION PROMPT
      // =======================================================

      const prompt = `
สร้างโพสต์ Social Media ภาษาไทยสำหรับ TATO Coffee

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


ข้อมูล TATO ที่อนุญาตให้ใช้:

- TATO Coffee
- Arabica 100%
- Single Origin
- Doi Wiang
- คั่วสดใหม่ทุกออเดอร์


กฎสำคัญ:

1. เขียนภาษาไทยที่เป็นธรรมชาติแบบคนจริง
2. ห้ามใช้คำเว่อร์หรือภาษาที่ไม่มีความหมาย
3. ห้ามแต่งข้อมูลสินค้า
4. ห้ามแต่งรีวิว
5. ห้ามแต่งรางวัล
6. ห้ามแต่งใบรับรอง
7. ห้ามแต่งส่วนลด
8. ห้ามอ้างผลลัพธ์ที่ไม่มีข้อมูลรองรับ
9. ห้ามบอกว่า TATO ดีกว่าคู่แข่งโดยไม่มีหลักฐาน
10. ห้ามใช้คำที่แปลจากภาษาอังกฤษแล้วฟังแปลก
11. ห้ามสร้างคำใหม่หรือคำผิด
12. ต้องเชื่อมกับ Customer Attention ที่ตรวจพบ
13. ต้องมีเหตุผลที่ลูกค้าควรสนใจ
14. ต้องมี CTA
15. ห้ามอธิบายเหตุผลหรือกระบวนการคิด
16. ส่งเฉพาะโพสต์พร้อมใช้


รูปแบบ:

HOOK

BODY

CTA
      `.trim();


      // =======================================================
      // AI GENERATION
      // =======================================================

      const aiResult =
        await context.env.AI.run(
          "@cf/zai-org/glm-4.7-flash",
          {
            messages: [
              {
                role: "system",
                content:
                  "You are a Thai marketing content writer for TATO Coffee. Write natural Thai. Never reveal reasoning. Return only the final post."
              },
              {
                role: "user",
                content: prompt
              }
            ],

            reasoning_effort: "low",

            max_completion_tokens: 1800,

            temperature: 0.6
          }
        );


      const generatedChoice =
        aiResult?.choices?.[0];

      const generatedMessage =
        generatedChoice?.message;


      let generatedText = "";


      if (
        typeof generatedMessage?.content ===
        "string"
      ) {
        generatedText =
          generatedMessage.content.trim();
      }


      if (
        !generatedText &&
        Array.isArray(generatedMessage?.content)
      ) {
        generatedText =
          generatedMessage.content
            .map(item => {
              if (typeof item === "string") {
                return item;
              }

              return item?.text || "";
            })
            .join("")
            .trim();
      }


      if (!generatedText) {
        return json(
          {
            success: false,
            error:
              "AI did not return final content",

            finish_reason:
              generatedChoice?.finish_reason || null,

            reasoning_present:
              Boolean(generatedMessage?.reasoning)
          },
          500
        );
      }


      // =======================================================
      // CONTENT QUALITY ENGINE
      // =======================================================

      const qualityPrompt = `
คุณคือ Content Quality Editor ของ TATO Coffee

ตรวจและปรับปรุงโพสต์ด้านล่างให้พร้อมใช้จริง

เป้าหมาย:
- ภาษาไทยต้องเป็นธรรมชาติ
- อ่านแล้วเหมือนมนุษย์เขียน
- ไม่มีคำเพี้ยน
- ไม่มีประโยคไร้ความหมาย
- ไม่มีการแปลภาษาอังกฤษแบบตรงตัว
- ไม่เว่อร์เกินจริง
- ไม่แต่งข้อมูลสินค้า
- ไม่แต่งรีวิว
- ไม่แต่งรางวัล
- ไม่แต่งใบรับรอง
- ไม่แต่งส่วนลด
- ไม่อ้างข้อมูลที่ไม่มีในข้อมูลต้นทาง
- รักษา Hook ที่ดึงความสนใจ
- รักษาเจตนาการขาย
- รักษา CTA
- ทำให้ข้อความกระชับและน่าอ่านขึ้น

ข้อมูลจริงที่สามารถกล่าวถึงได้:

TATO Coffee
Arabica 100%
Single Origin
Doi Wiang
คั่วสดใหม่ทุกออเดอร์

CONTENT INTELLIGENCE:

Attention:
${brief.attention_type || ""}

Market:
${brief.market_keyword || ""}

Angle:
${brief.angle || ""}

Direction:
${brief.direction || ""}

CTA:
${brief.cta || ""}


โพสต์ที่ต้องตรวจ:

${generatedText}


สำคัญ:
อย่าอธิบายว่าคุณแก้อะไร
อย่าแสดง Reasoning
ส่งเฉพาะโพสต์ฉบับสุดท้ายเท่านั้น

รูปแบบ:

HOOK

BODY

CTA
      `.trim();


      const qualityResult =
        await context.env.AI.run(
          "@cf/zai-org/glm-4.7-flash",
          {
            messages: [
              {
                role: "system",
                content:
                  "You are the final Thai content quality editor for TATO Coffee. Return only the corrected final post."
              },
              {
                role: "user",
                content: qualityPrompt
              }
            ],

            reasoning_effort: "low",

            max_completion_tokens: 1800,

            temperature: 0.3
          }
        );


      const qualityChoice =
        qualityResult?.choices?.[0];

      const qualityMessage =
        qualityChoice?.message;


      let finalText = "";


      if (
        typeof qualityMessage?.content ===
        "string"
      ) {
        finalText =
          qualityMessage.content.trim();
      }


      if (
        !finalText &&
        Array.isArray(qualityMessage?.content)
      ) {
        finalText =
          qualityMessage.content
            .map(item => {
              if (typeof item === "string") {
                return item;
              }

              return item?.text || "";
            })
            .join("")
            .trim();
      }


      // ถ้า Quality Engine ไม่คืนข้อความ
      // ให้ใช้ข้อความจาก Generation แทน
      if (!finalText) {
        finalText =
          generatedText;
      }


      // =======================================================
      // SAVE FINAL CONTENT
      // =======================================================

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
          finalText,
          brief.id
        )
        .run();


      return json({
        success: true,
        mode: "generate",
        generated: true,
        quality_checked: true,

        model:
          "@cf/zai-org/glm-4.7-flash",

        content: {
          ...brief,
          status: "GENERATED",
          content_text: finalText
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

      source:
        body.source || null,

      status:
        body.status || "IDEA",

      title,

      objective:
        body.objective || null,

      attention_type:
        body.attention_type || null,

      market_keyword:
        body.market_keyword || null,

      angle:
        body.angle || null,

      direction:
        body.direction || null,

      cta:
        body.cta || null,

      content_text:
        body.content_text || null
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
