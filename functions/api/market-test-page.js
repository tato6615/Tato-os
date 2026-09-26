const ENGINE = "REAL_MARKET_TEST_ENTRY_V1";
const VERSION = "1.0";
const MEASUREMENT_ENGINE = "MEASUREMENT_V2.3";
const ALLOWED_EVENTS = ["content_view","content_click","engagement","product_view","order_created","payment_completed","revenue_recorded"];
const ATTENTION_EVENTS = ["content_view","content_click"];
const INTEREST_EVENTS = ["engagement","product_view"];
const PURCHASE_EVENTS = ["order_created","payment_completed"];
const REVENUE_EVENTS = ["revenue_recorded"];
function now(){return new Date().toISOString();}
function makeId(prefix){return prefix+"-"+Date.now()+"-"+Math.random().toString(36).slice(2,10);}
function json(payload,status){return new Response(JSON.stringify(payload),{status:status||200,headers:{"Content-Type":"application/json; charset=UTF-8","Cache-Control":"no-store","Access-Control-Allow-Origin":"*"}});}
const DISTRIBUTION_ID = "distribution-1790392496602-lhk96nmd";
const MARKET_TEST_ID = "market-test-1790392032678-c80dkx3f";
const MEASUREMENT_ID = "measurement-1790395426049-7wjtgs3p";
const ENTRY_API = "/api/market-test-entry";

async function tableExists(db, tableName) {
  const result = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
    )
    .bind(tableName)
    .first();

  return !!result;
}

async function getColumns(db, tableName) {
  const result = await db
    .prepare("PRAGMA table_info(" + tableName + ")")
    .all();

  return result.results || [];
}

function hasColumn(columns, name) {
  return columns.some(function (column) {
    return column.name === name;
  });
}

function getEventStage(eventType) {
  if (ATTENTION_EVENTS.includes(eventType)) {
    return "ATTENTION";
  }

  if (INTEREST_EVENTS.includes(eventType)) {
    return "INTEREST";
  }

  if (PURCHASE_EVENTS.includes(eventType)) {
    return "PURCHASE";
  }

  if (REVENUE_EVENTS.includes(eventType)) {
    return "REVENUE";
  }

  return "UNKNOWN";
}

async function ensureLinkTable(db) {
  const exists = await tableExists(db, "market_test_event_links");
  if (!exists) {
    await db.prepare(
      "CREATE TABLE market_test_event_links (" +
      "id TEXT PRIMARY KEY," +
      "measurement_id TEXT NOT NULL," +
      "distribution_id TEXT NOT NULL," +
      "market_test_id TEXT NOT NULL," +
      "behavior_event_id TEXT NOT NULL," +
      "event_type TEXT NOT NULL," +
      "event_stage TEXT NOT NULL," +
      "created_at TEXT NOT NULL)"
    ).run();
    return;
  }

  const columns = await getColumns(db, "market_test_event_links");
  if (!hasColumn(columns, "event_stage")) {
    await db.prepare(
      "ALTER TABLE market_test_event_links ADD COLUMN event_stage TEXT"
    ).run();
  }
}

async function getDistribution(db, distributionId) {
  const exists = await tableExists(
    db,
    "market_test_distributions"
  );

  if (!exists) {
    return null;
  }

  return await db
    .prepare(
      "SELECT * FROM market_test_distributions " +
      "WHERE id = ? LIMIT 1"
    )
    .bind(distributionId)
    .first();
}

async function getActiveMeasurement(
  db,
  distributionId
) {
  const exists = await tableExists(
    db,
    "market_test_measurements"
  );

  if (!exists) {
    return null;
  }

  return await db
    .prepare(
      "SELECT * FROM market_test_measurements " +
      "WHERE distribution_id = ? " +
      "AND status = 'COLLECTING' " +
      "ORDER BY created_at DESC LIMIT 1"
    )
    .bind(distributionId)
    .first();
}

