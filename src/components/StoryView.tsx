import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n';
import { ASSETS, BAG_IMAGES, ROAST_PROFILES } from '../data/coffeeData';
import { RoastType } from '../types';
import { Fog, Smoke, FxDebug } from './StoryFx';

interface StoryViewProps {
  onGoToProduct: (roast?: RoastType) => void;
  onGoToDiscover?: () => void;
}

// หน้าเล่าเรื่องแบบเลื่อนซ้าย-ขวา (scrollytelling) ที่ /doi-wiang/
// ใช้สี ฟอนต์ ของเว็บ และรูปใน ASSETS (coffeeData.ts) ไฟล์ภาพอยู่ที่ public/images/story/
// เนื้อหาใช้เฉพาะข้อเท็จจริงที่ตรงกับหน้าเว็บ: ไม่มีส่งฟรี ไม่มีใบรับรอง ไม่ระบุระยะเวลาคั่ว/ส่ง
// ภาพฉาก 3, 4 และ 6 เป็นภาพถ่ายจริงของร้าน (ผลกาแฟ, การคัดเมล็ด, เครื่องคั่ว) ส่วนฉาก 1, 2 และ 5 ยังเป็นภาพบรรยากาศจากคลังภาพฟรี
// alt text จึงบรรยายสิ่งที่เห็นเฉยๆ ไม่อ้างว่าเป็นดอยเวียงผา ถ้าได้ภาพจริงให้เขียนทับไฟล์ชื่อเดิมได้เลย

const COUNT = 7;
// เมล็ดคั่วอ่อน/กลาง/เข้ม: ตัดจากภาพ 06b-beans-trio.webp (643x299) ด้วย CSS ไม่ต้องมีไฟล์ใหม่
const BEAN_CROP: Record<RoastType, { x: number; w: number }> = { light: { x: 10, w: 195 }, medium: { x: 228, w: 193 }, dark: { x: 443, w: 191 } };
const TRIO_W = 643, TRIO_H = 299;
// where smoke starts, as fractions of the photo (05-roast-pour: along the pouring beans; 07-bag: the cup rim)
const ROAST_EMITTERS = [{ nx: 0.6, ny: 0.52 }, { nx: 0.45, ny: 0.66 }, { nx: 0.3, ny: 0.8 }];
const CUP_EMITTERS = [{ nx: 0.57, ny: 0.555 }];
const AUTO_MS = 3500;
const AUTO_MS_ROASTS = 6000;
const IDLE_MS = 3000;

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
.tv-pulse{animation:tvpulse 2.4s ease-out infinite}
@keyframes tvpulse{0%{box-shadow:0 0 0 0 rgba(255,94,26,.55)}100%{box-shadow:0 0 0 22px rgba(255,94,26,0)}}
.tv-nudge{animation:tvnudge 1.5s ease-in-out infinite}
@keyframes tvnudge{50%{transform:translateX(-14px)}}
.tv-grow{transform:scaleY(0);transform-origin:bottom;transition:transform 2.4s cubic-bezier(.2,.8,.2,1) .2s}
.tv-on .tv-grow{transform:scaleY(1)}
.tv-card{opacity:0;transform:translateY(34px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.8,.2,1),border-color .25s,background-color .25s}
.tv-on .tv-card{opacity:1;transform:none}
.tv-on .tv-card:hover{transform:translateY(-6px);background-color:#211f1e}
.tv-bag{height:88px;width:auto;max-width:100%;object-fit:contain;transform-origin:50% 90%;transition:transform .35s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 16px 22px rgba(0,0,0,.55));will-change:transform}
@media (min-width:768px){.tv-bag{height:clamp(130px,21vh,280px)}}
.tv-bean{flex:none;height:44px;background-repeat:no-repeat;filter:drop-shadow(0 6px 8px rgba(0,0,0,.5))}
@media (min-width:768px){.tv-bean{height:64px}}
.tv-ring{animation:tvring linear forwards}
@keyframes tvring{from{stroke-dashoffset:151}to{stroke-dashoffset:0}}
.tv-zoom{transform:scale(1.04);transform-origin:var(--zo,50% 50%)}
.tv-on .tv-zoom{animation:tvzoom 9s cubic-bezier(.22,.6,.2,1) .2s forwards}
@keyframes tvzoom{from{transform:scale(1.04)}to{transform:scale(1.8)}}
.tv-drop{opacity:0}
.tv-on .tv-drop{animation:tvdrop 1.5s cubic-bezier(.4,0,.6,1) .35s both}
@keyframes tvdrop{0%{opacity:0;transform:translateY(-150%)}12%{opacity:1}55%{opacity:1;transform:translateY(0)}70%{transform:translateY(-9%)}85%{transform:translateY(0)}93%{transform:translateY(-2.5%)}100%{opacity:1;transform:translateY(0)}}
@media (prefers-reduced-motion:reduce){
  .tv-kb,.tv-mist,.tv-glow,.tv-pulse,.tv-nudge,.tv-ring,.tv-zoom,.tv-drop{animation:none}
  .tv-zoom{transform:scale(1.2)}
  .tv-drop{opacity:1!important;transform:none!important}
  .tv-line>span,.tv-fade,.tv-grow,.tv-card,.tv-bag{transition:none}
}
`;

// photoreal bag that leans toward the finger / cursor. Static for prefers-reduced-motion.
const BagTilt: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const ref = useRef<HTMLImageElement>(null);
  const move = (e: React.PointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${(x * 22).toFixed(1)}deg) rotateX(${(-y * 10).toFixed(1)}deg) translateY(-8px) scale(1.04)`;
  };
  const leave = () => { if (ref.current) ref.current.style.transform = ''; };
  return (
    <span className="block md:mb-5" onPointerMove={move} onPointerLeave={leave} onPointerCancel={leave}>
      <img ref={ref} src={src} alt={alt} loading="lazy" decoding="async" draggable={false} className="tv-bag mx-auto" />
    </span>
  );
};

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

