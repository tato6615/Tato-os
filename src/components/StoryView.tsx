import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n';
import { ASSETS, ROAST_PROFILES } from '../data/coffeeData';
import { RoastType } from '../types';

interface StoryViewProps {
  onGoToProduct: (roast?: RoastType) => void;
}

// หน้าเล่าเรื่องแบบเลื่อนซ้าย-ขวา (scrollytelling) ที่ /doi-wiang/
// ใช้สี ฟอนต์ และรูปเดิมของเว็บ (ASSETS ใน coffeeData.ts) ไม่เพิ่มรูปหรือโทนสีใหม่
// เนื้อหาใช้เฉพาะข้อเท็จจริงที่ตรงกับหน้าเว็บ: ไม่มีส่งฟรี ไม่มีใบรับรอง ไม่ระบุระยะเวลาคั่ว/ส่ง

const ROAST_NOTES: Record<RoastType, { th: string; en: string; feel: { th: string; en: string }; accent: string }> = {
  light: { th: 'ดอกมะลิ ซิตรัส ชาเอิร์ลเกรย์', en: 'Jasmine, citrus, Earl Grey tea', feel: { th: 'หอมใส', en: 'Bright & aromatic' }, accent: '#f3bc8b' },
  medium: { th: 'คาราเมล พลัมสุก น้ำผึ้งป่า', en: 'Caramel, ripe plum, wild honey', feel: { th: 'หวานกลมกล่อม · เหมาะกับคนเพิ่งเริ่มลอง', en: 'Sweet & balanced · a good first try' }, accent: '#ffb59c' },
  dark: { th: 'โกโก้เข้ม แมคคาเดเมียคั่ว', en: 'Dark cocoa, roasted macadamia', feel: { th: 'เข้ม', en: 'Bold' }, accent: '#ff5e1a' },
};

