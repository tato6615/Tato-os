import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n';
import { ASSETS, ROAST_PROFILES } from '../data/coffeeData';
import { RoastType } from '../types';

interface StoryViewProps {
  onGoToProduct: (roast?: RoastType) => void;
}

// หน้าเล่าเรื่องแบบเลื่อนซ้าย-ขวา (scrollytelling) ที่ /doi-wiang/
// ใช้สี ฟอนต์ และรูปเดิมของเว็บ (ASSETS ใน coffeeData.ts)
// เนื้อหาใช้เฉพาะข้อเท็จจริงที่ตรงกับหน้าเว็บ: ไม่มีส่งฟรี ไม่มีใบรับรอง ไม่ระบุระยะเวลาคั่ว/ส่ง
// ภาพประกอบฉากตาก/คั่วเป็นภาพวาดประกอบ ไม่ใช่ภาพถ่ายจริง

const COUNT = 7;
const AUTO_MS = 6500;
const AUTO_MS_ROASTS = 9500;

const ROAST_NOTES: Record<RoastType, { th: string; en: string; feel: { th: string; en: string }; accent: string }> = {
  light: { th: 'ดอกมะลิ ซิตรัส ชาเอิร์ลเกรย์', en: 'Jasmine, citrus, Earl Grey tea', feel: { th: 'หอมใส', en: 'Bright & aromatic' }, accent: '#f3bc8b' },
  medium: { th: 'คาราเมล พลัมสุก น้ำผึ้งป่า', en: 'Caramel, ripe plum, wild honey', feel: { th: 'หวานกลมกล่อม · เหมาะกับคนเพิ่งเริ่มลอง', en: 'Sweet & balanced · a good first try' }, accent: '#ffb59c' },
  dark: { th: 'โกโก้เข้ม แมคคาเดเมียคั่ว', en: 'Dark cocoa, roasted macadamia', feel: { th: 'เข้ม', en: 'Bold' }, accent: '#ff5e1a' },
};

const CSS = `
.tv-line{display:block;overflow:hidden;padding:.32em 0 .12em;margin:-.32em 0 0}
@media (min-width:768px){.tv-line{white-space:nowrap}}
.tv-line>span{display:block;transform:translateY(118%);transition:transform .95s cubic-bezier(.2,.8,.2,1)}
.tv-on .tv-line>span{transform:none}
.tv-fade{opacity:0;transform:translateY(20px);transition:opacity .8s ease,transform .8s ease}
.tv-on .tv-fade{opacity:1;transform:none}
.tv-kb{animation:tvkb 18s ease-in-out infinite alternate}
@keyframes tvkb{from{transform:scale(1)}to{transform:scale(1.16) translate3d(-2.5%,-2%,0)}}
.tv-mist{animation:tvmist 28s ease-in-out infinite alternate}
@keyframes tvmist{from{transform:translateX(-14%)}to{transform:translateX(14%)}}
.tv-glow{animation:tvglow 9s ease-in-out infinite alternate}
@keyframes tvglow{from{transform:translate3d(-8%,6%,0) scale(1);opacity:.45}to{transform:translate3d(10%,-8%,0) scale(1.3);opacity:.85}}
.tv-bean{animation:tvbean 8s ease-in-out infinite}
@keyframes tvbean{0%{fill:#6f8a3d}28%{fill:#c8a463}55%{fill:#8a5a34}82%{fill:#392015}100%{fill:#6f8a3d}}
.tv-wob{animation:tvwob 3.4s ease-in-out infinite;transform-origin:100px 130px}
@keyframes tvwob{50%{transform:rotate(7deg) translateY(-6px)}}
.tv-steam{animation:tvsteam 3.6s ease-out infinite;opacity:0}
@keyframes tvsteam{0%{transform:translateY(0);opacity:0}25%{opacity:.55}100%{transform:translateY(-80px);opacity:0}}
.tv-seed{opacity:0;transition:opacity .5s ease}
.tv-on .tv-seed{opacity:1}
.tv-pulse{animation:tvpulse 2.4s ease-out infinite}
@keyframes tvpulse{0%{box-shadow:0 0 0 0 rgba(255,94,26,.55)}100%{box-shadow:0 0 0 22px rgba(255,94,26,0)}}
.tv-nudge{animation:tvnudge 1.5s ease-in-out infinite}
@keyframes tvnudge{50%{transform:translateX(-14px)}}
.tv-grow{transform:scaleY(0);transform-origin:bottom;transition:transform 2.4s cubic-bezier(.2,.8,.2,1) .2s}
.tv-on .tv-grow{transform:scaleY(1)}
.tv-card{opacity:0;transform:translateY(34px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.8,.2,1),border-color .25s,background-color .25s}
.tv-on .tv-card{opacity:1;transform:none}
.tv-on .tv-card:hover{transform:translateY(-6px);background-color:#211f1e}
.tv-ring{animation:tvring linear forwards}
@keyframes tvring{from{stroke-dashoffset:151}to{stroke-dashoffset:0}}
@media (prefers-reduced-motion:reduce){
  .tv-kb,.tv-mist,.tv-glow,.tv-bean,.tv-wob,.tv-steam,.tv-pulse,.tv-nudge,.tv-ring{animation:none}
  .tv-line>span,.tv-fade,.tv-grow,.tv-card,.tv-seed{transition:none}
}
`;

