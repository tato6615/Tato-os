-- ล้างข้อมูลตัวอย่างก่อนใช้งานจริง (รันใน D1 Console ทีละบล็อก)
--
-- ก่อนรัน: เปิดแท็บ Time Travel ใน D1 (so_tato) แล้วจดเวลา/ Bookmark ไว้ จะกู้ย้อนได้ถ้าลบผิด
-- สคริปต์นี้ลบเฉพาะข้อมูลออเดอร์ ไม่แตะ behavior_events / รอบวัด content_measurement / products
-- ถ้าตารางใดไม่มีอยู่ (เช่น payments) บรรทัดนั้นจะ error ให้ข้ามไป

-- 1) ดูก่อนว่าจะลบอะไร
SELECT COUNT(*) AS orders FROM orders;
SELECT COUNT(*) AS customers_from_checkout FROM customers WHERE source = 'PUBLIC_CHECKOUT';

-- 2) ลบข้อมูลออเดอร์ตัวอย่างทั้งหมด (ตารางลูกก่อน ตารางแม่ทีหลัง)
DELETE FROM revenue_ledger;
DELETE FROM profit_ledger;
DELETE FROM payments;
DELETE FROM order_details;
DELETE FROM checkout_attempts;
DELETE FROM orders;
DELETE FROM customers WHERE source = 'PUBLIC_CHECKOUT';

-- 3) รีเซ็ตการใช้รหัสส่วนลดที่ลองทดสอบ (ถ้ามี)
UPDATE discount_codes SET used_count = 0;

-- 4) ตรวจผล ต้องได้ 0 ทั้งหมด
SELECT (SELECT COUNT(*) FROM orders) AS orders, (SELECT COUNT(*) FROM order_details) AS details, (SELECT COUNT(*) FROM customers WHERE source='PUBLIC_CHECKOUT') AS customers;