export const StoryView: React.FC<StoryViewProps> = ({ onGoToProduct }) => {
  const { language } = useLanguage();
  const tr = (en: string, th: string) => (language === 'th' ? th : en);
  const trackRef = useRef<HTMLDivElement>(null);
  const sceneRefs = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const count = 7;
  const src = (() => {
    try { return new URLSearchParams(window.location.search).get('src') || 'doi-wiang'; } catch { return 'doi-wiang'; }
  })();

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let ticking = false;

    const update = () => {
      ticking = false;
      const pos = track.scrollLeft / window.innerWidth;
      setActive(Math.min(count - 1, Math.max(0, Math.round(pos))));
      if (reduce) return;
      sceneRefs.current.forEach((s, i) => {
        if (!s) return;
        const p = i - pos;
        const copy = s.querySelector<HTMLElement>('[data-copy]');
        const img = s.querySelector<HTMLElement>('[data-par]');
        if (copy) {
          copy.style.transform = `translateX(${p * 90}px)`;
          copy.style.opacity = String(Math.max(0, 1 - Math.min(1, Math.abs(p)) * 0.95));
        }
        if (img) img.style.transform = `translateX(${p * -70}px) scale(1.12)`;
      });
    };
    const onScroll = () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    };
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); track.scrollLeft += e.deltaY; }
    };
    const onKey = (e: KeyboardEvent) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) track.scrollBy({ left: d * window.innerWidth, behavior: reduce ? 'auto' : 'smooth' });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    track.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', update);
    update();
    return () => {
      track.removeEventListener('scroll', onScroll);
      track.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', update);
    };
  }, []);

  const goTo = (i: number) =>
    trackRef.current?.scrollTo({ left: i * window.innerWidth, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });

  const scene = 'relative shrink-0 w-screen h-full snap-start overflow-hidden flex items-center px-6 md:px-16 lg:px-20 pb-28';
  const label = "font-mono text-[12px] text-[#ffb59c] uppercase tracking-[0.18em] mb-3 block";
  const head = "font-['Anuphan'] font-semibold text-[#e6e1df] text-[40px] sm:text-6xl lg:text-7xl leading-[1.15] whitespace-pre-line";
  const sub = "mt-5 max-w-xl font-['Anuphan'] font-light text-base md:text-xl leading-relaxed text-[#e3beb3]/85";
  const shade = <div className="absolute inset-0 bg-gradient-to-t from-[#141312] via-[#141312]/60 to-[#141312]/40" />;
  const bg = (url: string, pos: string, alt: string) => (
    <div className="absolute inset-0 z-0">
      <img data-par src={url} alt={alt} className="w-full h-full object-cover opacity-65 brightness-[0.7] contrast-125" style={{ objectPosition: pos }} />
      {shade}
    </div>
  );
  const setRef = (i: number) => (el: HTMLElement | null) => { sceneRefs.current[i] = el; };

  return (
    <div className="fixed inset-0 bg-[#141312] text-[#e6e1df] font-['Manrope'] selection:bg-[#ff5e1a] selection:text-[#390c00]">
      <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-5 md:px-10 py-4">
        <a href="/" aria-label="TATO Coffee"><img src={ASSETS.logo} alt="TATO Coffee" className="h-9 w-auto" /></a>
        <nav className="hidden sm:flex gap-1.5" aria-label={tr('Scenes', 'ฉาก')}>
          {Array.from({ length: count }).map((_, i) => (
            <button key={i} onClick={() => goTo(i)} aria-label={tr(`Scene ${i + 1}`, `ฉากที่ ${i + 1}`)}
              className="h-5 w-9 relative focus-visible:outline-2 focus-visible:outline-[#ffb59c]">
              <span className={`absolute inset-x-0 top-[9px] h-[2px] transition-colors ${i === active ? 'bg-[#ff5e1a]' : 'bg-[#5b4138]'}`} />
            </button>
          ))}
        </nav>
        <a href={`/?src=${src}`} className="font-mono text-[12px] text-[#f3bc8b] tracking-widest">{tr('SHOP', 'หน้าร้าน')}</a>
      </div>

      <div ref={trackRef} className="absolute inset-0 flex overflow-x-auto overflow-y-hidden snap-x snap-proximity [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* 1 hero */}
        <section ref={setRef(0)} className={scene}>
          {bg(ASSETS.highlandAerial, 'center', 'Doi Wiang highland coffee plantation in morning mist')}
          <div data-copy className="relative z-10 max-w-3xl">
            <span className={label}>Single-Origin · Doi Wiang Pa</span>
            <h1 className={head}>{tr('Coffee from Doi Wiang Pa,\nroasted when you order', 'กาแฟจากดอยเวียงผา\nคั่วสดเมื่อคุณสั่ง')}</h1>
            <p className={sub}>{tr('100% Arabica from Chiang Mai. Not coffee that sits on a shelf.', 'อาราบิก้า 100% จากเชียงใหม่ ไม่ใช่กาแฟที่นอนรอบนชั้นวาง')}</p>
            <p className="mt-10 hidden md:flex items-center gap-3 text-sm text-[#e3beb3]/70 font-['Anuphan']"><span className="inline-block h-px w-11 bg-[#e3beb3]/60" />{tr('Scroll sideways to continue', 'เลื่อนไปทางซ้ายเพื่อไปต่อ')}</p>
          </div>
        </section>

        {/* 2 altitude */}
        <section ref={setRef(1)} className={scene}>
          {bg(ASSETS.highlandAerial, '80% 40%', 'Misty mountain slopes of Doi Wiang Pa')}
          <div data-copy className="relative z-10 max-w-2xl">
            <span className={label}>01 · Origin</span>
            <h2 className={head}>{tr('1,500 metres\nabove sea level', 'สูงกว่าน้ำทะเล\n1,500 เมตร')}</h2>
            <p className={sub}>{tr('Before it was your cup, it grew on Doi Wiang Pa, Chaiprakan District, Chiang Mai.', 'ก่อนเป็นถ้วยของคุณ มันเติบโตบนดอยเวียงผา อ.ไชยปราการ จ.เชียงใหม่')}</p>
          </div>
        </section>

        {/* 3 growers */}
        <section ref={setRef(2)} className={scene}>
          {bg(ASSETS.cherriesAndBeans, 'center', 'Coffee cherries and beans')}
          <div data-copy className="relative z-10 max-w-2xl">
            <span className={label}>02 · Grown</span>
            <h2 className={head}>{tr('Grown by the\nLahu people', 'ปลูกโดย\nชาวลาหู่')}</h2>
            <p className={sub}>{tr('100% Arabica from Lahu hill-tribe growers on Doi Wiang Pa.', 'อาราบิก้า 100% จากชาวเขาเผ่าลาหู่ที่ดอยเวียงผา')}</p>
          </div>
        </section>

        {/* 4 drying */}
        <section ref={setRef(3)} className={`${scene} bg-[#0f0e0d]`}>
          <div className="absolute inset-0 bg-radial from-[#5b4138]/30 via-transparent to-transparent" />
          <div data-copy className="relative z-10 max-w-2xl">
            <span className={label}>03 · Dried</span>
            <h2 className={head}>{tr('Dried on\nraised beds', 'ตากบน\nแคร่ยกพื้น')}</h2>
            <p className={sub}>{tr('The beans are dried on raised beds before they reach our roaster.', 'เมล็ดถูกตากบนแคร่ยกพื้น ก่อนเดินทางมาถึงเครื่องคั่วของเรา')}</p>
          </div>
        </section>

        {/* 5 roast to order */}
        <section ref={setRef(4)} className={`${scene} bg-[#141312]`}>
          <div className="absolute inset-0 bg-radial from-[#ff5e1a]/10 via-transparent to-transparent" />
          <div data-copy className="relative z-10 max-w-3xl">
            <span className={label}>04 · Roasted</span>
            <h2 className={head}>{tr('We don’t roast stock.\nWe roast when you order.', 'เราไม่คั่วสต็อก\nเราคั่วเมื่อคุณสั่ง')}</h2>
            <p className={sub}>{tr('Every order is roasted to order.', 'ทุกออเดอร์คั่วตามคำสั่งซื้อ')}</p>
          </div>
        </section>

        {/* 6 roast levels -> opens the real order flow */}
        <section ref={setRef(5)} className={`${scene} bg-[#0f0e0d]`}>
          <div data-copy className="relative z-10 w-full max-w-5xl">
            <span className={label}>05 · Roasts</span>
            <h2 className={`${head} !text-[34px] sm:!text-5xl lg:!text-6xl`}>{tr('Choose the cup\nyou want', 'เลือกได้ว่า\nอยากได้ถ้วยแบบไหน')}</h2>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
              {(['light', 'medium', 'dark'] as RoastType[]).map((id) => {
                const p = ROAST_PROFILES.find((r) => r.id === id)!;
                const n = ROAST_NOTES[id];
                return (
                  <button key={id} onClick={() => onGoToProduct(id)}
                    className="text-left rounded-xl bg-[#1d1b1a] border border-[#5b4138]/40 hover:border-[#ff5e1a]/70 transition-colors p-4 md:p-5 focus-visible:outline-2 focus-visible:outline-[#ffb59c]"
                    style={{ borderTop: `3px solid ${n.accent}` }}>
                    <span className="block font-['Anuphan'] font-semibold text-xl md:text-2xl text-[#e6e1df]">{tr(p.name, p.nameThai)}</span>
                    <span className="block mt-2 font-['Anuphan'] font-light text-sm md:text-base text-[#e3beb3]/85">{tr(n.en, n.th)}</span>
                    <span className="block mt-2 font-['Anuphan'] text-[13px]" style={{ color: n.accent }}>{tr(n.feel.en, n.feel.th)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* 7 call to action */}
        <section ref={setRef(6)} className={scene}>
          {bg(ASSETS.matteBlackPouch, '75% center', 'TATO Coffee matte black pouch')}
          <div data-copy className="relative z-10 max-w-2xl">
            <span className={label}>06 · Order</span>
            <h2 className={head}>{tr('From the mountain\nto your cup', 'ชิมจากดอย\nถึงถ้วยของคุณ')}</h2>
            <p className={sub}>{tr('Home brewers from 650 THB/kg. Cafés: first order 550 THB/kg, no minimum.', 'ดื่มเองเริ่ม 650 บาท/กก. ร้านกาแฟสั่งครั้งแรก 550 บาท/กก. ไม่มีขั้นต่ำ')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => onGoToProduct('medium')} className="px-6 py-3.5 rounded-full bg-[#ff5e1a] text-[#390c00] font-['Anuphan'] font-semibold text-base md:text-lg min-h-12 focus-visible:outline-2 focus-visible:outline-[#ffb59c] focus-visible:outline-offset-2">
                {tr('Order fresh-roasted · 650 THB/kg', 'สั่งกาแฟคั่วสด 650 บาท/กก.')}
              </button>
              <a href={`/cafe/?src=${src}`} className="px-6 py-3.5 rounded-full border border-[#e6e1df]/70 text-[#e6e1df] font-['Anuphan'] font-semibold text-base md:text-lg min-h-12 inline-flex items-center focus-visible:outline-2 focus-visible:outline-[#ffb59c] focus-visible:outline-offset-2">
                {tr('For cafés · 550 THB/kg', 'สำหรับร้านกาแฟ 550 บาท/กก.')}
              </a>
            </div>
            <p className="mt-5 text-[13px] text-[#e3beb3]/70 font-['Anuphan']">{tr('Prices exclude shipping. Questions? Call 064-293-6615.', 'ราคายังไม่รวมค่าส่ง สอบถามได้ที่ 064-293-6615')}</p>
          </div>
        </section>
      </div>

      {/* sticky order bar */}
      <div className="absolute bottom-0 inset-x-0 z-30 flex justify-center gap-2.5 px-3.5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-gradient-to-t from-[#0f0e0d]/90 to-transparent">
        <button onClick={() => onGoToProduct('medium')} className="flex-1 max-w-[280px] py-3 rounded-full bg-[#ff5e1a] text-[#390c00] font-['Anuphan'] font-semibold text-sm">{tr('Order · 650/kg', 'สั่งกาแฟ 650/กก.')}</button>
        <a href={`/cafe/?src=${src}`} className="flex-1 max-w-[280px] py-3 rounded-full text-center border border-[#5b4138] bg-[#0f0e0d]/60 text-[#e6e1df] font-['Anuphan'] font-semibold text-sm">{tr('Cafés · 550/kg', 'ร้านกาแฟ 550/กก.')}</a>
      </div>
    </div>
  );
};
