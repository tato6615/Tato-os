import React, { useState, useEffect, useRef } from 'react';
import { RoastType, GrindType, OrderItem, CheckoutResult } from '../types';
import { PaymentBox } from './ReceiptsPanel';
import { ASSETS, ROAST_PROFILES, GRIND_OPTIONS, TERROIR_SPECS, SENSORY_CARDS } from '../data/coffeeData';
import { useLanguage, translateText } from '../i18n';
import { quote as buildQuote, SHIPPING } from '../../shared/shipping.js';
import { validateCustomer } from '../../shared/validate.js';

const PRODUCT_ID = 'e71d46e6-8f1d-4c3d-aedc-8461d79f13c0';
type ServerQuote = { key: string; unit_price: number; subtotal: number; discount: number; shipping: number; total: number; code: { input: string; valid: boolean; error: string | null; min_kg: number | null } | null; capacity: { limited: boolean; left: number | null }; turnstile_site_key: string };
const CODE_ERRORS: Record<string, string> = { CODE_INVALID: 'ไม่พบรหัสส่วนลดนี้', CODE_EXPIRED: 'รหัสส่วนลดหมดอายุแล้ว', CODE_USED_UP: 'รหัสส่วนลดถูกใช้ครบแล้ว', CODE_MIN_KG: 'ปริมาณไม่ถึงขั้นต่ำของรหัสนี้' };
const FIELD_ORDER = ['name', 'phone', 'email', 'address', 'postal_code', 'consent', 'code'];
const inputBase = "w-full px-4 rounded-xl bg-[#1d1b1a] text-[#e6e1df] placeholder:text-[#aa897f]/60 focus:outline-none focus:border-[#ff5e1a] border transition-all";
const bdr = (bad: boolean) => (bad ? 'border-[#ff6b6b]' : 'border-[#2b2a28]');
const SUBMIT_ERRORS: Record<string, string> = { RATE_LIMITED: 'ส่งคำสั่งซื้อถี่เกินไป กรุณารอสักครู่แล้วลองใหม่', TURNSTILE_FAILED: 'ยืนยันตัวตนไม่ผ่าน กรุณาลองใหม่', PRICE_MISMATCH: 'ราคามีการเปลี่ยนแปลง กรุณาตรวจยอดสุทธิอีกครั้งแล้วกดสั่งซื้อ', CAPACITY_FULL: 'ขออภัย รอบคั่วนี้เต็มแล้ว กรุณาลดปริมาณหรือติดต่อร้าน' };

interface ProductViewProps {
  initialRoast?: RoastType;
  onOrderSuccess: (order: OrderItem) => Promise<CheckoutResult>;
  onTrack?: (event_type: string, metadata?: Record<string, unknown>) => void;
  onViewOrders: () => void;
  prefill?: OrderItem | null;
  onPrefillConsumed?: () => void;
}

