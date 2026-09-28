import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { DiscoverView } from './components/DiscoverView';
import { ProductView } from './components/ProductView';
import { Footer } from './components/Footer';
import { PageView, RoastType, OrderItem } from './types';
import { LanguageProvider } from './i18n';

async function sendCheckout(order: OrderItem): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:'e71d46e6-8f1d-4c3d-aedc-8461d79f13c0',content_id:'5127d38f-6601-41dd-bb30-9e4346dd9a4c',session_id:localStorage.getItem('tato_session')||crypto.randomUUID(),name:order.customer.name,email:order.customer.email,phone:order.customer.phone,quantity_kg:order.quantityKg,roast:order.roast,grind:order.grind,address:order.customer.address,note:order.customer.note||'',payment_method:order.customer.paymentMethod})});
    const data = await res.json().catch(()=>({} as any));
    if (!res.ok || data.success === false) return { ok:false, error: data.status || data.error || `HTTP_${res.status}` };
    return { ok:true };
  } catch (e) {
    return { ok:false, error: e instanceof Error ? e.message : 'NETWORK_ERROR' };
  }
}

function track(event_type:string,metadata:Record<string,unknown>={}){const session_id=localStorage.getItem('tato_session')||crypto.randomUUID();localStorage.setItem('tato_session',session_id);void fetch('/api/behavior',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id,event_type,page:'/',object_type:'content',object_id:'5127d38f-6601-41dd-bb30-9e4346dd9a4c',product_id:'e71d46e6-8f1d-4c3d-aedc-8461d79f13c0',metadata:{source:'TATO_DOI_WIANG_PRIMARY_WEB',...metadata}})}).catch(()=>{});}

function CustomerApp(){
 if (window.location.pathname === '/system' || window.location.pathname === '/system/') { window.location.replace('/system/index.html'); return null; }
 const [view,setView]=useState<PageView>('discover');
 const [roast,setRoast]=useState<RoastType>('medium');
 const [orders,setOrders]=useState<OrderItem[]>([]);
 useEffect(()=>{track('content_view')},[]);
 const navigate=(next:PageView,sectionId?:string)=>{setView(next);if(sectionId)requestAnimationFrame(()=>document.getElementById(sectionId)?.scrollIntoView({behavior:'smooth'}));};
 const openProduct=(r:RoastType=roast)=>{setRoast(r);setView('product');track('product_view',{roast:r});window.scrollTo({top:0,behavior:'smooth'});};
 return <div className="min-h-screen bg-[#141312] text-[#e6e1df]">
  <Header currentView={view} onNavigate={navigate} cartCount={1} onOpenCart={()=>openProduct(roast)} onOpenOrders={()=>{}}/>
  <main className="pt-20">{view==='product'?<ProductView initialRoast={roast} onOrderSuccess={async(o)=>{const r=await sendCheckout(o);if(r.ok)setOrders(p=>[o,...p]);return r;}} onViewOrders={()=>{}}/>:<DiscoverView onGoToProduct={openProduct}/>}</main>
  <Footer/>
 </div>;
}


export default function App(){
  return <LanguageProvider><CustomerApp /></LanguageProvider>;
}
