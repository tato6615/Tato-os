import React from 'react';
import { ASSETS } from '../data/coffeeData';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full bg-[#0f0e0d] text-[#e3beb3]/75 py-16 md:py-20 border-t border-[#211f1e]">
      <div className="max-w-[1440px] mx-auto px-5 md:px-10 lg:px-20">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-12 mb-16">
          {/* Brand Info */}
          <div className="space-y-4 md:col-span-2">
            <div className="flex items-center gap-3">
              <img
                src={ASSETS.logo}
                alt="TATO Coffee Brandmark"
                className="h-7 w-auto object-contain opacity-95"
              />
              <span className="font-['Manrope'] text-[20px] font-medium tracking-tight text-[#e6e1df] uppercase">
                TATO COFFEE
              </span>
            </div>
            <p className="font-['Manrope'] text-[14px] leading-relaxed text-[#e3beb3]/70 max-w-md">
              Single-Origin Arabica Estate nestled at Doi Wiang, Doi Wiang Pa, Chiang Mai (1,500 MASL). High-altitude micro-lots slow-crafted with extreme agricultural precision.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <span className="font-mono text-[12px] px-2.5 py-0.5 rounded-full bg-[#2b2a28] text-[#f3bc8b]">
                DOI WIANG PA • CHIANG MAI
              </span>
              <span className="font-mono text-[12px] px-2.5 py-0.5 rounded-full bg-[#2b2a28] text-[#ffb59c]">
                1,500M ELEVATION
              </span>
            </div>
          </div>

          {/* Provenance */}
          <div className="space-y-3">
            <span className="font-['Manrope'] text-[11px] font-bold uppercase tracking-widest text-[#e6e1df] block">
              PROVENANCE
            </span>
            <ul className="space-y-2 font-['Manrope'] text-[13px] text-[#e3beb3]/70">
              <li className="hover:text-[#e6e1df] transition-colors">Doi Wiang Terroir</li>
              <li className="hover:text-[#e6e1df] transition-colors">Micro-Lot Specialty Processing</li>
              <li className="hover:text-[#e6e1df] transition-colors">100% Arabica Specialty</li>
              <li className="hover:text-[#e6e1df] transition-colors">Highland Climate</li>
            </ul>
          </div>

          {/* Harvest Assurance */}
          <div className="space-y-3">
            <span className="font-['Manrope'] text-[11px] font-bold uppercase tracking-widest text-[#e6e1df] block">
              HARVEST ASSURANCE
            </span>
            <ul className="space-y-2 font-['Manrope'] text-[13px] text-[#e3beb3]/70">
              <li className="hover:text-[#e6e1df] transition-colors">Fresh Small-Batch Roast</li>
              <li className="hover:text-[#e6e1df] transition-colors">Nitrogen Purged Packaging</li>
              <li className="hover:text-[#e6e1df] transition-colors">Direct Origin Trade</li>
              <li className="hover:text-[#e6e1df] transition-colors">Traceable Lot Curves</li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-[#211f1e] flex flex-col md:flex-row items-center justify-between gap-4 font-mono text-[11px] text-[#e3beb3]/60">
          <div>
            © 2025 TATO COFFEE ESTATE. DOI WIANG, THAILAND. ALL RIGHTS RESERVED.
          </div>
          <div className="flex items-center gap-6">
            <span>DOI WIANG PA • CHIANG MAI</span>
            <span>ELEVATION 1,500M</span>
            <span>CHIANG MAI / NORTHERN HIGHLANDS</span>
            <a href="/cafe/?src=site" className="text-[#ffb59c] hover:text-[#e6e1df] transition-colors">สำหรับร้านกาแฟ · FOR CAFÉS</a>
          </div>
        </div>
      </div>
    </footer>
  );
};
