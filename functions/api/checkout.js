// TATO-OS
// Real Checkout V1.0
// Route: /api/checkout
//
// Creates a real customer + order from the public purchase page.
// Payment is not marked paid here. A verified payment must be confirmed separately.

const LAYER="REAL_CHECKOUT_V1.0";

function json(data,status=200){
  return new Response(JSON.stringify(data,null,2),{
    status,
    headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store"}
  });
}
function text(v){return v==null?"":String(v).trim();}
function now(){return new Date().toISOString();}
async function cols(db,table){
  const r=await db.prepare("PRAGMA table_info("+table+")").all();
  return (r.results||[]).map(x=>x.name);
}
async function exists(db,table){
  return !!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(table).first();
}
async function insertDynamic(db,table,data){
  const c=new Set(await cols(db,table));
  const names=Object.keys(data).filter(k=>c.has(k));
  if(!names.length) throw new Error("NO_INSERTABLE_COLUMNS_"+table);
  await db.prepare(
    "INSERT INTO "+table+" ("+names.join(",")+") VALUES ("+names.map(()=>"?").join(",")+")"
  ).bind(...names.map(k=>data[k])).run();
}
async function recordEvent(db,type,payload){
  if(!await exists(db,"behavior_events")) return;
  const c=await cols(db,"behavior_events"), data={};
  const metadata=JSON.stringify(payload);
  if(c.includes("id")) data.id=crypto.randomUUID();
  if(c.includes("customer_id")) data.customer_id=payload.customer_id||null;
  if(c.includes("anonymous_id")) data.anonymous_id=payload.session_id||null;
  if(c.includes("session_id")) data.session_id=payload.session_id||null;
  if(c.includes("event_type")) data.event_type=type;
  if(c.includes("event_name")) data.event_name=type;
  if(c.includes("page")) data.page="/buy.html";
  if(c.includes("object_type")) data.object_type=payload.object_type||"checkout";
  if(c.includes("object_id")) data.object_id=payload.object_id||payload.product_id||null;
  if(c.includes("product_id")) data.product_id=payload.product_id||null;
  if(c.includes("metadata")) data.metadata=metadata;
  if(c.includes("created_at")) data.created_at=now();
  const required=c.filter(x=>x.notnull===1&&x.pk!==1&&x.dflt_value===null).map(x=>x.name).filter(n=>data[n]===undefined);
  if(required.length) return;
  await insertDynamic(db,"behavior_events",data);
}
async function product(db,id){
  return await db.prepare("SELECT * FROM products WHERE id=? LIMIT 1").bind(id).first();
}
function price(p){return Number(p?.price??p?.sale_price??p?.cost_price??p?.unit_price??0);}
function clip(v,n){return text(v).slice(0,n);}
async function ensureDetails(db){
  await db.prepare("CREATE TABLE IF NOT EXISTS order_details (order_id TEXT PRIMARY KEY, name TEXT, phone TEXT, email TEXT, address TEXT, roast TEXT, grind TEXT, note TEXT, payment_method TEXT, created_at TEXT)").run();
}
async function notify(env,msg){
  const jobs=[];
  if(env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID) jobs.push(fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:msg})}).catch(()=>{}));
  if(env.LINE_CHANNEL_TOKEN&&env.LINE_OWNER_USER_ID) jobs.push(fetch("https://api.line.me/v2/bot/message/push",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+env.LINE_CHANNEL_TOKEN},body:JSON.stringify({to:env.LINE_OWNER_USER_ID,messages:[{type:"text",text:msg.slice(0,4900)}]})}).catch(()=>{}));
  await Promise.all(jobs);
}
export async function onRequestGet(context){
  try{
    const db=context.env?.DB;
    if(!db)return json({success:false,layer:LAYER,status:"DB_BINDING_NOT_FOUND"},500);
    const u=new URL(context.request.url), p=await product(db,u.searchParams.get("product_id")||"");
    if(!p)return json({success:false,layer:LAYER,status:"PRODUCT_NOT_FOUND"},404);
    return json({
      success:true,layer:LAYER,version:"1.0",status:"CHECKOUT_READY",
      product:{id:p.id,name:p.name,description:p.description||"",price:price(p),currency:p.currency||"THB",status:p.status||"active"},
      payment_instructions:{
        method:String(context.env.PAYMENT_METHOD||"BANK_TRANSFER"),
        bank_name:String(context.env.PAYMENT_BANK_NAME||""),
        account_name:String(context.env.PAYMENT_ACCOUNT_NAME||""),
        account_number:String(context.env.PAYMENT_ACCOUNT_NUMBER||""),
        promptpay:String(context.env.PAYMENT_PROMPTPAY||""),
        note:"Order is confirmed only after the operator verifies the real payment."
      }
    });
  }catch(e){return json({success:false,layer:LAYER,status:"ERROR",error:e?.message||String(e)},500);}
}
export async function onRequestPost(context){
  try{
    const db=context.env?.DB;
    if(!db)return json({success:false,layer:LAYER,status:"DB_BINDING_NOT_FOUND"},500);
    const b=await context.request.json().catch(()=>({}));
    const productId=text(b.product_id), name=text(b.name), email=text(b.email), phone=text(b.phone);
    const isTest=(b.is_test===true||b.is_test===1||b.is_test==="1")?1:0, utmSource=clip(b.utm_source,60), utmMedium=clip(b.utm_medium,60), utmCampaign=clip(b.utm_campaign,60);
    const kg=Number(b.quantity_kg), contentId=text(b.content_id), sessionId=text(b.session_id), paymentMethod=text(b.payment_method);
    if(!productId||!name||(!email&&!phone)||!(kg>0))return json({success:false,layer:LAYER,status:"CHECKOUT_FIELDS_REQUIRED",error:"product_id, name, email_or_phone and quantity_kg are required"},400);
    if(kg>100)return json({success:false,layer:LAYER,status:"QUANTITY_TOO_LARGE",error:"quantity_kg must be 100 or less"},400);
    const p=await product(db,productId);
    if(!p)return json({success:false,layer:LAYER,status:"PRODUCT_NOT_FOUND"},404);
    if(text(p.status).toLowerCase()&&text(p.status).toLowerCase()!=="active")return json({success:false,layer:LAYER,status:"PRODUCT_NOT_ACTIVE"},400);
    const unit=price(p);
    if(!(unit>0))return json({success:false,layer:LAYER,status:"PRODUCT_PRICE_NOT_CONFIGURED"},400);
    if(!await exists(db,"customers")||!await exists(db,"orders"))return json({success:false,layer:LAYER,status:"SALES_TABLES_NOT_READY"},500);

    const customerCols=await cols(db,"customers");
    let customer=null;
    if(email&&customerCols.includes("email")) customer=await db.prepare("SELECT * FROM customers WHERE email=? LIMIT 1").bind(email).first();
    if(!customer&&phone&&customerCols.includes("phone")) customer=await db.prepare("SELECT * FROM customers WHERE phone=? LIMIT 1").bind(phone).first();

    if(!customer){
      const id=crypto.randomUUID(), data={id,name,email:email||null,phone:phone||null,status:"active",source:"PUBLIC_CHECKOUT",created_at:now()};
      await insertDynamic(db,"customers",data);
      customer=await db.prepare("SELECT * FROM customers WHERE id=? LIMIT 1").bind(id).first();
    }
    const subtotal=Math.round(Math.round(kg*1000)*unit/1000), shipping=kg>=2?0:50, amount=subtotal+shipping, orderId="order_"+crypto.randomUUID();
    const orderData={id:orderId,customer_id:customer.id,product_id:productId,total_amount:amount,amount,shipping_fee:shipping,total_kg:kg,quantity:kg,qty:kg,currency:"THB",status:"pending",payment_method:paymentMethod||null,source:"PUBLIC_CHECKOUT",content_id:contentId||null,is_test:isTest,utm_source:utmSource||null,utm_medium:utmMedium||null,utm_campaign:utmCampaign||null,created_at:now()};
    const orderCols=await cols(db,"orders");
    const allowed=new Set(orderCols);
    const names=Object.keys(orderData).filter(k=>allowed.has(k));
    await ensureDetails(db);
    await db.batch([
      db.prepare("INSERT INTO orders ("+names.join(",")+") VALUES ("+names.map(()=>"?").join(",")+")").bind(...names.map(k=>orderData[k])),
      db.prepare("INSERT INTO order_details (order_id,name,phone,email,address,roast,grind,note,payment_method,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(orderId,clip(name,120),clip(phone,40),clip(email,120),clip(b.address,500),clip(b.roast,30),clip(b.grind,30),clip(b.note,500),paymentMethod||null,now())
    ]);

    await recordEvent(db,"customer_created",{customer_id:customer.id,product_id:productId,content_id:contentId,session_id:sessionId,order_id:orderId,is_test:isTest,utm_source:utmSource||null,utm_medium:utmMedium||null,utm_campaign:utmCampaign||null});
    await recordEvent(db,"purchase_intent",{customer_id:customer.id,product_id:productId,content_id:contentId,session_id:sessionId,order_id:orderId,amount,quantity_kg:kg,is_test:isTest,utm_source:utmSource||null,utm_medium:utmMedium||null,utm_campaign:utmCampaign||null});

    const orderNo="TATO-"+orderId.replace("order_","").slice(0,8).toUpperCase();
    const msg=(isTest?"[ทดสอบ] ":"")+"🛒 ออเดอร์ใหม่ "+orderNo+"\nยอด "+amount+" บาท ("+kg+" กก.) ค่าส่ง "+shipping+" บาท\nคั่ว: "+clip(b.roast,30)+" / บด: "+clip(b.grind,30)+"\nผู้รับ: "+clip(name,120)+" โทร "+clip(phone,40)+"\nที่อยู่: "+clip(b.address,300)+"\nหมายเหตุ: "+clip(b.note,200)+"\nช่องทาง: "+(utmSource?utmSource+"/"+utmMedium:"ไม่ระบุ")+"\nรอลูกค้าโอน แล้วกดยืนยันที่ "+new URL(context.request.url).origin+"/admin/";
    const nj=notify(context.env,msg);
    if(context.waitUntil) context.waitUntil(nj); else await nj;
    return json({
      success:true,layer:LAYER,version:"1.0",status:"ORDER_CREATED",
      order:{id:orderId,customer_id:customer.id,product_id:productId,quantity_kg:kg,subtotal,shipping,amount,currency:"THB",status:"pending",payment_method:paymentMethod||null},
      payment_instructions:{
        method:String(context.env.PAYMENT_METHOD||"BANK_TRANSFER"),
        bank_name:String(context.env.PAYMENT_BANK_NAME||""),
        account_name:String(context.env.PAYMENT_ACCOUNT_NAME||""),
        account_number:String(context.env.PAYMENT_ACCOUNT_NUMBER||""),
        promptpay:String(context.env.PAYMENT_PROMPTPAY||""),
        note:"After transfer, send the payment proof to the seller. The order becomes PAID only after verification."
      },
      contact:{line_oa:String(context.env.PAYMENT_LINE_OA||"")},
      next:"Operator verifies the real payment with /api/business-money operation=confirm_payment."
    },201);
  }catch(e){return json({success:false,layer:LAYER,status:"ERROR",error:e?.message||String(e)},400);}
}