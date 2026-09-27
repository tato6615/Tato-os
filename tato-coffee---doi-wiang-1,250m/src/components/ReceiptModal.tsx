import React from 'react';
import { OrderItem } from '../types';
import { ASSETS, GRIND_OPTIONS } from '../data/coffeeData';

interface ReceiptModalProps {
  order: OrderItem | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ order, onClose }) => {
  if (!order) return null;

  const grindLabel = GRIND_OPTIONS.find((g) => g.id === order.grind)?.label;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="min-h-screen px-4 text-center flex items-center justify-center">
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/85 backdrop-blur-sm transition-opacity"
        />

        <div className="inline-block w-full max-w-xl p-6 md:p-8 my-8 text-left align-middle transition-all transform bg-[#141312] border border-[#ff5e1a]/40 rounded-2xl shadow-2xl relative z-10">
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-4 border-b border-[#2b2a28]">
            <div className="flex items-center gap-3">
              <img src={ASSETS.logo} alt="TATO Coffee" className="h-6 w-auto" />
              <div>
                <span className="font-['Manrope'] text-[13px] font-bold text-[#e6e1df] uppercase tracking-wider block">
                  TATO COFFEE ESTATE DISPATCH
                </span>
                <span className="font-mono text-[11px] text-[#ff5e1a]">
                  #{order.orderNumber}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#211f1e] text-[#e6e1df] hover:bg-[#2b2a28] flex items-center justify-center transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          {/* Certificate / Receipt Body */}
          <div className="py-6 space-y-6">
            {/* Status Pipeline */}
            <div className="bg-[#1d1b1a] p-4 rounded-xl border border-[#2b2a28] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-['Manrope'] text-[11px] font-bold text-[#f3bc8b] uppercase tracking-wider">
                  STATUS PIPELINE / สถานะการจัดเตรียม
                </span>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#ff5e1a]/20 text-[#ffb59c] font-semibold">
                  {order.status}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1 pt-1">
                {['Queued', 'Roasting', 'Degassing', 'Dispatched'].map((step, idx) => (
                  <div key={step} className="space-y-1 text-center">
                    <div
                      className={`h-1.5 rounded-full ${
                        idx <= 1 ? 'bg-[#ff5e1a]' : 'bg-[#363433]'
                      }`}
                    />
                    <span className="font-mono text-[10px] text-[#e3beb3]/70">{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Order Specification Key-Values */}
            <div className="bg-[#1d1b1a] p-4 rounded-xl border border-[#2b2a28] space-y-2 text-[13px] font-['Manrope']">
              <div className="flex justify-between py-1 border-b border-[#2b2a28]">
                <span className="text-[#aa897f]">Origin & Terroir:</span>
                <span className="text-[#e6e1df] font-medium">Doi Wiang 1,250 MASL, Chiang Rai</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#2b2a28]">
                <span className="text-[#aa897f]">Varietal:</span>
                <span className="text-[#e6e1df]">Arabica 100% (Catimor & Typica)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#2b2a28]">
                <span className="text-[#aa897f]">Roast Profile:</span>
                <span className="text-[#ff5e1a] font-bold uppercase">{order.roast} ROAST</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#2b2a28]">
                <span className="text-[#aa897f]">Grind Specification:</span>
                <span className="text-[#f3bc8b]">{grindLabel}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#2b2a28]">
                <span className="text-[#aa897f]">Package Volume:</span>
                <span className="text-[#e6e1df] font-medium">{order.quantityKg} KG (Degassed Foil Pouch)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#2b2a28]">
                <span className="text-[#aa897f]">Payment Method:</span>
                <span className="text-[#ffdcc0] uppercase">
                  {order.customer.paymentMethod === 'promptpay'
                    ? 'PromptPay QR'
                    : order.customer.paymentMethod === 'cod'
                    ? 'Cash on Delivery (เก็บเงินปลายทาง)'
                    : 'Credit/Debit Card'}
                </span>
              </div>
            </div>

            {/* Recipient Details */}
            <div className="bg-[#1d1b1a] p-4 rounded-xl border border-[#2b2a28] space-y-1.5 text-[12px] font-['Manrope']">
              <span className="font-['Manrope'] text-[11px] font-bold text-[#f3bc8b] uppercase tracking-wider block">
                DELIVERY RECIPIENT / ข้อมูลการจัดส่ง
              </span>
              <p className="text-[#e6e1df] font-medium">{order.customer.name}</p>
              <p className="text-[#e3beb3]/80">{order.customer.phone} · {order.customer.email}</p>
              <p className="text-[#e3beb3]/70">{order.customer.address}</p>
              {order.customer.note && (
                <p className="text-[#ffdcc0] pt-1 italic">
                  Note: "{order.customer.note}"
                </p>
              )}
            </div>

            {/* Financial Summary */}
            <div className="bg-[#0f0e0d] p-4 rounded-xl border border-[#2b2a28] space-y-1.5 font-['Manrope'] text-[13px]">
              <div className="flex justify-between text-[#e3beb3]/75">
                <span>Subtotal ({order.quantityKg} KG):</span>
                <span className="font-mono text-[#e6e1df]">{order.subtotal.toLocaleString('th-TH')} THB</span>
              </div>
              <div className="flex justify-between text-[#e3beb3]/75">
                <span>Shipping:</span>
                <span className="font-mono text-[#e6e1df]">
                  {order.shipping === 0 ? 'FREE' : `${order.shipping} THB`}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#211f1e] text-[16px] font-bold text-[#e6e1df]">
                <span>Total Amount:</span>
                <span className="font-mono text-[#ff5e1a] text-xl">
                  {order.total.toLocaleString('th-TH')} THB
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 border-t border-[#2b2a28] flex items-center justify-end gap-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2.5 rounded-lg bg-[#211f1e] hover:bg-[#2b2a28] text-[#e6e1df] font-['Manrope'] text-[12px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              <span>พิมพ์ใบคำสั่งซื้อ</span>
            </button>
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-lg bg-[#ff5e1a] text-[#390c00] hover:bg-[#822800] hover:text-[#ffdbcf] font-['Manrope'] text-[12px] font-bold uppercase tracking-wider transition-colors"
            >
              ปิด / CLOSE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