function buildBehaviorValues(
  columns,
  eventId,
  eventType,
  timestamp,
  distribution,
  measurement,
  requestData
) {
  const values = {};

  function set(name, value) {
    if (
      hasColumn(columns, name) &&
      value !== undefined
    ) {
      values[name] = value;
    }
  }

  set("id", eventId);
  set("event_type", eventType);
  set("created_at", timestamp);
  set("updated_at", timestamp);

  set(
    "measurement_id",
    measurement.id
  );

  set(
    "distribution_id",
    distribution.id
  );

  set(
    "market_test_id",
    distribution.market_test_id
  );

  if (requestData.content_id !== undefined) {
    if (hasColumn(columns, "content_id")) {
      set("content_id", requestData.content_id);
    } else if (hasColumn(columns, "metadata")) {
      let metadataObject = {};
      if (requestData.metadata !== undefined) {
        try {
          metadataObject = typeof requestData.metadata === "string"
            ? JSON.parse(requestData.metadata)
            : requestData.metadata;
        } catch (error) {
          metadataObject = { raw_metadata: requestData.metadata };
        }
      }
      if (!metadataObject || typeof metadataObject !== "object" || Array.isArray(metadataObject)) {
        metadataObject = { raw_metadata: metadataObject };
      }
      metadataObject.content_id = requestData.content_id;
      set("metadata", JSON.stringify(metadataObject));
    }
  } else if (requestData.metadata !== undefined) {
    set(
      "metadata",
      typeof requestData.metadata === "string"
        ? requestData.metadata
        : JSON.stringify(requestData.metadata)
    );
  }

  if (requestData.session_id !== undefined) {
    set("session_id", requestData.session_id);
  }

  set(
    "source",
    requestData.source ||
      "REAL_MARKET_TEST"
  );

  set(
    "source_type",
    "REAL_MARKET_TEST"
  );

  if (
    requestData.revenue !== undefined
  ) {
    set(
      "revenue",
      requestData.revenue
    );
  }

  if (
    requestData.order_id !== undefined
  ) {
    set(
      "order_id",
      requestData.order_id
    );
  }

  if (
    requestData.customer_id !== undefined
  ) {
    set(
      "customer_id",
      requestData.customer_id
    );
  }

  return values;
}

function findMissingRequiredColumns(
  columns,
  values
) {
  const missing = [];

  columns.forEach(function (column) {
    const required =
      column.notnull === 1 &&
      column.pk !== 1 &&
      column.dflt_value === null;

    if (
      required &&
      !(column.name in values)
    ) {
      missing.push(column.name);
    }
  });

  return missing;
}

async function insertBehaviorEvent(
  db,
  distribution,
  measurement,
  eventType,
  requestData
) {
  const exists = await tableExists(
    db,
    "behavior_events"
  );

  if (!exists) {
    throw new Error(
      "behavior_events table does not exist"
    );
  }

  const columns = await getColumns(
    db,
    "behavior_events"
  );

  const eventId = makeId("behavior");
  const timestamp = now();

  const values = buildBehaviorValues(
    columns,
    eventId,
    eventType,
    timestamp,
    distribution,
    measurement,
    requestData
  );

  const missing =
    findMissingRequiredColumns(
      columns,
      values
    );

  if (missing.length > 0) {
    throw new Error(
      "behavior_events required columns missing: " +
      missing.join(", ")
    );
  }

  const names = Object.keys(values);

  if (names.length === 0) {
    throw new Error(
      "No compatible behavior_events columns found"
    );
  }

  const placeholders = names
    .map(function () {
      return "?";
    })
    .join(", ");

  const sql =
    "INSERT INTO behavior_events (" +
    names.join(", ") +
    ") VALUES (" +
    placeholders +
    ")";

  const params = names.map(function (name) {
    return values[name];
  });

  await db.prepare(sql).bind(...params).run();

  return {
    id: eventId,
    event_type: eventType,
    created_at: timestamp
  };
}

