import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n';
import { ASSETS, ROAST_PROFILES } from '../data/coffeeData';
import { RoastType } from '../types';

interface StoryViewProps {
  onGoToProduct: (roast?: RoastType) => void;
}

// หน้าเล่าเรื่องแบบเลื่อนซ้าย-ขวา (scrollytelling) ที่ /doi-wiang/
// ใช้สี ฟอนต์ ของเว็บ และรูปใน ASSETS (coffeeData.ts) ไฟล์ภาพอยู่ที่ public/images/story/
// เนื้อหาใช้เฉพาะข้อเท็จจริงที่ตรงกับหน้าเว็บ: ไม่มีส่งฟรี ไม่มีใบรับรอง ไม่ระบุระยะเวลาคั่ว/ส่ง
// ภาพฉาก 1-6 เป็นภาพบรรยากาศจากคลังภาพฟรี ปรับโทนสีให้เป็นชุดเดียวกัน ไม่ใช่ภาพถ่ายจากไร่โดยตรง
// alt text จึงบรรยายสิ่งที่เห็นเฉยๆ ไม่อ้างว่าเป็นดอยเวียงผา ถ้าได้ภาพจริงให้เขียนทับไฟล์ชื่อเดิมได้เลย

const COUNT = 7;
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
.tv-ring{animation:tvring linear forwards}
@keyframes tvring{from{stroke-dashoffset:151}to{stroke-dashoffset:0}}
@media (prefers-reduced-motion:reduce){
  .tv-kb,.tv-mist,.tv-glow,.tv-pulse,.tv-nudge,.tv-ring{animation:none}
  .tv-line>span,.tv-fade,.tv-grow,.tv-card{transition:none}
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

export const StoryView: React.FC<StoryViewProps> = ({ onGoToProduct }) => {
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
  const TONES = { dim: 'opacity-45 brightness-[0.7] contrast-125', normal: 'opacity-65 brightness-[0.7] contrast-125', bright: 'opacity-85 brightness-[0.9] contrast-110' };
  const bg = (url: string, pos: string, alt: string, opts: { first?: boolean; tone?: keyof typeof TONES } = {}) => (
    <div className="absolute inset-0 z-0">
      <div data-par className="absolute inset-0">
        <img src={url} alt={alt} decoding="async" loading={opts.first ? 'eager' : 'lazy'} fetchPriority={opts.first ? 'high' : 'auto'}
          className={`tv-kb w-full h-full object-cover ${TONES[opts.tone ?? 'normal']}`} style={{ objectPosition: pos }} />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#141312] via-[#141312]/60 to-[#141312]/40" />
    </div>
  );
  // portrait photo: lower half of the screen on phones (so it never sits under the copy),
  // right-hand panel fading into the dark on wide screens (keeps the bag sharp and uncropped)
  const bgSide = (url: string, pos: string, alt: string) => (
    <div className="absolute inset-0 z-0">
      <div data-par className="absolute inset-x-0 bottom-0 h-[54%] md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-[52%] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000_32%)] md:[mask-image:linear-gradient(to_right,transparent,#000_16%)]">
        <img src={url} alt={alt} decoding="async" loading="lazy" className="tv-kb w-full h-full object-cover opacity-85 md:opacity-90" style={{ objectPosition: pos }} />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#141312]/50 via-transparent to-transparent md:from-[#141312]/60" />
    </div>
  );
  const glow = (cls: string) => <div className={`tv-glow pointer-events-none absolute rounded-full blur-3xl bg-[#ff5e1a]/25 ${cls}`} />;

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
          {bg(ASSETS.storyRidges, '50% 45%', tr('Layers of mountain ridges fading into haze', 'สันเขาซ้อนกันหลายชั้นจางหายไปในหมอก'), { tone: 'bright' })}
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
          {bg(ASSETS.storyCherries, '50% 50%', tr('Ripe coffee cherries on the branch', 'ผลกาแฟสุกบนกิ่ง'))}
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
        <section ref={setRef(3)} className={`${scene} ${on(3)}`}>
          {bg(ASSETS.storyDrying, '62% 55%', tr('Coffee beans drying on raised beds', 'เมล็ดกาแฟตากบนแคร่ยกพื้น'), { tone: 'bright' })}
          {glow('left-[30%] top-[10%] w-[520px] h-[520px]')}
          <div className={grid}>
            <div data-copy>
              <span className={label}>03 · Dried</span>
              <h2 className={head}><Lines text={tr('Dried on\nraised beds', 'ตากบน\nแคร่ยกพื้น')} base={100} /></h2>
              <p className={sub} style={delay(500)}>{tr('The beans are dried on raised beds before they reach our roaster.', 'เมล็ดถูกตากบนแคร่ยกพื้น ก่อนเดินทางมาถึงเครื่องคั่วของเรา')}</p>
            </div>
          </div>
        </section>

        {/* 5 roast to order */}
        <section ref={setRef(4)} className={`${scene} bg-[#141312] ${on(4)}`}>
          {bg(ASSETS.storyRoastPour, '50% 72%', tr('Freshly roasted beans pouring out of a drum roaster', 'เมล็ดกาแฟคั่วใหม่ไหลออกจากเครื่องคั่วแบบดรัม'), { tone: 'normal' })}
          <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-r from-[#141312]/85 via-[#141312]/40 to-transparent" />
          {glow('right-[10%] top-[20%] w-[480px] h-[480px]')}
          <div className={grid}>
            <div data-copy>
              <span className={label}>04 · Roasted</span>
              <h2 className={head}><Lines text={tr('We don’t roast stock.\nWe roast when\nyou order.', 'เราไม่คั่วสต็อก\nเราคั่วเมื่อคุณสั่ง')} base={100} /></h2>
              <p className={sub} style={delay(600)}>{tr('Every order is roasted to order.', 'ทุกออเดอร์คั่วตามคำสั่งซื้อ')}</p>
            </div>
          </div>
        </section>

        {/* 6 roast levels -> opens the real order flow */}
        <section ref={setRef(5)} className={`${scene} bg-[#0f0e0d] pt-16 md:pt-0 ${on(5)}`}>
          {bg(ASSETS.storyRoastDrum, '60% 50%', tr('Roasted coffee beans turning in a drum roaster', 'เมล็ดกาแฟคั่วหมุนอยู่ในเครื่องคั่วแบบดรัม'), { tone: 'dim' })}
          {glow('left-[-5%] bottom-[0%] w-[460px] h-[460px]')}
          <div data-copy className="relative z-10 w-full max-w-6xl">
            <div className="md:flex md:items-end md:justify-between md:gap-10">
              <div>
                <span className={label}>05 · Roasts</span>
                <h2 className={`${head} !text-[7.4vw] sm:!text-5xl lg:!text-[56px] xl:!text-[64px]`}><Lines text={tr('Choose the cup\nyou want', 'เลือกได้ว่า\nอยากได้ถ้วยแบบไหน')} base={100} /></h2>
              </div>
              <img src={ASSETS.storyBeansTrio} alt={tr('Light, medium and dark roasted beans side by side', 'เมล็ดกาแฟคั่วอ่อน กลาง เข้ม เรียงข้างกัน')} decoding="async" loading="lazy"
                className="tv-fade hidden md:block shrink-0 w-[300px] lg:w-[360px] pointer-events-none" style={delay(600)} />
            </div>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-5">
              {(['light', 'medium', 'dark'] as RoastType[]).map((id, i) => {
                const p = ROAST_PROFILES.find((r) => r.id === id)!;
                const n = ROAST_NOTES[id];
                return (
                  <button key={id} onClick={() => onGoToProduct(id)} style={{ ...delay(450 + i * 160), borderTop: `3px solid ${n.accent}` }}
                    onPointerEnter={() => { hover.current = true; }} onPointerLeave={() => { hover.current = false; }}
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
          {bgSide(ASSETS.storyBag, '30% 62%', tr('A TATO Coffee bag beside a steaming cup on a café counter', 'ถุงกาแฟ TATO วางข้างถ้วยกาแฟร้อนบนเคาน์เตอร์'))}
          <div className={`${grid} self-start mt-16 md:self-center md:mt-0`}>
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

      {/* sticky order bar */}
      <div className="absolute bottom-0 inset-x-0 z-30 flex justify-center gap-2.5 px-3.5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-gradient-to-t from-[#0f0e0d]/90 to-transparent">
        <button onClick={() => onGoToProduct('medium')} className="flex-1 max-w-[280px] py-3 rounded-full bg-[#ff5e1a] text-[#390c00] font-['Anuphan'] font-semibold text-sm">{tr('Order · 650/kg', 'สั่งกาแฟ 650/กก.')}</button>
        <a href={`/cafe/?src=${src}`} className="flex-1 max-w-[280px] py-3 rounded-full text-center border border-[#5b4138] bg-[#0f0e0d]/60 text-[#e6e1df] font-['Anuphan'] font-semibold text-sm">{tr('Cafés · 550/kg', 'ร้านกาแฟ 550/กก.')}</a>
      </div>
    </div>
  );
};