export const ProductView: React.FC<ProductViewProps> = ({
  initialRoast = 'medium',
  onOrderSuccess,
  onTrack,
  onViewOrders,
  prefill = null,
  onPrefillConsumed,
}) => {
  const [selectedRoast, setSelectedRoast] = useState<RoastType>(initialRoast);
  const [selectedGrind, setSelectedGrind] = useState<GrindType>('whole_bean');
  const [quantityKg, setQuantityKg] = useState<number>(0.5);
  const [quantityInput, setQuantityInput] = useState<string>('0.5');
  const [paymentMethod, setPaymentMethod] = useState<'promptpay' | 'cod' | 'credit_card'>('promptpay');

  // Customer form fields
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [customerPostal, setCustomerPostal] = useState('');
  const [consent, setConsent] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [appliedCode, setAppliedCode] = useState('');
  const [serverQuote, setServerQuote] = useState<ServerQuote | null>(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const requestIdRef = useRef<string | null>(null);
  const submitLockRef = useRef(false);
  const turnstileBoxRef = useRef<HTMLDivElement | null>(null);
  const turnstileIdRef = useRef<any>(null);

  // Validation errors
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Success state
  const [completedOrder, setCompletedOrder] = useState<OrderItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const checkoutStartedRef = useRef(false);
  const orderDoneRef = useRef(false);
  const startCheckout = () => {
    if (checkoutStartedRef.current) return;
    checkoutStartedRef.current = true;
    onTrack?.('checkout_start');
  };
  useEffect(() => {
    const fireAbandon = () => {
      if (checkoutStartedRef.current && !orderDoneRef.current) {
        checkoutStartedRef.current = false;
        onTrack?.('checkout_abandon');
      }
    };
    window.addEventListener('pagehide', fireAbandon);
    return () => {
      window.removeEventListener('pagehide', fireAbandon);
      fireAbandon();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { language } = useLanguage();
  const tr = (en: string, th: string) => language === 'th' ? th : en;

  // Sync initialRoast when passed
  useEffect(() => {
    if (initialRoast) {
      setSelectedRoast(initialRoast);
    }
  }, [initialRoast]);

  const unitPrice = 550;
  const minimumQuantityKg = 0.5;
  const maximumQuantityKg = 100;
  const quantityStepKg = 0.5;

  // Price = shared formula (shared/shipping.js, same file the server uses). While the server quote
  // for the current inputs is loading we show the local calculation; once it arrives its numbers win.
  const localQuote = buildQuote({ kg: quantityKg, unitPrice, postal: customerPostal.trim() });
  const quoteKey = quantityKg + '|' + customerPostal.trim() + '|' + appliedCode;
  const sq = serverQuote && serverQuote.key === quoteKey ? serverQuote : null;
  const subtotal = sq ? sq.subtotal : localQuote.subtotal;
  const discount = sq ? sq.discount : 0;
  const shipping = sq ? sq.shipping : localQuote.shipping;
  const total = sq ? sq.total : localQuote.total;
  const codeError = sq && sq.code && !sq.code.valid
    ? (sq.code.error === 'CODE_MIN_KG' && sq.code.min_kg
        ? `รหัสนี้ใช้ได้เมื่อสั่งครบ ${sq.code.min_kg} กก. (ตอนนี้ ${quantityKg} กก.)`
        : (CODE_ERRORS[sq.code.error || ''] || 'ใช้รหัสส่วนลดนี้ไม่ได้'))
    : null;
  const codeChecking = !!appliedCode && !sq;
  const codeApplied = !!appliedCode && !!sq && !!sq.code && sq.code.valid;
  const kgToFree = Math.max(0, Math.round((SHIPPING.freeFromKg - quantityKg) * 100) / 100);
  const siteKey = serverQuote ? serverQuote.turnstile_site_key : '';
  const capacityLeft = serverQuote && serverQuote.capacity.limited ? serverQuote.capacity.left : null;
  const capacityFull = capacityLeft !== null && quantityKg > capacityLeft;

  useEffect(() => {
    const key = quoteKey;
    const h = window.setTimeout(() => {
      const qs = new URLSearchParams({ action: 'quote', product_id: PRODUCT_ID, kg: String(quantityKg), postal: customerPostal.trim(), code: appliedCode });
      fetch('/api/checkout?' + qs.toString()).then((r) => r.json()).then((d) => {
        if (d && d.success) setServerQuote({ ...d, key });
      }).catch(() => {});
    }, 350);
    return () => window.clearTimeout(h);
  }, [quoteKey]);

  useEffect(() => {
    if (!siteKey || !turnstileBoxRef.current) return;
    const w = window as any;
    const mount = () => {
      if (!w.turnstile || !turnstileBoxRef.current || turnstileIdRef.current !== null) return;
      turnstileIdRef.current = w.turnstile.render(turnstileBoxRef.current, { sitekey: siteKey, theme: 'dark', callback: (t: string) => setTurnstileToken(t), 'expired-callback': () => setTurnstileToken(''), 'error-callback': () => setTurnstileToken('') });
    };
    if (w.turnstile) { mount(); return; }
    let sc = document.getElementById('cf-turnstile-script') as HTMLScriptElement | null;
    if (!sc) { sc = document.createElement('script'); sc.id = 'cf-turnstile-script'; sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; sc.async = true; document.head.appendChild(sc); }
    sc.addEventListener('load', mount);
    return () => sc && sc.removeEventListener('load', mount);
  }, [siteKey]);

  useEffect(() => {
    if (!prefill) return;
    setSelectedRoast(prefill.roast);
    setSelectedGrind(prefill.grind);
    setQuantityKg(prefill.quantityKg);
    setQuantityInput(String(prefill.quantityKg));
    setCustomerName(prefill.customer.name);
    setCustomerEmail(prefill.customer.email || '');
    setCustomerPhone(prefill.customer.phone);
    setCustomerAddress(prefill.customer.address);
    setCustomerPostal(prefill.customer.postalCode || '');
    setCustomerNote(prefill.customer.note || '');
    onPrefillConsumed && onPrefillConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const formatQuantity = (kg: number) => {
    return Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
  };

  const packagingLabel = (() => {
    const fullKg = Math.floor(quantityKg);
    const hasHalfKg = quantityKg % 1 !== 0;
    const parts: string[] = [];

    if (fullKg > 0) {
      parts.push(`${fullKg}x 1000g Degassed Foil Bag${fullKg > 1 ? 's' : ''}`);
    }
    if (hasHalfKg) {
      parts.push('1x 500g Degassed Foil Bag');
    }

    return parts.join(' + ');
  })();

  const clearErr = (key: string) => setErrors((prev) => {
    if (!prev[key]) return prev;
    const n = { ...prev };
    delete n[key];
    return n;
  });

  const applyCode = () => {
    const c = codeInput.trim().toUpperCase();
    if (!c) return;
    setAppliedCode(c);
    clearErr('code');
  };
  const removeCode = () => {
    setCodeInput('');
    setAppliedCode('');
    clearErr('code');
  };

  const scrollToFirstError = (errs: { [key: string]: string }) => {
    const first = FIELD_ORDER.find((k) => errs[k]);
    if (!first) return;
    window.setTimeout(() => {
      const el = document.getElementById('f-' + first);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof (el as HTMLElement).focus === 'function') (el as HTMLElement).focus({ preventScroll: true });
      }
    }, 30);
  };

  // Single source of truth for the quantity stepper.
  // Every button press derives the next quantity from the latest React state,
  // then the displayed subtotal/total is recalculated from that same state.
  const handleQuantityChange = (delta: number) => {
    const next = Math.min(
      maximumQuantityKg,
      Math.max(minimumQuantityKg, Number((quantityKg + delta * quantityStepKg).toFixed(2)))
    );
    setQuantityKg(next);
    setQuantityInput(String(next));
  };

  const handleQuantityInputChange = (value: string) => {
    // Keep the text field free-form while typing.
    // The price is recalculated immediately whenever the typed value is numeric.
    setQuantityInput(value);

    if (value.trim() === '') return;

    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      const next = Math.min(maximumQuantityKg, Math.max(minimumQuantityKg, parsed));
      setQuantityKg(next);
    }
  };

  const handleQuantityInputBlur = () => {
    const parsed = Number(quantityInput);
    const next = Number.isFinite(parsed) && parsed > 0
      ? Math.min(maximumQuantityKg, Math.max(minimumQuantityKg, parsed))
      : minimumQuantityKg;

    setQuantityKg(next);
    setQuantityInput(String(next));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { [key: string]: string } = validateCustomer({ name: customerName, phone: customerPhone, email: customerEmail.trim(), address: customerAddress, postal_code: customerPostal, consent });
    if (siteKey && !turnstileToken) newErrors.turnstile = 'กรุณายืนยันว่าไม่ใช่บอท';
    if (codeInput.trim().toUpperCase() !== appliedCode) newErrors.code = 'กรุณากดปุ่ม "ใช้รหัส" ก่อน หรือกด ✕ เพื่อเอารหัสออก';
    else if (appliedCode && codeError) newErrors.code = codeError;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      scrollToFirstError(newErrors);
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
        postalCode: customerPostal.trim(),
        note: customerNote.trim() || undefined,
        paymentMethod,
      },
      timestamp: new Date().toISOString(),
      status: 'Roast Queued',
      discount,
      discountCode: appliedCode || undefined,
      expectedTotal: total,
      requestId: (requestIdRef.current = requestIdRef.current || crypto.randomUUID()),
      consent,
      turnstileToken: turnstileToken || undefined,
    };

    if (submitting || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await onOrderSuccess(newOrder);
      if (result.ok && result.order) { orderDoneRef.current = true; requestIdRef.current = null; setCompletedOrder(result.order); }
      else {
        if (result.fields) { setErrors(result.fields); scrollToFirstError(result.fields); }
        const code = result.error || 'ERROR';
        if (code === 'PRICE_MISMATCH') setServerQuote(null);
        if (siteKey && turnstileIdRef.current !== null) { try { (window as any).turnstile.reset(turnstileIdRef.current); } catch {} setTurnstileToken(''); }
        setSubmitError(code === 'CHECKOUT_VALIDATION' ? 'ข้อมูลบางช่องไม่ถูกต้อง กรุณาตรวจสอบช่องที่มีข้อความสีแดง' : (SUBMIT_ERRORS[code] || CODE_ERRORS[code] || 'สั่งซื้อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง หรือติดต่อร้านโดยตรง (' + code + ')'));
      }
    } catch {
      setSubmitError('เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const resetOrderForm = () => {
    orderDoneRef.current = false;
    checkoutStartedRef.current = false;
    setCompletedOrder(null);
    setQuantityKg(0.5);
    setQuantityInput('0.5');
    setSelectedRoast('medium');
    setSelectedGrind('whole_bean');
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomerNote('');
    setCustomerPostal('');
    setConsent(false);
    setCodeInput('');
    setAppliedCode('');
    requestIdRef.current = null;
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
          <span className="text-[#ff5e1a] font-semibold">TATO 1,500M</span>
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
                  DOI WIANG PA 1,500M
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
                  {tr('Cherries selectively hand-picked at peak ripeness on steep northern highland slopes. Cold mountain night fermentation.', 'เก็บผลเชอร์รี่ด้วยมือเฉพาะผลที่สุกเต็มที่บนพื้นที่ลาดชันทางภาคเหนือ และหมักในอุณหภูมิที่เย็นจากภูเขายามค่ำคืน')}
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
            <form onFocusCapture={startCheckout} onSubmit={handleFormSubmit} className="space-y-7">
              {/* Roast Profile Selector */}
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-['Manrope'] text-[11px] font-bold text-[#e6e1df] uppercase tracking-wider">
                    1 · ระดับการคั่ว / ROAST PROFILE
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
                        onClick={() => { setSelectedRoast(profile.id); onTrack?.('option_change', { option: 'roast', value: profile.id }); }}
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
                    2 · ขนาดการบด / GRIND SIZE
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
                        onClick={() => { setSelectedGrind(grind.id); onTrack?.('option_change', { option: 'grind', value: grind.id }); }}
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

              {/* Quantity */}
              <div className="space-y-3">
                <span className="font-['Manrope'] text-[11px] font-bold text-[#e6e1df] uppercase tracking-wider block">
                  3 · จำนวน / QUANTITY
                </span>
                  <div>
                    <label className="font-['Manrope'] text-[12px] text-[#e3beb3]/80 block mb-1.5">
                      จำนวน (กิโลกรัม) · ขั้นต่ำ 0.5 กก. เพิ่มครั้งละ 0.5 กก.
                    </label>
                    <div className="flex items-center justify-between bg-[#1d1b1a] rounded-xl p-2 px-3 border border-[#2b2a28]">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleQuantityChange(-1);
                          }}
                          className="relative z-50 w-9 h-9 rounded-lg bg-[#363433] hover:bg-[#3b3937] text-[#e6e1df] flex items-center justify-center transition-colors active:scale-95 touch-manipulation pointer-events-auto cursor-pointer select-none"
                          style={{ WebkitTapHighlightColor: 'transparent', WebkitUserSelect: 'none', userSelect: 'none' }}
                          aria-label="Decrease quantity"
                        >
                          <span className="material-symbols-outlined text-[18px] pointer-events-none">remove</span>
                        </button>
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={quantityInput}
                          onChange={(e) => handleQuantityInputChange(e.target.value)}
                          onBlur={handleQuantityInputBlur}
                          aria-label="Quantity in kilograms"
                          className="font-['Manrope'] text-[18px] font-bold px-2 text-[#e6e1df] w-[78px] text-center bg-transparent border-0 outline-none appearance-none"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleQuantityChange(1);
                          }}
                          className="relative z-50 w-9 h-9 rounded-lg bg-[#363433] hover:bg-[#3b3937] text-[#e6e1df] flex items-center justify-center transition-colors active:scale-95 touch-manipulation pointer-events-auto cursor-pointer select-none"
                          style={{ WebkitTapHighlightColor: 'transparent', WebkitUserSelect: 'none', userSelect: 'none' }}
                          aria-label="Increase quantity"
                        >
                          <span className="material-symbols-outlined text-[18px] pointer-events-none">add</span>
                        </button>
                      </div>

                      {/* Live Calculated Breakdown Subtext */}
                      <div className="text-right">
                        <span className="font-['Manrope'] text-[10px] text-[#aa897f] uppercase block">
                          Packaging Standard
                        </span>
                        <span className="font-mono text-[11px] text-[#f3bc8b]">
                          {packagingLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                <p className="font-['Anuphan'] text-[12px] text-[#f3bc8b]">
                  {shipping === 0
                    ? `✓ สั่งครบ ${SHIPPING.freeFromKg} กก. ส่งฟรี`
                    : `สั่งเพิ่มอีก ${kgToFree} กก. รับส่งฟรี (ตอนนี้ค่าส่ง ${shipping.toLocaleString('th-TH')} บาท)`}
                </p>
              </div>

              {/* Customer Details & Dispatch Inputs */}
              <div className="space-y-4 pt-2">
                <span className="font-['Manrope'] text-[11px] font-bold text-[#e6e1df] uppercase tracking-wider block">
                  4 · ข้อมูลผู้รับและที่อยู่จัดส่ง / DELIVERY DETAILS
                </span>

                <div className="space-y-3">
                  {/* Name Field */}
                  <div>
                    <label className="font-['Manrope'] text-[12px] text-[#e3beb3]/80 block mb-1">
                      ชื่อ-นามสกุล / Full Name <span className="text-[#ff5e1a]">*</span>
                    </label>
                    <input
                      type="text"
                      id="f-name"
value={customerName}
                      onChange={(e) => { setCustomerName(e.target.value); clearErr('name'); }}
                      placeholder="เช่น ภูมิรพี วงศ์สุวรรณ"
                      className={`w-full h-11 px-4 rounded-xl bg-[#1d1b1a] text-[#e6e1df] placeholder:text-[#aa897f]/60 focus:outline-none focus:border-[#ff5e1a] border ${bdr(!!errors.name)} transition-all text-[14px]`}
                    />
                    {errors.name && <p className="text-[#ffb4ab] text-xs mt-1">{errors.name}</p>}
                  </div>

                  {/* Contact Grid: Email & Phone */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="font-['Manrope'] text-[12px] text-[#e3beb3]/80 block mb-1">
                        อีเมล / Email <span className="text-[#e3beb3]/50">(ถ้ามี)</span>
                      </label>
                      <input
                        type="email"
                        id="f-email"
value={customerEmail}
                        onChange={(e) => { setCustomerEmail(e.target.value); clearErr('email'); }}
                        placeholder="curator@tatocoffee.com"
                        className={`w-full h-11 px-4 rounded-xl bg-[#1d1b1a] text-[#e6e1df] placeholder:text-[#aa897f]/60 focus:outline-none focus:border-[#ff5e1a] border ${bdr(!!errors.email)} transition-all text-[14px]`}
                      />
                      {errors.email && <p className="text-[#ffb4ab] text-xs mt-1">{errors.email}</p>}
                    </div>

                    <div>
                      <label className="font-['Manrope'] text-[12px] text-[#e3beb3]/80 block mb-1">
                        เบอร์มือถือ / Phone <span className="text-[#ff5e1a]">*</span>
                      </label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        maxLength={16}
                        id="f-phone"
value={customerPhone}
                        onChange={(e) => { setCustomerPhone(e.target.value); clearErr('phone'); }}
                        placeholder="เช่น 081 234 5678"
                        className={`w-full h-11 px-4 rounded-xl bg-[#1d1b1a] text-[#e6e1df] placeholder:text-[#aa897f]/60 focus:outline-none focus:border-[#ff5e1a] border ${bdr(!!errors.phone)} transition-all text-[14px]`}
                      />
                      {errors.phone && <p className="text-[#ffb4ab] text-xs mt-1">{errors.phone}</p>}
                    </div>
                  </div>

                  {/* Address Field */}
                  <div>
                    <label className="font-['Manrope'] text-[12px] text-[#e3beb3]/80 block mb-1">
                      ที่อยู่จัดส่ง / Address <span className="text-[#ff5e1a]">*</span>
                    </label>
                    <textarea
                      rows={2}
                      id="f-address"
value={customerAddress}
                      onChange={(e) => { setCustomerAddress(e.target.value); clearErr('address'); }}
                      placeholder="บ้านเลขที่, อาคาร, ซอย, ถนน, ตำบล/แขวง, อำเภอ/เขต, จังหวัด, รหัสไปรษณีย์"
                      className={`w-full p-3 rounded-xl bg-[#1d1b1a] text-[#e6e1df] placeholder:text-[#aa897f]/60 focus:outline-none focus:border-[#ff5e1a] border ${bdr(!!errors.address)} transition-all text-[14px] resize-none`}
                    />
                    {errors.address && <p className="text-[#ffb4ab] text-xs mt-1">{errors.address}</p>}
                  </div>

                  {/* Postal code (drives real shipping cost) */}
                  <div>
                    <label className="font-['Manrope'] text-[12px] text-[#e3beb3]/80 block mb-1">
                      รหัสไปรษณีย์ / Postal Code <span className="text-[#ff5e1a]">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      maxLength={5}
                      id="f-postal_code"
value={customerPostal}
                      onChange={(e) => { setCustomerPostal(e.target.value.replace(/\D/g, '')); clearErr('postal_code'); }}
                      placeholder="เช่น 50110 (ใช้คำนวณค่าส่ง)"
                      className={`w-full h-11 px-4 rounded-xl bg-[#1d1b1a] text-[#e6e1df] placeholder:text-[#aa897f]/60 focus:outline-none focus:border-[#ff5e1a] border ${bdr(!!errors.postal_code)} transition-all text-[14px]`}
                    />
                    {errors.postal_code && <p className="text-[#ffb4ab] text-xs mt-1">{errors.postal_code}</p>}
                  </div>

                  {/* Optional Note */}
                  <div>
                    <label className="font-['Manrope'] text-[12px] text-[#e3beb3]/70 block mb-1">
                      หมายเหตุถึงผู้คั่ว / Note (ถ้ามี)
                    </label>
                    <input
                      type="text"
                      value={customerNote}
                      onChange={(e) => setCustomerNote(e.target.value)}
                      placeholder="เช่น ขอบดสำหรับ Aeropress ฟิลเตอร์โลหะ, ส่งช่วงบ่าย"
                      className="w-full h-10 px-4 rounded-xl bg-[#1d1b1a] text-[#e6e1df] placeholder:text-[#aa897f]/40 focus:outline-none focus:border-[#ff5e1a] border border-[#2b2a28] transition-all text-[13px]"
                    />
                  </div>
                </div>
              </div>

              {/* Payment */}
              <div className="space-y-3">
                <span className="font-['Manrope'] text-[11px] font-bold text-[#e6e1df] uppercase tracking-wider block">
                  5 · วิธีชำระเงิน / PAYMENT
                </span>
                  <div>
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

              </div>

              {/* Discount code */}
              <div className="space-y-3">
                <span className="font-['Manrope'] text-[11px] font-bold text-[#e6e1df] uppercase tracking-wider block">
                  6 · รหัสส่วนลด / DISCOUNT CODE <span className="text-[#e3beb3]/50 normal-case font-normal">(ถ้ามี)</span>
                </span>
                <div className="flex gap-2">
                  <input
                    id="f-code"
                    type="text"
                    value={codeInput}
                    onChange={(e) => { setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '')); clearErr('code'); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCode(); } }}
                    maxLength={30}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="พิมพ์รหัสส่วนลด เช่น WELCOME10"
                    className={`flex-1 h-11 px-4 rounded-xl bg-[#1d1b1a] text-[#e6e1df] placeholder:text-[#aa897f]/50 focus:outline-none focus:border-[#ff5e1a] border ${bdr(!!errors.code || (!!appliedCode && !!codeError))} transition-all text-[14px] font-mono`}
                  />
                  {appliedCode && (
                    <button type="button" onClick={removeCode} aria-label="เอารหัสส่วนลดออก" className="h-11 w-11 rounded-xl bg-[#2b2a28] hover:bg-[#363433] text-[#e6e1df] text-[16px]">✕</button>
                  )}
                  <button
                    type="button"
                    onClick={applyCode}
                    disabled={!codeInput.trim() || codeInput.trim().toUpperCase() === appliedCode}
                    className="h-11 px-5 rounded-xl bg-[#ff5e1a] text-[#390c00] font-['Anuphan'] text-[13px] font-bold disabled:opacity-40"
                  >
                    ใช้รหัส
                  </button>
                </div>
                {codeChecking && <p className="text-[#e3beb3]/70 text-xs">กำลังตรวจสอบรหัส…</p>}
                {codeApplied && !codeError && discount > 0 && (
                  <p className="text-[#7be0a0] text-xs">✓ ใช้รหัส {appliedCode} แล้ว · ประหยัด {discount.toLocaleString('th-TH')} บาท</p>
                )}
                {appliedCode && codeError && <p className="text-[#ffb4ab] text-xs">{codeError}</p>}
                {!appliedCode && codeInput.trim() && <p className="text-[#f3c76b] text-xs">กดปุ่ม “ใช้รหัส” เพื่อให้ส่วนลดมีผล</p>}
                {errors.code && <p className="text-[#ffb4ab] text-xs">{errors.code}</p>}
              </div>

              {/* Total Summary & Shipping Bar */}
              <div className="bg-[#0f0e0d] rounded-xl p-5 space-y-2.5 border border-[#ff5e1a]/30">
                <span className="font-['Manrope'] text-[11px] font-bold text-[#e6e1df] uppercase tracking-wider block">
                  สรุปราคา / ORDER SUMMARY
                </span>
                <div className="flex items-center justify-between text-[#e3beb3]/80 font-['Anuphan'] text-[14px]">
                  <span>ค่ากาแฟ ({formatQuantity(quantityKg)} กก. × {unitPrice.toLocaleString('th-TH')} บาท)</span>
                  <span className="font-mono text-[#e6e1df] font-medium">{subtotal.toLocaleString('th-TH')} บาท</span>
                </div>

                {discount > 0 && (
                  <div className="flex items-center justify-between text-[#7be0a0] font-['Anuphan'] text-[14px]">
                    <span>ส่วนลด{appliedCode ? ` (${appliedCode})` : ''}</span>
                    <span className="font-mono">−{discount.toLocaleString('th-TH')} บาท</span>
                  </div>
                )}

                <div className="flex items-start justify-between text-[#e3beb3]/80 font-['Anuphan'] text-[14px]">
                  <span className="flex flex-col">
                    <span>ค่าจัดส่ง</span>
                    <span className="text-[11px] text-[#f3bc8b]">
                      {shipping === 0
                        ? `ส่งฟรี เพราะสั่งครบ ${SHIPPING.freeFromKg} กก.`
                        : `สั่งเพิ่มอีก ${kgToFree} กก. ส่งฟรี`}
                    </span>
                  </span>
                  <span className={`font-mono ${shipping === 0 ? 'text-[#7be0a0]' : 'text-[#e6e1df]'}`}>
                    {shipping === 0 ? 'ฟรี' : `${shipping.toLocaleString('th-TH')} บาท`}
                  </span>
                </div>

                <div className="pt-3 mt-1 border-t border-[#2b2a28] flex items-baseline justify-between text-[#e6e1df]">
                  <span className="font-['Anuphan'] text-[16px] font-bold">ยอดที่ต้องชำระ</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-['Manrope'] text-3xl font-extrabold text-[#ff5e1a]">{total.toLocaleString('th-TH')}</span>
                    <span className="font-['Anuphan'] text-[14px] text-[#f3bc8b]">บาท</span>
                  </div>
                </div>
              </div>

              {/* High Prominence Call to Action */}
              <div className="space-y-2">
                {capacityFull && (
                  <p className="text-center text-[13px] text-[#f3c76b] bg-[#3d2f12] rounded-lg py-2 px-3">
                    รอบคั่วนี้เหลือรับได้อีก {capacityLeft} กก. กรุณาลดปริมาณ หรือติดต่อร้าน
                  </p>
                )}
                <label className="flex items-start gap-2 text-[12px] text-[#e3beb3]/80 font-['Anuphan'] leading-relaxed">
                  <input id="f-consent" type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); clearErr('consent'); }} className="mt-1 h-4 w-4 accent-[#ff5e1a]" />
                  <span>
                    ข้าพเจ้ายินยอมให้เก็บและใช้ชื่อ เบอร์โทร ที่อยู่ เพื่อจัดส่งสินค้าและติดต่อเรื่องคำสั่งซื้อ และยอมรับ{' '}
                    <a href="/privacy/" target="_blank" rel="noopener noreferrer" className="underline text-[#f3bc8b]">นโยบายความเป็นส่วนตัว</a> และ{' '}
                    <a href="/refund/" target="_blank" rel="noopener noreferrer" className="underline text-[#f3bc8b]">นโยบายการคืนสินค้า/เงิน</a>
                  </span>
                </label>
                {errors.consent && <p className="text-[#ffb4ab] text-xs">{errors.consent}</p>}
                {siteKey && <div ref={turnstileBoxRef} className="flex justify-center" />}
                {errors.turnstile && <p className="text-center text-[#ffb4ab] text-xs">{errors.turnstile}</p>}
                {submitError && (
                  <p className="text-center text-[13px] text-[#ff6b6b] bg-[#3a0f0f] rounded-lg py-2 px-3">
                    ⚠️ {submitError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={submitting || capacityFull}
                  className="disabled:opacity-60 w-full py-4 px-6 rounded-xl bg-[#ff5e1a] text-[#390c00] hover:text-[#ffdbcf] hover:bg-[#822800] font-['Manrope'] text-[15px] font-bold tracking-wider uppercase transition-all duration-200 shadow-[0_16px_32px_-6px_rgba(255,94,26,0.35)] flex items-center justify-center gap-2 active:scale-[0.99]"
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
                    ORDER RECEIVED #{completedOrder.orderNumber}
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
                      {completedOrder.quantityKg} กก.
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>SUBTOTAL / ค่ากาแฟ:</span>
                    <span className="text-[#e6e1df] font-medium">{completedOrder.subtotal.toLocaleString("th-TH")} บาท</span>
                  </div>
                  {completedOrder.discount ? (
                    <div className="flex justify-between text-[#7be0a0]">
                      <span>DISCOUNT / ส่วนลด{completedOrder.discountCode ? ` (${completedOrder.discountCode})` : ''}:</span>
                      <span className="font-medium">−{completedOrder.discount.toLocaleString("th-TH")} บาท</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <span>SHIPPING / ค่าจัดส่ง:</span>
                    <span className="text-[#e6e1df] font-medium">{completedOrder.shipping === 0 ? "ฟรี" : `${completedOrder.shipping.toLocaleString("th-TH")} บาท`}</span>
                  </div>
                  <div className="flex justify-between pt-1 text-[13px]">
                    <span>ยอดชำระสุทธิ:</span>
                    <span className="text-[#ff5e1a] font-bold">
                      {completedOrder.total.toLocaleString('th-TH')} บาท
                    </span>
                  </div>
                </div>

                <PaymentBox order={completedOrder} />
              </div>

              {completedOrder.statusUrl && (
                <a href={completedOrder.statusUrl} target="_blank" rel="noopener noreferrer" className="block w-full text-center py-3 rounded-lg bg-[#1d1b1a] border border-[#ff5e1a]/50 text-[#f3bc8b] font-['Anuphan'] text-[13px]">
                  บันทึกลิงก์นี้ไว้ดูสถานะ/เลขพัสดุ (เปิดซ้ำได้ตลอด)
                </a>
              )}

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
            โปรไฟล์กลิ่นและรสชาติที่ถูกบันทึกจากการคัปปิ้งโดย Q Grader ประจำไร่ดอยเวียง ค้นพบอัตลักษณ์เฉพาะตัวของดินภูเขาและความสูง 1,500 เมตร
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