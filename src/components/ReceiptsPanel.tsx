import React from 'react';
import { OrderItem } from '../types';

const thb = (n: number) => n.toLocaleString('th-TH') + ' บาท';

export const PaymentBox: React.FC<{ order: OrderItem }> = ({ order }) => {
  const p = order.payment || {};
  const has = !!(p.promptpay || p.account_number);
  return (
    <div className="mt-3 p-4 rounded-lg bg-[#211f1e] border border-[#ff5e1a]/30 space-y-1.5 font-mono text-[12px] text-[#e3beb3]/90">
      <span className="font-bold text-[#ff5e1a] uppercase tracking-wider block text-[11px]">ช่องทางชำระเงิน / PAYMENT</span>
      {has ? (
        <>
          {p.promptpay ? <div>PromptPay: <span className="text-[#e6e1df]">{p.promptpay}</span></div> : null}
          {p.bank_name ? <div>ธนาคาร: <span className="text-[#e6e1df]">{p.bank_name}</span></div> : null}
          {p.account_number ? <div>เลขบัญชี: <span className="text-[#e6e1df]">{p.account_number}</span></div> : null}
          {p.account_name ? <div>ชื่อบัญชี: <span className="text-[#e6e1df]">{p.account_name}</span></div> : null}
          <div className="text-[#f3bc8b] font-['Anuphan']">ยอดที่ต้องโอน: {thb(order.total)}</div>
          <div className="text-[#e3beb3]/70 font-['Anuphan']">โอนแล้วส่งสลิปพร้อมเลขออเดอร์ให้ร้าน ออเดอร์จะยืนยันเมื่อร้านตรวจสอบยอดแล้ว</div>
        </>
      ) : (
        <div className="text-[#f3bc8b] font-['Anuphan']">ร้านจะติดต่อกลับทางเบอร์ {order.customer.phone || order.customer.email} เพื่อแจ้งช่องทางชำระเงิน ยอด {thb(order.total)}</div>
      )}
    </div>
  );
};

export const ReceiptsPanel: React.FC<{ open: boolean; orders: OrderItem[]; onClose: () => void }> = ({ open, orders, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div className="w-full max-w-xl mt-20 mb-10 bg-[#0f0e0d] border border-[#ff5e1a]/40 rounded-2xl p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-['Manrope'] text-xl font-semibold text-[#e6e1df]">ใบเสร็จและสถานะคำสั่งซื้อ</h2>
          <button type="button" onClick={onClose} className="px-3 py-1 rounded-lg bg-[#2b2a28] text-[#e6e1df] text-sm">ปิด</button>
        </div>
        {orders.length === 0 ? (
          <p className="font-['Anuphan'] text-[14px] text-[#e3beb3]">ยังไม่มีคำสั่งซื้อในเครื่องนี้</p>
        ) : orders.map((o) => (
          <div key={o.id} className="bg-[#1d1b1a] rounded-xl p-4 border border-[#2b2a28] space-y-1.5 font-mono text-[12px] text-[#e3beb3]/80">
            <div className="flex justify-between text-[#ff5e1a] font-bold"><span>#{o.orderNumber}</span><span>รอตรวจสอบการชำระเงิน</span></div>
            <div className="flex justify-between"><span>วันที่</span><span>{new Date(o.timestamp).toLocaleString('th-TH')}</span></div>
            <div className="flex justify-between"><span>ผู้รับ</span><span className="text-[#e6e1df]">{o.customer.name}</span></div>
            <div className="flex justify-between"><span>เบอร์โทร</span><span className="text-[#e6e1df]">{o.customer.phone}</span></div>
            <div className="flex justify-between gap-4"><span>ที่อยู่</span><span className="text-[#e6e1df] text-right">{o.customer.address}</span></div>
            <div className="flex justify-between"><span>ระดับคั่ว / การบด</span><span className="text-[#e6e1df]">{o.roast.toUpperCase()} / {o.grind}</span></div>
            <div className="flex justify-between"><span>ปริมาณ</span><span className="text-[#e6e1df]">{o.quantityKg} กก.</span></div>
            <div className="flex justify-between"><span>ค่ากาแฟ</span><span className="text-[#e6e1df]">{thb(o.subtotal)}</span></div>
            <div className="flex justify-between"><span>ค่าจัดส่ง</span><span className="text-[#e6e1df]">{o.shipping === 0 ? 'ฟรี' : thb(o.shipping)}</span></div>
            <div className="flex justify-between text-[13px] font-bold text-[#ff5e1a]"><span>ยอดสุทธิ</span><span>{thb(o.total)}</span></div>
            <PaymentBox order={o} />
          </div>
        ))}
      </div>
    </div>
  );
};