const Lines: React.FC<{ text: string; base?: number }> = ({ text, base = 0 }) => (
  <>
    {text.split('\n').map((l, i) => (
      <span key={i} className="tv-line"><span style={{ transitionDelay: `${base + i * 140}ms` }}>{l}</span></span>
    ))}
  </>
);

const CountUp: React.FC<{ run: boolean; to: number }> = ({ run, to }) => {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(to); return; }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 2400);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [run, to]);
  return <>{v.toLocaleString('en-US')}</>;
};

// ภาพวาดประกอบ: แคร่ตากเมล็ด
const DryingBeds: React.FC = () => {
  const cols = ['#8a5a34', '#c8a463', '#d4c3bd', '#a7743f'];
  const rows = [78, 160, 242];
  return (
    <svg viewBox="0 0 400 300" className="w-full max-w-[460px]" aria-hidden="true">
      {rows.map((y, r) => (
        <g key={r}>
          {Array.from({ length: 15 }).map((_, i) => (
            <ellipse key={i} className="tv-seed" style={{ transitionDelay: `${300 + (r * 15 + i) * 45}ms` }}
              cx={34 + i * 24 + ((i * 7 + r * 5) % 6)} cy={y - 6 - ((i * 3 + r) % 4)} rx="8" ry="5.5"
              transform={`rotate(${(i * 37 + r * 19) % 70 - 35} ${34 + i * 24} ${y - 6})`} fill={cols[(i + r) % 4]} />
          ))}
          <rect x="18" y={y} width="364" height="8" rx="2" fill="#5b4138" />
          <rect x="34" y={y + 8} width="6" height="34" fill="#3b3937" />
          <rect x="360" y={y + 8} width="6" height="34" fill="#3b3937" />
        </g>
      ))}
    </svg>
  );
};

// ภาพวาดประกอบ: เมล็ดกาแฟเปลี่ยนสีตามระดับคั่ว (ไม่ได้ระบุเวลา)
const RoastBean: React.FC = () => (
  <svg viewBox="0 0 200 270" className="w-full max-w-[300px]" aria-hidden="true">
    {[78, 100, 122].map((x, i) => (
      <circle key={x} className="tv-steam" style={{ animationDelay: `${i * 1.1}s` }} cx={x} cy="40" r="9" fill="#e6e1df" opacity=".4" />
    ))}
    <g className="tv-wob">
      <ellipse className="tv-bean" cx="100" cy="150" rx="68" ry="94" />
      <path d="M100 62 C70 120 130 180 100 238" stroke="#141312" strokeWidth="9" fill="none" strokeLinecap="round" opacity=".6" />
    </g>
  </svg>
);

const Arrow: React.FC<{ dir: 'l' | 'r' }> = ({ dir }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {dir === 'r' ? <path d="M9 5l7 7-7 7" /> : <path d="M15 5l-7 7 7 7" />}
  </svg>
);

