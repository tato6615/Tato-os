import React, { useState, useEffect } from 'react';
import { RoastType, GrindType, OrderItem } from '../types';
import { ASSETS, ROAST_PROFILES, GRIND_OPTIONS, TERROIR_SPECS, SENSORY_CARDS } from '../data/coffeeData';
import { useLanguage, translateText } from '../i18n';

interface ProductViewProps {
  initialRoast?: RoastType;
  onOrderSuccess: (order: OrderItem) => void;
  onViewOrders: () => void;
}

export const ProductView: React.FC<ProductViewProps> = ({
  initialRoast = 'medium',
  onOrderSuccess,
  onViewOrders,
}) => {
  const [selectedRoast, setSelectedRoast] = useState<RoastType>(initialRoast);
  const [selectedGrind, setSelectedGrind] = useState<GrindType>('whole_bean');
  const [quantityKg, setQuantityKg] = useState<number>(1);
  const [paymentMethod, setPaymentMethod] = useState<'promptpay' | 'cod' | 'credit_card'>('promptpay');

  // Customer form fields
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerNote, setCustomerNote] = useState('');

  // Validation errors
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Success state
  const [completedOrder, setCompletedOrder] = useState<OrderItem | null>(null);
  const { language } = useLanguage();
  const tr = (en: string, th: string) => language === 'th' ? th : en;

  // Sync initialRoast when passed
  useEffect(() => {
    if (initialRoast) {
      setSelectedRoast(initialRoast);
    }
  }, [initialRoast]);

  const unitPrice = 550;
  const subtotal = quantityKg * unitPrice;
  const shipping = quantityKg >= 2 ? 0 : 50;
  const total = subtotal + shipping;

  const handleQuantityChange = (delta: number) => {
    setQuantityKg((current) => Math.min(25, Math.max(1, current + delta)));
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { [key: string]: string } = {};

    if (!customerName.trim()) {
      newErrors.name = 'กรุณาระบุชื่อ-นามสกุล';
    }
    if (!customerEmail.trim() || !customerEmail.includes('@')) {
      newErrors.email = 'กรุณาระบุอีเมลที่ถูกต้อง';
    }
    if (!customerPhone.trim() || customerPhone.replace(/\D/g, '').length < 9) {
      newErrors.phone = 'กรุณาระบุเบอร์โทรศัพท์สำหรับจัดส่ง';
    }
    if (!customerAddress.trim()) {
      newErrors.address = 'กรุณาระบุที่อยู่สำหรับจัดส่ง (บ้านเลขที่, ถนน, แขวง/ตำบล, เขต/อำเภอ, จังหวัด, รหัสไปรษณีย์)';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `TATO-${randomSuffix}`;

    const newOrder: OrderItem = {
      id: `${Date.now()}-${randomSuffix}`,
      orderNumber,
      roast: selectedRoast,
      grind: selectedGrind,
      quantityKg,
      unitPrice,
      subtotal,
      shipping,
      total,
      customer: {
        name: customerName.trim(),
        email: customerEmail.trim(),
        phone: customerPhone.trim(),
        address: customerAddress.trim(),
        note: customerNote.trim() || undefined,
        paymentMethod,
      },
      timestamp: new Date().toISOString(),
      status: 'Roast Queued',
    };

    setCompletedOrder(newOrder);
    onOrderSuccess(newOrder);
  };

  const resetOrderForm = () => {
    setCompletedOrder(null);
    setQuantityKg(1);
    setSelectedRoast('medium');
    setSelectedGrind('whole_bean');
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomerNote('');
    setErrors({});
  };

  const activeRoastObj = ROAST_PROFILES.find((r) => r.id === selectedRoast) || ROAST_PROFILES[1];
  const activeGrindObj = GRIND_OPTIONS.find((g) => g.id === selectedGrind) || GRIND_OPTIONS[0];

  return (
    <div className="w-full max-w-[1440px] mx-auto px-5 md:px-10 lg:px-20 py-8 lg:py-12">
      {/* Breadcrumb & Lot Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div className="flex items-center gap-2 font-mono text-[12px] text-[#e3beb3]/70">
          <span className="text-[#d4c3bd]">ESTATE ARCHIVE</span>
          <span className="text-[#5b4138]">/</span>
          <span className="text-[#d4c3bd]">DOI WIANG LOT 2025</span>
          <span className="text-[#5b4138]">/</span>
          <span className="text-[#ff5e1a] font-semibold">TATO 1,834M</span>
        </div>
        <div className="flex items-center gap-2 bg-[#2b2a28] px-3.5 py-1.5 rounded-full border border-[#363433]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ff5e1a] animate-pulse" />
          <span className="font-mono text-[11px] text-[#ffb59c] uppercase font-medium">
            CRAFT MICRO-BATCH ACTIVE
          </span>
        </div>
      </div>

      {/* Main Two-Column Luxury Studio Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* LEFT COLUMN: Product Stage & Sensory Proof */}
        <div className="lg:col-span-6 space-y-6 lg:sticky lg:top-24">
          {/* Primary Hero Stage with Image */}
          <div className="relative bg-[#0f0e0d] rounded-2xl overflow-hidden shadow-[0_24px_48px_-12px_rgba(0,0,0,0.85)] group border border-[#2b2a28]">
            <div className="aspect-[4/5] w-full relative flex items-center justify-center overflow-hidden bg-[#1d1b1a]">
              <img
                src={ASSETS.matteBlackPouch}
                alt="TATO Single Origin Matte Black Bag nestled on dark slate stone"
                className="w-full h-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.02]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f0e0d] via-transparent to-black/20 pointer-events-none" />

              {/* Overlaid Micro Badges */}
              <div className="absolute top-4 left-4 flex flex-col gap-1.5 pointer-events-none">
                <span className="font-mono text-[11px] tracking-wider uppercase px-2.5 py-1 rounded bg-[#0f0e0d]/80 backdrop-blur-md text-[#f3bc8b] border border-white/10">
                  DOI WIANG PA 1,834M
                </span>
                <span className="font-mono text-[11px] tracking-wider uppercase px-2.5 py-1 rounded bg-[#0f0e0d]/80 backdrop-blur-md text-[#d4c3bd] border border-white/10">
                  ARABICA 100%
                </span>
              </div>

              <div className="absolute bottom-4 right-4 pointer-events-none">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#363433]/90 backdrop-blur-md text-[#e6e1df] border border-white/10">
                  <span className="material-symbols-outlined text-[15px] text-[#ff5e1a]">
                    local_fire_department
                  </span>
                  <span className="font-mono text-[11px] tracking-wide font-medium">
                    ROAST-TO-ORDER
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Secondary Preview Stage & Origin Details */}
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-5 bg-[#1d1b1a] rounded-xl overflow-hidden aspect-[4/3] group relative border border-[#2b2a28]">
              <img
                src={ASSETS.cherriesAndBeans}
                alt="Fresh harvested coffee cherries alongside freshly roasted dark espresso beans on slate"
                className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f0e0d]/80 to-transparent" />
              <span className="absolute bottom-2 left-2.5 font-mono text-[10px] text-[#e3beb3]/80 uppercase tracking-wider font-semibold">
                HARVEST SPECIMEN
              </span>
            </div>

            <div className="col-span-7 bg-[#1d1b1a] rounded-xl p-4 flex flex-col justify-between border border-[#2b2a28]">
              <div className="space-y-1">
                <span className="font-['Manrope'] text-[11px] font-bold text-[#f3bc8b] uppercase tracking-wider">
                  {tr('TERROIR SPECIFICATION', 'ข้อมูลแหล่งกำเนิดและสภาพพื้นที่')}
                </span>
                <p className="font-['Manrope'] text-[13px] text-[#e3beb3]/80 line-clamp-2 leading-relaxed">
                  {tr('Cherries selectively hand-picked at peak ripeness on northern steep volcanic slopes. Cold mountain night fermentation.', 'เก็บผลเชอร์รี่ด้วยมือเฉพาะผลที่สุกเต็มที่บนพื้นที่ลาดชันทางภาคเหนือ และหมักในอุณหภูมิที่เย็นจากภูเขายามค่ำคืน')}
                </p>
              </div>
              <div className="pt-2 flex items-center justify-between font-mono text-[11px] text-[#d4c3bd]">
                <span>DOI WIANG PA • CHIANG MAI</span>
                <span>WASHED / SLOW-DRIED</span>
              </div>
            </div>
          </div>

          {/* Technical Assurance Strip */}
          <div className="grid grid-cols-3 gap-3 bg-[#0f0e0d] p-4 rounded-xl border border-[#2b2a28]">
            <div className="text-center space-y-0.5">
              <span className="font-['Manrope'] text-[10px] text-[#aa897f] uppercase tracking-wider block">
                Packaging
              </span>
              <span className="font-['Manrope'] text-[13px] text-[#e6e1df] font-medium">
                Degassing Valve
              </span>
            </div>
            <div className="text-center space-y-0.5 border-x border-[#211f1e]">
              <span className="font-['Manrope'] text-[10px] text-[#aa897f] uppercase tracking-wider block">
                Pouch Barrier
              </span>
              <span className="font-['Manrope'] text-[13px] text-[#e6e1df] font-medium">
                Foil Sealed
              </span>
            </div>
            <div className="text-center space-y-0.5">
              <span className="font-['Manrope'] text-[10px] text-[#aa897f] uppercase tracking-wider block">
                Origin Proof
              </span>
              <span className="font-['Manrope'] text-[13px] text-[#e6e1df] font-medium">
                100% Traceable
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Purchase Studio Configuration & Live Order Form */}
        <div className="lg:col-span-6 space-y-8">
          {/* Header & Identity Section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-['Manrope'] text-[11px] font-bold text-[#ff5e1a] uppercase tracking-widest">
                SINGLE ESTATE EXCLUSIVE
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#5b4138]" />
              <span className="font-mono text-[11px] text-[#f3bc8b]">CROP LOT 2025</span>
            </div>
            <h1 className="font-['Manrope'] text-3xl md:text-5xl font-medium tracking-tight text-[#e6e1df] uppercase">
              TATO COFFEE
            </h1>
            <p className="font-['Anuphan'] text-lg md:text-xl text-[#ffdcc0] font-light">
              กาแฟอาราบิก้าแท้ 100% ซิงเกิลออริจิน จากดอยเวียง
            </p>
          </div>

          {/* Terroir Metadata Key-Value Matrix */}
          <div className="bg-[#1d1b1a] rounded-xl p-5 space-y-2.5 border border-[#2b2a28]">
            {TERROIR_SPECS.map((spec) => (
              <div
                key={translateText(spec.label, language)}
                className="flex items-baseline justify-between py-1 border-b border-[#2b2a28]/60 last:border-b-0"
              >
                <span className="font-['Manrope'] text-[11px] font-bold text-[#e3beb3]/70 uppercase">
                  {spec.label}
                </span>
                <span className="font-['Manrope'] text-[13px] text-[#e6e1df] font-medium text-right">
                  {translateText(spec.value, language)}
                </span>
              </div>
            ))}
          </div>

          {/* Price Display Anchor */}
          <div className="bg-[#211f1e] rounded-xl p-6 flex flex-col md:flex-row md:items-end justify-between gap-4 border border-[#2b2a28]">
            <div className="space-y-1">
              <span className="font-['Manrope'] text-[11px] font-bold text-[#e3beb3]/70 uppercase tracking-widest">
                Base Investment / ราคาต่อกิโลกรัม
              </span>
              <div className="flex items-baseline gap-2">
                <span className="font-['Manrope'] text-4xl md:text-5xl font-bold tracking-tight text-[#e6e1df]">
                  550
                </span>
                <span className="font-['Manrope'] text-lg text-[#f3bc8b] font-medium">
                  THB / KG
                </span>
              </div>
            </div>
            <div className="text-left md:text-right space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-[#67401a]/40 text-[#ffdcc0] font-mono text-[11px] border border-[#67401a]">
                <span className="material-symbols-outlined text-[14px]">local_shipping</span>
                <span>FREE SHIPPING ON 2+ KG</span>
              </div>
              <p className="font-['Anuphan'] text-[12px] text-[#e3beb3]/70">
                รวมภาษีมูลค่าเพิ่มแล้ว · จัดส่งฟรีเมื่อสั่งซื้อ 2 กก. ขึ้นไป
              </p>
            </div>          </div>

          {/* ORDER CONFIGURATION OR SUCCESS STAGE */}
          {!completedOrder ? (
            <form onSubmit={handleFormSubmit} className="space-y-7">
              {/* Roast Profile Selector */}
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-['Manrope'] text-[11px] font-bold text-[#e6e1df] uppercase tracking-wider">
                    ROAST PROFILE / เลือกระดับการคั่ว
                  </span>
                  <span className="font-mono text-[11px] text-[#ff5e1a] font-semibold">
                    {language === 'th' ? activeRoastObj.nameThai : activeRoastObj.name} ({translateText(activeRoastObj.subtitle, language)})
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {ROAST_PROFILES.map((profile) => {
                    const isSelected = selectedRoast === profile.id;
                    return (
                      <div
                        key={profile.id}
                        onClick={() => setSelectedRoast(profile.id)}
                        className={`cursor-pointer p-4 rounded-xl transition-all duration-200 flex flex-col justify-between border ${
                          isSelected
                            ? 'bg-[#ff5e1a]/10 border-[#ff5e1a]'
                            : 'bg-[#1d1b1a] border-[#2b2a28] hover:bg-[#211f1e]'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span
                              className={`font-['Manrope'] text-[16px] font-bold ${
                                isSelected ? 'text-[#ff5e1a]' : 'text-[#e6e1df]'
                              }`}
                            >
                              {language === 'th' ? profile.nameThai : profile.name}
                            </span>
                            <span
                              className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                                isSelected ? 'bg-[#ff5e1a]' : 'bg-[#363433]'
                              }`}
                            >
                              {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#0f0e0d]" />}
                            </span>
                          </div>
                          <span
                            className={`font-['Anuphan'] text-[13px] block ${
                              isSelected ? 'text-[#ffdbcf]' : 'text-[#f3bc8b]'
                            }`}
                          >
                            {translateText(profile.subtitle, language)}
                          </span>
                        </div>
                        <p className="font-['Manrope'] text-[11px] leading-snug text-[#e3beb3]/80 mt-2">
                          {translateText(profile.description, language)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Grind Size Selector */}
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-['Manrope'] text-[11px] font-bold text-[#e6e1df] uppercase tracking-wider">
                    GRIND SIZE / ขนาดการบด
                  </span>
                  <span className="font-mono text-[11px] text-[#f3bc8b]">
                    {activeGrindObj.label.split('(')[0].trim()}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {GRIND_OPTIONS.map((grind) => {
                    const isSelected = selectedGrind === grind.id;
                    return (
                      <button
                        type="button"
                        key={grind.id}
                        onClick={() => setSelectedGrind(grind.id)}
                        className={`text-left p-3 rounded-lg border transition-all ${
                          isSelected
                            ? 'bg-[#ff5e1a]/10 border-[#ff5e1a] text-[#ffdbcf]'
                            : 'bg-[#1d1b1a] border-[#2b2a28] hover:bg-[#211f1e] text-[#e6e1df]'
                        }`}
                      >
                        <div className="font-['Manrope'] text-[13px] font-semibold flex items-center justify-between">
                          <span>{translateText(grind.label, language)}</span>
                          {isSelected && (
                            <span className="material-symbols-outlined text-[16px] text-[#ff5e1a]">
                              check
                            </span>
                          )}
                        </div>
                        <p className="font-['Anuphan'] text-[11px] text-[#e3beb3]/65 mt-0.5">
                          {translateText(grind.desc, language)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Customer Details & Dispatch Inputs */}
              <div className="space-y-4 pt-2">
                <span className="font-['Manrope'] text-[11px] font-bold text-[#e6e1df] uppercase tracking-wider block">
                  CUSTOMER & DELIVERY SPECIFICATION / ข้อมูลผู้สั่งซื้อ
                </span>

                <div className="space-y-3">
                  {/* Name Field */}
                  <div>
                    <label className="font-['Manrope'] text-[12px] text-[#e3beb3]/80 block mb-1">
                      Full Name / ชื่อ-นามสกุล <span className="text-[#ff5e1a]">*</span>
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="เช่น ภูมิรพี วงศ์สุวรรณ"
                      className="w-full h-11 px-4 rounded-xl bg-[#1d1b1a] text-[#e6e1df] placeholder:text-[#aa897f]/60 focus:outline-none focus:border-[#ff5e1a] border border-[#2b2a28] transition-all text-[14px]"
                    />
                    {errors.name && <p className="text-[#ffb4ab] text-xs mt-1">{errors.name}</p>}
                  </div>

                  {/* Contact Grid: Email & Phone */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="font-['Manrope'] text-[12px] text-[#e3beb3]/80 block mb-1">
                        Email Address / อีเมล <span className="text-[#ff5e1a]">*</span>
                      </label>
                      <input
                        type="email"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder="curator@tatocoffee.com"
                        className="w-full h-11 px-4 rounded-xl bg-[#1d1b1a] text-[#e6e1df] placeholder:text-[#aa897f]/60 focus:outline-none focus:border-[#ff5e1a] border border-[#2b2a28] transition-all text-[14px]"
                      />
                      {errors.email && <p className="text-[#ffb4ab] text-xs mt-1">{errors.email}</p>}
                    </div>

                    <div>
                      <label className="font-['Manrope'] text-[12px] text-[#e3beb3]/80 block mb-1">
                        Phone Number / เบอร์โทรศัพท์ <span className="text-[#ff5e1a]">*</span>
                      </label>
                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="081 234 5678"
                        className="w-full h-11 px-4 rounded-xl bg-[#1d1b1a] text-[#e6e1df] placeholder:text-[#aa897f]/60 focus:outline-none focus:border-[#ff5e1a] border border-[#2b2a28] transition-all text-[14px]"
                      />
                      {errors.phone && <p className="text-[#ffb4ab] text-xs mt-1">{errors.phone}</p>}
                    </div>
                  </div>

                  {/* Address Field */}
                  <div>
                    <label className="font-['Manrope'] text-[12px] text-[#e3beb3]/80 block mb-1">
                      Shipping Address / ที่อยู่จัดส่ง <span className="text-[#ff5e1a]">*</span>
                    </label>
                    <textarea
                      rows={2}
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      placeholder="บ้านเลขที่, อาคาร, ซอย, ถนน, ตำบล/แขวง, อำเภอ/เขต, จังหวัด, รหัสไปรษณีย์"
                      className="w-full p-3 rounded-xl bg-[#1d1b1a] text-[#e6e1df] placeholder:text-[#aa897f]/60 focus:outline-none focus:border-[#ff5e1a] border border-[#2b2a28] transition-all text-[14px] resize-none"
                    />
                    {errors.address && <p className="text-[#ffb4ab] text-xs mt-1">{errors.address}</p>}
                  </div>

                  {/* Optional Note */}
                  <div>
                    <label className="font-['Manrope'] text-[12px] text-[#e3beb3]/70 block mb-1">
                      Note to Roaster / ความประสงค์เพิ่มเติม (ถ้ามี)
                    </label>
                    <input
                      type="text"
                      value={customerNote}
                      onChange={(e) => setCustomerNote(e.target.value)}
                      placeholder="เช่น ขอบดสำหรับ Aeropress ฟิลเตอร์โลหะ, ส่งช่วงบ่าย"
                      className="w-full h-10 px-4 rounded-xl bg-[#1d1b1a] text-[#e6e1df] placeholder:text-[#aa897f]/40 focus:outline-none focus:border-[#ff5e1a] border border-[#2b2a28] transition-all text-[13px]"
                    />
                  </div>

                  {/* Payment Method Selector */}
                  <div className="pt-2">
                    <label className="font-['Manrope'] text-[12px] text-[#e3beb3]/80 block mb-1.5">
                      Payment Method / วิธีการชำระเงิน
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('promptpay')}
                        className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all ${
                          paymentMethod === 'promptpay'
                            ? 'bg-[#ff5e1a]/10 border-[#ff5e1a] text-[#ffdbcf]'
                            : 'bg-[#1d1b1a] border-[#2b2a28] text-[#e3beb3]/80'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[18px] text-[#ff5e1a]">qr_code_2</span>
                        <div className="font-['Manrope'] text-[12px] leading-tight font-medium">
                          PromptPay QR
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMethod('cod')}
                        className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all ${
                          paymentMethod === 'cod'
                            ? 'bg-[#ff5e1a]/10 border-[#ff5e1a] text-[#ffdbcf]'
                            : 'bg-[#1d1b1a] border-[#2b2a28] text-[#e3beb3]/80'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[18px] text-[#f3bc8b]">local_shipping</span>
                        <div className="font-['Manrope'] text-[12px] leading-tight font-medium">
                          เก็บเงินปลายทาง (COD)
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMethod('credit_card')}
                        className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all ${
                          paymentMethod === 'credit_card'
                            ? 'bg-[#ff5e1a]/10 border-[#ff5e1a] text-[#ffdbcf]'
                            : 'bg-[#1d1b1a] border-[#2b2a28] text-[#e3beb3]/80'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[18px] text-[#d4c3bd]">credit_card</span>
                        <div className="font-['Manrope'] text-[12px] leading-tight font-medium">
                          บัตรเครดิต / เดบิต
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Quantity Stepper with Calculated Total */}
                  <div className="pt-2">
                    <label className="font-['Manrope'] text-[12px] text-[#e3beb3]/80 block mb-1.5">
                      Quantity / จำนวนกิโลกรัม (1 KG = 1 Pouch)
                    </label>
                    <div className="flex items-center justify-between bg-[#1d1b1a] rounded-xl p-2 px-3 border border-[#2b2a28]">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onTouchStart={() => {}}
                          onClick={() => handleQuantityChange(-1)}
                          className="relative z-50 w-9 h-9 rounded-lg bg-[#363433] hover:bg-[#3b3937] text-[#e6e1df] flex items-center justify-center transition-colors active:scale-95 touch-manipulation pointer-events-auto cursor-pointer select-none"
                          style={{ WebkitTapHighlightColor: 'transparent', WebkitUserSelect: 'none', userSelect: 'none' }}
                          aria-label="Decrease quantity"
                        >
                          <span className="material-symbols-outlined text-[18px]">remove</span>
                        </button>
                        <span className="font-['Manrope'] text-[18px] font-bold px-4 text-[#e6e1df] min-w-[70px] text-center">
                          {quantityKg} KG
                        </span>
                        <button
                          type="button"
                          onTouchStart={() => {}}
                          onClick={() => handleQuantityChange(1)}
                          className="relative z-50 w-9 h-9 rounded-lg bg-[#363433] hover:bg-[#3b3937] text-[#e6e1df] flex items-center justify-center transition-colors active:scale-95 touch-manipulation pointer-events-auto cursor-pointer select-none"
                          style={{ WebkitTapHighlightColor: 'transparent', WebkitUserSelect: 'none', userSelect: 'none' }}
                          aria-label="Increase quantity"
                        >
                          <span className="material-symbols-outlined text-[18px]">add</span>
                        </button>
                      </div>

                      {/* Live Calculated Breakdown Subtext */}
                      <div className="text-right">
                        <span className="font-['Manrope'] text-[10px] text-[#aa897f] uppercase block">
                          Packaging Standard
                        </span>
                        <span className="font-mono text-[11px] text-[#f3bc8b]">
                          {quantityKg}x 1000g Degassed Foil Bag{quantityKg > 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Total Summary & Shipping Bar */}
              <div className="bg-[#0f0e0d] rounded-xl p-4 space-y-2 border border-[#2b2a28]">
                <div className="flex items-center justify-between text-[#e3beb3]/80 font-['Manrope'] text-[13px]">
                  <span>Subtotal / ยอดรวม</span>
                  <span className="font-mono text-[#e6e1df] font-medium">
                    {subtotal.toLocaleString('th-TH')} THB
                  </span>
                </div>

                <div className="flex items-center justify-between text-[#e3beb3]/80 font-['Manrope'] text-[13px]">
                  <span className="flex items-center gap-1.5">
                    <span>Shipping / ค่าจัดส่ง</span>
                    {quantityKg >= 2 ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#67401a]/70 text-[#ffdcc0] font-semibold">
                        PROMO FREE
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2b2a28] text-[#aa897f]">
                        STANDARD
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[#e6e1df]">
                    {quantityKg >= 2 ? 'FREE (ฟรี)' : `${shipping} THB`}
                  </span>
                </div>

                <div className="pt-2 mt-2 border-t border-[#211f1e] flex items-baseline justify-between text-[#e6e1df]">
                  <span className="font-['Manrope'] text-[16px] font-bold uppercase tracking-tight">
                    Total / ยอดรวมสุทธิ:
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-['Manrope'] text-3xl font-extrabold text-[#ff5e1a]">
                      {total.toLocaleString('th-TH')}
                    </span>
                    <span className="font-mono text-[13px] text-[#f3bc8b]">THB</span>
                  </div>
                </div>
              </div>

              {/* High Prominence Call to Action */}
              <div className="space-y-2">
                <button
                  type="submit"
                  className="w-full py-4 px-6 rounded-xl bg-[#ff5e1a] text-[#390c00] hover:text-[#ffdbcf] hover:bg-[#822800] font-['Manrope'] text-[15px] font-bold tracking-wider uppercase transition-all duration-200 shadow-[0_16px_32px_-6px_rgba(255,94,26,0.35)] flex items-center justify-center gap-2 active:scale-[0.99]"
                >
                  <span className="material-symbols-outlined text-[20px]">shopping_bag</span>
                  <span>ORDER TATO · สั่งซื้อ TATO</span>
                </button>
                <p className="text-center font-['Anuphan'] text-[12px] text-[#e3beb3]/70">
                  🔒 ชำระเงินปลายทาง หรือรับลิงก์ชำระผ่านพร้อมเพย์ทาง SMS / อีเมลยืนยัน
                </p>
              </div>
            </form>
          ) : (
            /* IN-PAGE SUCCESS STATE */
            <div className="bg-[#0f0e0d] rounded-2xl p-6 md:p-8 space-y-6 shadow-2xl border border-[#ff5e1a]/40 animate-fade-in">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#ff5e1a] text-[#390c00] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[26px]">check</span>
                </div>
                <div>
                  <span className="font-mono text-[11px] text-[#ff5e1a] uppercase tracking-widest block font-bold">
                    ORDER CONFIRMED #{completedOrder.orderNumber}
                  </span>
                  <h2 className="font-['Manrope'] text-xl md:text-2xl text-[#e6e1df] font-semibold">
                    ขอบคุณสำหรับคำสั่งซื้อ TATO Coffee
                  </h2>
                </div>
              </div>

              <div className="bg-[#1d1b1a] rounded-xl p-5 space-y-3 border border-[#2b2a28]">
                <p className="font-['Anuphan'] text-[14px] text-[#ffdcc0] leading-relaxed">
                  เมล็ดกาแฟของคุณจะถูกคั่วสดใหม่ตามรอบคั่วถัดไป และจัดส่งตรงจากไร่ดอยเวียงภายใน 24-48 ชั่วโมง
                </p>

                <div className="space-y-1.5 pt-2 font-mono text-[12px] text-[#e3beb3]/80 border-t border-[#2b2a28]">
                  <div className="flex justify-between">
                    <span>RECIPIENT / ผู้รับ:</span>
                    <span className="text-[#e6e1df] font-medium">{completedOrder.customer.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>PHONE / เบอร์โทร:</span>
                    <span className="text-[#e6e1df]">{completedOrder.customer.phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ROAST PROFILE / ระดับคั่ว:</span>
                    <span className="text-[#ff5e1a] font-medium">
                      {completedOrder.roast.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>GRIND / การบด:</span>
                    <span className="text-[#f3bc8b]">
                      {GRIND_OPTIONS.find((g) => g.id === completedOrder.grind)?.label.split('(')[0]}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>QUANTITY / ปริมาณ:</span>
                    <span className="text-[#e6e1df] font-medium">
                      {completedOrder.quantityKg} KG ({completedOrder.quantityKg} ถุง)
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 text-[13px]">
                    <span>TOTAL SETTLEMENT:</span>
                    <span className="text-[#ff5e1a] font-bold">
                      {completedOrder.total.toLocaleString('th-TH')} THB
                    </span>
                  </div>
                </div>

                {/* Simulated PromptPay QR if selected */}
                {completedOrder.customer.paymentMethod === 'promptpay' && (
                  <div className="mt-3 p-4 rounded-lg bg-[#211f1e] border border-[#ff5e1a]/30 text-center space-y-2">
                    <span className="font-['Manrope'] text-[11px] font-bold text-[#ff5e1a] uppercase tracking-wider block">
                      PROMPTPAY QR PAYMENT (สแกนชำระเงิน)
                    </span>
                    <div className="w-36 h-36 mx-auto bg-white p-2 rounded-lg flex flex-col items-center justify-center">
                      {/* SVG Simulation of QR Code */}                      <svg viewBox="0 0 100 100" className="w-full h-full text-black">
                        <rect x="5" y="5" width="25" height="25" fill="black" />
                        <rect x="10" y="10" width="15" height="15" fill="white" />
                        <rect x="13" y="13" width="9" height="9" fill="black" />
                        <rect x="70" y="5" width="25" height="25" fill="black" />
                        <rect x="75" y="10" width="15" height="15" fill="white" />
                        <rect x="78" y="13" width="9" height="9" fill="black" />
                        <rect x="5" y="70" width="25" height="25" fill="black" />
                        <rect x="10" y="75" width="15" height="15" fill="white" />
                        <rect x="13" y="78" width="9" height="9" fill="black" />
                        <rect x="40" y="20" width="8" height="8" fill="black" />
                        <rect x="50" y="35" width="8" height="8" fill="black" />
                        <rect x="40" y="50" width="15" height="15" fill="black" />
                        <rect x="70" y="65" width="10" height="20" fill="black" />
                        <rect x="60" y="80" width="15" height="10" fill="black" />
                        <rect x="35" y="75" width="8" height="15" fill="black" />
                      </svg>
                    </div>
                    <p className="font-mono text-[11px] text-[#e3beb3]/80">
                      PromptPay ID: 081-234-5678 (TATO COFFEE ESTATE)
                    </p>
                    <p className="text-[11px] text-[#f3bc8b] font-['Anuphan']">
                      ยอดชำระ: {completedOrder.total.toLocaleString('th-TH')} บาท (บันทึกสลิปหรือชำระภายใน 24 ชม.)
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={onViewOrders}
                  className="w-full py-3 rounded-lg bg-[#ff5e1a] text-[#390c00] hover:bg-[#822800] hover:text-[#ffdbcf] font-['Manrope'] text-[12px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                  <span>ดูใบเสร็จและสถานะการคั่ว / VIEW ORDER DETAILS</span>
                </button>

                <button
                  type="button"
                  onClick={resetOrderForm}
                  className="w-full py-3 rounded-lg bg-[#2b2a28] hover:bg-[#363433] text-[#e6e1df] font-['Manrope'] text-[12px] font-bold uppercase tracking-wider transition-colors"
                >
                  สั่งซื้อเพิ่มเติม / PLACE ANOTHER ORDER
                </button>
              </div>
            </div>
          )}

          {/* Estate Heritage Note */}
          <div className="bg-[#0f0e0d]/80 rounded-xl p-4 flex items-start gap-3 border border-[#2b2a28]">
            <span className="material-symbols-outlined text-[#ff5e1a] text-[20px] shrink-0 mt-0.5">
              verified
            </span>
            <p className="font-['Anuphan'] text-[13px] text-[#e3beb3]/80 leading-relaxed">
              <strong>100% Single Estate Guarantee:</strong> เมล็ดกาแฟทุกซองเก็บเกี่ยวจากฟาร์มดอยเวียง ไม่ผสมเมล็ดจากแหล่งอื่น คั่วทีละแบตช์เล็กด้วยโปรไฟล์ความร้อนที่คำนวณตามความชื้นสัมพัทธ์ของอากาศ
            </p>
          </div>
        </div>
      </div>

      {/* SENSORY TASTING NOTES COMPONENT (Full Width Sensory Horizon) */}
      <div className="mt-20 pt-16 border-t border-[#211f1e]">
        <div className="space-y-2 mb-8">
          <div className="flex items-center gap-2">
            <span className="font-['Manrope'] text-[11px] font-bold text-[#ff5e1a] uppercase tracking-wider">
              CUPPING PROFILE
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#5b4138]" />
            <span className="font-mono text-[11px] text-[#e3beb3]/70">SCA SCORE: 85.50</span>
          </div>
          <h2 className="font-['Manrope'] text-2xl md:text-3xl font-medium tracking-tight text-[#e6e1df] uppercase">
            Sensory Notes & Extraction Range
          </h2>
          <p className="font-['Anuphan'] text-[14px] md:text-[15px] text-[#e3beb3]/80 max-w-2xl leading-relaxed">
            โปรไฟล์กลิ่นและรสชาติที่ถูกบันทึกจากการคัปปิ้งโดย Q Grader ประจำไร่ดอยเวียง ค้นพบอัตลักษณ์เฉพาะตัวของดินภูเขาและความสูง 1,834 เมตร
          </p>
        </div>

        {/* Sensory Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {SENSORY_CARDS.map((card) => (
            <div
              key={card.labelEn}
              className="bg-[#1d1b1a] rounded-xl p-5 space-y-2 relative overflow-hidden border border-[#2b2a28]"
            >
              <div className={`w-1 h-8 rounded-full ${card.lineColor} absolute top-5 left-0`} />
              <span className="font-['Manrope'] text-[10px] text-[#aa897f] uppercase tracking-wider block pl-2 font-bold">
                {language === 'th' ? card.labelTh : card.labelEn}
              </span>
              <h3 className="font-['Manrope'] text-[16px] text-[#e6e1df] font-semibold pl-2 leading-tight">
                {language === 'th' ? card.titleTh : card.titleEn}
              </h3>
              <p className="font-['Anuphan'] text-[12px] text-[#e3beb3]/70 pl-2 leading-relaxed">
                {language === 'th' ? card.descTh : card.descEn}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};