async function createEventLink(
  db,
  distribution,
  measurement,
  behaviorEvent
) {
  await ensureLinkTable(db);

  const columns = await getColumns(
    db,
    "market_test_event_links"
  );

  const values = {};
  function set(name, value) {
    if (hasColumn(columns, name) && value !== undefined) {
      values[name] = value;
    }
  }

  set("id", makeId("event-link"));
  set("measurement_id", measurement.id);
  set("distribution_id", distribution.id);
  set("market_test_id", distribution.market_test_id);
  set("behavior_event_id", behaviorEvent.id);
  set("event_type", behaviorEvent.event_type);
  set("event_stage", getEventStage(behaviorEvent.event_type));
  set("created_at", now());

  const names = Object.keys(values);
  const placeholders = names.map(function () { return "?"; }).join(", ");
  const params = names.map(function (name) { return values[name]; });

  if (names.length === 0) {
    throw new Error("No compatible market_test_event_links columns found");
  }

  const statement = db.prepare(
    "INSERT INTO market_test_event_links (" +
    names.join(", ") +
    ") VALUES (" +
    placeholders +
    ")"
  );

  await statement.bind.apply(statement, params).run();

  return {
    id: values.id,
    measurement_id: values.measurement_id,
    distribution_id: values.distribution_id,
    behavior_event_id: values.behavior_event_id,
    event_type: values.event_type,
    event_stage: values.event_stage || null,
    created_at: values.created_at
  };
}
async function updateMeasurementTimestamp(
  db,
  measurementId
) {
  const exists = await tableExists(
    db,
    "market_test_measurements"
  );

  if (!exists) {
    return;
  }

  const columns = await getColumns(
    db,
    "market_test_measurements"
  );

  if (
    !hasColumn(columns, "updated_at")
  ) {
    return;
  }

  await db
    .prepare(
      "UPDATE market_test_measurements " +
      "SET updated_at = ? " +
      "WHERE id = ?"
    )
    .bind(
      now(),
      measurementId
    )
    .run();
}


async function recordMarketEvent(request, env) {
  const db = env.DB;

  if (!db) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "D1 binding env.DB is not available"
      },
      500
    );
  }

  let body;

  try {
    body = await request.json();
  } catch (error) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "Request body must be valid JSON"
      },
      400
    );
  }

  const distributionId =
    body.distribution_id;

  const eventType =
    body.event_type;

  if (!distributionId) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "distribution_id is required"
      },
      400
    );
  }

  if (!eventType) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "event_type is required"
      },
      400
    );
  }

  if (
    !ALLOWED_EVENTS.includes(
      eventType
    )
  ) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "Unsupported event_type: " +
          eventType,
        allowed_events:
          ALLOWED_EVENTS
      },
      400
    );
  }

  const distribution =
    await getDistribution(
      db,
      distributionId
    );

  if (!distribution) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "Distribution not found",
        distribution_id:
          distributionId
      },
      404
    );
  }

  const measurement =
    await getActiveMeasurement(
      db,
      distributionId
    );

  if (!measurement) {
    return json(
      {
        success: false,
        engine: ENGINE,
        version: VERSION,
        error:
          "No active measurement session found",
        distribution_id:
          distributionId,
        expected_status:
          "COLLECTING"
      },
      409
    );
  }

  const behaviorEvent =
    await insertBehaviorEvent(
      db,
      distribution,
      measurement,
      eventType,
      body
    );

  const eventLink =
    await createEventLink(
      db,
      distribution,
      measurement,
      behaviorEvent
    );

  await updateMeasurementTimestamp(
    db,
    measurement.id
  );

  return json({
    success: true,
    engine: ENGINE,
    version: VERSION,
    timestamp: now(),
    state:
      "REAL_BEHAVIOR_RECORDED",

    measurement: {
      id: measurement.id,
      distribution_id:
        measurement.distribution_id,
      market_test_id:
        measurement.market_test_id,
      measurement_engine:
        MEASUREMENT_ENGINE,
      status:
        measurement.status
    },

    behavior_event:
      behaviorEvent,

    event_link:
      eventLink,

    handoff: {
      previous_layer:
        ENGINE,

      current_layer:
        ENGINE,

      next_layer:
        "MEASUREMENT_V2.3",

      ready: true
    },

    guardrails: {
      real_event_required: true,
      event_created_by_system:
        false,
      invents_behavior: false,
      invents_attention: false,
      invents_purchase: false,
      invents_revenue: false,
      declares_winner: false,
      changes_strategy: false,
      executes_action: false
    }
  });
}