export const StoryView: React.FC<StoryViewProps> = ({ onGoToProduct }) => {
  const { language, setLanguage } = useLanguage();
  const tr = (en: string, th: string) => (language === 'th' ? th : en);
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const trackRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const sceneRefs = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [seen, setSeen] = useState<boolean[]>(() => Array.from({ length: COUNT }, (_, i) => reduce || i === 0));
  const [auto, setAuto] = useState(!reduce);
  const src = (() => {
    try { return new URLSearchParams(window.location.search).get('src') || 'doi-wiang'; } catch { return 'doi-wiang'; }
  })();

  const goTo = (i: number) =>
    trackRef.current?.scrollTo({ left: Math.max(0, Math.min(COUNT - 1, i)) * window.innerWidth, behavior: reduce ? 'auto' : 'smooth' });
  const userGo = (i: number) => { setAuto(false); goTo(i); };

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      const vw = window.innerWidth;
      const pos = track.scrollLeft / vw;
      const a = Math.min(COUNT - 1, Math.max(0, Math.round(pos)));
      setActive(a);
      setSeen((s) => (s[a] ? s : s.map((v, i) => v || i === a)));
      if (barRef.current) barRef.current.style.transform = `scaleX(${Math.min(1, pos / (COUNT - 1))})`;
      if (reduce) return;
      sceneRefs.current.forEach((s, i) => {
        if (!s) return;
        const p = i - pos;
        const copy = s.querySelector<HTMLElement>('[data-copy]');
        const par = s.querySelector<HTMLElement>('[data-par]');
        const vis = s.querySelector<HTMLElement>('[data-vis]');
        if (copy) {
          copy.style.transform = `translateX(${p * 90}px)`;
          copy.style.opacity = String(Math.max(0, 1 - Math.min(1, Math.abs(p)) * 0.95));
        }
        if (par) par.style.transform = `translateX(${p * -70}px) scale(1.12)`;
        if (vis) {
          vis.style.transform = `translateX(${p * -150}px)`;
          vis.style.opacity = String(Math.max(0, 1 - Math.min(1, Math.abs(p)) * 0.9));
        }
      });
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    const onWheel = (e: WheelEvent) => {
      setAuto(false);
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); track.scrollLeft += e.deltaY; }
    };
    const stopAuto = () => setAuto(false);
    const onKey = (e: KeyboardEvent) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { setAuto(false); track.scrollBy({ left: d * window.innerWidth, behavior: reduce ? 'auto' : 'smooth' }); }
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    track.addEventListener('wheel', onWheel, { passive: false });
    track.addEventListener('touchstart', stopAuto, { passive: true });
    track.addEventListener('pointerdown', stopAuto);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', update);
    update();
    return () => {
      track.removeEventListener('scroll', onScroll);
      track.removeEventListener('wheel', onWheel);
      track.removeEventListener('touchstart', stopAuto);
      track.removeEventListener('pointerdown', stopAuto);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', update);
    };
  }, [reduce]);

  // เลื่อนอัตโนมัติ: หยุดทันทีเมื่อผู้ใช้แตะ เลื่อน หรือกดปุ่ม และมีปุ่มหยุด/เล่นเอง
  useEffect(() => {
    if (!auto || active >= COUNT - 1) return;
    const t = window.setTimeout(() => goTo(active + 1), active === 5 ? AUTO_MS_ROASTS : AUTO_MS);
    return () => window.clearTimeout(t);
  }, [auto, active]);

  const scene = 'relative shrink-0 w-screen h-full snap-start overflow-hidden flex items-center px-6 md:pl-16 md:pr-32 lg:pl-24 lg:pr-36 pb-32 md:pb-28';
  const grid = 'relative z-10 w-full md:grid md:grid-cols-[1.3fr_0.7fr] md:gap-10 items-center';
  const label = "tv-fade font-mono text-[12px] text-[#ffb59c] uppercase tracking-[0.18em] mb-4 block";
  const head = "font-['Anuphan'] font-semibold text-[#e6e1df] text-[8.6vw] sm:text-6xl lg:text-[64px] xl:text-[76px] leading-[1.12]";
  const sub = "tv-fade mt-6 max-w-xl font-['Anuphan'] font-light text-base md:text-xl leading-relaxed text-[#e3beb3]/85";
  const on = (i: number) => (seen[i] ? 'tv-on' : '');
  const setRef = (i: number) => (el: HTMLElement | null) => { sceneRefs.current[i] = el; };
  const delay = (ms: number) => ({ transitionDelay: `${ms}ms` });
  const bg = (url: string, pos: string, alt: string) => (
    <div className="absolute inset-0 z-0">
      <div data-par className="absolute inset-0">
        <img src={url} alt={alt} className="tv-kb w-full h-full object-cover opacity-65 brightness-[0.7] contrast-125" style={{ objectPosition: pos }} />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#141312] via-[#141312]/60 to-[#141312]/40" />
    </div>
  );
  const glow = (cls: string) => <div className={`tv-glow pointer-events-none absolute rounded-full blur-3xl bg-[#ff5e1a]/25 ${cls}`} />;

  const ringDur = (active === 5 ? AUTO_MS_ROASTS : AUTO_MS) / 1000;
  const last = active === COUNT - 1;

  return (
    <div className="fixed inset-0 bg-[#141312] text-[#e6e1df] font-['Manrope'] selection:bg-[#ff5e1a] selection:text-[#390c00]">
      <style>{CSS}</style>

      {/* top bar */}
      <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between gap-3 px-5 md:px-10 py-4">
        <a href="/" aria-label="TATO Coffee"><img src={ASSETS.logo} alt="TATO Coffee" className="h-9 w-auto" /></a>
        <nav className="hidden md:flex gap-1.5" aria-label={tr('Scenes', 'ฉาก')}>
          {Array.from({ length: COUNT }).map((_, i) => (
            <button key={i} onClick={() => userGo(i)} aria-label={tr(`Scene ${i + 1}`, `ฉากที่ ${i + 1}`)} aria-current={i === active}
              className="h-5 w-9 relative focus-visible:outline-2 focus-visible:outline-[#ffb59c]">
              <span className={`absolute inset-x-0 top-[9px] h-[2px] transition-colors ${i === active ? 'bg-[#ff5e1a]' : 'bg-[#5b4138]'}`} />
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-full bg-[#2b2a28]/70 backdrop-blur-md border border-[#5b4138]/40">
            <button type="button" onClick={() => setLanguage('th')} aria-pressed={language === 'th'} className={`px-2.5 py-1 rounded-full font-['Manrope'] text-[11px] font-bold transition-all ${language === 'th' ? 'bg-[#ff5e1a] text-[#390c00]' : 'text-[#e3beb3]'}`}>TH</button>
            <button type="button" onClick={() => setLanguage('en')} aria-pressed={language === 'en'} className={`px-2.5 py-1 rounded-full font-['Manrope'] text-[11px] font-bold transition-all ${language === 'en' ? 'bg-[#ff5e1a] text-[#390c00]' : 'text-[#e3beb3]'}`}>EN</button>
          </div>
          <a href={`/?src=${src}`} className="hidden sm:inline font-mono text-[12px] text-[#f3bc8b] tracking-widest">{tr('SHOP', 'หน้าร้าน')}</a>
        </div>
      </div>
      <div className="absolute top-0 inset-x-0 z-40 h-[3px] bg-[#5b4138]/30"><div ref={barRef} className="h-full origin-left bg-[#ff5e1a]" style={{ transform: 'scaleX(0)' }} /></div>

      {/* scenes */}
      <div ref={trackRef} className="absolute inset-0 flex overflow-x-auto overflow-y-hidden snap-x snap-proximity [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* 1 hero */}
        <section ref={setRef(0)} className={`${scene} ${on(0)}`}>
          {bg(ASSETS.highlandAerial, 'center', 'Doi Wiang highland coffee plantation in morning mist')}
          <div className="tv-mist pointer-events-none absolute inset-x-[-20%] top-[38%] h-40 z-[1] bg-gradient-to-r from-transparent via-[#e6e1df]/10 to-transparent blur-2xl" />
          <div className={grid}>
            <div data-copy className="max-w-5xl md:col-span-2">
              <span className={label}>Single-Origin · Doi Wiang Pa</span>
              <h1 className={`${head} lg:!text-[72px] xl:!text-[88px]`}><Lines text={tr('Coffee from\nDoi Wiang Pa,\nroasted when\nyou order', 'กาแฟจากดอยเวียงผา\nคั่วสดเมื่อคุณสั่ง')} base={150} /></h1>
              <p className={sub} style={delay(700)}>{tr('100% Arabica from Chiang Mai. Not coffee that sits on a shelf.', 'อาราบิก้า 100% จากเชียงใหม่ ไม่ใช่กาแฟที่นอนรอบนชั้นวาง')}</p>
            </div>
          </div>
        </section>

        {/* 2 altitude */}
        <section ref={setRef(1)} className={`${scene} ${on(1)}`}>
          {bg(ASSETS.highlandAerial, '80% 40%', 'Misty mountain slopes of Doi Wiang Pa')}
          <div className={grid}>
            <div data-copy>
              <span className={label}>01 · Origin</span>
              <h2 className={head}><Lines text={tr('Above\nsea level', 'สูงกว่า\nน้ำทะเล')} base={100} /></h2>
              <p className={sub} style={delay(500)}>{tr('Before it was your cup, it grew on Doi Wiang Pa, Chaiprakan District, Chiang Mai.', 'ก่อนเป็นถ้วยของคุณ มันเติบโตบนดอยเวียงผา อ.ไชยปราการ จ.เชียงใหม่')}</p>
            </div>
            <div data-vis className="relative mt-10 md:mt-0 flex items-end gap-5 md:justify-end pointer-events-none">
              <div className="tv-grow w-[3px] h-32 md:h-72 bg-gradient-to-t from-transparent to-[#ff5e1a]" />
              <div>
                <div className="font-['Manrope'] font-extrabold leading-none text-[#ffb59c] text-[84px] sm:text-[120px] lg:text-[170px] tabular-nums"><CountUp run={seen[1]} to={1500} /></div>
                <div className="mt-2 font-mono text-[12px] md:text-sm tracking-[0.18em] text-[#f3bc8b] uppercase">{tr('metres above sea level', 'เมตร เหนือระดับน้ำทะเล')}</div>
              </div>
            </div>
          </div>
        </section>

        {/* 3 growers */}
        <section ref={setRef(2)} className={`${scene} ${on(2)}`}>
          {bg(ASSETS.cherriesAndBeans, 'center', 'Coffee cherries and beans')}
          {glow('right-[-6%] bottom-[8%] w-[420px] h-[420px]')}
          <div className={grid}>
            <div data-copy className="md:col-span-2 max-w-5xl">
              <span className={label}>02 · Grown</span>
              <h2 className={head}><Lines text={tr('Grown by the\nLahu people', 'ปลูกโดย\nชาวลาหู่')} base={100} /></h2>
              <p className={sub} style={delay(550)}>{tr('100% Arabica from Lahu hill-tribe growers on Doi Wiang Pa.', 'อาราบิก้า 100% จากชาวเขาเผ่าลาหู่ที่ดอยเวียงผา')}</p>
            </div>
          </div>
        </section>

        {/* 4 drying */}
        <section ref={setRef(3)} className={`${scene} bg-[#0f0e0d] ${on(3)}`}>
          {glow('left-[30%] top-[10%] w-[520px] h-[520px]')}
          <div className={grid}>
            <div data-copy>
              <span className={label}>03 · Dried</span>
              <h2 className={head}><Lines text={tr('Dried on\nraised beds', 'ตากบน\nแคร่ยกพื้น')} base={100} /></h2>
              <p className={sub} style={delay(500)}>{tr('The beans are dried on raised beds before they reach our roaster.', 'เมล็ดถูกตากบนแคร่ยกพื้น ก่อนเดินทางมาถึงเครื่องคั่วของเรา')}</p>
            </div>
            <div data-vis className="mt-8 md:mt-0 flex md:justify-end pointer-events-none"><DryingBeds /></div>
          </div>
        </section>

        {/* 5 roast to order */}
        <section ref={setRef(4)} className={`${scene} bg-[#141312] ${on(4)}`}>
          {glow('right-[10%] top-[20%] w-[480px] h-[480px]')}
          <div className={grid}>
            <div data-copy>
              <span className={label}>04 · Roasted</span>
              <h2 className={head}><Lines text={tr('We don’t roast stock.\nWe roast when\nyou order.', 'เราไม่คั่วสต็อก\nเราคั่วเมื่อคุณสั่ง')} base={100} /></h2>
              <p className={sub} style={delay(600)}>{tr('Every order is roasted to order.', 'ทุกออเดอร์คั่วตามคำสั่งซื้อ')}</p>
            </div>
            <div data-vis className="mt-6 md:mt-0 flex md:justify-end pointer-events-none"><div className="w-[190px] md:w-[300px]"><RoastBean /></div></div>
          </div>
        </section>

        {/* 6 roast levels -> opens the real order flow */}
        <section ref={setRef(5)} className={`${scene} bg-[#0f0e0d] ${on(5)}`}>
          {glow('left-[-5%] bottom-[0%] w-[460px] h-[460px]')}
          <div data-copy className="relative z-10 w-full max-w-6xl">
            <span className={label}>05 · Roasts</span>
            <h2 className={`${head} !text-[7.4vw] sm:!text-5xl lg:!text-[56px] xl:!text-[64px]`}><Lines text={tr('Choose the cup\nyou want', 'เลือกได้ว่า\nอยากได้ถ้วยแบบไหน')} base={100} /></h2>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-5">
              {(['light', 'medium', 'dark'] as RoastType[]).map((id, i) => {
                const p = ROAST_PROFILES.find((r) => r.id === id)!;
                const n = ROAST_NOTES[id];
                return (
                  <button key={id} onClick={() => onGoToProduct(id)} style={{ ...delay(450 + i * 160), borderTop: `3px solid ${n.accent}` }}
                    className="tv-card text-left rounded-xl bg-[#1d1b1a] border border-[#5b4138]/40 hover:border-[#ff5e1a]/70 p-4 md:p-6 focus-visible:outline-2 focus-visible:outline-[#ffb59c]">
                    <span className="flex items-center gap-3">
                      <span className="inline-block h-4 w-4 rounded-full" style={{ background: n.accent }} />
                      <span className="font-['Anuphan'] font-semibold text-xl md:text-2xl text-[#e6e1df]">{tr(p.name, p.nameThai)}</span>
                    </span>
                    <span className="block mt-3 font-['Anuphan'] font-light text-sm md:text-base text-[#e3beb3]/85">{tr(n.en, n.th)}</span>
                    <span className="block mt-2 font-['Anuphan'] text-[13px]" style={{ color: n.accent }}>{tr(n.feel.en, n.feel.th)}</span>
                    <span className="block mt-4 font-['Anuphan'] text-[13px] text-[#e6e1df]/70">{tr('Order this roast', 'สั่งระดับคั่วนี้')} ›</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* 7 call to action */}
        <section ref={setRef(6)} className={`${scene} ${on(6)}`}>
          {bg(ASSETS.matteBlackPouch, '75% center', 'TATO Coffee matte black pouch')}
          <div className={grid}>
            <div data-copy>
              <span className={label}>06 · Order</span>
              <h2 className={head}><Lines text={tr('From the mountain\nto your cup', 'ชิมจากดอย\nถึงถ้วยของคุณ')} base={100} /></h2>
              <p className={sub} style={delay(500)}>{tr('Home brewers from 650 THB/kg. Cafés: first order 550 THB/kg, no minimum.', 'ดื่มเองเริ่ม 650 บาท/กก. ร้านกาแฟสั่งครั้งแรก 550 บาท/กก. ไม่มีขั้นต่ำ')}</p>
              <div className="tv-fade mt-8 flex flex-wrap gap-3" style={delay(700)}>
                <button onClick={() => onGoToProduct('medium')} className="tv-pulse px-6 py-3.5 rounded-full bg-[#ff5e1a] text-[#390c00] font-['Anuphan'] font-semibold text-base md:text-lg min-h-12 focus-visible:outline-2 focus-visible:outline-[#ffb59c] focus-visible:outline-offset-2">
                  {tr('Order fresh-roasted · 650 THB/kg', 'สั่งกาแฟคั่วสด 650 บาท/กก.')}
                </button>
                <a href={`/cafe/?src=${src}`} className="px-6 py-3.5 rounded-full border border-[#e6e1df]/70 text-[#e6e1df] font-['Anuphan'] font-semibold text-base md:text-lg min-h-12 inline-flex items-center focus-visible:outline-2 focus-visible:outline-[#ffb59c] focus-visible:outline-offset-2">
                  {tr('For cafés · 550 THB/kg', 'สำหรับร้านกาแฟ 550 บาท/กก.')}
                </a>
              </div>
              <p className="tv-fade mt-5 text-[13px] text-[#e3beb3]/70 font-['Anuphan']" style={delay(850)}>{tr('Prices exclude shipping. Questions? Call 064-293-6615.', 'ราคายังไม่รวมค่าส่ง สอบถามได้ที่ 064-293-6615')}</p>
            </div>
          </div>
        </section>
      </div>

      {/* scroll cue (first scene) */}
      {active === 0 && (
        <div className="absolute z-20 left-1/2 -translate-x-1/2 bottom-[96px] md:bottom-[100px] flex items-center gap-3 text-[#e3beb3] font-['Anuphan'] text-sm pointer-events-none">
          <span className="tv-nudge inline-flex"><Arrow dir="l" /></span>
          <span>{tr('Swipe or scroll to continue', 'ปัดหรือเลื่อนไปทางซ้ายเพื่อไปต่อ')}</span>
        </div>
      )}

      {/* controls */}
      <div className="absolute z-30 right-4 md:right-8 bottom-[84px] md:bottom-1/2 md:translate-y-1/2 flex flex-col items-center gap-3">
        {last ? (
          <button onClick={() => userGo(0)} aria-label={tr('Start over', 'เริ่มใหม่')} className="h-14 w-14 rounded-full bg-[#2b2a28]/80 backdrop-blur-md border border-[#5b4138] text-[#e6e1df] grid place-items-center font-['Anuphan'] text-xs">↺</button>
        ) : (
          <button onClick={() => userGo(active + 1)} aria-label={tr('Next scene', 'ฉากถัดไป')} className={`relative h-14 w-14 rounded-full bg-[#ff5e1a] text-[#390c00] grid place-items-center ${auto ? '' : 'tv-pulse'}`}>
            {auto && (
              <svg key={active} className="absolute inset-0 -rotate-90" viewBox="0 0 56 56" aria-hidden="true">
                <circle cx="28" cy="28" r="24" fill="none" stroke="#390c00" strokeOpacity=".25" strokeWidth="3" />
                <circle className="tv-ring" style={{ animationDuration: `${ringDur}s` }} cx="28" cy="28" r="24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeDasharray="151" />
              </svg>
            )}
            <Arrow dir="r" />
          </button>
        )}
        {active > 0 && (
          <button onClick={() => userGo(active - 1)} aria-label={tr('Previous scene', 'ฉากก่อนหน้า')} className="h-10 w-10 rounded-full bg-[#2b2a28]/80 backdrop-blur-md border border-[#5b4138] text-[#e6e1df] grid place-items-center"><Arrow dir="l" /></button>
        )}
        {!last && (
          <button onClick={() => setAuto((v) => !v)} aria-pressed={auto} aria-label={auto ? tr('Pause autoplay', 'หยุดเลื่อนอัตโนมัติ') : tr('Play autoplay', 'เลื่อนอัตโนมัติ')}
            className="px-3 py-1.5 rounded-full bg-[#2b2a28]/80 backdrop-blur-md border border-[#5b4138] text-[11px] font-bold text-[#e3beb3]">
            {auto ? `❚❚ ${tr('Pause', 'หยุด')}` : `▶ ${tr('Auto', 'อัตโนมัติ')}`}
          </button>
        )}
      </div>

      {/* sticky order bar */}
      <div className="absolute bottom-0 inset-x-0 z-30 flex justify-center gap-2.5 px-3.5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-gradient-to-t from-[#0f0e0d]/90 to-transparent">
        <button onClick={() => onGoToProduct('medium')} className="flex-1 max-w-[280px] py-3 rounded-full bg-[#ff5e1a] text-[#390c00] font-['Anuphan'] font-semibold text-sm">{tr('Order · 650/kg', 'สั่งกาแฟ 650/กก.')}</button>
        <a href={`/cafe/?src=${src}`} className="flex-1 max-w-[280px] py-3 rounded-full text-center border border-[#5b4138] bg-[#0f0e0d]/60 text-[#e6e1df] font-['Anuphan'] font-semibold text-sm">{tr('Cafés · 550/kg', 'ร้านกาแฟ 550/กก.')}</a>
      </div>
    </div>
  );
};
