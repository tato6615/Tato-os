// TATO-OS
// Real Checkout V1.1 (order hardening)
// Route: /api/checkout
//
// Creates a real customer + order from the public purchase page.
// Payment is not marked paid here. A verified payment must be confirmed separately.
//
// V1.1: server-side validation (Thai phone, address, postal code, consent), per-IP rate limit,
// optional Cloudflare Turnstile, shared shipping formula, discount codes, roast capacity limit,
// idempotent submit (request_id), status link for the customer, optional confirmation email.

import { quote as buildQuote } from "../../shared/shipping.js";
import { validateCustomer, normalizePhone } from "../../shared/validate.js";
import { ensureSchema } from "../../shared/schema.js";
import { notifyOwner, sendEmail } from "../../shared/notify.js";
import {
  orderNo, statusUrl, newToken, ipHash, rateLimitOk, turnstileOk, findCode, capacity,
  expirePending, CONSENT_VERSION
} from "../../shared/orders.js";

const LAYER="REAL_CHECKOUT_V1.1";

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
  const info=(await db.prepare("PRAGMA table_info(behavior_events)").all()).results||[];
  const c=info.map(x=>x.name), data={};
  const metadata=JSON.stringify(payload);
  if(c.includes("id")&&info.find(x=>x.name==="id"&&/TEXT/i.test(x.type||""))) data.id=crypto.randomUUID();
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
  const required=info.filter(x=>x.notnull===1&&x.pk!==1&&x.dflt_value===null).map(x=>x.name).filter(n=>data[n]===undefined);
  if(required.length) return;
  await insertDynamic(db,"behavior_events",data);
}
async function product(db,id){
  return await db.prepare("SELECT * FROM products WHERE id=? LIMIT 1").bind(id).first();
}
function price(p){return Number(p?.price??p?.sale_price??p?.cost_price??p?.unit_price??0);}
function clip(v,n){return text(v).slice(0,n);}
function paymentInstructions(env,note){
  return {
    method:String(env.PAYMENT_METHOD||"BANK_TRANSFER"),
    bank_name:String(env.PAYMENT_BANK_NAME||""),
    account_name:String(env.PAYMENT_ACCOUNT_NAME||""),
    account_number:String(env.PAYMENT_ACCOUNT_NUMBER||""),
    promptpay:String(env.PAYMENT_PROMPTPAY||""),
    note
  };
}
function orderResponse(env,origin,o,token,extra){
  return {
    success:true,layer:LAYER,version:"1.1",status:"ORDER_CREATED",
    order:{id:o.id,customer_id:o.customer_id,product_id:o.product_id,quantity_kg:Number(o.total_kg),subtotal:Number(o.subtotal),discount:Number(o.discount_amount||0),shipping:Number(o.shipping_fee||0),amount:Number(o.amount),currency:"THB",status:o.status,payment_method:o.payment_method||null},
    status_url:statusUrl(origin,o.id,token),
    payment_instructions:paymentInstructions(env,"After transfer, send the payment proof to the seller. The order becomes PAID only after verification."),
    contact:{line_oa:String(env.PAYMENT_LINE_OA||"")},
    next:"Operator verifies the real payment with /api/business-money operation=confirm_payment.",
    ...(extra||{})
  };
}
async function existingByRequest(db,requestId){
  if(!requestId) return null;
  return await db.prepare(
    "SELECT o.*, d.lookup_token AS lookup_token FROM order_details d JOIN orders o ON o.id=d.order_id WHERE d.request_id=? LIMIT 1"
  ).bind(requestId).first();
}

export async function onRequestGet(context){
  try{
    const db=context.env?.DB;
    if(!db)return json({success:false,layer:LAYER,status:"DB_BINDING_NOT_FOUND"},500);
    const u=new URL(context.request.url), p=await product(db,u.searchParams.get("product_id")||"");
    if(!p)return json({success:false,layer:LAYER,status:"PRODUCT_NOT_FOUND"},404);

    if(u.searchParams.get("action")==="quote"){
      await ensureSchema(db);
      const kg=Number(u.searchParams.get("kg")), postal=text(u.searchParams.get("postal"));
      if(!(kg>0)||kg>100)return json({success:false,layer:LAYER,status:"INVALID_QUANTITY"},400);
      const unit=price(p), codeRaw=text(u.searchParams.get("code"));
      const cr=await findCode(db,codeRaw,kg);
      const q=buildQuote({kg,unitPrice:unit,postal,code:cr.ok?cr.code:null});
      const cap=await capacity(db);
      return json({
        success:true,layer:LAYER,status:"QUOTE",unit_price:unit,...q,
        code:codeRaw?{input:codeRaw.toUpperCase(),valid:cr.ok,error:cr.ok?null:cr.error,min_kg:cr.min_kg||null}:null,
        capacity:{limited:cap.limited,left:cap.left},
        turnstile_site_key:String(context.env.TURNSTILE_SITE_KEY||"")
      });
    }

    return json({
      success:true,layer:LAYER,version:"1.1",status:"CHECKOUT_READY",
      product:{id:p.id,name:p.name,description:p.description||"",price:price(p),currency:p.currency||"THB",status:p.status||"active"},
      payment_instructions:paymentInstructions(context.env,"Order is confirmed only after the operator verifies the real payment.")
    });
  }catch(e){return json({success:false,layer:LAYER,status:"ERROR",error:e?.message||String(e)},500);}
}

