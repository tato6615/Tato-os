```javascript
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

    const decisions = Array.isArray(body.decisions)
      ? body.decisions
      : [];

    const actions = [];

    // =========================================================
    // CONVERT DECISION → ACTION
    // =========================================================

    for (const decision of decisions) {
      const type = String(decision.type || "").toUpperCase();

      if (type === "ATTENTION") {
        actions.push({
          action_type: "CONTENT",
          title: "สร้าง Content จาก Attention Signal",
          description:
            "นำพฤติกรรมที่ลูกค้าสนใจมาสร้าง Content หรือ Offer ที่เกี่ยวข้อง",
          priority: decision.priority || "HIGH",
          status: "READY",
          source: "ATTENTION"
        });
      }

      else if (type === "MARKET") {
        actions.push({
          action_type: "MARKET_RESPONSE",
          title: "ตอบสนองต่อ Market Signal",
          description:
            "เลือก Market Signal ที่มี Demand และสร้างข้อเสนอหรือ Content เพื่อตอบสนอง",
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
            "จัดกลุ่มลูกค้าตามระดับความสนใจและพฤติกรรมเพื่อสร้างข้อเสนอเฉพาะกลุ่ม",
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
            "ตรวจสอบ AI Insight ล่าสุดและกำหนด Action ที่สามารถวัดผลได้",
          priority: decision.priority || "HIGH",
          status: "READY",
          source: "AI_INSIGHT"
        });
      }

      else if (type === "DATA_COLLECTION") {
        actions.push({
          action_type: "DATA_COLLECTION",
          title: "เก็บข้อมูลเพิ่ม",
          description:
            "เพิ่มการเก็บ Behavior และ Market Signals ก่อนสร้าง Action",
          priority: decision.priority || "MEDIUM",
          status: "WAITING_DATA",
          source: "DATA_COLLECTION"
        });
      }
    }

    // =========================================================
    // DEFAULT ACTION
    // =========================================================

    if (actions.length === 0) {
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

    // =========================================================
    // RESPONSE
    // =========================================================

    return Response.json({
      success: true,

      layer: "ACTION",

      actions,

      total: actions.length,

      generated_at: new Date().toISOString()
    });
  }

  catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}
```
