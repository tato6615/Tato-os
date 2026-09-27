import React, { useState } from 'react';
import { RoastType } from '../types';
import { ASSETS, ROAST_PROFILES } from '../data/coffeeData';

interface DiscoverViewProps {
  onGoToProduct: (preselectedRoast?: RoastType) => void;
}

export const DiscoverView: React.FC<DiscoverViewProps> = ({ onGoToProduct }) => {
  const [selectedRoast, setSelectedRoast] = useState<RoastType>('medium');

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="flex flex-col w-full">
      {/* ==================== HERO SECTION ==================== */}
      <section className="relative w-full min-h-[92vh] flex items-center justify-center -mt-20 overflow-hidden bg-[#0f0e0d]">
        {/* Atmospheric Highland Aerial Background */}
        <div className="absolute inset-0 z-0">
          <img
            src={ASSETS.highlandAerial}
            alt="Doi Wiang highland coffee plantation enveloped in morning sea of mist at sunrise"
            className="w-full h-full object-cover object-center scale-105 transform opacity-65 filter brightness-[0.7] contrast-125 transition-transform duration-[10000ms]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#141312] via-[#141312]/60 to-[#141312]/40" />
          <div className="absolute inset-0 bg-radial from-transparent via-[#141312]/30 to-[#0f0e0d]" />
        </div>

        {/* Hero Content Envelope */}
        <div className="relative z-10 max-w-[1440px] w-full mx-auto px-5 md:px-10 lg:px-20 pt-32 pb-16 flex flex-col items-center text-center">
          {/* Monogram Tag */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#2b2a28]/70 backdrop-blur-md shadow-sm mb-6 border border-[#5b4138]/40">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff5e1a] animate-ping" />
            <span className="font-mono text-[11px] text-[#f3bc8b] uppercase tracking-[0.18em] font-medium">
              Single-Origin Terroir Reserve
            </span>
          </div>

          {/* Core Display Headline */}
          <h1 className="font-['Manrope'] text-4xl sm:text-6xl md:text-7xl lg:text-[72px] font-semibold text-[#e6e1df] uppercase tracking-tight max-w-4xl drop-shadow-2xl leading-[1.1]">
            KNOW YOUR COFFEE.
          </h1>

          {/* Thai Subheadline */}
          <p className="mt-3 text-[26px] md:text-[34px] leading-relaxed text-[#ffdcc0] font-light tracking-wide font-['Anuphan']">
            รู้จักกาแฟของคุณ
          </p>

          {/* Supporting Spec Note */}
          <p className="mt-4 font-['Manrope'] text-base md:text-lg text-[#e3beb3]/80 max-w-xl font-light">
            Arabica 100% • Single Origin • Doi Wiang Pa 1,834m
          </p>

          {/* Primary Action CTA */}
          <div className="mt-8 flex flex-col sm:flex-row items-center gap-4">
            <button
              onClick={() => scrollToSection('origin')}
              className="group flex items-center justify-center gap-2 bg-[#ff5e1a] text-[#390c00] hover:text-[#ffdbcf] hover:bg-[#822800] px-8 py-3.5 rounded-full font-['Manrope'] text-[12px] font-bold tracking-[0.14em] uppercase transition-all duration-300 shadow-[0_12px_32px_rgba(255,94,26,0.35)] transform hover:-translate-y-0.5 active:scale-95"
            >
              <span>EXPLORE TATO</span>
              <span className="material-symbols-outlined text-[16px] transition-transform duration-300 group-hover:translate-y-0.5">
                arrow_downward
              </span>
            </button>

            <button
              onClick={() => scrollToSection('roasts')}
              className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-full font-['Manrope'] text-[12px] font-bold tracking-[0.14em] uppercase text-[#e6e1df] transition-all duration-300 hover:text-[#ff5e1a] hover:bg-[#2b2a28]/60 border border-[#5b4138]/40"
            >
              <span>VIEW ROASTS</span>
              <span className="material-symbols-outlined text-[16px]">tune</span>
            </button>
          </div>

          {/* Coordinates Quick Strip */}
          <div className="mt-16 flex items-center gap-6 text-[#e3beb3]/60 font-mono text-[11px] uppercase tracking-widest hidden md:flex">
            <span>DOI WIANG PA • CHIANG MAI</span>
            <span className="w-1 h-1 rounded-full bg-[#5b4138]" />
            <span>1,834 MASL</span>
            <span className="w-1 h-1 rounded-full bg-[#5b4138]" />
            <span>1,834 MASL ELEVATION</span>
          </div>
        </div>
      </section>

      {/* ==================== 01 / ORIGIN SECTION ==================== */}
      <section className="relative w-full py-20 md:py-24 bg-[#141312]" id="origin">
        <div className="max-w-[1440px] mx-auto px-5 md:px-10 lg:px-20">
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
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
              Perched on the micro-climate ridge of Doi Wiang Pa, Chiang Mai, where perennial mountain mists and volcanic mineral soil slow down cherry maturation, producing unmatched sweetness.
            </p>
          </div>

          {/* Terroir Interactive Card & Metrics Mosaic */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Large Terroir Visual Card (7 Cols) */}
            <div className="lg:col-span-7 group relative rounded-xl overflow-hidden shadow-2xl bg-[#0f0e0d] min-h-[440px] flex flex-col justify-end p-8 md:p-10 border border-[#2b2a28]">
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
                  DOI WIANG ESTATE LOT #DW-04
                </span>
              </div>

              <h3 className="relative z-10 font-['Manrope'] text-xl md:text-2xl font-semibold text-[#e6e1df] max-w-lg mb-2">
                Highland Cloud Mist & Shade-Grown Microclimate
              </h3>
              <p className="relative z-10 font-['Manrope'] text-[14px] text-[#e3beb3]/80 max-w-md leading-relaxed">
                The distinct diurnal temperature shift at 1,834 MASL concentrates organic sugars deep within each coffee bean.
              </p>
            </div>

            {/* 3 Terroir Metrics Split Panel (5 Cols) */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {/* Metric 1: Elevation */}
              <div className="flex-1 bg-[#1d1b1a] rounded-xl p-6 flex flex-col justify-center transition-all duration-300 hover:bg-[#211f1e] border border-[#2b2a28] shadow-md">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="font-['Manrope'] text-[11px] font-bold text-[#e3beb3]/70 uppercase tracking-widest">
                    ELEVATION
                  </span>
                  <span className="material-symbols-outlined text-[#ffb59c] text-[20px]">filter_hdr</span>
                </div>
                <div className="font-['Manrope'] text-[46px] md:text-[52px] leading-tight text-[#ffb59c] font-bold tracking-tight">
                  1,250 m
                </div>
                <p className="font-['Manrope'] text-[13px] text-[#e3beb3]/70 mt-1">
                  High-altitude cool air slows photosynthesis, dense bean structure.
                </p>
              </div>

              {/* Metric 2: Purity */}
              <div className="flex-1 bg-[#1d1b1a] rounded-xl p-6 flex flex-col justify-center transition-all duration-300 hover:bg-[#211f1e] border border-[#2b2a28] shadow-md">
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
                  Pure single-estate Catimor & Typica lineage. No blends, no compromises.
                </p>
              </div>

              {/* Metric 3: Terroir */}
              <div className="flex-1 bg-[#1d1b1a] rounded-xl p-6 flex flex-col justify-center transition-all duration-300 hover:bg-[#211f1e] border border-[#2b2a28] shadow-md">
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
                  Only blood-red cherries at 22+ Brix density are harvested during the December freeze.
                </p>
              </div>
            </div>

            {/* Editorial Content Column (6 Cols) */}
            <div className="lg:col-span-6 space-y-8">
              <div>
                <h3 className="font-['Manrope'] text-2xl md:text-3xl text-[#e6e1df] font-semibold tracking-tight">
                  Obsessive Grading. Zero Defect Philosophy.
                </h3>
                <p className="mt-4 font-['Manrope'] text-base md:text-lg text-[#e3beb3]/80 font-light leading-relaxed">
                  Every bean tells the history of Doi Wiang’s soil. Before entering the roaster drum, our cherries undergo rigorous floating separation, optical sorting, and extended slow fermentation in controlled temperature tanks.
                </p>
              </div>

              {/* Feature Breakdown Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-[#211f1e] p-5 rounded-lg border border-[#2b2a28] shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-[#67401a] flex items-center justify-center mb-3 text-[#ffdcc0]">
                    <span className="material-symbols-outlined text-[18px]">water_drop</span>
                  </div>
                  <h4 className="font-['Manrope'] text-[17px] text-[#e6e1df] font-medium">
                    Anaerobic & Washed
                  </h4>
                  <p className="font-['Manrope'] text-[13px] text-[#e3beb3]/75 mt-1 leading-normal">
                    48-hour oxygen-free tank fermentation followed by double mountain wash for supreme clarity.
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
                    Sun-dried slowly across 18 days on elevated bamboo mesh to stabilize moisture at exactly 10.5%.
                  </p>
                </div>
              </div>

              {/* Technical Spec Baseline */}
              <div className="bg-[#2b2a28]/60 p-4 rounded-lg space-y-2 font-mono text-[12px] border border-[#363433]">
                <div className="flex justify-between text-[#e3beb3]/70">
                  <span>HARVEST METHOD:</span>
                  <span className="text-[#e6e1df] font-semibold">100% Selective Hand Pluck</span>
                </div>
                <div className="flex justify-between text-[#e3beb3]/70">
                  <span>DRYING PROCESS:</span>
                  <span className="text-[#e6e1df] font-semibold">Elevated Tier African Mesh</span>
                </div>
                <div className="flex justify-between text-[#e3beb3]/70">
                  <span>DEFECT RATE:</span>
                  <span className="text-[#ff5e1a] font-semibold">&lt; 0.05% Specialty SCAA Graded</span>
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
                  className={`cursor-pointer rounded-xl p-6 md:p-8 flex flex-col justify-between transition-all duration-300 shadow-xl relative overflow-hidden border ${
                    isSelected
                      ? 'bg-[#2b2a28] border-[#ff5e1a] transform -translate-y-2'
                      : 'bg-[#1d1b1a] border-[#2b2a28] hover:bg-[#211f1e]'
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
                        {profile.isBestseller ? 'SIGNATURE BESTSELLER' : `PROFILE 0${profile.id === 'dark' ? 1 : 3}`}
                      </span>
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/20"
                        style={{ backgroundColor: profile.colorHex }}
                      />
                    </div>

                    <h3 className="font-['Manrope'] text-2xl md:text-3xl text-[#e6e1df] font-bold">
                      {profile.name}
                    </h3>
                    <p className="text-[17px] text-[#f3bc8b] font-light mt-0.5 font-['Anuphan']">
                      {profile.subtitle}
                    </p>
                    <p className="font-['Manrope'] text-[13px] text-[#e3beb3]/80 mt-4 leading-relaxed">
                      {profile.description}
                    </p>

                    {/* Flavor Attributes Pill Tag */}
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {profile.notes.map((note) => (
                        <span
                          key={note}
                          className="font-mono text-[11px] px-2.5 py-1 rounded bg-[#211f1e] text-[#e3beb3] border border-[#363433]"
                        >
                          {note}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Roast Density Level Meter */}
                  <div className="mt-8 pt-4 border-t border-[#363433]/50 space-y-2">
                    <div className="flex justify-between font-mono text-[11px] text-[#e3beb3]/70">
                      <span>ROAST INTENSITY</span>
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
                        className={`w-full py-2.5 px-4 rounded-lg font-['Manrope'] text-[11px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? 'bg-[#ff5e1a] text-[#390c00] hover:bg-[#822800] hover:text-[#ffdbcf]'
                            : 'bg-[#2b2a28] text-[#e6e1df] hover:bg-[#ff5e1a] hover:text-[#390c00]'
                        }`}
                      >
                        <span>ORDER THIS ROAST</span>
                        <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
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
              พบกับ TATO
            </p>
          </div>

          {/* Bento Product Display Showcase */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center bg-[#1d1b1a] rounded-2xl p-6 md:p-12 border border-[#2b2a28] shadow-2xl">
            {/* Luxury Matte Black Pouch Image Presentation (6 Cols) */}
            <div className="lg:col-span-6 relative flex items-center justify-center">
              <div className="relative w-full max-w-md rounded-xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.85)] group border border-[#2b2a28]">
                <img
                  src={ASSETS.matteBlackPouch}
                  alt="TATO Coffee luxury matte black pouch with copper foil badge resting on natural black slate with roasted coffee beans"
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
                  <span>Fresh Roast Guaranteed</span>
                </div>
                <h3 className="font-['Manrope'] text-2xl md:text-3xl text-[#e6e1df] font-semibold tracking-tight">
                  Small-Batch Micro Roasting. Peak Aromatics.
                </h3>
                <p className="mt-3 font-['Anuphan'] text-[15px] md:text-[16px] text-[#e3beb3]/80 leading-relaxed">
                  คั่วสดใหม่ทุกออเดอร์ เพื่อให้คุณได้ดื่มกาแฟในจุดที่รสชาติและกลิ่นหอมสมบูรณ์ที่สุด บรรจุในถุงฟอยล์กันความชื้นแบบมีวาล์วทางเดียว (One-way Degassing Valve) เพื่อกักเก็บแก๊สอะโรมาติกส์ได้นานถึง 90 วัน
                </p>
              </div>

              {/* Feature Bullets */}
              <div className="space-y-2.5 font-['Manrope'] text-[14px] text-[#e6e1df]">
                <div className="flex items-center gap-3 p-3 bg-[#211f1e] rounded-lg border border-[#2b2a28]">
                  <span className="material-symbols-outlined text-[#ff5e1a] text-[20px]">check_circle</span>
                  <span>Roast-on-Demand (จัดส่งภายใน 48 ชม. หลังคั่ว)</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-[#211f1e] rounded-lg border border-[#2b2a28]">
                  <span className="material-symbols-outlined text-[#f3bc8b] text-[20px]">check_circle</span>
                  <span>เลือกขนาดบดตามอุปกรณ์สกัด (Espresso, Filter, Whole Bean)</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-[#211f1e] rounded-lg border border-[#2b2a28]">
                  <span className="material-symbols-outlined text-[#ffb59c] text-[20px]">check_circle</span>
                  <span>Single Origin 100% Traceability จากแปลงดอยเวียงโดยตรง</span>
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
                  Available in 250g / 500g / 1,000g (1 KG)
                </span>
              </div>
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
          <p className="text-[22px] md:text-[28px] text-[#ffdcc0] font-light mt-1 font-['Anuphan']">
            ค้นหารสชาติของคุณ
          </p>

          {/* Prominent Price Indicator */}
          <div className="my-8 inline-flex items-center gap-3 px-6 py-3 rounded-full bg-[#2b2a28] shadow-lg border border-[#363433]">
            <span className="font-['Manrope'] text-[11px] font-bold text-[#e3beb3]/70 uppercase tracking-widest">
              STARTING AT
            </span>
            <span className="font-['Manrope'] text-2xl font-bold tracking-tight text-[#ff5e1a]">
              550 THB
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
              Express Delivery Nationwide
            </span>
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#ff5e1a]">verified_user</span>
              Direct Estate Guarantee
            </span>
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#ff5e1a]">lock</span>
              Secure PromptPay & Cards
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};
