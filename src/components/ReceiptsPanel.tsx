import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { OrderItem } from '../types';
import { promptpayPayload } from '../lib/promptpay';

const thb = (n: number) => n.toLocaleString('th-TH') + ' บาท';

export const PaymentBox: React.FC<{ order: OrderItem }> = ({ order }) => {
  const p = order.payment || {};
  const [qr, setQr] = useState('');
  useEffect(() => {
    let on = true;
    if (p.promptpay) {
      const payload = promptpayPayload(p.promptpay, order.total);
      if (payload) QRCode.toDataURL(payload, { margin: 1, width: 300 }).then((u) => { if (on) setQr(u); }).catch(() => {});
    }
    return () => { on = false; };
  }, [p.promptpay, order.total]);

  const msg = 'สวัสดีครับ ส่งสลิปออเดอร์ ' + order.orderNumber + ' ยอด ' + order.total + ' บาท';
  const oa = (order.lineOa || '').trim();
  const lineUrl = oa ? 'https://line.me/R/oaMessage/' + oa + '/?' + encodeURIComponent(msg) : '';
  const hasBank = !!p.account_number;

  return (
    <div className="mt-3 p-4 rounded-lg bg-[#211f1e] border border-[#ff5e1a]/30 space-y-2 text-[12px] text-[#e3beb3]/90">
      <span className="font-mono font-bold text-[#ff5e1a] uppercase tracking-wider block text-[11px]">ช่องทางชำระเงิน / PAYMENT</span>
      {qr ? (
        <div className="text-center space-y-2">
          <div className="w-48 h-48 mx-auto bg-white p-2 rounded-lg"><img src={qr} alt="PromptPay QR" className="w-full h-full" /></div>
          <div className="font-['Anuphan'] text-[#f3bc8b] text-[14px]">สแกนจ่าย {thb(order.total)}</div>
          <a href={qr} download={'tato-' + order.orderNumber + '.png'} className="inline-block text-[11px] underline text-[#e3beb3]">บันทึกรูป QR</a>
        </div>
      ) : null}
      {hasBank ? (
        <div className="font-mono space-y-0.5">
          {p.bank_name ? <div>ธนาคาร: <span className="text-[#e6e1df]">{p.bank_name}</span></div> : null}
          <div>เลขบัญชี: <span className="text-[#e6e1df]">{p.account_number}</span></div>
          {p.account_name ? <div>ชื่อบัญชี: <span className="text-[#e6e1df]">{p.account_name}</span></div> : null}
        </div>
      ) : null}
      {!qr && !hasBank ? (
        <div className="text-[#f3bc8b] font-['Anuphan']">ร้านจะติดต่อกลับทางเบอร์ {order.customer.phone || order.customer.email} เพื่อแจ้งช่องทางชำระเงิน ยอด {thb(order.total)}</div>
      ) : (
        <div className="font-['Anuphan'] text-[#e3beb3]/80">
          โอนแล้วส่งสลิปพร้อมเลขออเดอร์ <span className="text-[#e6e1df] font-mono">{order.orderNumber}</span> ให้ร้าน ออเดอร์จะเข้าคิวคั่วหลังร้านตรวจยอดแล้ว
        </div>
      )}
      {lineUrl ? (
        <a href={lineUrl} target="_blank" rel="noopener noreferrer" className="block w-full text-center py-2.5 rounded-lg bg-[#06c755] text-white font-bold text-[13px]">ส่งสลิปทาง LINE</a>
      ) : null}
    </div>
  );
};

export const ReceiptsPanel: React.FC<{ open: boolean; orders: OrderItem[]; onClose: () => void; onReorder?: (o: OrderItem) => void }> = ({ open, orders, onClose, onReorder }) => {
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
            <div className="flex justify-between text-[#ff5e1a] font-bold"><span>#{o.orderNumber}</span><span>สถานะ: ดูที่ลิงก์ด้านล่าง</span></div>
            <div className="flex justify-between"><span>วันที่</span><span>{new Date(o.timestamp).toLocaleString('th-TH')}</span></div>
            <div className="flex justify-between"><span>ผู้รับ</span><span className="text-[#e6e1df]">{o.customer.name}</span></div>
            <div className="flex justify-between"><span>เบอร์โทร</span><span className="text-[#e6e1df]">{o.customer.phone}</span></div>
            <div className="flex justify-between gap-4"><span>ที่อยู่</span><span className="text-[#e6e1df] text-right">{o.customer.address}</span></div>
            <div className="flex justify-between"><span>ระดับคั่ว / การบด</span><span className="text-[#e6e1df]">{o.roast.toUpperCase()} / {o.grind}</span></div>
            <div className="flex justify-between"><span>ปริมาณ</span><span className="text-[#e6e1df]">{o.quantityKg} กก.</span></div>
            <div className="flex justify-between"><span>ค่ากาแฟ</span><span className="text-[#e6e1df]">{thb(o.subtotal)}</span></div>
            {o.discount ? <div className="flex justify-between"><span>ส่วนลด{o.discountCode ? ' (' + o.discountCode + ')' : ''}</span><span className="text-[#e6e1df]">-{thb(o.discount)}</span></div> : null}
            <div className="flex justify-between"><span>ค่าจัดส่ง</span><span className="text-[#e6e1df]">{o.shipping === 0 ? 'ฟรี' : thb(o.shipping)}</span></div>
            <div className="flex justify-between text-[13px] font-bold text-[#ff5e1a]"><span>ยอดสุทธิ</span><span>{thb(o.total)}</span></div>
            <PaymentBox order={o} />
            <div className="flex gap-2 pt-2">
              {o.statusUrl ? <a href={o.statusUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-center py-2.5 rounded-lg bg-[#ff5e1a] text-[#390c00] font-bold text-[12px] font-['Anuphan']">ดูสถานะ / เลขพัสดุ</a> : null}
              {onReorder ? <button type="button" onClick={() => onReorder(o)} className="flex-1 py-2.5 rounded-lg bg-[#2b2a28] text-[#e6e1df] font-bold text-[12px] font-['Anuphan']">สั่งซ้ำ</button> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
