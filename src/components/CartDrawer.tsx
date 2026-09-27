import React from 'react';
import { RoastType, GrindType } from '../types';
import { ASSETS, ROAST_PROFILES, GRIND_OPTIONS } from '../data/coffeeData';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRoast: RoastType;
  onChangeRoast: (roast: RoastType) => void;
  selectedGrind: GrindType;
  onChangeGrind: (grind: GrindType) => void;
  quantityKg: number;
  onChangeQuantity: (delta: number) => void;
  onProceedToCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  selectedRoast,
  onChangeRoast,
  selectedGrind,
  onChangeGrind,
  quantityKg,
  onChangeQuantity,
  onProceedToCheckout,
}) => {
  if (!isOpen) return null;

  const unitPrice = 550;
  const subtotal = quantityKg * unitPrice;
  const shipping = quantityKg >= 2 ? 0 : 50;
  const total = subtotal + shipping;

  const currentRoast = ROAST_PROFILES.find((r) => r.id === selectedRoast) || ROAST_PROFILES[1];
  const currentGrind = GRIND_OPTIONS.find((g) => g.id === selectedGrind) || GRIND_OPTIONS[0];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-[#141312] border-l border-[#2b2a28] shadow-2xl flex flex-col justify-between">
          {/* Header */}
          <div className="p-6 border-b border-[#2b2a28] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#ff5e1a] text-[22px]">
                shopping_bag
              </span>
              <h2 className="font-['Manrope'] text-lg font-bold uppercase tracking-wider text-[#e6e1df]">
                YOUR SELECTION · ตะกร้า
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#211f1e] text-[#e6e1df] hover:bg-[#2b2a28] flex items-center justify-center transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          {/* Cart Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Item Card */}
            <div className="bg-[#1d1b1a] rounded-xl p-4 border border-[#2b2a28] space-y-4">
              <div className="flex gap-4">
                <img
                  src={ASSETS.matteBlackPouch}
                  alt="TATO Coffee pouch"
                  className="w-20 h-24 object-cover rounded-lg bg-[#0f0e0d] border border-[#2b2a28]"
                />
                <div className="flex-1 space-y-1">
                  <span className="font-mono text-[10px] text-[#ff5e1a] uppercase font-bold tracking-wider">
                    SINGLE ORIGIN • 1,834M
                  </span>
                  <h3 className="font-['Manrope'] text-[16px] font-bold text-[#e6e1df]">
                    TATO COFFEE
                  </h3>
                  <p className="font-['Anuphan'] text-[12px] text-[#ffdcc0]">
                    Doi Wiang 100% Arabica
                  </p>
                  <p className="font-mono text-[13px] font-semibold text-[#f3bc8b] pt-1">
                    550 THB / KG
                  </p>
                </div>
              </div>

              {/* Roast Level Switcher */}
              <div className="space-y-1.5 pt-2 border-t border-[#2b2a28]">
                <label className="font-['Manrope'] text-[11px] font-bold text-[#e3beb3]/80 uppercase block">
                  Roast Profile / เลือกระดับคั่ว:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {ROAST_PROFILES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onChangeRoast(r.id)}
                      className={`py-1.5 px-2 rounded font-['Manrope'] text-[11px] font-bold tracking-wider uppercase transition-all ${
                        selectedRoast === r.id
                          ? 'bg-[#ff5e1a] text-[#390c00]'
                          : 'bg-[#211f1e] text-[#e3beb3]/80 hover:bg-[#2b2a28]'
                      }`}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[#ffdcc0] font-['Anuphan'] pt-0.5">
                  {currentRoast.subtitle}
                </p>
              </div>

              {/* Grind Selector */}
              <div className="space-y-1.5 pt-2 border-t border-[#2b2a28]">
                <label className="font-['Manrope'] text-[11px] font-bold text-[#e3beb3]/80 uppercase block">
                  Grind / บดกาแฟ:
                </label>
                <select
                  value={selectedGrind}
                  onChange={(e) => onChangeGrind(e.target.value as GrindType)}
                  className="w-full h-9 px-3 rounded-lg bg-[#211f1e] text-[#e6e1df] border border-[#2b2a28] font-['Manrope'] text-[12px] focus:outline-none focus:border-[#ff5e1a]"
                >
                  {GRIND_OPTIONS.map((g) => (
                    <option key={g.id} value={g.id} className="bg-[#141312] text-white">
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity Stepper */}
              <div className="flex items-center justify-between pt-2 border-t border-[#2b2a28]">
                <span className="font-['Manrope'] text-[12px] text-[#e3beb3]/80 font-medium">
                  จำนวน (KG):
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onChangeQuantity(-1)}
                    className="w-7 h-7 rounded bg-[#2b2a28] hover:bg-[#363433] text-[#e6e1df] flex items-center justify-center transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">remove</span>
                  </button>
                  <span className="font-mono text-[14px] font-bold px-2 text-[#e6e1df] min-w-[40px] text-center">
                    {quantityKg} KG
                  </span>
                  <button
                    onClick={() => onChangeQuantity(1)}
                    className="w-7 h-7 rounded bg-[#2b2a28] hover:bg-[#363433] text-[#e6e1df] flex items-center justify-center transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Micro Origin Spec Guarantee */}
            <div className="p-4 rounded-xl bg-[#0f0e0d] border border-[#2b2a28] space-y-1">
              <div className="flex items-center gap-1.5 text-[#ff5e1a] font-mono text-[11px] font-bold">
                <span className="material-symbols-outlined text-[15px]">verified</span>
                <span>HARVEST ASSURANCE</span>
              </div>
              <p className="font-['Anuphan'] text-[12px] text-[#e3beb3]/75 leading-relaxed">
                จัดส่งตรงจากแหล่งปลูกดอยเวียง คั่วสดใหม่ตามคำสั่งซื้อ พร้อมวาล์วกันชื้น Degassing Valve รักษาความหอมได้นาน 90 วัน
              </p>
            </div>
          </div>

          {/* Footer Checkout Summary */}
          <div className="p-6 border-t border-[#2b2a28] bg-[#0f0e0d] space-y-4">
            <div className="space-y-1.5 text-[13px] font-['Manrope'] text-[#e3beb3]/80">
              <div className="flex justify-between">
                <span>ยอดรวมเมล็ดกาแฟ:</span>
                <span className="font-mono text-[#e6e1df]">{subtotal.toLocaleString('th-TH')} THB</span>
              </div>
              <div className="flex justify-between">
                <span>ค่าจัดส่งทั่วไทย:</span>
                <span className="font-mono text-[#e6e1df]">
                  {quantityKg >= 2 ? 'FREE (ฟรี)' : `${shipping} THB`}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#211f1e] text-[16px] font-bold text-[#e6e1df]">
                <span>ยอดชำระสุทธิ:</span>
                <span className="font-mono text-[#ff5e1a] text-xl">
                  {total.toLocaleString('th-TH')} THB
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                onClose();
                onProceedToCheckout();
              }}
              className="w-full py-3.5 rounded-xl bg-[#ff5e1a] text-[#390c00] hover:text-[#ffdbcf] hover:bg-[#822800] font-['Manrope'] text-[13px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-[0_12px_24px_rgba(255,94,26,0.3)]"
            >
              <span>ดำเนินการสั่งซื้อ / CHECKOUT</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
