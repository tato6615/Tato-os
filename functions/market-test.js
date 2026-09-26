```javascript
// TATO-OS
// Market Test Public Entry V1.0
//
// Route:
// /market-test
//
// Flow:
//
// Market Test Distribution
//        ↓
// Public Market Test Entry
//        ↓
// Real Customer Behavior
//        ↓
// /api/market-test-entry
//        ↓
// Measurement V2.3
//
// This page DOES:
// - record real content_view when a visitor opens the page
// - record real content_click when visitor clicks CTA
// - record real product_view when visitor reaches the offer section
// - send events to REAL_MARKET_TEST_ENTRY_V1
//
// This page DOES NOT:
// - create fake behavior
// - simulate customers
// - create orders
// - create payments
// - create revenue
// - declare winners
// - change strategy
// - publish advertisements
// - spend money

const DISTRIBUTION_ID =
  "distribution-1790392496602-lhk96nmd";

const MARKET_TEST_ID =
  "market-test-1790392032678-c80dkx3f";

const MEASUREMENT_ID =
  "measurement-1790395426049-7wjtgs3p";

const ENTRY_API =
  "/api/market-test-entry";

const PAGE_TITLE =
  "TATO Coffee — Market Test";

const BRAND_NAME =
  "TATO Coffee";

const HEADLINE =
  "กาแฟที่เริ่มจากความสนใจของคนดื่มจริง";

const SUBHEAD =
  "ทดลองทำความรู้จัก TATO Coffee และดูว่ากาแฟแบบไหนเหมาะกับคุณ";

const CTA_TEXT =
  "ดูรายละเอียด TATO Coffee";

function htmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function pageHtml() {
  var safeTitle = htmlEscape(PAGE_TITLE);
  var safeBrand = htmlEscape(BRAND_NAME);
  var safeHeadline = htmlEscape(HEADLINE);
  var safeSubhead = htmlEscape(SUBHEAD);
  var safeCta = htmlEscape(CTA_TEXT);
  var safeDistribution = htmlEscape(DISTRIBUTION_ID);
  var safeMarketTest = htmlEscape(MARKET_TEST_ID);
  var safeMeasurement = htmlEscape(MEASUREMENT_ID);

  return (
    "<!DOCTYPE html>" +
    "<html lang=\"th\">" +
    "<head>" +
      "<meta charset=\"UTF-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">" +
      "<meta name=\"description\" content=\"" +
        safeSubhead +
      "\">" +
      "<title>" +
        safeTitle +
      "</title>" +
      "<style>" +
        "*{box-sizing:border-box}" +
        "html{scroll-behavior:smooth}" +
        "body{" +
          "margin:0;" +
          "background:#111;" +
          "color:#f5f5f5;" +
          "font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;" +
        "}" +
        ".page{" +
          "min-height:100vh;" +
          "display:flex;" +
          "flex-direction:column;" +
        "}" +
        ".hero{" +
          "min-height:82vh;" +
          "display:flex;" +
          "align-items:center;" +
          "justify-content:center;" +
          "padding:48px 24px;" +
          "background:linear-gradient(180deg,#151515 0%,#0d0d0d 100%);" +
        "}" +
        ".hero-inner{" +
          "width:100%;" +
          "max-width:900px;" +
          "text-align:center;" +
        "}" +
        ".brand{" +
          "font-size:15px;" +
          "font-weight:700;" +
          "letter-spacing:4px;" +
          "color:#f28c28;" +
          "margin-bottom:28px;" +
          "text-transform:uppercase;" +
        "}" +
        "h1{" +
          "margin:0 auto 22px;" +
          "max-width:760px;" +
          "font-size:clamp(36px,7vw,72px);" +
          "line-height:1.05;" +
          "letter-spacing:-2px;" +
        "}" +
        ".subhead{" +
          "max-width:650px;" +
          "margin:0 auto 34px;" +
          "font-size:clamp(18px,3vw,24px);" +
          "line-height:1.6;" +
          "color:#cfcfcf;" +
        "}" +
        ".cta{" +
          "display:inline-flex;" +
          "align-items:center;" +
          "justify-content:center;" +
          "min-height:56px;" +
          "padding:0 30px;" +
          "border:0;" +
          "border-radius:12px;" +
          "background:#f28c28;" +
          "color:#111;" +
          "font-size:17px;" +
          "font-weight:800;" +
          "cursor:pointer;" +
          "text-decoration:none;" +
          "transition:transform .15s ease,opacity .15s ease;" +
        "}" +
        ".cta:hover{" +
          "transform:translateY(-2px);" +
        "}" +
        ".cta:active{" +
          "transform:translateY(0);" +
        "}" +
        ".offer{" +
          "min-height:70vh;" +
          "padding:80px 24px;" +
          "background:#f4f1eb;" +
          "color:#161616;" +
        "}" +
        ".offer-inner{" +
          "max-width:900px;" +
          "margin:0 auto;" +
        "}" +
        ".offer-label{" +
          "font-size:13px;" +
          "font-weight:800;" +
          "letter-spacing:2px;" +
          "color:#a85e12;" +
          "margin-bottom:16px;" +
          "text-transform:uppercase;" +
        "}" +
        ".offer h2{" +
          "font-size:clamp(30px,5vw,48px);" +
          "line-height:1.15;" +
          "margin:0 0 20px;" +
        "}" +
        ".offer p{" +
          "font-size:18px;" +
          "line-height:1.8;" +
          "max-width:700px;" +
        "}" +
        ".facts{" +
          "display:grid;" +
          "grid-template-columns:repeat(auto-fit,minmax(180px,1fr));" +
          "gap:14px;" +
          "margin-top:35px;" +
        "}" +
        ".fact{" +
          "padding:20px;" +
          "border-radius:14px;" +
          "background:#fff;" +
          "border:1px solid #dedbd4;" +
        "}" +
        ".fact strong{" +
          "display:block;" +
          "font-size:16px;" +
          "margin-bottom:6px;" +
        "}" +
        ".fact span{" +
          "color:#666;" +
          "font-size:14px;" +
        "}" +
        ".status{" +
          "position:fixed;" +
          "right:14px;" +
          "bottom:14px;" +
          "padding:8px 12px;" +
          "border-radius:999px;" +
          "background:rgba(0,0,0,.72);" +
          "color:#aaa;" +
          "font-size:11px;" +
          "z-index:20;" +
        "}" +
        ".footer{" +
          "padding:30px 20px;" +
          "text-align:center;" +
          "background:#0b0b0b;" +
          "color:#777;" +
          "font-size:12px;" +
        "}" +
        "@media(max-width:600px){" +
          ".hero{min-height:88vh;padding:35px 20px}" +
          ".offer{padding:60px 20px}" +
          "h1{letter-spacing:-1px}" +
        "}" +
      "</style>" +
    "</head>" +
    "<body>" +

      "<main class=\"page\">" +

        "<section class=\"hero\">" +
          "<div class=\"hero-inner\">" +
            "<div class=\"brand\">" +
              safeBrand +
            "</div>" +

            "<h1>" +
              safeHeadline +
            "</h1>" +

            "<p class=\"subhead\">" +
              safeSubhead +
            "</p>" +

            "<a " +
              "id=\"cta\" " +
              "class=\"cta\" " +
              "href=\"#offer\"" +
            ">" +
              safeCta +
            "</a>" +
          "</div>" +
        "</section>" +

        "<section " +
          "id=\"offer\" " +
          "class=\"offer\"" +
        ">" +
          "<div class=\"offer-inner\">" +

            "<div class=\"offer-label\">" +
              "TATO COFFEE" +
            "</div>" +

            "<h2>" +
              "Arabica 100% จากดอยเวียง" +
            "</h2>" +

            "<p>" +
              "TATO Coffee คั่วสดใหม่ทุกออเดอร์ " +
              "เลือกคั่วตามสไตล์การดื่มของคุณ " +
              "เพื่อให้คุณได้สัมผัสรสชาติของกาแฟที่เหมาะกับตัวเอง" +
            "</p>" +

            "<div class=\"facts\">" +

              "<div class=\"fact\">" +
                "<strong>Arabica 100%</strong>" +
                "<span>Single Origin</span>" +
              "</div>" +

              "<div class=\"fact\">" +
                "<strong>ดอยเวียง</strong>" +
                "<span>ระดับความสูงประมาณ 1,250 เมตร</span>" +
              "</div>" +

              "<div class=\"fact\">" +
                "<strong>คั่วสด</strong>" +
                "<span>คั่วสดใหม่ทุกออเดอร์</span>" +
              "</div>" +

              "<div class=\"fact\">" +
                "<strong>หลายระดับคั่ว</strong>" +
                "<span>เลือกตามสไตล์การดื่ม</span>" +
              "</div>" +

            "</div>" +

          "</div>" +
        "</section>" +

        "<footer class=\"footer\">" +
          "TATO Coffee · Controlled Market Test" +
        "</footer>" +

      "</main>" +

      "<div id=\"status\" class=\"status\">" +
        "Market Test Active" +
      "</div>" +

      "<script>" +

        "(function() {" +

          "var distributionId = " +
            JSON.stringify(DISTRIBUTION_ID) +
            ";" +

          "var marketTestId = " +
            JSON.stringify(MARKET_TEST_ID) +
            ";" +

          "var measurementId = " +
            JSON.stringify(MEASUREMENT_ID) +
            ";" +

          "var apiUrl = " +
            JSON.stringify(ENTRY_API) +
            ";" +

          "var statusElement = " +
            "document.getElementById(\"status\")" +
            ";" +

          "var eventState = {};" +

          "function setStatus(message) {" +
            "if (statusElement) {" +
              "statusElement.textContent = message;" +
            "}" +
          "}" +

          "function sendEvent(eventType) {" +

            "if (eventState[eventType]) {" +
              "return Promise.resolve(false);" +
            "}" +

            "eventState[eventType] = true;" +

            "var payload = {" +
              "distribution_id: distributionId," +
              "event_type: eventType" +
            "};" +

            "return fetch(apiUrl, {" +
              "method: \"POST\"," +
              "headers: {" +
                "\"Content-Type\": \"application/json\"" +
              "}," +
              "body: JSON.stringify(payload)," +
              "keepalive: true" +
            "})" +

            ".then(function(response) {" +

              "return response.json()" +

                ".then(function(data) {" +

                  "if (!response.ok || !data.success) {" +

                    "eventState[eventType] = false;" +

                    "throw new Error(" +
                      "data.error || \"Event recording failed\"" +
                    ");" +

                  "}" +

                  "return data;" +

                "});" +

            "})" +

            ".then(function(data) {" +

              "setStatus(eventType + \" recorded\");" +

              "return data;" +

            "})" +

            ".catch(function(error) {" +

              "eventState[eventType] = false;" +

              "console.error(" +
                "\"TATO Market Test event error:\"," +
                "error" +
              ");" +

              "setStatus(\"Ready\");" +

              "return null;" +

            "});" +

          "}" +

          // Real page view.
          // Only fires when an actual visitor opens this page.
          "sendEvent(\"content_view\");" +

          // Real CTA click.
          "var cta = document.getElementById(\"cta\");" +

          "if (cta) {" +

            "cta.addEventListener(\"click\", function() {" +

              "sendEvent(\"content_click\");" +

            "});" +

          "}" +

          // Real product-view signal.
          // The offer section must actually enter the visitor's viewport.
          "var offer = document.getElementById(\"offer\");" +

          "if (offer && \"IntersectionObserver\" in window) {" +

            "var observer = new IntersectionObserver(" +

              "function(entries) {" +

                "entries.forEach(function(entry) {" +

                  "if (entry.isIntersecting) {" +

                    "sendEvent(\"product_view\");" +

                    "observer.disconnect();" +

                  "}" +

                "});" +

              "}," +

              "{" +
                "threshold: 0.35" +
              "}" +

            ");" +

            "observer.observe(offer);" +

          "} else if (offer) {" +

            // Fallback for browsers without IntersectionObserver.
            // This still represents the page section being present to the visitor.
            "var offerSent = false;" +

            "window.addEventListener(\"scroll\", function() {" +

              "if (offerSent) {" +
                "return;" +
              "}" +

              "var rect = offer.getBoundingClientRect();" +

              "if (rect.top < window.innerHeight && rect.bottom > 0) {" +

                "offerSent = true;" +

                "sendEvent(\"product_view\");" +

              "}" +

            "});" +

          "}" +

          // Keep these values visible for debugging without sending them
          // as fabricated behavioral events.
          "window.TATO_MARKET_TEST = {" +
            "distribution_id: distributionId," +
            "market_test_id: marketTestId," +
            "measurement_id: measurementId" +
          "};" +

        "})();" +

      "</script>" +

    "</body>" +
    "</html>"
  );
}

export async function onRequest(context) {
  try {
    return new Response(
      pageHtml(),
      {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=UTF-8",
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        engine: "MARKET_TEST_PUBLIC_ENTRY_V1",
        error: error && error.message
          ? error.message
          : String(error)
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=UTF-8"
        }
      }
    );
  }
}
```
