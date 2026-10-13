import React, { useState, useEffect } from 'react';
import { PageView } from '../types';
import { ASSETS } from '../data/coffeeData';
import { useLanguage } from '../i18n';

interface HeaderProps {
  currentView: PageView;
  onNavigate: (view: PageView, sectionId?: string) => void;
  cartCount: number;
  onOpenCart: () => void;
  onOpenOrders: () => void;
  onOpenStory?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigate,
  cartCount,
  onOpenCart,
  onOpenOrders,
  onOpenStory,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { language, setLanguage } = useLanguage();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavClick = (view: PageView, sectionId?: string) => {
    onNavigate(view, sectionId);
    setMobileMenuOpen(false);
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#141312]/95 backdrop-blur-md shadow-[0_4px_24px_rgba(0,0,0,0.65)] border-b border-[#5b4138]/40'
          : 'bg-[#141312]/80 backdrop-blur-sm shadow-[0_1px_8px_rgba(0,0,0,0.35)] border-b border-[#2b2a28]/40'
      }`}
    >
      <div className="h-20 max-w-[1440px] mx-auto px-5 md:px-10 lg:px-20 flex items-center justify-between">
        {/* Brandmark */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => handleNavClick('discover')}
            className="flex items-center gap-3 transition-opacity duration-300 hover:opacity-85 text-left focus:outline-none hover-lift-subtle"
          >
            <img
              src={ASSETS.logo}
              alt="TATO Coffee Brandmark"
              className="h-8 w-auto object-contain transition-transform duration-300 hover:scale-105"
            />
            <span className="font-['Manrope'] text-[11px] font-bold tracking-[0.18em] text-[#e6e1df] uppercase">
              TATO COFFEE
            </span>
          </button>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-8 xl:gap-10">
          <button
            onClick={() => handleNavClick('discover')}
            className={`group relative py-1 transition-all duration-200 font-['Manrope'] text-[11px] font-bold tracking-[0.14em] uppercase flex flex-col items-center gap-1 focus:outline-none hover-lift-subtle ${
              currentView === 'discover'
                ? 'text-[#ff5e1a]'
                : 'text-[#e3beb3]/80 hover:text-[#e6e1df]'
            }`}
          >
            <span>{language === 'th' ? 'ค้นพบ' : 'DISCOVER'}</span>
            <span
              className={`h-0.5 rounded-full bg-[#ff5e1a] transition-all duration-300 ${
                currentView === 'discover' ? 'w-full opacity-100' : 'w-0 opacity-0 group-hover:w-1/2 group-hover:opacity-60'
              }`}
            />
          </button>

          <button
            onClick={() => handleNavClick('discover', 'origin')}
            className={`group relative py-1 transition-all duration-200 font-['Manrope'] text-[11px] font-bold tracking-[0.14em] uppercase flex flex-col items-center gap-1 focus:outline-none hover-lift-subtle ${
              currentView === 'origin'
                ? 'text-[#ff5e1a]'
                : 'text-[#e3beb3]/80 hover:text-[#e6e1df]'
            }`}
          >
            <span>{language === 'th' ? 'ดอยเวียงผา 1,500M' : 'ORIGIN'}</span>
            <span
              className={`h-0.5 rounded-full bg-[#ff5e1a] transition-all duration-300 ${
                currentView === 'origin' ? 'w-full opacity-100' : 'w-0 opacity-0 group-hover:w-1/2 group-hover:opacity-60'
              }`}
            />
          </button>

          <button
            onClick={() => handleNavClick('discover', 'roasts')}
            className={`group relative py-1 transition-all duration-200 font-['Manrope'] text-[11px] font-bold tracking-[0.14em] uppercase flex flex-col items-center gap-1 focus:outline-none hover-lift-subtle ${
              currentView === 'roasts'
                ? 'text-[#ff5e1a]'
                : 'text-[#e3beb3]/80 hover:text-[#e6e1df]'
            }`}
          >
            <span>{language === 'th' ? 'ระดับการคั่ว' : 'ROASTS'}</span>
            <span
              className={`h-0.5 rounded-full bg-[#ff5e1a] transition-all duration-300 ${
                currentView === 'roasts' ? 'w-full opacity-100' : 'w-0 opacity-0 group-hover:w-1/2 group-hover:opacity-60'
              }`}
            />
          </button>

          <button
            onClick={() => handleNavClick('product')}
            className={`group relative py-1 transition-all duration-200 font-['Manrope'] text-[11px] font-bold tracking-[0.14em] uppercase flex flex-col items-center gap-1 focus:outline-none hover-lift-subtle ${
              currentView === 'product'
                ? 'text-[#ff5e1a]'
                : 'text-[#e3beb3]/80 hover:text-[#e6e1df]'
            }`}
          >
            <span>{language === 'th' ? 'สั่งซื้อเมล็ดกาแฟ' : 'PRODUCT'}</span>
            <span
              className={`h-0.5 rounded-full bg-[#ff5e1a] transition-all duration-300 ${
                currentView === 'product' ? 'w-full opacity-100' : 'w-0 opacity-0 group-hover:w-1/2 group-hover:opacity-60'
              }`}
            />
          </button>

          {onOpenStory && (
            <button
              onClick={() => {
                onOpenStory();
                setMobileMenuOpen(false);
              }}
              className="py-1 transition-all duration-200 font-['Manrope'] text-[11px] font-bold tracking-[0.14em] uppercase flex items-center gap-1.5 text-[#ffdcc0] hover:text-[#ffb59c] hover-lift-subtle"
            >
              <span className="material-symbols-outlined text-[16px] text-[#ffb59c]">landscape</span>
              <span>{language === 'th' ? 'เรื่องราวดอยเวียง' : 'STORY'}</span>
            </button>
          )}

          <a
            href="/cafe/?src=site"
            className="transition-all duration-200 font-['Manrope'] text-[11px] font-bold tracking-[0.14em] uppercase flex items-center gap-1.5 text-[#e3beb3]/80 hover:text-[#e6e1df] hover-lift-subtle"
          >
            {language === 'th' ? 'สำหรับร้านกาแฟ' : 'FOR CAFÉS'}
          </a>
        </nav>

        {/* Action Controls */}
        <div className="flex items-center gap-3 md:gap-4">
          <button
            onClick={onOpenCart}
            className="flex items-center gap-2 bg-[#ff5e1a] text-[#390c00] hover:text-[#ffdbcf] hover:bg-[#822800] px-4 py-2 rounded-full font-['Manrope'] text-[11px] font-bold tracking-wider transition-all duration-300 shadow-[0_12px_24px_-4px_rgba(255,94,26,0.3)] hover-lift-subtle interactive-press focus:outline-none"
            title="ตะกร้าและสั่งซื้อ TATO"
          >
            <span className="material-symbols-outlined text-[16px]">shopping_bag</span>
            <span className="font-semibold tracking-wider">{language === 'th' ? 'สั่งซื้อ TATO' : 'ORDER TATO'}</span>
            {cartCount > 0 && (
              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[#141312] text-[#ffb59c] text-[10px] font-bold animate-pulse">
                {cartCount}
              </span>
            )}
          </button>

          <div className="flex items-center rounded-full border border-[#5b4138]/50 bg-[#211f1e] p-0.5" aria-label="Language">
            <button type="button" onClick={() => setLanguage('th')} className={`px-2.5 py-1 rounded-full font-['Manrope'] text-[10px] font-bold transition-all ${language === 'th' ? 'bg-[#ff5e1a] text-[#390c00] shadow-sm' : 'text-[#aa897f] hover:text-[#e6e1df]'}`}>TH</button>
            <button type="button" onClick={() => setLanguage('en')} className={`px-2.5 py-1 rounded-full font-['Manrope'] text-[10px] font-bold transition-all ${language === 'en' ? 'bg-[#ff5e1a] text-[#390c00] shadow-sm' : 'text-[#aa897f] hover:text-[#e6e1df]'}`}>EN</button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden w-8 h-8 rounded-lg bg-[#211f1e] text-[#e6e1df] flex items-center justify-center focus:outline-none interactive-press border border-[#2b2a28]"
            aria-label="Toggle navigation"
          >
            <span className="material-symbols-outlined text-[20px]">
              {mobileMenuOpen ? 'close' : 'menu'}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Drawer with smooth slide-down and staggered link animation */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#1d1b1a]/98 backdrop-blur-xl border-b border-[#363433] px-6 py-5 space-y-4 animate-page-enter">
          <div className="flex flex-col gap-2 font-['Manrope'] text-[13px] tracking-wider uppercase font-semibold">
            <button
              onClick={() => handleNavClick('discover')}
              className={`flex items-center justify-between py-2 text-left transition-colors ${
                currentView === 'discover' ? 'text-[#ff5e1a]' : 'text-[#e6e1df] hover:text-[#ff5e1a]'
              }`}
            >
              <span>{language === 'th' ? 'ค้นพบ' : 'DISCOVER'}</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
            <button
              onClick={() => handleNavClick('discover', 'origin')}
              className="flex items-center justify-between py-2 text-left text-[#e6e1df] hover:text-[#ff5e1a] transition-colors"
            >
              <span>{language === 'th' ? 'ดอยเวียงผา 1,500M' : 'ORIGIN'}</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
            <button
              onClick={() => handleNavClick('discover', 'roasts')}
              className="flex items-center justify-between py-2 text-left text-[#e6e1df] hover:text-[#ff5e1a] transition-colors"
            >
              <span>{language === 'th' ? 'ระดับการคั่ว' : 'ROASTS'}</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
            <button
              onClick={() => handleNavClick('product')}
              className={`flex items-center justify-between py-2 text-left transition-colors ${
                currentView === 'product' ? 'text-[#ff5e1a]' : 'text-[#e6e1df] hover:text-[#ff5e1a]'
              }`}
            >
              <span>{language === 'th' ? 'สั่งซื้อเมล็ดกาแฟ' : 'PRODUCT'}</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
            {onOpenStory && (
              <button
                onClick={() => {
                  onOpenStory();
                  setMobileMenuOpen(false);
                }}
                className="flex items-center justify-between py-2 text-left text-[#ffdcc0] hover:text-[#ffb59c] transition-colors"
              >
                <span>{language === 'th' ? 'เรื่องราวดอยเวียง' : 'STORY JOURNEY'}</span>
                <span className="material-symbols-outlined text-[16px] text-[#ffb59c]">landscape</span>
              </button>
            )}
            <a
              href="/cafe/?src=site"
              className="flex items-center justify-between py-2 text-left text-[#e6e1df] hover:text-[#ff5e1a] transition-colors"
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
