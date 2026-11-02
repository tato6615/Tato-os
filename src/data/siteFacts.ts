import { ROAST_SURCHARGE, CAFE_DISCOUNT_PER_KG, unitPriceFor } from '../../shared/pricing.js';
// ข้อมูลที่ใช้ซ้ำหลายหน้า แก้ที่นี่ที่เดียว หน้าเรื่องราว/หน้าร้าน/ตะกร้า/หน้าสั่งซื้อ ดึงค่าไปใช้เอง
// หมายเหตุ: PRICE_RETAIL ต้องตรงกับ products.price ใน D1 (ฝั่ง server เป็นตัวตัดสินราคาจริงตอน checkout)
// ราคาแยกตามระดับคั่วอยู่ที่ shared/pricing.js (ฝั่ง server ใช้ไฟล์เดียวกัน)
//   ปลีก: อ่อน 690 / กลาง 650 / เข้ม 650   ร้านกาแฟ: อ่อน 590 / กลาง 550 / เข้ม 550
export const PRICE_RETAIL = 650; // บาท/กก. ราคาเริ่มต้น (คั่วกลาง/เข้ม) = products.price ใน D1
export const PRICE_CAFE = PRICE_RETAIL - CAFE_DISCOUNT_PER_KG; // 550 บาท/กก. ร้านกาแฟ เริ่มต้น (โค้ด CAFE)
export const PRICE_CAFE_LIGHT = PRICE_CAFE + ROAST_SURCHARGE.light; // 590
/** ราคาปลีก บาท/กก. ของระดับคั่วนั้น */
export const retailPrice = (roast?: string): number => unitPriceFor(PRICE_RETAIL, roast);
export const ELEVATION_M = 1500; // เมตรเหนือระดับน้ำทะเล
export const PHONE = '064-293-6615';
export const MIN_ORDER_KG = 0.5;