export async function onRequest(context) {
  if (context.request.method === "POST") {
    try {
      return await recordMarketEvent(context.request, context.env);
    } catch (error) {
      return json({success:false,error:error && error.message ? error.message : String(error)},500);
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
<div style="margin-top:36px;max-width:560px">
<h3 style="font-size:28px;margin:0 0 10px">สนใจทดลอง TATO Coffee</h3>
<p style="color:#555;line-height:1.6">กรอกข้อมูลเพื่อส่งคำสั่งซื้อจริง ระบบจะสร้างออเดอร์สถานะรอชำระ และจะไม่บันทึกยอดเงินจนกว่าจะตรวจสอบการชำระจริง</p>
<form id="order-form">
<input id="name" required placeholder="ชื่อ" style="width:100%;padding:15px;margin:6px 0;border:1px solid #ccc;border-radius:10px;font-size:16px">
<input id="phone" placeholder="เบอร์โทร" style="width:100%;padding:15px;margin:6px 0;border:1px solid #ccc;border-radius:10px;font-size:16px">
<input id="email" type="email" placeholder="อีเมล" style="width:100%;padding:15px;margin:6px 0;border:1px solid #ccc;border-radius:10px;font-size:16px">
<input id="quantity" type="number" min="1" step="1" value="1" required placeholder="จำนวน" style="width:100%;padding:15px;margin:6px 0;border:1px solid #ccc;border-radius:10px;font-size:16px">
<button type="submit" style="width:100%;padding:16px;margin-top:10px;border:0;border-radius:10px;background:#f28c28;color:#111;font-weight:800;font-size:16px">ส่งคำสั่งซื้อ</button>
</form>
<div id="order-result" style="margin-top:14px;font-weight:700"></div>
</div>
</div>
</section>
<footer style="padding:30px;text-align:center;background:#0b0b0b;color:#777;font-size:12px">TATO Coffee · Controlled Market Test</footer>
<div id="status" class="status">Market Test Active</div>
<script>
(function(){
var did="distribution-1790392496602-lhk96nmd";
var api="/api/market-test-page";
var cid="5127d38f-6601-41dd-bb30-9e4346dd9a4c";
var sid;
try{
 sid=sessionStorage.getItem("tato_market_session");
 if(!sid){sid="mts-"+Date.now()+"-"+Math.random().toString(36).slice(2,10);sessionStorage.setItem("tato_market_session",sid);}
}catch(e){sid="mts-"+Date.now()+"-"+Math.random().toString(36).slice(2,10);}
var sent={};
function setStatus(t){var el=document.getElementById("status");if(el)el.textContent=t;}
function send(type){
 if(sent[type])return;
 sent[type]=true;
 setStatus("กำลังบันทึก "+type+"...");
 fetch(api,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({distribution_id:did,event_type:type,content_id:cid,session_id:sid})})
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

var orderForm=document.getElementById("order-form");
var orderSubmit=orderForm ? orderForm.querySelector("button[type=\"submit\"]") : null;
if(orderForm){
 orderForm.addEventListener("submit",function(event){
  event.preventDefault();
  var result=document.getElementById("order-result");
  result.textContent="กำลังสร้างคำสั่งซื้อ...";
  if(orderSubmit) orderSubmit.disabled=true;
  var payload={
   name:document.getElementById("name").value.trim(),
   phone:document.getElementById("phone").value.trim(),
   email:document.getElementById("email").value.trim(),
   quantity:Number(document.getElementById("quantity").value||1),
   content_id:cid,
   session_id:sid
  };
  fetch(window.location.origin+"/api/business-order-entry",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify(payload)
  })
  .then(function(response){
   return response.text().then(function(text){
    var data;
    try{data=JSON.parse(text)}catch(e){throw new Error(text||"Invalid response")}
    if(!response.ok||!data.success)throw new Error(data.error||"Order creation failed");
    return data;
   });
  })
  .then(function(data){
   send("order_created");
   result.textContent="รับคำสั่งซื้อแล้ว เลขออเดอร์: "+data.order.id+" · ยอด "+data.order.total_amount+" บาท";
  })
  .catch(function(error){
   result.textContent="ยังสร้างคำสั่งซื้อไม่ได้: "+(error&&error.message?error.message:"unknown error");
   if(orderSubmit) orderSubmit.disabled=false;
  });
}
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