export const StoryView: React.FC<StoryViewProps> = ({ onGoToProduct, onGoToDiscover }) => {
  const { language, setLanguage } = useLanguage();
  const tr = (en: string, th: string) => (language === 'th' ? th : en);
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const trackRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const sceneRefs = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [seen, setSeen] = useState<boolean[]>(() => Array.from({ length: COUNT }, (_, i) => reduce || i === 0));
  const lastTouch = useRef(0);
  const hover = useRef(false);
  const src = (() => {
    try { return new URLSearchParams(window.location.search).get('src') || 'doi-wiang'; } catch { return 'doi-wiang'; }
  })();

  const debug = (() => { try { return new URLSearchParams(window.location.search).get('fxdebug') === '1'; } catch { return false; } })();
  const animRef = useRef(0);
  const goTo = (i: number) => {
    const t = trackRef.current;
    if (!t) return;
    const target = Math.max(0, Math.min(COUNT - 1, i)) * window.innerWidth;
    cancelAnimationFrame(animRef.current);
    if (reduce) { t.scrollTo({ left: target, behavior: 'auto' }); return; }
    const from = t.scrollLeft, dist = target - from, t0 = performance.now(), D = 950;
    t.style.scrollSnapType = 'none';
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / D);
      t.scrollLeft = from + dist * (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
      if (k < 1) animRef.current = requestAnimationFrame(step); else t.style.scrollSnapType = '';
    };
    animRef.current = requestAnimationFrame(step);
  };
  const userGo = (i: number) => { lastTouch.current = Date.now(); goTo(i); };
  const onTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('a,button,input,select,textarea')) return;
    if (window.getSelection()?.toString()) return;
    userGo(e.clientX < window.innerWidth / 3 ? active - 1 : active + 1);
  };

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
        if (par) {
          const ap = Math.min(1, Math.abs(p));
          // ฉาก 1-6: ภาพที่ออกซูมเข้า ภาพใหม่นิ่ง / ฉากสุดท้าย: ซูมออกเผยถุงกับถ้วย
          const z = i === COUNT - 1 ? 1.12 + ap * 0.3 : p < 0 ? 1.12 + ap * 0.2 : 1.12;
          par.style.transform = `translateX(${p * -70}px) scale(${z})`;
          par.style.opacity = String(Math.max(0, 1 - ap * 0.9));
        }
        if (vis) {
          vis.style.transform = `translateX(${p * -150}px)`;
          vis.style.opacity = String(Math.max(0, 1 - Math.min(1, Math.abs(p)) * 0.9));
        }
      });
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    const onWheel = (e: WheelEvent) => {
      lastTouch.current = Date.now();
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); track.scrollLeft += e.deltaY; }
    };
    const stopAuto = () => { lastTouch.current = Date.now(); cancelAnimationFrame(animRef.current); track.style.scrollSnapType = ''; };
    const onKey = (e: KeyboardEvent) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { lastTouch.current = Date.now(); goTo(Math.round(track.scrollLeft / window.innerWidth) + d); }
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

  // เลื่อนอัตโนมัติแบบเงียบ ๆ (ไม่มีปุ่มหรือข้อความบอก):
  // รอผู้ใช้เงียบ 7 วินาทีหลังแตะ/เลื่อน และรอระหว่างชี้การ์ดหรือซ่อนแท็บ หยุดที่ฉากสุดท้าย
  useEffect(() => {
    if (active >= COUNT - 1) return;
    let t = 0;
    const tick = () => {
      if (document.hidden || hover.current || Date.now() - lastTouch.current < IDLE_MS) { t = window.setTimeout(tick, 1000); return; }
      goTo(active + 1);
    };
    t = window.setTimeout(tick, active === 5 ? AUTO_MS_ROASTS : AUTO_MS);
    return () => window.clearTimeout(t);
  }, [active]);

  const scene = 'relative shrink-0 w-screen h-full snap-start overflow-hidden flex items-center px-6 md:pl-16 md:pr-32 lg:pl-24 lg:pr-36 pb-32 md:pb-28';
  const grid = 'relative z-10 w-full md:grid md:grid-cols-[1.3fr_0.7fr] md:gap-10 items-center';
  const label = "tv-fade font-mono text-[12px] text-[#ffb59c] uppercase tracking-[0.18em] mb-4 block";
  const head = "font-['Anuphan'] font-semibold text-[#e6e1df] text-[8.6vw] sm:text-6xl lg:text-[64px] xl:text-[76px] leading-[1.12]";
  const sub = "tv-fade mt-6 max-w-xl font-['Anuphan'] font-light text-base md:text-xl leading-relaxed text-[#e3beb3]/85";
  const on = (i: number) => (seen[i] ? 'tv-on' : '');
  const setRef = (i: number) => (el: HTMLElement | null) => { sceneRefs.current[i] = el; };
  const delay = (ms: number) => ({ transitionDelay: `${ms}ms` });
  // full-bleed photo behind the copy. first = load before anything else (scene 1)
  // tone: 'bright' for light, misty photos; 'dim' for text-heavy scenes; default sits between
  const TONES = { dim: 'opacity-45 brightness-[0.7] contrast-125', normal: 'opacity-65 brightness-[0.7] contrast-125', bright: 'opacity-85 brightness-[0.9] contrast-110', clear: 'opacity-100 brightness-100 contrast-110' };
  const bg = (url: string, pos: string, alt: string, opts: { first?: boolean; tone?: keyof typeof TONES; veil?: string; zoom?: string; fx?: React.ReactNode } = {}) => (
    <div className="absolute inset-0 z-0">
      <div data-par className="absolute inset-0">
        <img src={url} alt={alt} decoding="async" loading={opts.first ? 'eager' : 'lazy'} fetchPriority={opts.first ? 'high' : 'auto'}
          className={`${opts.zoom ? 'tv-zoom' : 'tv-kb'} w-full h-full object-cover ${TONES[opts.tone ?? 'normal']}`} style={opts.zoom ? ({ objectPosition: pos, '--zo': opts.zoom } as React.CSSProperties) : { objectPosition: pos }} />
        {opts.fx && <div className="tv-kb pointer-events-none absolute inset-0">{opts.fx}</div>}
      </div>
      <div className={`absolute inset-0 ${opts.veil ?? 'bg-gradient-to-t from-[#141312] via-[#141312]/60 to-[#141312]/40'}`} />
    </div>
  );
  // portrait photo: lower half of the screen on phones (so it never sits under the copy),
  // right-hand panel fading into the dark on wide screens (keeps the bag sharp and uncropped)
  const bgSide = (url: string, pos: string, alt: string, fx?: React.ReactNode) => (
    <div className="absolute inset-0 z-0">
      <div data-par className="absolute inset-x-0 bottom-0 h-[54%] md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-[52%] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000_32%)] md:[mask-image:linear-gradient(to_right,transparent,#000_16%)]">
        <img src={url} alt={alt} decoding="async" loading="lazy" className="tv-kb w-full h-full object-cover opacity-85 md:opacity-90" style={{ objectPosition: pos }} />
        {fx && <div className="tv-kb pointer-events-none absolute inset-0">{fx}</div>}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#141312]/50 via-transparent to-transparent md:from-[#141312]/60" />
    </div>
  );
  const glow = (cls: string) => <div className={`tv-glow pointer-events-none absolute rounded-full blur-3xl bg-black/60 ${cls}`} />;

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
          <a href={`/?shop=1&src=${src}`} className="hidden sm:inline font-mono text-[12px] text-[#f3bc8b] tracking-widest">{tr('SHOP', 'หน้าร้าน')}</a>
        </div>
      </div>
      <div className="absolute top-0 inset-x-0 z-40 h-[3px] bg-[#5b4138]/30"><div ref={barRef} className="h-full origin-left bg-[#ff5e1a]" style={{ transform: 'scaleX(0)' }} /></div>

      {/* scenes */}
      <div ref={trackRef} onClick={onTrackClick} className="absolute inset-0 flex overflow-x-auto overflow-y-hidden snap-x snap-proximity [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* 1 hero */}
        <section ref={setRef(0)} className={`${scene} ${on(0)}`}>
          {bg(ASSETS.storyMist, '50% 55%', tr('Morning mist over highland ridges at sunrise', 'หมอกเช้ายามพระอาทิตย์ขึ้นเหนือสันเขา'), { first: true, tone: 'bright' })}
          <div className="tv-mist pointer-events-none absolute inset-x-[-20%] top-[38%] h-40 z-[1] bg-gradient-to-r from-transparent via-[#e6e1df]/10 to-transparent blur-2xl" />
          <Fog run={active <= 1} />
          <div className={grid}>
            <div data-copy className="max-w-5xl md:col-span-2">
              <span className={label}>{tr('Single-Origin · Doi Wiang Pa', 'ซิงเกิลออริจิน · ดอยเวียงผา')}</span>
              <h1 className={`${head} lg:!text-[72px] xl:!text-[88px]`}><Lines text={tr('Coffee from\nDoi Wiang Pa,\nroasted when\nyou order', 'กาแฟจากดอยเวียงผา\nคั่วสดเมื่อคุณสั่ง')} base={150} /></h1>
              <p className={sub} style={delay(700)}>{tr('100% Arabica from Chiang Mai. Not coffee that sits on a shelf.', 'อาราบิก้า 100% จากเชียงใหม่ ไม่ใช่กาแฟที่นอนรอบนชั้นวาง')}</p>
            </div>
          </div>
        </section>

        {/* 2 altitude */}
        <section ref={setRef(1)} className={`${scene} ${on(1)}`}>
          {bg(ASSETS.storyRidges, '50% 45%', tr('Layers of mountain ridges fading into haze', 'สันเขาซ้อนกันหลายชั้นจางหายไปในหมอก'), { tone: 'bright' })}
          <div className={grid}>
            <div data-copy>
              <span className={label}>01 · {tr('Origin', 'แหล่งปลูก')}</span>
              <h2 className={head}><Lines text={tr('Above\nsea level', 'สูงกว่า\nน้ำทะเล')} base={100} /></h2>
              <p className={sub} style={delay(500)}>{tr('Before it was your cup, it grew on Doi Wiang Pa, Chaiprakan District, Chiang Mai.', 'ก่อนเป็นถ้วยของคุณ มันเติบโตบนดอยเวียงผา อ.ไชยปราการ จ.เชียงใหม่')}</p>
            </div>
            <div data-vis className="relative mt-10 md:mt-0 flex items-end gap-5 md:justify-end pointer-events-none">
              <div className="tv-grow w-[3px] h-32 md:h-72 bg-gradient-to-t from-transparent to-[#ff5e1a]" />
              <div className="tv-drop">
                <div className="font-['Manrope'] font-extrabold leading-none text-white [text-shadow:0_0_44px_rgba(255,255,255,.28)] text-[84px] sm:text-[120px] lg:text-[170px] tabular-nums"><CountUp run={seen[1]} to={1500} /></div>
                <div className="mt-2 font-mono text-[12px] md:text-sm tracking-[0.18em] text-[#f3bc8b] uppercase">{tr('metres above sea level', 'เมตร เหนือระดับน้ำทะเล')}</div>
              </div>
            </div>
          </div>
        </section>

        {/* 3 growers */}
        <section ref={setRef(2)} className={`${scene} ${on(2)}`}>
          {bg(ASSETS.storyCherries, '50% 50%', tr('Freshly picked coffee cherries in a pink mesh sack', 'ผลกาแฟสดที่เพิ่งเก็บ ในถุงตาข่ายสีชมพู'), { zoom: '15% 60%' })}
          {glow('right-[-6%] bottom-[8%] w-[420px] h-[420px]')}
          <div className={grid}>
            <div data-copy className="md:col-span-2 max-w-5xl">
              <span className={label}>02 · {tr('Grown', 'ผู้ปลูก')}</span>
              <h2 className={head}><Lines text={tr('Grown by the\nLahu people', 'ปลูกโดย\nชาวลาหู่')} base={100} /></h2>
              <p className={sub} style={delay(550)}>{tr('100% Arabica from Lahu hill-tribe growers on Doi Wiang Pa.', 'อาราบิก้า 100% จากชาวเขาเผ่าลาหู่ที่ดอยเวียงผา')}</p>
            </div>
          </div>
        </section>

        {/* 4 drying */}
        <section ref={setRef(3)} className={`${scene} ${on(3)}`}>
          <div className="absolute inset-0 z-0">
            <img src={ASSETS.storyDrying} alt="" aria-hidden="true" decoding="async" loading="lazy" className="absolute inset-0 w-full h-full object-cover scale-125 blur-3xl opacity-60 brightness-75 saturate-125" style={{ objectPosition: '50% 45%' }} />
            <div data-par className="absolute inset-x-0 bottom-0 h-[54%] md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-[62%] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000_32%)] md:[mask-image:linear-gradient(to_right,transparent,#000_14%)]">
              <img src={ASSETS.storyDrying} alt={tr('A farmer sorting dried green coffee beans in a woven tray', 'เกษตรกรกำลังคัดเมล็ดกาแฟสารในกระด้งสาน')} decoding="async" loading="lazy" className="tv-kb w-full h-full object-cover opacity-95" style={{ objectPosition: '38% 50%' }} />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-[#141312]/55 via-transparent to-transparent md:bg-gradient-to-r md:from-[#141312]/70 md:via-[#141312]/20 md:to-transparent" />
          </div>
          <div className={grid}>
            <div data-copy>
              <span className={label}>03 · {tr('Dried', 'การตาก')}</span>
              <h2 className={head}><Lines text={tr('Dried on\nraised beds', 'ตากบน\nแคร่ยกพื้น')} base={100} /></h2>
              <p className={sub} style={delay(500)}>{tr('The beans are dried on raised beds before they reach our roaster.', 'เมล็ดถูกตากบนแคร่ยกพื้น ก่อนเดินทางมาถึงเครื่องคั่วของเรา')}</p>
            </div>
          </div>
        </section>

        {/* 5 roast to order */}
        {/* cinematic dark: copy sits at the top, the pouring beans own the lower half */}
        <section ref={setRef(4)} className={`${scene} !items-start pt-24 md:pt-28 bg-[#141312] ${on(4)}`}>
          {bg(ASSETS.storyRoastPour, '50% 40%', tr('Freshly roasted beans pouring out of a drum roaster', 'เมล็ดกาแฟคั่วใหม่ไหลออกจากเครื่องคั่วแบบดรัม'), { tone: 'normal', fx: <Smoke run={Math.abs(active - 4) <= 1} iw={900} ih={1350} pos={[0.5, 0.4]} preset="roast" emitters={ROAST_EMITTERS} />, veil: 'bg-[linear-gradient(to_bottom,rgba(20,19,18,.92)_0%,rgba(20,19,18,.6)_26%,rgba(20,19,18,.08)_52%,rgba(20,19,18,.88)_100%)]' })}
          <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-r from-[#141312]/55 via-[#141312]/10 to-transparent" />
          <div className={grid}>
            <div data-copy>
              <span className={label}>04 · {tr('Roasted', 'การคั่ว')}</span>
              <h2 className={head}><Lines text={tr('We don’t roast stock.\nWe roast when\nyou order.', 'เราไม่คั่วสต็อก\nเราคั่วเมื่อคุณสั่ง')} base={100} /></h2>
              <p className={sub} style={delay(600)}>{tr('Every order is roasted to order.', 'ทุกออเดอร์คั่วตามคำสั่งซื้อ')}</p>
            </div>
          </div>
        </section>

        {/* 6 roast levels -> opens the real order flow */}
        <section ref={setRef(5)} className={`${scene} bg-[#0f0e0d] pt-16 md:pt-0 ${on(5)}`}>
          {bg(ASSETS.storyRoastDrum, '60% 50%', tr('Roasted coffee beans in the drum of a roaster', 'เมล็ดกาแฟคั่วในถังของเครื่องคั่ว'), { tone: 'dim' })}
          {glow('left-[-5%] bottom-[0%] w-[460px] h-[460px]')}
          <div data-copy className="relative z-10 w-full max-w-6xl">
            <div>
              <div>
                <span className={label}>05 · {tr('Roasts', 'ระดับการคั่ว')}</span>
                <h2 className={`${head} !text-[7.4vw] sm:!text-5xl lg:!text-[56px] xl:!text-[64px]`}><Lines text={tr('Choose the cup\nyou want', 'เลือกได้ว่า\nอยากได้ถ้วยแบบไหน')} base={100} /></h2>
              </div>
            </div>
            <div className="mt-5 md:mt-6 grid grid-cols-1 md:grid-cols-3 gap-2.5 md:gap-5">
              {(['light', 'medium', 'dark'] as RoastType[]).map((id, i) => {
                const p = ROAST_PROFILES.find((r) => r.id === id)!;
                const n = ROAST_NOTES[id];
                return (
                  <button key={id} onClick={() => onGoToProduct(id)} style={{ ...delay(450 + i * 160), borderTop: `3px solid ${n.accent}` }}
                    onPointerEnter={() => { hover.current = true; }} onPointerLeave={() => { hover.current = false; }}
                    className="tv-card text-left rounded-xl bg-[#1d1b1a] border border-[#5b4138]/40 hover:border-[#ff5e1a]/70 p-4 md:p-6 flex items-center gap-4 md:block focus-visible:outline-2 focus-visible:outline-[#ffb59c]">
                    <span className="block w-20 shrink-0 md:w-auto">
                      <BagTilt src={BAG_IMAGES[id].cut} alt={tr(`TATO Coffee bag, ${p.name.toLowerCase()} roast`, `ถุงกาแฟ TATO ${p.nameThai}`)} />
                    </span>
                    <span className="block min-w-0 flex-1">
                      <span className="flex items-center gap-3">
                        <span className="tv-bean" role="img" aria-label={tr(`${p.name} roast bean`, `เมล็ดกาแฟ${p.nameThai}`)}
                          style={{ aspectRatio: `${BEAN_CROP[id].w} / ${TRIO_H}`, backgroundImage: `url(${ASSETS.storyBeansTrio})`, backgroundSize: `${(TRIO_W / BEAN_CROP[id].w) * 100}% 100%`, backgroundPosition: `${(BEAN_CROP[id].x / (TRIO_W - BEAN_CROP[id].w)) * 100}% 0` }} />
                        <span className="font-['Anuphan'] font-semibold text-xl md:text-2xl text-[#e6e1df]">{tr(p.name, p.nameThai)}</span>
                      </span>
                      <span className="block mt-2 md:mt-3 font-['Anuphan'] font-light text-sm md:text-base text-[#e3beb3]/85">{tr(n.en, n.th)}</span>
                      <span className="block mt-1 md:mt-2 font-['Anuphan'] text-[13px]" style={{ color: n.accent }}>{tr(n.feel.en, n.feel.th)}</span>
                      <span className="block mt-2 md:mt-4 font-['Anuphan'] text-[13px] text-[#e6e1df]/70">{tr('Order this roast', 'สั่งระดับคั่วนี้')} ›</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* 7 call to action */}
        <section ref={setRef(6)} className={`${scene} ${on(6)}`}>
          {bgSide(ASSETS.storyBag, '30% 62%', tr('A TATO Coffee bag beside a steaming cup on a café counter', 'ถุงกาแฟ TATO วางข้างถ้วยกาแฟร้อนบนเคาน์เตอร์'), <Smoke run={active >= 5} iw={784} ih={1168} pos={[0.3, 0.62]} preset="steam" emitters={CUP_EMITTERS} />)}
          <div className={`${grid} self-start mt-16 md:self-center md:mt-0`}>
            <div data-copy>
              <span className={label}>06 · {tr('Order', 'สั่งซื้อ')}</span>
              <h2 className={head}><Lines text={tr('From the mountain\nto your cup', 'ชิมจากดอย\nถึงถ้วยของคุณ')} base={100} /></h2>
              <p className={sub} style={delay(500)}>{tr('Roasted fresh to order. No minimum for cafés.', 'คั่วสดตามออเดอร์ ร้านกาแฟไม่มีขั้นต่ำ')}</p>
              <div className="tv-fade mt-8 flex flex-wrap gap-3" style={delay(700)}>
                <button onClick={() => onGoToProduct('medium')} className="tv-pulse px-6 py-3.5 rounded-full bg-[#ff5e1a] text-[#390c00] font-['Anuphan'] font-semibold text-base md:text-lg min-h-12 focus-visible:outline-2 focus-visible:outline-[#ffb59c] focus-visible:outline-offset-2">
                  {tr('Order fresh-roasted · 650 THB/kg', 'สั่งกาแฟคั่วสด 650 บาท/กก.')}
                </button>
                <a href={`/cafe/?src=${src}`} className="px-6 py-3.5 rounded-full border border-[#e6e1df]/70 text-[#e6e1df] font-['Anuphan'] font-semibold text-base md:text-lg min-h-12 inline-flex items-center focus-visible:outline-2 focus-visible:outline-[#ffb59c] focus-visible:outline-offset-2">
                  {tr('For cafés · 550 THB/kg', 'สำหรับร้านกาแฟ 550 บาท/กก.')}
                </a>
              </div>
              <p className="tv-fade mt-5 text-[13px] text-[#e3beb3]/70 font-['Anuphan']" style={delay(850)}>{tr('Prices exclude shipping. Questions? Call 064-293-6615.', 'ราคายังไม่รวมค่าส่ง สอบถามได้ที่ 064-293-6615')}</p>
              {onGoToDiscover && (
                <button onClick={onGoToDiscover} className="tv-fade mt-2 min-h-11 text-[14px] underline underline-offset-4 text-[#ffb59c] hover:text-[#e6e1df] font-['Anuphan']" style={delay(1000)}>{tr('Learn more about the coffee →', 'ดูรายละเอียดเกี่ยวกับกาแฟ →')}</button>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* sticky order bar */}
      {active < COUNT - 1 && (
      <div className="absolute bottom-0 inset-x-0 z-30 flex justify-center gap-2.5 px-3.5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-gradient-to-t from-[#0f0e0d]/90 to-transparent">
        <button onClick={() => onGoToProduct('medium')} className="flex-1 max-w-[280px] py-3 rounded-full bg-[#ff5e1a] text-[#390c00] font-['Anuphan'] font-semibold text-sm">{tr('Order · 650/kg', 'สั่งกาแฟ 650/กก.')}</button>
        <a href={`/cafe/?src=${src}`} className="flex-1 max-w-[280px] py-3 rounded-full text-center border border-[#5b4138] bg-[#0f0e0d]/60 text-[#e6e1df] font-['Anuphan'] font-semibold text-sm">{tr('Cafés · 550/kg', 'ร้านกาแฟ 550/กก.')}</a>
      </div>
      )}
      {debug && <FxDebug active={active} count={COUNT} />}
    </div>
  );
};