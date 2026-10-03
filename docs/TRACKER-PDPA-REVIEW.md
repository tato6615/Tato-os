# สรุปการเก็บพฤติกรรมผู้ใช้ สำหรับผู้ตรวจกฎหมาย/PDPA

สรุปข้อเท็จจริงจากโค้ด (ตรวจ 2 ต.ค. 2569) ไม่ใช่คำวินิจฉัยทางกฎหมาย ให้ผู้ตรวจตัดสินว่าต้องขอความยินยอมแยกหรือไม่

## ข้อค้นพบสำคัญ
1. public/tracker.js ไม่มีหน้าใดโหลดใช้ (ค้นใน html/tsx/ts/js นอก dist ไม่พบ) จึงไม่ได้ทำงาน ถ้าจะเปิดใช้ให้ผ่านผู้ตรวจก่อน เพราะเก็บมากกว่าตัวที่ใช้จริง (ข้อความปุ่มที่กด, คำค้น, URL เต็ม, ชื่อหน้า) และมีฟังก์ชันส่ง customer_id ซึ่งผูกพฤติกรรมกับตัวบุคคลได้
2. ตัวที่ทำงานจริงคือ track() ใน src/App.tsx (หน้าร้าน) และสคริปต์ใน public/cafe/index.html ส่งไป /api/behavior
3. หน้า /privacy/ ยังไม่มีหัวข้อเรื่องการเก็บพฤติกรรมการใช้งานเว็บ / ตัวระบุเซสชันในเบราว์เซอร์ (localStorage) ควรให้ผู้ตรวจพิจารณาเพิ่ม

## ข้อมูลที่เก็บจริง (ตาราง behavior_events)
- session_id: UUID สุ่ม เก็บใน localStorage ชื่อ tato_session ไม่หมดอายุเอง
- event_type (เช่น content_view, cafe_view, cafe_form_start, cafe_submit), page, product_id, เวลา
- metadata (JSON): source, is_test, src, utm_source/medium/campaign (localStorage tato_utm), referrer
- ไม่พบการเก็บ IP ดิบหรือ User-Agent ใน behavior.js / event.js (IP ถูก hash เฉพาะ rate limit ของฟอร์มและออเดอร์)
- /api/behavior รับ metadata อะไรก็ได้ ไม่จำกัดขนาด/ฟิลด์
- ยังไม่มีระยะเวลาลบ behavior_events (lead กำหนดไว้ 2 ปี)
- localStorage อื่น: tato_orders (20 ออเดอร์ล่าสุดในเครื่องผู้ใช้), tato_language, tato_is_test, tato_utm
- ไม่พบการใช้คุกกี้ (document.cookie) และเครื่องมือภายนอกเช่น Google Analytics ในโค้ดที่ตรวจ

## คำถามถึงผู้ตรวจ
1. session_id ถาวรใน localStorage ที่ไม่ผูกชื่อ/เบอร์ ถือเป็นข้อมูลส่วนบุคคลหรือไม่ ต้องมีแบนเนอร์ขอความยินยอมก่อนเก็บหรือไม่
2. ถ้าไม่ต้องขอความยินยอม ต้องแจ้งในนโยบายอย่างไร (วัตถุประสงค์, ระยะเก็บ, สิทธิ์ปฏิเสธ)
3. UTM/referrer ที่เก็บในเบราว์เซอร์ผู้ใช้ ต้องระบุในนโยบายหรือไม่
4. ควรกำหนดระยะเวลาลบ behavior_events เท่าไร
5. ไฟล์สำรอง D1 (เก็บ 90 วันใน GitHub) ต้องระบุในนโยบายหรือไม่

## ตัวเลือกลดความเสี่ยงทางเทคนิค (ยังไม่ได้ทำ รอคำตอบผู้ตรวจ)
- ให้ session_id หมดอายุ (เช่น 30 วัน) หรือใช้ sessionStorage
- เคารพสัญญาณ Do Not Track / Global Privacy Control
- จำกัดฟิลด์ใน /api/behavior เป็น allowlist และจำกัดขนาด
- เพิ่มงานลบ behavior_events เก่า (ต่อยอดจาก workflow retention)
- ลบ public/tracker.js ถ้าไม่ใช้
