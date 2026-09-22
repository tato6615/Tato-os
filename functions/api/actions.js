export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return Response.json(
        {
          success: false,
          error: "D1 database binding DB not found"
        },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const mode = String(body.mode || "preview").toLowerCase();

    /*
    ============================================================
    ACTION TYPES
    ============================================================
    */

    const ACTION_TYPES = {
      CONTENT: {
        title: "สร้าง Content จาก Attention",
        source: "ATTENTION"
      },

      PUBLISH_CONTENT: {
        title: "เผยแพร่ Content ที่ผ่าน Decision",
        source: "CONTENT_DECISION"
      },

      MARKET_RESPONSE: {
        title: "ตอบสนองต่อ Market Demand",
        source: "MARKET"
      },

      CUSTOMER_SEGMENT: {
        title: "แบ่งกลุ่มลูกค้าตามพฤติกรรม",
        source: "CUSTOMER"
      },

      AI_ACTION: {
        title: "เปลี่ยน AI Insight เป็น Action",
        source: "AI_INSIGHT"
      }
    };

    /*
    ============================================================
    PREVIEW
    ============================================================
    */

    if (mode === "preview") {
      const decisions = Array.isArray(body.decisions)
        ? body.decisions
        : [];

      const actions = [];

      for (const decision of decisions) {
        const type = String(
          decision.type || ""
        ).toUpperCase();

        /*
        --------------------------------------------------------
        CONTENT DECISION
        --------------------------------------------------------
        */

        if (type === "PUBLISH_CONTENT") {
          actions.push({
            action_type: "PUBLISH_CONTENT",
            title: "เผยแพร่ Content ที่ผ่าน Decision",
            description:
              "นำ Content ที่ผ่าน Content Decision Engine ไปสู่ขั้นตอนเผยแพร่",
            priority: decision.priority || "HIGH",
            score: Number(decision.score || 0),
            status: "READY",
            source: "CONTENT_DECISION"
          });
        }

        else if (type === "GENERATE_CONTENT") {
          actions.push({
            action_type: "CONTENT",
            title: "สร้าง Content จาก Decision",
            description:
              "สร้าง Content จาก Attention + Market Demand",
            priority: decision.priority || "HIGH",
            status: "READY",
            source: "CONTENT_DECISION"
          });
        }

        else if (type === "ATTENTION") {
          actions.push({
            action_type: "CONTENT",
            title: "สร้าง Content จาก Attention",
            description:
              "นำสิ่งที่ลูกค้ากำลังสนใจมาสร้าง Content หรือ Offer",
            priority: decision.priority || "HIGH",
            status: "READY",
            source: "ATTENTION"
          });
        }

        else if (type === "MARKET") {
          actions.push({
            action_type: "MARKET_RESPONSE",
            title: "ตอบสนองต่อ Market Demand",
            description:
              "สร้างข้อเสนอหรือ Content ที่ตรงกับ Demand Signal",
            priority: decision.priority || "HIGH",
            status: "READY",
            source: "MARKET"
          });
        }

        else if (type === "CUSTOMER") {
          actions.push({
            action_type: "CUSTOMER_SEGMENT",
            title: "แบ่งกลุ่มลูกค้าตามพฤติกรรม",
            description:
              "จัดกลุ่มลูกค้าตามพฤติกรรมและมูลค่า",
            priority: decision.priority || "MEDIUM",
            status: "READY",
            source: "CUSTOMER"
          });
        }

        else if (type === "AI_INSIGHT") {
          actions.push({
            action_type: "AI_ACTION",
            title: "เปลี่ยน AI Insight เป็น Action",
            description:
              "นำ AI Insight ล่าสุดไปสร้าง Action ที่วัดผลได้",
            priority: decision.priority || "HIGH",
            status: "READY",
            source: "AI_INSIGHT"
          });
        }
      }

      if (!actions.length) {
        actions.push({
          action_type: "SYSTEM_CHECK",
          title: "ตรวจสอบ Intelligence Pipeline",
          description:
            "ยังไม่มี Decision สำหรับสร้าง Action",
          priority: "LOW",
          status: "WAITING_DATA",
          source: "SYSTEM"
        });
      }

      return Response.json({
        success: true,
        mode: "preview",
        layer: "ACTION",
        actions,
        total: actions.length,
        generated_at: new Date().toISOString()
      });
    }

    /*
    ============================================================
    EXECUTE
    ============================================================
    */

    if (mode !== "execute") {
      return Response.json(
        {
          success: false,
          error: `Unknown action mode: ${mode}`
        },
        { status: 400 }
      );
    }

    const actionType = String(
      body.action_type || ""
    ).toUpperCase();

    if (!ACTION_TYPES[actionType]) {
      return Response.json(
        {
          success: false,
          error: `Unknown action_type: ${actionType}`
        },
        { status: 400 }
      );
    }

    /*
    ============================================================
    CREATE ACTION RUN TABLE
    ============================================================
    */

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS action_runs (
        id TEXT PRIMARY KEY,
        action_type TEXT NOT NULL,
        source TEXT,
        status TEXT NOT NULL,
        input_data TEXT,
        output_data TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT
      )
    `).run();

    /*
    ============================================================
    ACTION RUN ID
    ============================================================
    */

    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    /*
    ============================================================
    LOAD INTELLIGENCE DATA
    ============================================================
    */

    const [
      behaviorResult,
      marketResult,
      customersResult,
      insightsResult,
      contentResult
    ] = await Promise.all([
      env.DB.prepare(`
        SELECT *
        FROM behavior_events
        ORDER BY created_at DESC
        LIMIT 20
      `).all(),

      env.DB.prepare(`
        SELECT *
        FROM market_signals
        ORDER BY detected_at DESC
        LIMIT 20
      `).all(),

      env.DB.prepare(`
        SELECT *
        FROM customers
        ORDER BY created_at DESC
        LIMIT 20
      `).all(),

      env.DB.prepare(`
        SELECT *
        FROM ai_insights
        ORDER BY created_at DESC
        LIMIT 20
      `).all(),

      env.DB.prepare(`
        SELECT *
        FROM content_engine
        ORDER BY created_at DESC
        LIMIT 20
      `).all()
    ]);

    const behavior =
      behaviorResult.results || [];

    const market =
      marketResult.results || [];

    const customers =
      customersResult.results || [];

    const insights =
      insightsResult.results || [];

    const contents =
      contentResult.results || [];

    /*
    ============================================================
    ATTENTION
    ============================================================
    */

    const attentionEvents = behavior.filter(event => {
      const type = String(
        event.event_type || ""
      ).toLowerCase();

      return [
        "view",
        "page_view",
        "product_view",
        "click",
        "engagement",
        "interest"
      ].includes(type);
    });

    const attentionByType = {};

    for (const event of attentionEvents) {
      const type =
        event.event_type || "unknown";

      attentionByType[type] =
        (attentionByType[type] || 0) + 1;
    }

    const topAttention =
      Object.entries(attentionByType)
        .sort((a, b) => b[1] - a[1])[0] || null;

    /*
    ============================================================
    MARKET
    ============================================================
    */

    const topMarket =
      [...market]
        .sort(
          (a, b) =>
            Number(b.score || 0) -
            Number(a.score || 0)
        )[0] || null;

    /*
    ============================================================
    CUSTOMER
    ============================================================
    */

    const customerCount =
      customers.length;

    /*
    ============================================================
    BUILD ACTION OUTPUT
    ============================================================
    */

    let output = {};

    /*
    ------------------------------------------------------------
    CONTENT
    ------------------------------------------------------------
    */

    if (actionType === "CONTENT") {
      const attentionType =
        topAttention?.[0] ||
        "customer_interest";

      const attentionCount =
        Number(topAttention?.[1] || 0);

      const keyword =
        topMarket?.keyword ||
        "coffee";

      const score =
        Number(topMarket?.score || 0);

      output = {
        action: "CREATE_CONTENT",
        status: "EXECUTED",

        content_brief: {
          objective:
            "สร้าง Content จาก Customer Attention ที่สอดคล้องกับ Market Demand",

          attention_signal: {
            type: attentionType,
            events: attentionCount
          },

          market_signal: {
            keyword,
            score,
            source:
              topMarket?.source || null
          },

          angle:
            `Content สำหรับผู้ที่กำลังสนใจ ${keyword}`,

          recommended_direction:
            "สร้าง Content ที่เชื่อมความสนใจของลูกค้ากับ Demand ของตลาด",

          cta:
            "ทดลองสินค้า / สอบถามรายละเอียด / สั่งซื้อ"
        },

        next_step:
          "ส่ง Content Brief เข้า Content Engine"
      };
    }

    /*
    ------------------------------------------------------------
    PUBLISH CONTENT
    ------------------------------------------------------------
    */

    else if (actionType === "PUBLISH_CONTENT") {

      /*
      ----------------------------------------------------------
      FIND GENERATED CONTENT
      ----------------------------------------------------------
      */

      const generatedContent =
        contents.filter(content =>
          String(content.status || "")
            .toUpperCase() === "GENERATED"
        );

      const latestContent =
        generatedContent[0] || null;


      /*
      ----------------------------------------------------------
      NO CONTENT
      ----------------------------------------------------------
      */

      if (!latestContent) {

        output = {
          action: "PUBLISH_CONTENT",
          status: "WAITING_CONTENT",

          message:
            "ยังไม่มี Content ที่ผ่าน AI Generate และ Quality Check",

          next_step:
            "สร้าง Content ก่อน แล้วจึงเข้าสู่ Publish Action"
        };

      }

      /*
      ----------------------------------------------------------
      CONTENT READY
      ----------------------------------------------------------
      */

      else {

        const decisionScore =
          Number(body.decision_score || 0);

        const decisionPriority =
          String(
            body.decision_priority ||
            "HIGH"
          ).toUpperCase();


        output = {
          action: "PUBLISH_CONTENT",
          status: "READY_TO_PUBLISH",

          decision: {
            score: decisionScore,
            priority: decisionPriority,
            type:
              body.decision_type ||
              "PUBLISH_CONTENT"
          },

          content: {
            id:
              latestContent.id,

            title:
              latestContent.title,

            status:
              latestContent.status,

            attention_type:
              latestContent.attention_type,

            market_keyword:
              latestContent.market_keyword,

            cta:
              latestContent.cta,

            content_text:
              latestContent.content_text
          },

          publish: {
            status: "READY",
            channel: body.channel || "MANUAL",
            platform:
              body.platform || "SOCIAL_MEDIA"
          },

          next_step:
            "ส่ง Content ไปยัง Publishing Channel"
        };
      }
    }

    /*
    ------------------------------------------------------------
    MARKET RESPONSE
    ------------------------------------------------------------
    */

    else if (actionType === "MARKET_RESPONSE") {
      const keyword =
        topMarket?.keyword ||
        "coffee";

      const score =
        Number(topMarket?.score || 0);

      output = {
        action: "CREATE_MARKET_RESPONSE",
        status: "EXECUTED",

        market_response: {
          keyword,
          score,

          demand_detected:
            Boolean(topMarket),

          recommended_offer:
            `สร้างข้อเสนอที่ตอบความต้องการเกี่ยวกับ ${keyword}`,

          content_direction:
            `สร้าง Content ที่จับ Demand: ${keyword}`,

          priority:
            score >= 80
              ? "HIGH"
              : score >= 50
                ? "MEDIUM"
                : "LOW"
        },

        next_step:
          "นำ Market Response เข้า Content / Offer Engine"
      };
    }

    /*
    ------------------------------------------------------------
    CUSTOMER SEGMENT
    ------------------------------------------------------------
    */

    else if (actionType === "CUSTOMER_SEGMENT") {
      const segments = customers.map(customer => {
        const customerEvents =
          behavior.filter(
            event =>
              event.customer_id ===
              customer.id
          );

        return {
          customer_id: customer.id,
          attention_events:
            customerEvents.length,

          segment:
            customerEvents.length >= 5
              ? "HIGH_INTENT"
              : customerEvents.length >= 2
                ? "INTERESTED"
                : "NEW"
        };
      });

      output = {
        action: "SEGMENT_CUSTOMERS",
        status: "EXECUTED",

        total_customers:
          customerCount,

        segments
      };
    }

    /*
    ------------------------------------------------------------
    AI ACTION
    ------------------------------------------------------------
    */

    else if (actionType === "AI_ACTION") {
      const latestInsight =
        insights[0] || null;

      output = {
        action: "AI_INSIGHT_TO_ACTION",
        status: "EXECUTED",

        source_insight:
          latestInsight
            ? {
                id: latestInsight.id,
                title:
                  latestInsight.title,
                priority:
                  latestInsight.priority,
                score:
                  latestInsight.score
              }
            : null,

        recommended_action:
          latestInsight
            ? latestInsight.content
            : "ยังไม่มี AI Insight สำหรับ Execute",

        next_step:
          latestInsight
            ? "ส่ง Insight ไปยัง Action / Workflow Engine"
            : "รอ AI Insight เพิ่มเติม"
      };
    }

    /*
    ============================================================
    SAVE ACTION RUN
    ============================================================
    */

    const completedAt =
      new Date().toISOString();

    const inputData = {
      action_type: actionType,

      source:
        body.source ||
        ACTION_TYPES[actionType].source,

      decision_type:
        body.decision_type || null,

      decision_score:
        body.decision_score || null,

      decision_priority:
        body.decision_priority || null,

      attention_events:
        attentionEvents.length,

      market_signals:
        market.length,

      customers:
        customerCount,

      ai_insights:
        insights.length,

      content:
        contents.length
    };

    await env.DB.prepare(`
      INSERT INTO action_runs
      (
        id,
        action_type,
        source,
        status,
        input_data,
        output_data,
        created_at,
        completed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        runId,
        actionType,
        body.source ||
          ACTION_TYPES[actionType].source,
        "COMPLETED",
        JSON.stringify(inputData),
        JSON.stringify(output),
        startedAt,
        completedAt
      )
      .run();

    /*
    ============================================================
    RESPONSE
    ============================================================
    */

    return Response.json({
      success: true,

      mode: "execute",

      layer: "ACTION",

      execution: {
        id: runId,
        action_type: actionType,
        source:
          body.source ||
          ACTION_TYPES[actionType].source,
        status: "COMPLETED",
        started_at: startedAt,
        completed_at: completedAt
      },

      intelligence: {
        attention_events:
          attentionEvents.length,

        top_attention:
          topAttention,

        market_signals:
          market.length,

        top_market:
          topMarket,

        customers:
          customerCount,

        ai_insights:
          insights.length,

        content:
          contents.length
      },

      result: output
    });

  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message,
        layer: "ACTION"
      },
      { status: 500 }
    );
  }
}
