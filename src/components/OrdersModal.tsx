import React from 'react';
import { OrderItem } from '../types';
import { GRIND_OPTIONS } from '../data/coffeeData';

interface OrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: OrderItem[];
  onSelectOrder: (order: OrderItem) => void;
}

export const OrdersModal: React.FC<OrdersModalProps> = ({
  isOpen,
  onClose,
  orders,
  onSelectOrder,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="min-h-screen px-4 text-center flex items-center justify-center">
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        />

        <div className="inline-block w-full max-w-2xl p-6 md:p-8 my-8 text-left align-middle transition-all transform bg-[#141312] border border-[#2b2a28] rounded-2xl shadow-2xl relative z-10">
          <div className="flex items-center justify-between pb-4 border-b border-[#2b2a28]">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[#ff5e1a] text-[24px]">
                receipt_long
              </span>
              <div>
                <h3 className="font-['Manrope'] text-lg font-bold text-[#e6e1df] uppercase tracking-wider">
                  ESTATE ORDER ARCHIVE / ประวัติคำสั่งซื้อ
                </h3>
                <p className="font-['Anuphan'] text-xs text-[#e3beb3]/70">
                  รายการคำสั่งซื้อเมล็ดกาแฟ TATO Coffee จากไร่ดอยเวียง
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#211f1e] text-[#e6e1df] hover:bg-[#2b2a28] flex items-center justify-center transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {orders.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <span className="material-symbols-outlined text-[48px] text-[#aa897f]/40">
                  local_cafe
                </span>
                <p className="font-['Manrope'] text-[15px] text-[#e6e1df] font-medium">
                  ยังไม่มีคำสั่งซื้อในระบบ
                </p>
                <p className="font-['Anuphan'] text-[13px] text-[#e3beb3]/70 max-w-sm mx-auto">
                  เลือกคั่วที่ชอบและสั่งซื้อเมล็ดกาแฟสดใหม่เพื่อเริ่มสะสมประวัติการสกัดของคุณ
                </p>
              </div>
            ) : (
              orders.map((order) => {
                const grindLabel = GRIND_OPTIONS.find((g) => g.id === order.grind)?.label.split('(')[0];
                return (
                  <div
                    key={order.id}
                    onClick={() => {
                      onSelectOrder(order);
                      onClose();
                    }}
                    className="p-4 rounded-xl bg-[#1d1b1a] border border-[#2b2a28] hover:border-[#ff5e1a]/60 cursor-pointer transition-all space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12px] font-bold text-[#ff5e1a]">
                          #{order.orderNumber}
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-[#5b4138]" />
                        <span className="font-mono text-[11px] text-[#e3beb3]/70">
                          {new Date(order.timestamp).toLocaleDateString('th-TH', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full bg-[#ff5e1a]/15 text-[#ffb59c] font-mono text-[11px] font-medium border border-[#ff5e1a]/30">
                        {order.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-['Manrope'] text-[12px]">
                      <div>
                        <span className="text-[#aa897f] block text-[10px] uppercase">Roast</span>
                        <span className="font-bold text-[#e6e1df] uppercase">{order.roast}</span>
                      </div>
                      <div>
                        <span className="text-[#aa897f] block text-[10px] uppercase">Grind</span>
                        <span className="text-[#f3bc8b] truncate block">{grindLabel}</span>
                      </div>
                      <div>
                        <span className="text-[#aa897f] block text-[10px] uppercase">Quantity</span>
                        <span className="text-[#e6e1df] font-medium">{order.quantityKg} KG</span>
                      </div>
                      <div>
                        <span className="text-[#aa897f] block text-[10px] uppercase">Total</span>
                        <span className="font-bold text-[#ff5e1a]">
                          {order.total.toLocaleString('th-TH')} THB
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] font-mono text-[#e3beb3]/60 pt-1 border-t border-[#2b2a28] flex justify-between items-center">
                      <span className="truncate max-w-[320px]">
                        ผู้รับ: {order.customer.name} ({order.customer.phone})
                      </span>
                      <span className="text-[#ff5e1a] font-['Manrope'] font-bold flex items-center gap-1">
                        รายละเอียด <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-4 border-t border-[#2b2a28] flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-lg bg-[#2b2a28] hover:bg-[#363433] text-[#e6e1df] font-['Manrope'] text-[12px] font-bold uppercase tracking-wider transition-colors"
            >
              ปิดหน้าต่าง / CLOSE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
