import React, { useState } from 'react';
import { Header } from './components/Header';
import { DiscoverView } from './components/DiscoverView';
import { ProductView } from './components/ProductView';
import { Footer } from './components/Footer';
import { PageView, RoastType, OrderItem } from './types';

export default function App(){
 const [view,setView]=useState<PageView>('discover');
 const [roast,setRoast]=useState<RoastType>('medium');
 const [orders,setOrders]=useState<OrderItem[]>([]);
 const navigate=(next:PageView,sectionId?:string)=>{setView(next);if(sectionId)requestAnimationFrame(()=>document.getElementById(sectionId)?.scrollIntoView({behavior:'smooth'}));};
 const openProduct=(r:RoastType=roast)=>{setRoast(r);setView('product');window.scrollTo({top:0,behavior:'smooth'});};
 return <div className="min-h-screen bg-[#141312] text-[#e6e1df]">
  <Header currentView={view} onNavigate={navigate} cartCount={1} onOpenCart={()=>openProduct(roast)} onOpenOrders={()=>{}}/>
  <main className="pt-20">{view==='product'?<ProductView initialRoast={roast} onOrderSuccess={(o)=>setOrders(p=>[o,...p])} onViewOrders={()=>{}}/>:<DiscoverView onGoToProduct={openProduct}/>}</main>
  <Footer/>
 </div>;
}
