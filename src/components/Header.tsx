import React, { useState } from 'react';
import { PageView } from '../types';
import { ASSETS } from '../data/coffeeData';
import { useLanguage } from '../i18n';

interface HeaderProps {
  currentView: PageView;
  onNavigate: (view: PageView, sectionId?: string) => void;
  cartCount: number;
  onOpenCart: () => void;
  onOpenOrders: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigate,
  cartCount,
  onOpenCart,
  onOpenOrders,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { language, setLanguage } = useLanguage();

  const handleNavClick = (view: PageView, sectionId?: string) => {
    onNavigate(view, sectionId);
    setMobileMenuOpen(false);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#141312]/90 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.45)] border-b border-[#2b2a28]/50">
      <div className="h-20 max-w-[1440px] mx-auto px-5 md:px-10 lg:px-20 flex items-center justify-between">
        {/* Brandmark */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => handleNavClick('discover')}
            className="flex items-center gap-3 transition-opacity duration-300 hover:opacity-85 text-left focus:outline-none"
          >
            <img
              src={ASSETS.logo}
              alt="TATO Coffee Brandmark"
              className="h-8 w-auto object-contain"
            />
            <span className="font-['Manrope'] text-[11px] font-bold tracking-[0.18em] text-[#e6e1df] uppercase">
              TATO COFFEE
            </span>
          </button>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-10">
          <button
            onClick={() => handleNavClick('discover')}
            className={`transition-colors duration-200 font-['Manrope'] text-[11px] font-bold tracking-[0.14em] uppercase flex items-center gap-1.5 focus:outline-none ${
              currentView === 'discover'
                ? 'text-[#ff5e1a]'
                : 'text-[#e3beb3]/80 hover:text-[#e6e1df]'
            }`}
          >
            {language === 'th' ? 'ค้นพบ' : 'DISCOVER'}
          </button>

          <button
            onClick={() => handleNavClick('discover', 'origin')}
            className={`transition-colors duration-200 font-['Manrope'] text-[11px] font-bold tracking-[0.14em] uppercase flex items-center gap-1.5 focus:outline-none ${
              currentView === 'origin'
                ? 'text-[#ff5e1a]'
                : 'text-[#e3beb3]/80 hover:text-[#e6e1df]'
            }`}
          >
            {language === 'th' ? 'ดอยเวียงผา 1,500M' : 'ORIGIN'}
          </button>

          <button
            onClick={() => handleNavClick('discover', 'roasts')}
            className={`transition-colors duration-200 font-['Manrope'] text-[11px] font-bold tracking-[0.14em] uppercase flex items-center gap-1.5 focus:outline-none ${
              currentView === 'roasts'
                ? 'text-[#ff5e1a]'
                : 'text-[#e3beb3]/80 hover:text-[#e6e1df]'
            }`}
          >
            {language === 'th' ? 'ระดับการคั่ว' : 'ROASTS'}
          </button>

          <button
            onClick={() => handleNavClick('product')}
            className={`transition-colors duration-200 font-['Manrope'] text-[11px] font-bold tracking-[0.14em] uppercase flex items-center gap-1.5 focus:outline-none ${
              currentView === 'product'
                ? 'text-[#ff5e1a]'
                : 'text-[#e3beb3]/80 hover:text-[#e6e1df]'
            }`}
          >
            {language === 'th' ? 'สั่งซื้อเมล็ดกาแฟ' : 'PRODUCT'}
          </button>
          <a
            href="/cafe/?src=site"
            className="transition-colors duration-200 font-['Manrope'] text-[11px] font-bold tracking-[0.14em] uppercase flex items-center gap-1.5 text-[#e3beb3]/80 hover:text-[#e6e1df]"
          >
            {language === 'th' ? 'สำหรับร้านกาแฟ' : 'FOR CAFÉS'}
          </a>
        </nav>

        {/* Action Controls */}
        <div className="flex items-center gap-3 md:gap-4">
          <button
            onClick={onOpenCart}
            className="flex items-center gap-2 bg-[#ff5e1a] text-[#390c00] hover:text-[#ffdbcf] hover:bg-[#822800] px-4 py-2 rounded-full font-['Manrope'] text-[11px] font-bold tracking-wider transition-all duration-300 shadow-[0_12px_24px_-4px_rgba(255,94,26,0.25)] focus:outline-none active:scale-95"
            title="ตะกร้าและสั่งซื้อ TATO"
          >
            <span className="material-symbols-outlined text-[16px]">shopping_bag</span>
            <span className="font-semibold tracking-wider">{language === 'th' ? 'สั่งซื้อ TATO' : 'ORDER TATO'}</span>
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[#141312] text-[#ffb59c] text-[10px] font-bold">
              {cartCount}
            </span>
          </button>

          <button
            onClick={onOpenOrders}
            className="w-8 h-8 rounded-full bg-[#ffb59c] hover:bg-[#ffdbcf] text-[#5c1900] flex items-center justify-center shrink-0 transition-colors focus:outline-none"
            title="ประวัติคำสั่งซื้อ / ข้อมูลผู้ซื้อ"
          >
            <span className="material-symbols-outlined text-[18px]">person</span>
          </button>

          <div className="flex items-center rounded-full border border-[#5b4138]/50 bg-[#211f1e] p-0.5" aria-label="Language">
            <button type="button" onClick={() => setLanguage('th')} className={`px-2.5 py-1 rounded-full font-['Manrope'] text-[10px] font-bold transition-all ${language === 'th' ? 'bg-[#ff5e1a] text-[#390c00]' : 'text-[#aa897f]'}`}>TH</button>
            <button type="button" onClick={() => setLanguage('en')} className={`px-2.5 py-1 rounded-full font-['Manrope'] text-[10px] font-bold transition-all ${language === 'en' ? 'bg-[#ff5e1a] text-[#390c00]' : 'text-[#aa897f]'}`}>EN</button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden w-8 h-8 rounded-lg bg-[#211f1e] text-[#e6e1df] flex items-center justify-center focus:outline-none"
            aria-label="Toggle navigation"
          >
            <span className="material-symbols-outlined text-[20px]">
              {mobileMenuOpen ? 'close' : 'menu'}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#1d1b1a] border-b border-[#363433] px-6 py-5 space-y-4">
          <div className="flex flex-col gap-3 font-['Manrope'] text-[13px] tracking-wider uppercase font-semibold">
            <button
              onClick={() => handleNavClick('discover')}
              className={`flex items-center justify-between py-2 text-left ${
                currentView === 'discover' ? 'text-[#ff5e1a]' : 'text-[#e6e1df]'
              }`}
            >
              <span>{language === 'th' ? 'ค้นพบ' : 'DISCOVER'}</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
            <button
              onClick={() => handleNavClick('discover', 'origin')}
              className="flex items-center justify-between py-2 text-left text-[#e6e1df]"
            >
              <span>{language === 'th' ? 'ดอยเวียงผา 1,500M' : 'ORIGIN'}</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
            <button
              onClick={() => handleNavClick('discover', 'roasts')}
              className="flex items-center justify-between py-2 text-left text-[#e6e1df]"
            >
              <span>{language === 'th' ? 'ระดับการคั่ว' : 'ROASTS'}</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
            <button
              onClick={() => handleNavClick('product')}
              className={`flex items-center justify-between py-2 text-left ${
                currentView === 'product' ? 'text-[#ff5e1a]' : 'text-[#e6e1df]'
              }`}
            >
              <span>{language === 'th' ? 'สั่งซื้อเมล็ดกาแฟ' : 'PRODUCT'}</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
            <a
              href="/cafe/?src=site"
              className="flex items-center justify-between py-2 text-left text-[#e6e1df]"
            >
              <span>{language === 'th' ? 'สำหรับร้านกาแฟ' : 'FOR CAFÉS'}</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </a>
          </div>
        </div>
      )}
    </header>
  );
};
