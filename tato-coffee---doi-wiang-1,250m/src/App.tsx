import React, { useState } from 'react';
import { Header } from './components/Header';
import { DiscoverView } from './components/DiscoverView';
import { ProductView } from './components/ProductView';
import { Footer } from './components/Footer';
import { PageView, RoastType, OrderItem } from './types';

async function sendCheckout(order: OrderItem){ try { await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:'e71d46e6-8f1d-4c3d-aedc-8461d79f13c0',content_id:'5127d38f-6601-41dd-bb30-9e4346dd9a4c',session_id:localStorage.getItem('tato_session')||crypto.randomUUID(),name:order.customer.name,email:order.customer.email,phone:order.customer.phone,quantity_kg:order.quantityKg,roast:order.roast,grind:order.grind,address:order.customer.address,note:order.customer.note||'',payment_method:order.customer.paymentMethod})}); } catch {} }

function track(event_type:string,metadata:Record<string,unknown>={}){const session_id=localStorage.getItem('tato_session')||crypto.randomUUID();localStorage.setItem('tato_session',session_id);void fetch('/api/behavior',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id,event_type,page:'/',object_type:'content',object_id:'5127d38f-6601-41dd-bb30-9e4346dd9a4c',product_id:'e71d46e6-8f1d-4c3d-aedc-8461d79f13c0',metadata:{source:'TATO_DOI_WIANG_PRIMARY_WEB',...metadata}})}).catch(()=>{});}

export default function App(){
 const [view,setView]=useState<PageView>('discover');
 const [roast,setRoast]=useState<RoastType>('medium');
 const [orders,setOrders]=useState<OrderItem[]>([]);
 useState(()=>{track('content_view');return null});
 const navigate=(next:PageView,sectionId?:string)=>{setView(next);if(sectionId)requestAnimationFrame(()=>document.getElementById(sectionId)?.scrollIntoView({behavior:'smooth'}));};
 const openProduct=(r:RoastType=roast)=>{setRoast(r);setView('product');track('product_view',{roast:r});window.scrollTo({top:0,behavior:'smooth'});};
 return <div className="min-h-screen bg-[#141312] text-[#e6e1df]">
  <Header currentView={view} onNavigate={navigate} cartCount={1} onOpenCart={()=>openProduct(roast)} onOpenOrders={()=>{}}/>
  <main className="pt-20">{view==='product'?<ProductView initialRoast={roast} onOrderSuccess={(o)=>{setOrders(p=>[o,...p]);void sendCheckout(o)}} onViewOrders={()=>{}}/>:<DiscoverView onGoToProduct={openProduct}/>}</main>
  <Footer/>
 </div>;
}