export async function onRequestPost(context){
  try{
    const db=context.env?.DB, env=context.env||{}, origin=new URL(context.request.url).origin;
    if(!db)return json({success:false,layer:LAYER,status:"DB_BINDING_NOT_FOUND"},500);
    await ensureSchema(db);
    const b=await context.request.json().catch(()=>({}));

    // 1) spam guards: honeypot, per-IP rate limit, optional Turnstile
    if(text(b.website)) return json({success:false,layer:LAYER,status:"REJECTED"},400);
    const ih=await ipHash(context.request,env);
    if(!await rateLimitOk(db,ih)) return json({success:false,layer:LAYER,status:"RATE_LIMITED",error:"Too many attempts. Please wait a few minutes."},429);
    if(!await turnstileOk(env,b.turnstile_token,context.request)) return json({success:false,layer:LAYER,status:"TURNSTILE_FAILED",error:"Human verification failed"},403);

    // 2) idempotency: same request_id returns the same order instead of creating another
    const requestId=clip(b.request_id,64);
    const dup=await existingByRequest(db,requestId);
    if(dup) return json(orderResponse(env,origin,dup,dup.lookup_token,{idempotent:true}),200);

    // lazy housekeeping (expire unpaid orders) without slowing the response
    const hk=expirePending(db,env,origin).catch(()=>{});
    if(context.waitUntil) context.waitUntil(hk);

    const productId=text(b.product_id), name=text(b.name), email=text(b.email), phone=normalizePhone(b.phone);
    const isTest=(b.is_test===true||b.is_test===1||b.is_test==="1")?1:0, utmSource=clip(b.utm_source,60), utmMedium=clip(b.utm_medium,60), utmCampaign=clip(b.utm_campaign,60);
    const kg=Number(b.quantity_kg), contentId=text(b.content_id), sessionId=text(b.session_id), paymentMethod=text(b.payment_method);
    const postal=text(b.postal_code);
    if(!productId||!(kg>0))return json({success:false,layer:LAYER,status:"CHECKOUT_FIELDS_REQUIRED",error:"product_id and quantity_kg are required"},400);
    if(kg>100)return json({success:false,layer:LAYER,status:"QUANTITY_TOO_LARGE",error:"quantity_kg must be 100 or less"},400);

    // 3) customer data validation (same rules as the browser)
    const fields=validateCustomer({name,phone,email,address:b.address,postal_code:postal,consent:b.consent===true});
    if(Object.keys(fields).length) return json({success:false,layer:LAYER,status:"CHECKOUT_VALIDATION",error:"Invalid customer data",fields},400);

    const p=await product(db,productId);
    if(!p)return json({success:false,layer:LAYER,status:"PRODUCT_NOT_FOUND"},404);
    if(text(p.status).toLowerCase()&&text(p.status).toLowerCase()!=="active")return json({success:false,layer:LAYER,status:"PRODUCT_NOT_ACTIVE"},400);
    const unit=price(p);
    if(!(unit>0))return json({success:false,layer:LAYER,status:"PRODUCT_PRICE_NOT_CONFIGURED"},400);
    if(!await exists(db,"customers")||!await exists(db,"orders"))return json({success:false,layer:LAYER,status:"SALES_TABLES_NOT_READY"},500);

    // 4) price: single formula in shared/shipping.js; refuse if the page showed a different total
    const cr=await findCode(db,b.discount_code,kg);
    if(!cr.ok) return json({success:false,layer:LAYER,status:cr.error,error:"Discount code cannot be used",min_kg:cr.min_kg||null},400);
    const q=buildQuote({kg,unitPrice:unit,postal,code:cr.code});
    if(b.expected_total!=null&&Number(b.expected_total)!==q.total)
      return json({success:false,layer:LAYER,status:"PRICE_MISMATCH",error:"Price changed, please review the total",quote:q},409);

    // 5) roast capacity (only if max_open_kg is set in admin settings; test orders bypass)
    if(!isTest){
      const cap=await capacity(db);
      if(cap.limited&&kg>cap.left) return json({success:false,layer:LAYER,status:"CAPACITY_FULL",error:"Not enough roast capacity left",left:cap.left},409);
    }

    const customerCols=await cols(db,"customers");
    let customer=null;
    if(email&&customerCols.includes("email")) customer=await db.prepare("SELECT * FROM customers WHERE email=? LIMIT 1").bind(email).first();
    if(!customer&&phone&&customerCols.includes("phone")) customer=await db.prepare("SELECT * FROM customers WHERE phone=? LIMIT 1").bind(phone).first();
    if(!customer){
      const id=crypto.randomUUID(), data={id,name,email:email||null,phone:phone||null,status:"active",source:"PUBLIC_CHECKOUT",created_at:now()};
      await insertDynamic(db,"customers",data);
      customer=await db.prepare("SELECT * FROM customers WHERE id=? LIMIT 1").bind(id).first();
    }

    const orderId="order_"+crypto.randomUUID(), token=newToken();
    const orderData={id:orderId,customer_id:customer.id,product_id:productId,total_amount:q.total,amount:q.total,subtotal:q.subtotal,discount_code:cr.code?cr.code.code:null,discount_amount:q.discount,shipping_fee:q.shipping,total_kg:kg,quantity:kg,qty:kg,currency:"THB",status:"pending",payment_method:paymentMethod||null,source:"PUBLIC_CHECKOUT",content_id:contentId||null,is_test:isTest,utm_source:utmSource||null,utm_medium:utmMedium||null,utm_campaign:utmCampaign||null,created_at:now()};
    const allowed=new Set(await cols(db,"orders"));
    const names=Object.keys(orderData).filter(k=>allowed.has(k));
    const stmts=[
      db.prepare("INSERT INTO orders ("+names.join(",")+") VALUES ("+names.map(()=>"?").join(",")+")").bind(...names.map(k=>orderData[k])),
      db.prepare("INSERT INTO order_details (order_id,name,phone,email,address,postal_code,roast,grind,note,payment_method,created_at,consent_at,consent_version,request_id,lookup_token,ip_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(orderId,clip(name,120),phone,clip(email,120),clip(b.address,500),postal,clip(b.roast,30),clip(b.grind,30),clip(b.note,500),paymentMethod||null,now(),now(),CONSENT_VERSION,requestId||null,token,ih)
    ];
    if(cr.code) stmts.push(db.prepare("UPDATE discount_codes SET used_count=used_count+1 WHERE code=?").bind(cr.code.code));
    try{ await db.batch(stmts); }
    catch(e){
      // two taps at once: the unique request_id index rejects the second insert -> return the first order
      const again=await existingByRequest(db,requestId);
      if(again) return json(orderResponse(env,origin,again,again.lookup_token,{idempotent:true}),200);
      throw e;
    }

    const ev={customer_id:customer.id,product_id:productId,content_id:contentId,session_id:sessionId,order_id:orderId,is_test:isTest,utm_source:utmSource||null,utm_medium:utmMedium||null,utm_campaign:utmCampaign||null};
    await recordEvent(db,"customer_created",ev);
    await recordEvent(db,"purchase_intent",{...ev,amount:q.total,quantity_kg:kg});

    const num=orderNo(orderId), link=statusUrl(origin,orderId,token);
    const msg=(isTest?"[ทดสอบ] ":"")+"🛒 ออเดอร์ใหม่ "+num+"\nยอด "+q.total+" บาท ("+kg+" กก.) ค่าส่ง "+q.shipping+" บาท"+(q.discount?" ส่วนลด "+q.discount+" บาท ("+cr.code.code+")":"")+"\nคั่ว: "+clip(b.roast,30)+" / บด: "+clip(b.grind,30)+"\nผู้รับ: "+clip(name,120)+" โทร "+phone+"\nที่อยู่: "+clip(b.address,300)+" "+postal+"\nหมายเหตุ: "+clip(b.note,200)+"\nช่องทาง: "+(utmSource?utmSource+"/"+utmMedium:"ไม่ระบุ")+"\nรอลูกค้าโอน แล้วกดยืนยันที่ "+origin+"/admin/";
    const jobs=[notifyOwner(env,msg)];
    if(email) jobs.push(sendEmail(env,{to:email,subject:"ยืนยันออเดอร์ "+num+" - TATO Coffee",text:"ขอบคุณที่สั่งซื้อ TATO Coffee\nเลขออเดอร์ "+num+"\nยอดชำระ "+q.total+" บาท ("+kg+" กก.)\n\nดูสถานะออเดอร์/วิธีชำระเงิน/เลขพัสดุได้ที่ลิงก์นี้ (เปิดซ้ำได้ตลอด):\n"+link+"\n\nออเดอร์ที่ยังไม่ชำระภายใน 48 ชั่วโมงจะถูกยกเลิกอัตโนมัติ"}));
    const nj=Promise.all(jobs);
    if(context.waitUntil) context.waitUntil(nj); else await nj;

    return json(orderResponse(env,origin,{id:orderId,customer_id:customer.id,product_id:productId,total_kg:kg,subtotal:q.subtotal,discount_amount:q.discount,shipping_fee:q.shipping,amount:q.total,status:"pending",payment_method:paymentMethod||null},token),201);
  }catch(e){return json({success:false,layer:LAYER,status:"ERROR",error:e?.message||String(e)},400);}
}
