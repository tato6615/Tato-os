import React, { useState, useEffect, useRef } from 'react';
import { useLanguage, translateText } from '../i18n';
import { RoastType } from '../types';
import { ASSETS, BAG_IMAGES, ROAST_PROFILES } from '../data/coffeeData';
import { PRICE_RETAIL, PRICE_CAFE, ELEVATION_M, MIN_ORDER_KG } from '../data/siteFacts';

interface DiscoverViewProps {
  onGoToProduct: (preselectedRoast?: RoastType) => void;
  onGoToStory?: () => void;
}

// Short "good for" hint shown as the card badge (general roast guidance; owner may edit the wording).
const BEST_FOR: Record<RoastType, { th: string; en: string }> = {
  dark: { th: 'เหมาะกับนมและลาเต้', en: 'GOOD WITH MILK' },
  medium: { th: 'ชงได้หลายแบบ', en: 'ALL-ROUNDER' },
  light: { th: 'เหมาะกับดริป', en: 'GOOD FOR POUR-OVER' },
};

const SENSORY_METRICS: Record<RoastType, { acidity: number; sweetness: number; body: number; aroma: number; bestBrew: { th: string; en: string } }> = {
  light: {
    acidity: 92,
    sweetness: 76,
    body: 55,
    aroma: 96,
    bestBrew: { th: 'ดริป / Pour-over / Aeropress (เน้นกลิ่นดอกมะลิและผลไม้ซิตรัส)', en: 'Pour-over / Aeropress (Accentuates jasmine floral & citrus notes)' },
  },
  medium: {
    acidity: 65,
    sweetness: 92,
    body: 82,
    aroma: 88,
    bestBrew: { th: 'Moka pot / Espresso / ดริป (กลมกล่อม คาราเมล พลัมสุก น้ำผึ้งป่า)', en: 'Moka pot / Espresso / Filter (Balanced caramel & wild honey sweetness)' },
  },
  dark: {
    acidity: 25,
    sweetness: 72,
    body: 96,
    aroma: 92,
    bestBrew: { th: 'Espresso / เครื่องชง / ลาเต้นม (เข้มข้น ดาร์กโกโก้ แมคคาเดเมียคั่ว)', en: 'Espresso machine / Milk lattes (Deep roasted macadamia & dark cocoa)' },
  },
};

const ElevationCounter: React.FC<{ target?: number }> = ({ target = ELEVATION_M }) => {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasStarted) {
          setHasStarted(true);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasStarted]);

  useEffect(() => {
    if (!hasStarted) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVal(target);
      return;
    }
    const duration = 1800;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(ease * target));
      if (p < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [hasStarted, target]);

  return <span ref={ref}>{val.toLocaleString('en-US')} m</span>;
};

