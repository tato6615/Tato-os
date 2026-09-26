// TATO-OS
// Canva Connect V1.0
// Route: /api/canva-connect
// Creates a NEW Canva design from the configured source design and registers it to TATO-OS.

const LAYER = "CANVA_CONNECT_V1.0";
const VERSION = "1.0";
const STATE_TABLE = "canva_oauth_states";
const TOKEN_TABLE = "canva_oauth_tokens";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" }
  });
}
function now() { return new Date().toISOString(); }
function b64url(bytes) {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function randomToken(n = 32) { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); }
async function sha256url(value) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return b64url(new Uint8Array(d));
}
async function key(secret) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", d, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function encrypt(secret, value) {
  const k = await key(secret); const iv = new Uint8Array(12); crypto.getRandomValues(iv);
  const c = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(value));
  return b64url(iv) + "." + b64url(new Uint8Array(c));
}
function decode64(v) {
  const s = String(v).replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - String(v).length % 4) % 4);
  const b = atob(s); const a = new Uint8Array(b.length); for (let i=0;i<b.length;i++) a[i]=b.charCodeAt(i); return a;
}
async function decrypt(secret, value) {
  const p = String(value).split("."); if (p.length !== 2) throw new Error("Encrypted token format invalid");
  const k = await key(secret);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode64(p[0]) }, k, decode64(p[1]));
  return new TextDecoder().decode(plain);
}
function cfg(env) { return {
  clientId: String(env.CANVA_CLIENT_ID || "").trim(),
  clientSecret: String(env.CANVA_CLIENT_SECRET || "").trim(),
  redirectUri: String(env.CANVA_REDIRECT_URI || "").trim(),
  encryptionKey: String(env.CANVA_TOKEN_ENCRYPTION_KEY || "").trim(),
  sourceDesignId: String(env.CANVA_SOURCE_DESIGN_ID || "DAHWTAi70fI").trim()
}; }
function missing(c) { return [["CANVA_CLIENT_ID",c.clientId],["CANVA_CLIENT_SECRET",c.clientSecret],["CANVA_REDIRECT_URI",c.redirectUri],["CANVA_TOKEN_ENCRYPTION_KEY",c.encryptionKey]].filter(x=>!x[1]).map(x=>x[0]); }
async function tables(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS " + STATE_TABLE + " (state TEXT PRIMARY KEY, code_verifier TEXT NOT NULL, expires_at TEXT NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS " + TOKEN_TABLE + " (id TEXT PRIMARY KEY, access_token TEXT NOT NULL, refresh_token TEXT NOT NULL, expires_at TEXT NOT NULL, scope TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
}
async function saveToken(db, env, t, id) {
  const c=cfg(env), ts=now(), tokenId=id||crypto.randomUUID(), expires=new Date(Date.now()+Number(t.expires_in||0)*1000).toISOString();
  const at=await encrypt(c.encryptionKey,t.access_token), rt=await encrypt(c.encryptionKey,t.refresh_token);
  if(id) await db.prepare("UPDATE "+TOKEN_TABLE+" SET access_token=?,refresh_token=?,expires_at=?,scope=?,updated_at=? WHERE id=?").bind(at,rt,expires,t.scope||null,ts,id).run();
  else await db.prepare("INSERT INTO "+TOKEN_TABLE+" (id,access_token,refresh_token,expires_at,scope,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").bind(tokenId,at,rt,expires,t.scope||null,ts,ts).run();
  return { id:tokenId, expires_at:expires, scope:t.scope||null };
}
async function storedToken(db, env) {
  const row=await db.prepare("SELECT * FROM "+TOKEN_TABLE+" ORDER BY updated_at DESC LIMIT 1").first(); if(!row) return null;
  const c=cfg(env); return { id:row.id, access_token:await decrypt(c.encryptionKey,row.access_token), refresh_token:await decrypt(c.encryptionKey,row.refresh_token), expires_at:row.expires_at, scope:row.scope };
}
async function accessToken(db, env) {
  let t=await storedToken(db,env); if(!t) return null;
  if(Date.parse(t.expires_at)-Date.now()>60000) return t;
  const c=cfg(env), body=new URLSearchParams(); body.set("grant_type","refresh_token"); body.set("refresh_token",t.refresh_token);
  const r=await fetch("https://api.canva.com/rest/v1/oauth/token",{method:"POST",headers:{"Authorization":"Basic "+btoa(c.clientId+":"+c.clientSecret),"Content-Type":"application/x-www-form-urlencoded"},body});
  const d=await r.json().catch(()=>({})); if(!r.ok||!d.access_token||!d.refresh_token) throw new Error("Canva token refresh failed: "+String(d.message||d.error||("HTTP "+r.status)));
  await saveToken(db,env,d,t.id); return { ...t, access_token:d.access_token, refresh_token:d.refresh_token, expires_at:new Date(Date.now()+Number(d.expires_in||0)*1000).toISOString(), scope:d.scope||t.scope };
}
async function createDesign(env, token, title) {
  const c=cfg(env);
  const r=await fetch("https://api.canva.com/rest/v1/designs",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({type:"design",design_id:c.sourceDesignId,title})});
  const d=await r.json().catch(()=>({})); if(!r.ok||!d.design) throw new Error("Canva design creation failed: "+String(d.message||d.code||("HTTP "+r.status)));
  return d.design;
}
export async function onRequestGet(context) {
  try {
    const db=context.env?.DB; if(!db) return json({success:false,layer:LAYER,status:"DB_BINDING_NOT_FOUND"},500);
    await tables(db); const c=cfg(context.env), miss=missing(c), token=miss.length?null:await storedToken(db,context.env);
    return json({success:true,layer:LAYER,version:VERSION,status:miss.length?"CANVA_CONFIG_REQUIRED":token?"CANVA_CONNECTED":"CANVA_AUTH_REQUIRED",connected:!!token,configuration:{ready:miss.length===0,missing:miss,source_design_id:c.sourceDesignId},capability:{creates_new_design:true,reuses_previous_asset:false,publishes_social_content:false}});
  } catch(e) { return json({success:false,layer:LAYER,status:"ERROR",error:e?.message||String(e)},500); }
}
export async function onRequestPost(context) {
  try {
    const db=context.env?.DB; if(!db) return json({success:false,layer:LAYER,status:"DB_BINDING_NOT_FOUND"},500);
    await tables(db); const body=await context.request.json().catch(()=>({})), mode=String(body.mode||"status").toLowerCase(), c=cfg(context.env), miss=missing(c);
    if(mode==="authorize") {
      if(miss.length) return json({success:false,layer:LAYER,status:"CANVA_CONFIG_REQUIRED",missing:miss},500);
      const state=randomToken(32), verifier=randomToken(48), challenge=await sha256url(verifier), exp=new Date(Date.now()+600000).toISOString();
      await db.prepare("INSERT INTO "+STATE_TABLE+" (state,code_verifier,expires_at) VALUES (?,?,?)").bind(state,verifier,exp).run();
      const q=new URLSearchParams({code_challenge:challenge,code_challenge_method:"S256",scope:"design:content:write",response_type:"code",client_id:c.clientId,state,redirect_uri:c.redirectUri});
      return json({success:true,layer:LAYER,status:"CANVA_AUTH_URL_READY",authorization_url:"https://www.canva.com/api/oauth/authorize?"+q.toString()});
    }
    if(mode==="callback") {
      if(miss.length) return json({success:false,layer:LAYER,status:"CANVA_CONFIG_REQUIRED",missing:miss},500);
      const code=String(body.code||""), state=String(body.state||""); if(!code||!state) return json({success:false,layer:LAYER,status:"OAUTH_CALLBACK_FIELDS_REQUIRED"},400);
      const row=await db.prepare("SELECT * FROM "+STATE_TABLE+" WHERE state=? LIMIT 1").bind(state).first();
      if(!row||Date.parse(row.expires_at)<Date.now()) return json({success:false,layer:LAYER,status:"OAUTH_STATE_INVALID_OR_EXPIRED"},400);
      const tb=new URLSearchParams(); tb.set("grant_type","authorization_code"); tb.set("code",code); tb.set("code_verifier",row.code_verifier); tb.set("redirect_uri",c.redirectUri);
      const r=await fetch("https://api.canva.com/rest/v1/oauth/token",{method:"POST",headers:{"Authorization":"Basic "+btoa(c.clientId+":"+c.clientSecret),"Content-Type":"application/x-www-form-urlencoded"},body:tb});
      const t=await r.json().catch(()=>({})); if(!r.ok||!t.access_token||!t.refresh_token) return json({success:false,layer:LAYER,status:"CANVA_TOKEN_EXCHANGE_FAILED",error:String(t.message||t.error||("HTTP "+r.status))},400);
      await saveToken(db,context.env,t); await db.prepare("DELETE FROM "+STATE_TABLE+" WHERE state=?").bind(state).run();
      const u=new URL("/",new URL(context.request.url).origin); u.searchParams.set("canva","connected"); return Response.redirect(u.toString(),302);
    }
    if(mode==="create") {
      if(miss.length) return json({success:false,layer:LAYER,status:"CANVA_CONFIG_REQUIRED",missing:miss},500);
      if(!body.production_id) return json({success:false,layer:LAYER,status:"PRODUCTION_ID_REQUIRED"},400);
      const p=await db.prepare("SELECT * FROM content_production WHERE id=? LIMIT 1").bind(body.production_id).first();
      if(!p) return json({success:false,layer:LAYER,status:"PRODUCTION_NOT_FOUND"},404);
      if(!p.content_id) return json({success:false,layer:LAYER,status:"CONTENT_ID_REQUIRED"},400);
      const existing=await db.prepare("SELECT id FROM content_assets WHERE production_id=? AND platform='CANVA' LIMIT 1").bind(p.id).first();
      if(existing) return json({success:false,layer:LAYER,status:"CANVA_ASSET_ALREADY_REGISTERED",error:"This production already has a Canva asset. Create a new production/content first."},409);
      let t;
      try { t=await accessToken(db,context.env); }
      catch(e) { return json({success:false,layer:LAYER,status:"CANVA_TOKEN_REFRESH_FAILED",error:e?.message||String(e)},401); }
      if(!t) return json({success:false,layer:LAYER,status:"CANVA_AUTH_REQUIRED"},401);
      const title=(String(p.title||"TATO Content")+" · "+new Date().toISOString().slice(0,10)).slice(0,255), design=await createDesign(context.env,t.access_token,title), assetId=crypto.randomUUID(), ts=now();
      await db.prepare("INSERT INTO content_assets (id,production_id,content_id,platform,asset_type,external_id,external_url,status,published_url,published_at,created_at,updated_at) VALUES (?,?,?,'CANVA','INSTAGRAM_POST',?,?,'DRAFT',NULL,NULL,?,?)").bind(assetId,p.id,p.content_id,design.id,design.urls?.edit_url||design.urls?.view_url||null,ts,ts).run();
      return json({success:true,layer:LAYER,version:VERSION,status:"NEW_CANVA_ASSET_CREATED",production:{id:p.id,content_id:p.content_id},asset:{id:assetId,platform:"CANVA",asset_type:"INSTAGRAM_POST",external_id:design.id,external_url:design.urls?.edit_url||design.urls?.view_url||null,status:"DRAFT"},next:"Review/edit the new Canva design, publish manually, then mark it PUBLISHED in TATO-OS."});
    }
    return json({success:false,layer:LAYER,status:"INVALID_MODE",allowed_modes:["authorize","callback","create"]},400);
  } catch(e) { return json({success:false,layer:LAYER,status:"ERROR",error:e?.message||String(e)},500); }
}