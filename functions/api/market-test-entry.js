```javascript
// TATO-OS
// Public Market Test Entry V1
// Route: /market-test
//
// Flow:
//
// REAL CUSTOMER
//      ↓
// Market Test Entry
//      ↓
// content_view
//      ↓
// content_click
//      ↓
// Product Test
//      ↓
// product_view
//      ↓
// Measurement V2.3
//
// IMPORTANT:
// - No fake events
// - No winner declaration
// - No strategy change
// - No purchase invention
// - No revenue invention
// - No automatic publishing
// - No spending

const DISTRIBUTION_ID =
  "distribution-1790392496602-lhk96nmd";

const ENGINE =
  "PUBLIC_MARKET_TEST_ENTRY_V1";

const VERSION =
  "1.0";

const API_PATH =
  "/api/market-test-entry";

export async function onRequestGet({ request }) {
  try {
    const url = new URL(request.url);

    // Optional debug/status mode
    if (url.searchParams.get("status") === "1") {
      return json({
        success: true,
        engine: ENGINE,
        version: VERSION,
        state: "PUBLIC_MARKET_TEST_READY",
        distribution_id: DISTRIBUTION_ID,
        tracking: {
          content_view: true,
          content_click: true,
          product_view: true
        },
        next_layer: "MEASUREMENT_V2.3",
        real_customer_required: true
      });
    }

    return new Response(renderEntryPage(), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    return json({
      success: false,
      engine: ENGINE,
      version: VERSION,
      error: error?.message || String(error)
    }, 500);
  }
}

function renderEntryPage() {
  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>กาแฟที่ใช่ สำหรับช่วงเวลาของคุณ | TATO</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: #111111;
      color: #ffffff;
      font-family:
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
    }

    .page {
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 24px;
    }

    .card {
      width: 100%;
      max-width: 620px;
      background: #1b1b1b;
      border-radius: 22px;
      padding: 34px 26px;
      border: 1px solid #2b2b2b;
      box-shadow: 0 20px 60px rgba(0,0,0,0.35);
    }

    .brand {
      font-size: 14px;
      letter-spacing: 3px;
      font-weight: 700;
      color: #f28c28;
      margin-bottom: 28px;
    }

    h1 {
      margin: 0 0 18px;
      font-size: 34px;
      line-height: 1.2;
    }

    .lead {
      color: #cfcfcf;
      font-size: 17px;
      line-height: 1.7;
      margin-bottom: 26px;
    }

    .coffee-box {
      background: #121212;
      border: 1px solid #303030;
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 24px;
    }

    .coffee-box strong {
      display: block;
      font-size: 20px;
      margin-bottom: 8px;
    }

    .coffee-box span {
      color: #aaa;
      line-height: 1.6;
    }

    .cta {
      width: 100%;
      border: 0;
      border-radius: 14px;
      padding: 17px 20px;
      background: #f28c28;
      color: #111111;
      font-size: 17px;
      font-weight: 800;
      cursor: pointer;
    }

    .cta:active {
      transform: scale(0.99);
    }

    .small {
      margin-top: 16px;
      text-align: center;
      color: #777;
      font-size: 12px;
      line-height: 1.5;
    }

    .status {
      display: none;
      margin-top: 16px;
      text-align: center;
      color: #999;
      font-size: 13px;
    }
  </style>
</head>

<body>

  <main class="page">

    <section class="card">

      <div class="brand">
        TATO COFFEE
      </div>

      <h1>
        ทำไมลูกค้าถึงสนใจ coffee ตอนนี้?
      </h1>

      <p class="lead">
        กาแฟไม่ได้มีแค่เรื่องความเข้มหรือความขม
        แต่สิ่งที่สำคัญคือ
        <strong>กาแฟแบบไหนที่เหมาะกับช่วงเวลาของคุณ</strong>
      </p>

      <div class="coffee-box">
        <strong>Arabica 100% · Single Origin</strong>

        <span>
          เมล็ดกาแฟจากดอยเวียง
          ความสูงประมาณ 1,250 เมตร
          คั่วสดใหม่ตามออเดอร์
        </span>
      </div>

      <button
        id="cta"
        class="cta"
        type="button"
      >
        ดูรายละเอียดและทดลอง TATO
      </button>

      <div
        id="status"
        class="status"
      >
        กำลังเปิดรายละเอียด...
      </div>

      <div class="small">
        TATO Coffee · Fresh Roasted
      </div>

    </section>

  </main>

  <script>
    const DISTRIBUTION_ID =
      ${JSON.stringify(DISTRIBUTION_ID)};

    const API_PATH =
      ${JSON.stringify(API_PATH)};

    async function recordEvent(eventType) {
      try {
        const response = await fetch(API_PATH, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            distribution_id: DISTRIBUTION_ID,
            event_type: eventType
          }),
          keepalive: true
        });

        return await response.json();
      } catch (error) {
        return {
          success: false,
          error: error?.message || String(error)
        };
      }
    }

    // Real customer page view.
    // This fires only when an actual visitor loads the page.
    recordEvent("content_view");

    const cta =
      document.getElementById("cta");

    const status =
      document.getElementById("status");

    cta.addEventListener("click", async () => {

      cta.disabled = true;
      status.style.display = "block";

      // Record the real click before navigation.
      await recordEvent("content_click");

      window.location.href =
        "/market-test/product";
    });

  </script>

</body>
</html>`;
}

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "content-type": "application/json; charset=UTF-8",
        "cache-control": "no-store"
      }
    }
  );
}
```
