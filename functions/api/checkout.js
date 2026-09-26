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
function price(p){return Number(p?.price??p?.sale_price??0);}
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
    const kg=Number(b.quantity_kg), contentId=text(b.content_id), sessionId=text(b.session_id);
    if(!productId||!name||(!email&&!phone)||!(kg>0))return json({success:false,layer:LAYER,status:"CHECKOUT_FIELDS_REQUIRED",error:"product_id, name, email_or_phone and quantity_kg are required"},400);
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
    const amount=Number((unit*kg).toFixed(2)), orderId="order_"+crypto.randomUUID();
    const orderData={id:orderId,customer_id:customer.id,product_id:productId,total_amount:amount,amount,total_kg:kg,quantity:kg,qty:kg,currency:"THB",status:"pending",source:"PUBLIC_CHECKOUT",content_id:contentId||null,created_at:now()};
    const orderCols=await cols(db,"orders");
    const allowed=new Set(orderCols);
    const names=Object.keys(orderData).filter(k=>allowed.has(k));
    await db.prepare("INSERT INTO orders ("+names.join(",")+") VALUES ("+names.map(()=>"?").join(",")+")").bind(...names.map(k=>orderData[k])).run();

    await recordEvent(db,"customer_created",{customer_id:customer.id,product_id:productId,content_id:contentId,session_id:sessionId,order_id:orderId});
    await recordEvent(db,"purchase_intent",{customer_id:customer.id,product_id:productId,content_id:contentId,session_id:sessionId,order_id:orderId,amount,quantity_kg:kg});

    return json({
      success:true,layer:LAYER,version:"1.0",status:"ORDER_CREATED",
      order:{id:orderId,customer_id:customer.id,product_id:productId,quantity_kg:kg,amount,currency:"THB",status:"pending"},
      payment_instructions:{
        method:String(context.env.PAYMENT_METHOD||"BANK_TRANSFER"),
        bank_name:String(context.env.PAYMENT_BANK_NAME||""),
        account_name:String(context.env.PAYMENT_ACCOUNT_NAME||""),
        account_number:String(context.env.PAYMENT_ACCOUNT_NUMBER||""),
        promptpay:String(context.env.PAYMENT_PROMPTPAY||""),
        note:"After transfer, send the payment proof to the seller. The order becomes PAID only after verification."
      },
      next:"Operator verifies the real payment with /api/business-money operation=confirm_payment."
    },201);
  }catch(e){return json({success:false,layer:LAYER,status:"ERROR",error:e?.message||String(e)},400);}
}