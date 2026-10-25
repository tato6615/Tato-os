export type Review = {
  name: string;
  shop: string;
  text: { th: string; en: string };
  usedSince: { th: string; en: string };
};

// เพิ่มรีวิวจริงที่ได้รับอนุญาตจากลูกค้าเท่านั้น ห้ามใส่ข้อความที่สร้างขึ้นเอง
// เมื่อมีรีวิวอย่างน้อย 1 รายการ ฉาก "เสียงจากลูกค้า" จะโผล่ในหน้าแรกและหน้า Discover เอง
// ตัวอย่างรูปแบบ (ลบคอมเมนต์ออกแล้วใส่ข้อมูลจริง):
// {
//   name: 'ชื่อลูกค้า',
//   shop: 'ชื่อร้าน',
//   text: { th: 'ข้อความรีวิวภาษาไทย', en: 'Review text in English' },
//   usedSince: { th: 'มกราคม 2569', en: 'January 2026' },
// },
export const REVIEWS: Review[] = [];
