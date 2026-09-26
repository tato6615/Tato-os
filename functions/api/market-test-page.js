const DISTRIBUTION_ID = "distribution-1790392496602-lhk96nmd";
const MARKET_TEST_ID = "market-test-1790392032678-c80dkx3f";
const MEASUREMENT_ID = "measurement-1790395426049-7wjtgs3p";
const ENTRY_API = "https://8f91cd42.tato-os.pages.dev/api/market-test-entry";

export async function onRequest(context) {
  if (context.request.method === "POST") {
    try {
      const body = await context.request.text();
      const response = await fetch(ENTRY_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body
      });

      return new Response(await response.text(), {
        status: response.status,
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          "Cache-Control": "no-store"
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error && error.message ? error.message : String(error)
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          "Cache-Control": "no-store"
        }
      });
    }
  }

  const html = String.raw`<!doctype html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TATO Coffee — Market Test</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#111;color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.hero{min-height:82vh;display:flex;align-items:center;justify-content:center;padding:40px 22px;text-align:center}
.inner{max-width:850px}
.brand{color:#f28c28;font-weight:800;letter-spacing:4px;margin-bottom:24px}
h1{font-size:clamp(38px,7vw,72px);line-height:1.05;margin:0 0 22px}
.sub{font-size:20px;line-height:1.6;color:#ccc;margin:0 auto 32px;max-width:650px}
.cta{display:inline-flex;padding:17px 28px;border:0;border-radius:12px;background:#f28c28;color:#111;font-weight:800;font-size:16px;cursor:pointer;appearance:none}
.offer{padding:80px 22px;background:#f4f1eb;color:#161616}
.offer-in{max-width:850px;margin:auto}
.offer h2{font-size:clamp(30px,5vw,48px);margin:0 0 18px}
.offer p{font-size:18px;line-height:1.8}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-top:30px}
.fact{background:#fff;border:1px solid #ddd;padding:20px;border-radius:14px}
.fact strong{display:block;margin-bottom:6px}
.fact span{color:#666;font-size:14px}
.status{position:fixed;right:12px;bottom:12px;background:#000c;padding:8px 12px;border-radius:20px;color:#aaa;font-size:11px}
</style>
</head>
<body>
<section class="hero">
<div class="inner">
<div class="brand">TATO COFFEE</div>
<h1>กาแฟที่เริ่มจากความสนใจของคนดื่มจริง</h1>
<p class="sub">ทดลองทำความรู้จัก TATO Coffee และดูว่ากาแฟแบบไหนเหมาะกับคุณ</p>
<button id="cta" class="cta" type="button" onclick="window.TATO_CLICK()">ดูรายละเอียด TATO Coffee</button>
</div>
</section>
<section id="offer" class="offer">
<div class="offer-in">
<h2>Arabica 100% จากดอยเวียง</h2>
<p>TATO Coffee คั่วสดใหม่ทุกออเดอร์ เลือกคั่วตามสไตล์การดื่มของคุณ เพื่อให้คุณได้สัมผัสรสชาติของกาแฟที่เหมาะกับตัวเอง</p>
<div class="facts">
<div class="fact"><strong>Arabica 100%</strong><span>Single Origin</span></div>
<div class="fact"><strong>ดอยเวียง</strong><span>ประมาณ 1,250 เมตร</span></div>
<div class="fact"><strong>คั่วสด</strong><span>คั่วสดใหม่ทุกออเดอร์</span></div>
<div class="fact"><strong>หลายระดับคั่ว</strong><span>เลือกตามสไตล์การดื่ม</span></div>
</div>
</div>
</section>
<footer style="padding:30px;text-align:center;background:#0b0b0b;color:#777;font-size:12px">TATO Coffee · Controlled Market Test</footer>
<div id="status" class="status">Market Test Active</div>
<script>
(function(){
var did="distribution-1790392496602-lhk96nmd";
var api="/api/market-test-page";
var sent={};
function setStatus(t){var el=document.getElementById("status");if(el)el.textContent=t;}
function send(type){
 if(sent[type])return;
 sent[type]=true;
 setStatus("กำลังบันทึก "+type+"...");
 fetch(api,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({distribution_id:did,event_type:type})})
 .then(function(r){return r.text().then(function(t){var d;try{d=JSON.parse(t)}catch(e){throw new Error(t||"Invalid response")}if(!r.ok||!d.success)throw new Error(d.error||"Request failed");return d;});})
 .then(function(){setStatus(type+" recorded");})
 .catch(function(e){sent[type]=false;setStatus("Event failed: "+(e&&e.message?e.message:"unknown"));console.error(e);});
}
window.TATO_CLICK=function(){
 send("content_click");
 var offer=document.getElementById("offer");
 if(offer)offer.scrollIntoView({behavior:"smooth",block:"start"});
};
send("content_view");
var offer=document.getElementById("offer");
if("IntersectionObserver" in window && offer){
 var o=new IntersectionObserver(function(es){
  es.forEach(function(e){if(e.isIntersecting){send("product_view");o.disconnect();}});
 },{threshold:.2});
 o.observe(offer);
}
})();
</script>
</body>
</html>`;

  return new Response(html,{
    status:200,
    headers:{
      "Content-Type":"text/html; charset=UTF-8",
      "Cache-Control":"no-store"
    }
  });
}