export const DiscoverView: React.FC<DiscoverViewProps> = ({ onGoToProduct, onGoToStory }) => {
  const [selectedRoast, setSelectedRoast] = useState<RoastType>('medium');
  const { language } = useLanguage();
  const tr = (en: string, th: string) => language === 'th' ? th : en;

  // Scroll reveal setup
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.reveal-init').forEach((el) => el.classList.add('reveal-active'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-active');
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    const elements = document.querySelectorAll('.reveal-init');
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const currentSensory = SENSORY_METRICS[selectedRoast];
  const activeProfile = ROAST_PROFILES.find((p) => p.id === selectedRoast) || ROAST_PROFILES[1];

  return (
    <div className="flex flex-col w-full pb-20 md:pb-0 overflow-hidden">
      {/* ==================== HERO SECTION ==================== */}
      <section className="relative w-full min-h-[92vh] flex items-center justify-center -mt-20 overflow-hidden bg-[#0f0e0d]">
        {/* Atmospheric Highland Aerial Background with Slow Ken Burns Drift */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <img
            src={ASSETS.highlandAerial}
            alt="Doi Wiang highland coffee plantation enveloped in morning sea of mist at sunrise"
            className="w-full h-full object-cover object-center scale-105 opacity-65 filter brightness-[0.7] contrast-125 animate-ken-burns"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#141312] via-[#141312]/60 to-[#141312]/40" />
          <div className="absolute inset-0 bg-radial from-transparent via-[#141312]/30 to-[#0f0e0d]" />
          {/* Subtle warm center glow */}
          <div className="absolute top-1/2 left-1/2 w-[500px] h-[300px] bg-[#ff5e1a]/15 rounded-full blur-[120px] pointer-events-none animate-warm-pulse" />
        </div>

        {/* Hero Content Envelope */}
        <div className="relative z-10 max-w-[1440px] w-full mx-auto px-5 md:px-10 lg:px-20 pt-32 pb-16 flex flex-col items-center text-center">
          {/* Monogram Tag with live pulsing beacon */}
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-[#2b2a28]/80 backdrop-blur-md shadow-lg mb-6 border border-[#5b4138]/50 animate-page-enter">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff5e1a] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff5e1a]"></span>
            </span>
            <span className="font-mono text-[11px] text-[#f3bc8b] uppercase tracking-[0.18em] font-medium">
              Single-Origin Terroir Reserve · 1,500 MASL
            </span>
          </div>

          {/* Core Display Headline with Staggered Entrance */}
          <h1 className="font-['Manrope'] text-4xl sm:text-6xl md:text-7xl lg:text-[76px] font-semibold text-[#e6e1df] uppercase tracking-tight max-w-4xl drop-shadow-2xl leading-[1.08] animate-stagger-1">
            KNOW YOUR COFFEE.
          </h1>

          {/* Supporting Spec Note */}
          <p className="mt-4 font-['Manrope'] text-base md:text-lg text-[#e3beb3]/90 max-w-xl font-light animate-stagger-2">
            Single Origin • Doi Wiang Pa, Chiang Mai
          </p>

          {/* Audience line: tells café owners this site is for them too */}
          <p className="mt-3 font-['Manrope'] text-sm md:text-base text-[#e3beb3]/80 max-w-xl animate-stagger-2">
            {tr('Fresh-roasted beans for cafés and home brewers.', 'เมล็ดคั่วสดสำหรับร้านกาแฟและดื่มที่บ้าน')}{' '}
            <a
              href="/cafe/?src=site-hero-line"
              className="text-[#ff5e1a] font-semibold underline underline-offset-4 hover:text-[#ffb59c] transition-colors"
            >
              {tr('Café owner? See café pricing →', 'เป็นร้านกาแฟ? ดูราคาและสั่งครั้งแรก →')}
            </a>
          </p>

          {/* Primary Action CTA with interactive micro-motion */}
          <div className="mt-8 flex flex-col sm:flex-row flex-wrap justify-center items-center gap-3.5 animate-stagger-3">
            <button
              onClick={() => onGoToProduct(selectedRoast)}
              className="group flex items-center justify-center gap-2 bg-[#ff5e1a] text-[#390c00] hover:text-[#ffdbcf] hover:bg-[#822800] px-8 py-3.5 rounded-full font-['Manrope'] text-[12px] font-bold tracking-[0.14em] uppercase transition-all duration-300 shadow-[0_12px_32px_rgba(255,94,26,0.35)] hover-lift-subtle interactive-press animate-pulse-glow"
            >
              <span>{tr('ORDER NOW', 'สั่งซื้อเลย')}</span>
              <span className="material-symbols-outlined text-[16px] transition-transform duration-300 group-hover:translate-x-0.5">shopping_bag</span>
            </button>

            {onGoToStory && (
              <button
                onClick={onGoToStory}
                className="group flex items-center justify-center gap-2 px-7 py-3.5 rounded-full font-['Manrope'] text-[12px] font-bold tracking-[0.14em] uppercase text-[#ffdcc0] bg-[#2b2a28]/70 hover:bg-[#363433] border border-[#5b4138]/60 transition-all duration-300 hover-lift-subtle interactive-press"
              >
                <span className="material-symbols-outlined text-[18px] text-[#ffb59c]">landscape</span>
                <span>{tr('STORY JOURNEY', 'เรื่องราวดอยเวียงผา')}</span>
              </button>
            )}

            <button
              onClick={() => scrollToSection('origin')}
              className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-full font-['Manrope'] text-[12px] font-bold tracking-[0.14em] uppercase text-[#e6e1df] transition-all duration-300 hover:text-[#ff5e1a] hover:bg-[#2b2a28]/60 border border-[#5b4138]/40 hover-lift-subtle interactive-press"
            >
              <span>EXPLORE TATO</span>
              <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
            </button>

            <a
              href="/cafe/calculator/?src=site-hero"
              aria-label={tr('Calculate cost per cup', 'คำนวณต้นทุนกาแฟต่อแก้ว')}
              className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-full font-['Manrope'] text-[12px] font-bold tracking-[0.14em] uppercase text-[#ff5e1a] transition-all duration-300 hover:bg-[#ff5e1a]/10 border border-[#ff5e1a]/60 hover-lift-subtle interactive-press"
            >
              <span className="material-symbols-outlined text-[20px]">calculate</span>
              <span>{tr('Cost per cup', 'คำนวณต้นทุนกาแฟ')}</span>
            </a>
          </div>
        </div>
      </section>

      {/* ==================== 01 / ORIGIN SECTION ==================== */}
      <section className="relative w-full py-20 md:py-24 bg-[#141312]" id="origin">
        <div className="max-w-[1440px] mx-auto px-5 md:px-10 lg:px-20">
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4 reveal-init">
            <div>
              <span className="font-mono text-[12px] text-[#ffb59c] uppercase tracking-widest block mb-1">
                01 / ORIGIN
              </span>
              <h2 className="font-['Manrope'] text-3xl md:text-5xl font-medium text-[#e6e1df] tracking-tight uppercase">
                FROM DOI WIANG.
              </h2>
              <p className="text-[20px] text-[#f3bc8b] font-light mt-1 font-['Anuphan']">
                จากแหล่งกำเนิดบนดอยเวียง
              </p>
            </div>
            <p className="font-['Manrope'] text-[15px] leading-relaxed text-[#e3beb3]/80 max-w-md">
              {tr(
                'Grown in the cool highlands of Doi Wiang Pa, Chiang Mai.',
                'ปลูกบนที่สูงอากาศเย็นของดอยเวียงผา จังหวัดเชียงใหม่'
              )}
            </p>
          </div>

          {/* Terroir Interactive Card & Metrics Mosaic */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Large Terroir Visual Card (7 Cols) */}
            <div className="lg:col-span-7 group relative rounded-xl overflow-hidden shadow-2xl bg-[#0f0e0d] min-h-[440px] flex flex-col justify-end p-8 md:p-10 border border-[#2b2a28] reveal-init">
              <img
                src={ASSETS.highlandAerial}
                alt="Aerial panoramic view of misty mountain slopes and Arabica estate"
                className="absolute inset-0 w-full h-full object-cover object-center filter brightness-[0.75] contrast-110 transition-transform duration-700 ease-out group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f0e0d] via-[#0f0e0d]/50 to-transparent" />

              {/* Terroir Badges on Image */}
              <div className="relative z-10 flex flex-wrap items-center gap-2 mb-3">
                <span className="px-3 py-1 rounded bg-[#0f0e0d]/85 backdrop-blur-md font-mono text-[11px] text-[#ffdbcf] border border-white/10">
                  19.824° N, 99.782° E
                </span>
                <span className="px-3 py-1 rounded bg-[#0f0e0d]/85 backdrop-blur-md font-mono text-[11px] text-[#f3bc8b] border border-white/10">
                  {tr('DOI WIANG ESTATE', 'ไร่ดอยเวียง')}
                </span>
              </div>

              <h3 className="relative z-10 font-['Manrope'] text-xl md:text-2xl font-semibold text-[#e6e1df] max-w-lg mb-2">
                Highland Cloud Mist & Shade-Grown Microclimate
              </h3>
              <p className="relative z-10 font-['Manrope'] text-[14px] text-[#e3beb3]/80 max-w-md leading-relaxed">
                The distinct diurnal temperature shift at 1,500 MASL concentrates organic sugars deep within each coffee bean.
              </p>
            </div>

            {/* 3 Terroir Metrics Split Panel (5 Cols) */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {/* Metric 1: Elevation with Animated Count */}
              <div className="flex-1 bg-[#1d1b1a] rounded-xl p-6 flex flex-col justify-center transition-all duration-300 hover:bg-[#211f1e] border border-[#2b2a28] shadow-md hover-lift reveal-init">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="font-['Manrope'] text-[11px] font-bold text-[#e3beb3]/70 uppercase tracking-widest">
                    ELEVATION
                  </span>
                  <span className="material-symbols-outlined text-[#ffb59c] text-[20px] animate-bounce">filter_hdr</span>
                </div>
                <div className="font-['Manrope'] text-[46px] md:text-[52px] leading-tight text-[#ffb59c] font-bold tracking-tight">
                  <ElevationCounter target={ELEVATION_M} />
                </div>
                <p className="font-['Manrope'] text-[13px] text-[#e3beb3]/70 mt-1">
                  High-altitude cool air slows photosynthesis, dense bean structure.
                </p>
              </div>

              {/* Metric 2: Purity */}
              <div className="flex-1 bg-[#1d1b1a] rounded-xl p-6 flex flex-col justify-center transition-all duration-300 hover:bg-[#211f1e] border border-[#2b2a28] shadow-md hover-lift reveal-init">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="font-['Manrope'] text-[11px] font-bold text-[#e3beb3]/70 uppercase tracking-widest">
                    PURITY
                  </span>
                  <span className="material-symbols-outlined text-[#f3bc8b] text-[20px]">verified</span>
                </div>
                <div className="font-['Manrope'] text-[36px] md:text-[42px] leading-tight text-[#e6e1df] font-bold tracking-tight">
                  Arabica 100%
                </div>
                <p className="font-['Manrope'] text-[13px] text-[#e3beb3]/70 mt-1">
                  {tr('Single-estate Arabica from one origin. No blends.', 'อาราบิก้าจากแหล่งปลูกเดียว ไม่ผสมแหล่งอื่น')}
                </p>
              </div>

              {/* Metric 3: Terroir */}
              <div className="flex-1 bg-[#1d1b1a] rounded-xl p-6 flex flex-col justify-center transition-all duration-300 hover:bg-[#211f1e] border border-[#2b2a28] shadow-md hover-lift reveal-init">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="font-['Manrope'] text-[11px] font-bold text-[#e3beb3]/70 uppercase tracking-widest">
                    TERROIR
                  </span>
                  <span className="material-symbols-outlined text-[#e3beb3] text-[20px]">terrain</span>
                </div>
                <div className="font-['Manrope'] text-[24px] md:text-[28px] leading-tight text-[#ffdcc0] font-semibold">
                  Chiang Mai Highlands
                </div>
                <p className="font-['Manrope'] text-[13px] text-[#e3beb3]/70 mt-1">
                  Rich forest humus soil, continuous shade canopies, clean alpine spring water.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== 02 / BEAN SECTION ==================== */}
      <section className="relative w-full py-20 md:py-24 bg-[#0f0e0d]">
        <div className="max-w-[1440px] mx-auto px-5 md:px-10 lg:px-20">
          {/* Section Tag & Title */}
          <div className="mb-12">
            <span className="font-mono text-[12px] text-[#ffb59c] uppercase tracking-widest block mb-1">
              02 / BEAN
            </span>
            <h2 className="font-['Manrope'] text-3xl md:text-5xl font-medium text-[#e6e1df] tracking-tight uppercase">
              BEFORE THE ROAST.
            </h2>
            <p className="text-[20px] text-[#f3bc8b] font-light mt-1 font-['Anuphan']">
              ก่อนเข้าสู่การคั่ว
            </p>
          </div>

          {/* Asymmetrical Editorial 2-Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
            {/* Tactile Slate Visual with Roasted & Cherry Contrast (6 Cols) */}
            <div className="lg:col-span-6 relative">
              <div className="relative rounded-xl overflow-hidden shadow-2xl bg-[#211f1e] border border-[#2b2a28]">
                <img
                  src={ASSETS.cherriesAndBeans}
                  alt="Fresh deep crimson coffee cherries alongside artisanal roasted beans resting on matte dark slate"
                  className="w-full h-[460px] md:h-[520px] object-cover object-center transform transition-transform duration-700 hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0f0e0d]/80 via-transparent to-transparent" />
              </div>

              {/* Overlapping Micro Terroir Floating Badge */}
              <div className="absolute -bottom-5 -right-3 bg-[#2b2a28]/95 backdrop-blur-md p-4 rounded-lg shadow-2xl max-w-xs border border-[#5b4138]/50 hidden sm:block">
                <div className="flex items-center gap-1.5 text-[#ffb59c] mb-1">
                  <span className="material-symbols-outlined text-[18px]">eco</span>
                  <span className="font-mono text-[11px] tracking-widest font-semibold uppercase">
                    Selective Hand-Pick
                  </span>
                </div>
                <p className="font-['Manrope'] text-[13px] text-[#e3beb3]/80 leading-normal">
                  {tr('Ripe cherries are picked by hand, selected for quality.', 'เก็บผลเชอร์รี่สุกด้วยมือ คัดเฉพาะผลที่คุณภาพดี')}
                </p>
              </div>
            </div>

            {/* Editorial Content Column (6 Cols) */}
            <div className="lg:col-span-6 space-y-8">
              <div>
                <h3 className="font-['Manrope'] text-2xl md:text-3xl text-[#e6e1df] font-semibold tracking-tight">
                  {tr('Careful Selection. Clean Cup.', 'คัดเลือกพิถีพิถัน เพื่อรสที่สะอาด')}
                </h3>
                <p className="mt-4 font-['Manrope'] text-base md:text-lg text-[#e3beb3]/80 font-light leading-relaxed">
                  {tr(
                    'Every bean tells the story of Doi Wiang’s soil. We select ripe cherries and process them with care, then roast to order.',
                    'ทุกเมล็ดบอกเรื่องราวของผืนดินดอยเวียง เราคัดผลสุกและแปรรูปอย่างพิถีพิถัน แล้วคั่วสดตามออเดอร์'
                  )}
                </p>
              </div>

              {/* Feature Breakdown Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-[#211f1e] p-5 rounded-lg border border-[#2b2a28] shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-[#67401a] flex items-center justify-center mb-3 text-[#ffdcc0]">
                    <span className="material-symbols-outlined text-[18px]">water_drop</span>
                  </div>
                  <h4 className="font-['Manrope'] text-[17px] text-[#e6e1df] font-medium">
                    {tr('Careful Processing', 'แปรรูปอย่างพิถีพิถัน')}
                  </h4>
                  <p className="font-['Manrope'] text-[13px] text-[#e3beb3]/75 mt-1 leading-normal">
                    {tr('Cherries are processed with attention to cleanliness and consistency.', 'แปรรูปโดยใส่ใจความสะอาดและความสม่ำเสมอของเมล็ด')}
                  </p>
                </div>

                <div className="bg-[#211f1e] p-5 rounded-lg border border-[#2b2a28] shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-[#ff5e1a]/20 flex items-center justify-center mb-3 text-[#ff5e1a]">
                    <span className="material-symbols-outlined text-[18px]">wb_sunny</span>
                  </div>
                  <h4 className="font-['Manrope'] text-[17px] text-[#e6e1df] font-medium">
                    Raised Solar Beds
                  </h4>
                  <p className="font-['Manrope'] text-[13px] text-[#e3beb3]/75 mt-1 leading-normal">
                    {tr('Dried slowly on raised beds to help keep flavor even.', 'ตากช้าๆ บนแคร่ยกสูงเพื่อให้รสชาติสม่ำเสมอ')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== 03 / ROAST SECTION ==================== */}
      <section className="relative w-full py-20 md:py-24 bg-[#141312]" id="roasts">
        <div className="max-w-[1440px] mx-auto px-5 md:px-10 lg:px-20">
          {/* Section Header */}
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="font-mono text-[12px] text-[#ffb59c] uppercase tracking-widest block mb-1">
              03 / ROAST
            </span>
            <h2 className="font-['Manrope'] text-3xl md:text-5xl font-medium text-[#e6e1df] tracking-tight uppercase">
              ROAST PROFILES.
            </h2>
            <div className="flex items-center justify-center gap-2 mt-2 font-['Manrope'] text-[11px] font-bold tracking-widest uppercase">
              <span className="text-[#ffdcc0]">DARK</span>
              <span className="text-[#5b4138]">/</span>
              <span className="text-[#f3bc8b]">MEDIUM</span>
              <span className="text-[#5b4138]">/</span>
              <span className="text-[#ffb59c]">LIGHT</span>
            </div>
            <p className="font-['Anuphan'] text-[16px] text-[#e3beb3]/80 mt-3">
              คัดสรรระดับการคั่วที่ดึงรสชาติเฉพาะตัวออกมาอย่างสมบูรณ์แบบ
            </p>
          </div>

          {/* 3 Interactive Roast Profile Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {ROAST_PROFILES.map((profile) => {
              const isSelected = selectedRoast === profile.id;
              return (
                <div
                  key={profile.id}
                  onClick={() => setSelectedRoast(profile.id)}
                  className={`cursor-pointer rounded-xl p-6 md:p-8 flex flex-col justify-between transition-all duration-300 shadow-xl relative overflow-hidden border hover-lift active:scale-[0.98] ${
                    isSelected
                      ? 'bg-[#2b2a28] border-[#ff5e1a] transform -translate-y-2 shadow-[0_16px_36px_-8px_rgba(255,94,26,0.25)]'
                      : 'bg-[#1d1b1a] border-[#2b2a28] hover:bg-[#211f1e] hover:border-[#ff5e1a]/40'
                  }`}
                >
                  <div
                    className={`absolute top-0 left-0 right-0 h-1 transition-all ${
                      isSelected ? 'bg-[#ff5e1a]' : 'bg-[#363433]'
                    }`}
                  />
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span
                        className={`font-mono text-[11px] px-2.5 py-1 rounded ${
                          profile.isBestseller
                            ? 'bg-[#ff5e1a] text-[#390c00] font-semibold'
                            : 'bg-[#67401a]/50 text-[#f3bc8b]'
                        }`}
                      >
                        {profile.isBestseller
                          ? (language === 'th' ? 'แนะนำ' : 'RECOMMENDED')
                          : (language === 'th' ? BEST_FOR[profile.id].th : BEST_FOR[profile.id].en)}
                      </span>
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/20"
                        style={{ backgroundColor: profile.colorHex }}
                      />
                    </div>

                    <h3 className="font-['Manrope'] text-2xl md:text-3xl text-[#e6e1df] font-bold">
                      {language === 'th' ? profile.nameThai : profile.name}
                    </h3>
                    <p className="text-[17px] text-[#f3bc8b] font-light mt-0.5 font-['Anuphan']">
                      {translateText(profile.subtitle, language)}
                    </p>
                    <p className="font-['Manrope'] text-[13px] text-[#e3beb3]/80 mt-4 leading-relaxed">
                      {translateText(profile.description, language)}
                    </p>

                    {/* Flavor Attributes Pill Tag */}
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {profile.notes.map((note) => (
                        <span
                          key={translateText(note, language)}
                          className="font-mono text-[11px] px-2.5 py-1 rounded bg-[#211f1e] text-[#e3beb3] border border-[#363433]"
                        >
                          {note}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Price + what you get */}
                  <div className="mt-6">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-['Manrope'] text-3xl font-bold text-[#e6e1df]">{PRICE_RETAIL}</span>
                      <span className="font-['Anuphan'] text-[14px] text-[#e3beb3]">
                        {language === 'th' ? 'บาท ต่อ กก.' : 'THB per kg'}
                      </span>
                    </div>
                    <p className="font-['Anuphan'] text-[13px] text-[#e3beb3]/70 mt-1">
                      {language === 'th'
                        ? 'คั่วสดตามออเดอร์ · เลือกเมล็ดหรือบดได้'
                        : 'Roasted to order · whole bean or ground'}
                    </p>
                  </div>

                  {/* Roast Density Level Meter */}
                  <div className="mt-5 pt-4 border-t border-[#363433]/50 space-y-2">
                    <div className="flex justify-between font-mono text-[11px] text-[#e3beb3]/70">
                      <span>{language === 'th' ? 'ความเข้มของการคั่ว' : 'ROAST INTENSITY'}</span>
                      <span className="text-[#ff5e1a] font-bold">{profile.intensityDisplay}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[#363433] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${profile.barColor}`}
                        style={{ width: `${(profile.intensity / profile.intensityMax) * 100}%` }}
                      />
                    </div>

                    {/* Quick Order Button */}
                    <div className="pt-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onGoToProduct(profile.id);
                        }}
                        className={`w-full py-3.5 px-4 rounded-lg font-['Anuphan'] text-[15px] font-bold transition-all flex items-center justify-center gap-2 border ${
                          isSelected
                            ? 'bg-[#ff5e1a] border-[#ff5e1a] text-[#390c00] hover:bg-[#ff7a40]'
                            : 'bg-transparent border-[#ff5e1a]/70 text-[#ffb59c] hover:bg-[#ff5e1a] hover:text-[#390c00]'
                        }`}
                      >
                        <span>{language === 'th' ? 'สั่งคั่วนี้' : 'ORDER THIS ROAST'}</span>
                        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive Cup Sensory Visualizer & Brewing Guide */}
          <div className="mt-10 p-6 md:p-8 rounded-2xl bg-[#1d1b1a] border border-[#2b2a28] shadow-2xl reveal-init">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#2b2a28]">
              <div>
                <span className="font-mono text-[11px] text-[#ff5e1a] tracking-widest uppercase font-semibold block mb-1">
                  INTERACTIVE SENSORY RADAR · {activeProfile.name.toUpperCase()}
                </span>
                <h4 className="font-['Manrope'] text-xl md:text-2xl text-[#e6e1df] font-bold">
                  {language === 'th' ? `โปรไฟล์รสชาติ: กาแฟคั่ว${activeProfile.nameThai}` : `Cup Profile: ${activeProfile.name}`}
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[#e3beb3]/70 font-mono">{tr('RECOMMENDED BREW:', 'เหมาะกับวิธีชง:')}</span>
                <span className="px-3 py-1.5 rounded-lg bg-[#211f1e] text-[#ffdcc0] font-['Anuphan'] text-[13px] border border-[#363433]">
                  {language === 'th' ? currentSensory.bestBrew.th : currentSensory.bestBrew.en}
                </span>
              </div>
            </div>

            {/* 4 Animated Flavor Progress Bars */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-6">
              {/* Acidity Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[#e3beb3]/80">{tr('BRIGHT ACIDITY', 'ความเปรี้ยวผลไม้')}</span>
                  <span className="text-[#ffb59c] font-bold">{currentSensory.acidity}%</span>
                </div>
                <div className="h-2 w-full bg-[#141312] rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#ffb59c] to-[#ff5e1a] transition-all duration-700 ease-out"
                    style={{ width: `${currentSensory.acidity}%` }}
                  />
                </div>
              </div>

              {/* Sweetness Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[#e3beb3]/80">{tr('NATURAL SWEETNESS', 'ความหวานธรรมชาติ')}</span>
                  <span className="text-[#f3bc8b] font-bold">{currentSensory.sweetness}%</span>
                </div>
                <div className="h-2 w-full bg-[#141312] rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#f3bc8b] to-[#ff9b66] transition-all duration-700 ease-out"
                    style={{ width: `${currentSensory.sweetness}%` }}
                  />
                </div>
              </div>

              {/* Body Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[#e3beb3]/80">{tr('MOUTHFEEL / BODY', 'บอดี้ความเข้ม')}</span>
                  <span className="text-[#ffdbcf] font-bold">{currentSensory.body}%</span>
                </div>
                <div className="h-2 w-full bg-[#141312] rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#822800] to-[#ff5e1a] transition-all duration-700 ease-out"
                    style={{ width: `${currentSensory.body}%` }}
                  />
                </div>
              </div>

              {/* Aroma Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[#e3beb3]/80">{tr('AROMATICS & NOTES', 'กลิ่นหอมอโรม่า')}</span>
                  <span className="text-[#ffdcc0] font-bold">{currentSensory.aroma}%</span>
                </div>
                <div className="h-2 w-full bg-[#141312] rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#ffdcc0] to-[#ffb59c] transition-all duration-700 ease-out"
                    style={{ width: `${currentSensory.aroma}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== 04 / PRODUCT SECTION ==================== */}
      <section className="relative w-full py-20 md:py-24 bg-[#0f0e0d] overflow-hidden">
        <div className="max-w-[1440px] mx-auto px-5 md:px-10 lg:px-20">
          {/* Section Header */}
          <div className="mb-12">
            <span className="font-mono text-[12px] text-[#ffb59c] uppercase tracking-widest block mb-1">
              04 / PRODUCT
            </span>
            <h2 className="font-['Manrope'] text-3xl md:text-5xl font-medium text-[#e6e1df] tracking-tight uppercase">
              MEET TATO.
            </h2>
            <p className="text-[20px] text-[#f3bc8b] font-light mt-1 font-['Anuphan']">
              {tr('Single-origin Arabica, roasted to order', 'อาราบิก้าสายพันธุ์เดียว คั่วสดตามออเดอร์')}
            </p>
          </div>

          {/* Bento Product Display Showcase */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center bg-[#1d1b1a] rounded-2xl p-6 md:p-12 border border-[#2b2a28] shadow-2xl">
            {/* Luxury Matte Black Pouch Image Presentation (6 Cols) */}
            <div className="lg:col-span-6 relative flex items-center justify-center">
              <div className="relative w-full max-w-md rounded-xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.85)] group border border-[#2b2a28]">
                <img
                  src={BAG_IMAGES.medium.scene}
                  alt="TATO Coffee bag with roasted coffee beans on burlap"
                  className="w-full h-auto object-cover transform transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0f0e0d]/60 via-transparent to-transparent pointer-events-none" />
              </div>
            </div>

            {/* Product Specs & Narrative (6 Cols) */}
            <div className="lg:col-span-6 space-y-6">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[#ff5e1a] font-mono text-[11px] uppercase tracking-widest mb-2 font-semibold">
                  <span className="material-symbols-outlined text-[16px]">local_fire_department</span>
                  <span>{tr('Roasted Fresh To Order', 'คั่วสดตามออเดอร์')}</span>
                </div>
                <h3 className="font-['Manrope'] text-2xl md:text-3xl text-[#e6e1df] font-semibold tracking-tight">
                  Roasted Fresh To Order. Peak Aromatics.
                </h3>
                <p className="mt-3 font-['Anuphan'] text-[15px] md:text-[16px] text-[#e3beb3]/80 leading-relaxed">
                  คั่วสดใหม่ทุกออเดอร์ เพื่อให้คุณได้ดื่มกาแฟในจุดที่รสชาติและกลิ่นหอมสมบูรณ์ที่สุด บรรจุในถุงฟอยล์กันความชื้นแบบมีวาล์วทางเดียว (One-way Degassing Valve) เพื่อช่วยรักษากลิ่นหอมของเมล็ด
                </p>
              </div>

              {/* Feature Bullets */}
              <div className="space-y-2.5 font-['Manrope'] text-[14px] text-[#e6e1df]">
                <div className="flex items-center gap-3 p-3 bg-[#211f1e] rounded-lg border border-[#2b2a28]">
                  <span className="material-symbols-outlined text-[#f3bc8b] text-[20px]">check_circle</span>
                  <span>เลือกขนาดบดตามอุปกรณ์สกัด (Espresso, Filter, Whole Bean)</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-[#211f1e] rounded-lg border border-[#2b2a28]">
                  <span className="material-symbols-outlined text-[#ffb59c] text-[20px]">check_circle</span>
                  <span>Single Origin จากดอยเวียงผา เชียงใหม่ ไม่ผสมแหล่งอื่น</span>
                </div>
              </div>

              {/* CTA to Product Page */}
              <div className="pt-2 flex flex-wrap items-center gap-4">
                <button
                  onClick={() => onGoToProduct(selectedRoast)}
                  className="flex items-center gap-2 bg-[#ff5e1a] text-[#390c00] hover:text-[#ffdbcf] hover:bg-[#822800] px-8 py-3.5 rounded-full font-['Manrope'] text-[12px] font-bold tracking-widest uppercase transition-all duration-300 shadow-[0_12px_24px_rgba(255,94,26,0.3)] active:scale-95"
                >
                  <span>VIEW COFFEE</span>
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </button>
                <span className="font-mono text-[12px] text-[#e3beb3]/70">
                  {tr(`Minimum order ${MIN_ORDER_KG} kg, in ${MIN_ORDER_KG} kg steps`, `สั่งขั้นต่ำ ${MIN_ORDER_KG} กก. เพิ่มครั้งละ ${MIN_ORDER_KG} กก.`)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* ==================== CAFE OWNERS SECTION ==================== */}
      <section className="relative w-full py-16 md:py-20 bg-[#0f0e0d] border-t border-[#5b4138]/30" id="for-cafes">
        <div className="max-w-[1440px] mx-auto px-5 md:px-10 lg:px-20">
          <div className="max-w-2xl">
            <h2 className="font-['Manrope'] text-2xl md:text-3xl font-bold text-[#e6e1df] leading-tight">
              {tr('Own a café? Know your cost per cup first', 'มีร้านกาแฟ? รู้ต้นทุนต่อแก้วก่อน')}
            </h2>
            <p className="mt-4 text-[#e3beb3]/80 leading-relaxed">
              {tr(
                `Tell us about your café. First order is ${PRICE_CAFE} THB/kg with no minimum, shipping not included.`,
                `บอกเราเกี่ยวกับร้านของคุณ หรือสั่งครั้งแรกได้เลยที่ ${PRICE_CAFE} บาท/กก. ไม่มีขั้นต่ำ ยังไม่รวมค่าส่ง`
              )}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <a
                href="/cafe/calculator/?src=site-home"
                className="inline-flex items-center justify-center gap-2 bg-[#ff5e1a] text-[#390c00] hover:bg-[#822800] hover:text-[#ffdbcf] px-8 py-3.5 rounded-full font-['Manrope'] text-[12px] font-bold tracking-[0.14em] uppercase transition-colors"
              >
                <span>{tr('Calculate cost per cup', 'คำนวณต้นทุนต่อแก้ว')}</span>
                <span className="material-symbols-outlined text-[16px]">calculate</span>
              </a>
              <a
                href="/cafe/checklist/?src=site-home"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full font-['Manrope'] text-[12px] font-bold tracking-[0.14em] uppercase text-[#ff5e1a] border border-[#ff5e1a]/60 hover:bg-[#ff5e1a]/10 transition-all duration-300"
              >
                <span>{tr('Cafe opening checklist', 'เช็กลิสต์เปิดร้านกาแฟ')}</span>
                <span className="material-symbols-outlined text-[16px]">checklist</span>
              </a>
              <a
                href="/cafe/?src=site-home"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full font-['Manrope'] text-[12px] font-bold tracking-[0.14em] uppercase text-[#ff5e1a] border border-[#ff5e1a]/60 hover:bg-[#ff5e1a]/10 transition-colors"
              >
                <span>{tr('Café order & contact', 'สั่งและติดต่อสำหรับร้านกาแฟ')}</span>
                <span className="material-symbols-outlined text-[16px]">storefront</span>
              </a>
            </div>
          </div>
        </div>
      </section>
      {/* ==================== 05 / FINAL CTA SECTION ==================== */}
      <section className="relative w-full py-20 md:py-24 bg-[#141312] overflow-hidden">
        {/* Atmospheric Ambient Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[#ff5e1a]/10 rounded-full blur-[140px] pointer-events-none" />

        <div className="relative z-10 max-w-[1000px] mx-auto px-5 md:px-10 text-center">
          <span className="font-mono text-[12px] text-[#ffb59c] uppercase tracking-widest block mb-2">
            RESERVE YOUR HARVEST
          </span>
          <h2 className="font-['Manrope'] text-4xl sm:text-5xl md:text-6xl leading-tight text-[#e6e1df] uppercase font-bold tracking-tight">
            FIND YOUR ROAST.
          </h2>

          {/* Prominent Price Indicator */}
          <div className="my-8 inline-flex items-center gap-3 px-6 py-3 rounded-full bg-[#2b2a28] shadow-lg border border-[#363433]">
            <span className="font-['Manrope'] text-[11px] font-bold text-[#e3beb3]/70 uppercase tracking-widest">
              STARTING AT
            </span>
            <span className="font-['Manrope'] text-2xl font-bold tracking-tight text-[#ff5e1a]">
              {PRICE_RETAIL} THB
            </span>
            <span className="font-mono text-[12px] text-[#e3beb3]/70">/ KG</span>
          </div>

          {/* Final Prominent Pill CTA */}
          <div>
            <button
              onClick={() => onGoToProduct(selectedRoast)}
              className="inline-flex items-center justify-center gap-3 bg-[#ff5e1a] text-[#390c00] hover:text-[#ffdbcf] hover:bg-[#822800] px-10 py-4 rounded-full font-['Manrope'] text-[14px] font-bold tracking-widest uppercase transition-all duration-300 shadow-[0_16px_36px_rgba(255,94,26,0.4)] transform hover:-translate-y-1 active:scale-95"
            >
              <span>CHOOSE YOUR ROAST</span>
              <span className="material-symbols-outlined text-[20px]">shopping_bag</span>
            </button>
          </div>

          {/* Trust Badges */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-[#e3beb3]/70 font-mono text-[12px] uppercase">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#ff5e1a]">local_shipping</span>
              Nationwide Delivery
            </span>
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#ff5e1a]">lock</span>
              PromptPay Payment
            </span>
          </div>
        </div>
      </section>

      {/* Mobile sticky order bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#141312]/95 backdrop-blur-md border-t border-[#5b4138]/40 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-['Manrope'] text-xs text-[#e3beb3]/80 leading-tight">
            TATO COFFEE<br />
            <span className="text-[10px] text-[#e3beb3]/60">{tr('Roasted fresh to order', 'คั่วสดตามออเดอร์')}</span>
          </span>
          <button
            onClick={() => onGoToProduct(selectedRoast)}
            className="bg-[#ff5e1a] text-[#390c00] px-6 py-2.5 rounded-full font-['Manrope'] text-[12px] font-bold tracking-[0.14em] uppercase active:scale-95 transition"
          >
            {tr('ORDER', 'สั่งซื้อ')}
          </button>
        </div>
      </div>
    </div>
  );
};
