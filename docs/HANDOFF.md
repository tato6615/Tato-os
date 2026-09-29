# TATO OS - Handoff (29 ก.ย. 2569)

## ค่าคงที่
- Site: https://tato-os.pages.dev  (Cloudflare Pages + Functions + D1 ชื่อ so_tato)
- Content ID: 5127d38f-6601-41dd-bb30-9e4346dd9a4c
- Product ID: e71d46e6-8f1d-4c3d-aedc-8461d79f13c0
- Auth: HTTP Basic (ตรวจแค่รหัสผ่านจาก env ADMIN_PASSWORD, username อะไรก็ได้) ครอบ /api/*, /system/*, /admin/*
- หน้าร้านเป็น React (src/App.tsx) ข้อมูลโรสต์อยู่ src/data/coffeeData.ts
- หน้า static ต่อโรสต์สร้างจาก scripts/gen-roast-pages.mjs (รันใหม่เมื่อแก้ข้อมูลโรสต์: node scripts/gen-roast-pages.mjs)
- ไม่มี wrangler.toml ใน repo: binding (DB, AI) ตั้งใน Cloudflare Dashboard

## วิธีใช้รหัสใน terminal (อย่าพิมพ์รหัสลงบรรทัดคำสั่งตรง ๆ)
    read -rs -p "ADMIN_PASSWORD: " PW; echo
    ... ใช้ -u "admin:$PW" ...
    unset PW

## ข้อควรระวัง
- SQL รันใน D1 Console (Cloudflare Dashboard) ไม่ใช่ terminal
- JS ตัวอย่าง (fetch(...)) รันใน Console ของเบราว์เซอร์ ไม่ใช่ terminal
- POST /api/content-measurement สร้างรอบวัดใหม่ทุกครั้ง (ตอนนี้ 20 รอบ) ห้ามยิงซ้ำโดยไม่จำเป็น GET ปลอดภัย
- Run Learning ใน HQ เป็น GET ปลอดภัย
- intelligence.js ใช้เฉพาะรอบวัดล่าสุดเป็น totals (แก้การนับซ้ำแล้ว) อ่านประวัติสูงสุด 20 รอบ
- ออเดอร์ทดสอบถูกตั้งเป็น cancelled แล้ว (order_3003ed13-..., order_4c8127de-...) measurement ข้ามสถานะ cancelled
- grep -c นับเป็น "บรรทัด" ไม่ใช่จำนวนครั้ง, cut -c ตัดกลางตัวอักษรไทยได้ (แค่แสดงเพี้ยน ไฟล์ไม่เสีย)
- อย่าลบ public/google3e607115e7da3739.html (ใช้ยืนยัน Search Console)
- ตัวเลขทั้งหมดตอนนี้มาจากการทดสอบภายใน ยังไม่มีผู้ใช้จริง อย่าเชื่อสัญญาณ PERSISTENT_* จนกว่าจะมีข้อมูลจริง

## เช็กสุขภาพระบบ (ควรรันก่อนเริ่มงาน)
    cd /workspaces/Tato-os && git status -sb && git log --oneline -5
    for u in "" roast/dark/ roast/medium/ roast/light/ robots.txt sitemap.xml; do curl -s -o /dev/null -w "%{http_code} /$u\n" "https://tato-os.pages.dev/$u"; done
    # ต้อง 200 ทุกบรรทัด
    curl -s https://tato-os.pages.dev/sitemap.xml | grep -c "<loc>"    # ต้อง 4
    npm run lint    # tsc ต้องไม่มี error

## รายการที่ยังขาด

### A. ต้องเจ้าของทำ
1. Search Console: ส่ง sitemap.xml + Request indexing 4 URL (/, /roast/dark/, /roast/medium/, /roast/light/)
   - Terminal เช็กไม่ได้ (ดูใน Search Console)  เช็กฝั่งเรา: curl -s https://tato-os.pages.dev/sitemap.xml | grep -c "<loc>"  (ต้อง 4)
   - ผลค้นหา: ค้น  site:tato-os.pages.dev  ใน Google (รอ 2-14 วัน ไม่มีการันตี)
2. [เสร็จ 29 ก.ย. รหัสใหม่ได้ 200] เปลี่ยน ADMIN_PASSWORD (Cloudflare Pages > Settings > Variables) แล้ว redeploy
   - เช็ก: รหัสเก่าต้องได้ 401 รหัสใหม่ได้ 200
       read -rs -p "PASSWORD: " PW; echo
       curl -s -o /dev/null -w "HTTP %{http_code}\n" -u "admin:$PW" "https://tato-os.pages.dev/api/intelligence?content_id=5127d38f-6601-41dd-bb30-9e4346dd9a4c"; unset PW
3. ภาพ og:image (JPG/PNG ~1200x630 วางใน public/images/) แล้วเพิ่ม meta og:image และ twitter:image ใน index.html และใน scripts/gen-roast-pages.mjs (URL เต็ม)
   - เช็ก:
       curl -s https://tato-os.pages.dev/ | grep -c 'og:image'      # ต้อง >= 1
       curl -sI https://tato-os.pages.dev/images/<ไฟล์>.jpg | grep -i -E "HTTP|content-type"   # 200 และ image/*
4. คำอธิบายภาษาไทยของโรสต์ใน coffeeData.ts (เนื้อหารสชาติ/สินค้าให้เจ้าของยืนยัน) แล้วรัน node scripts/gen-roast-pages.mjs
   - เช็ก: curl -s https://tato-os.pages.dev/roast/medium/ | grep -c '[ก-๙]'   # ต้องมากกว่าตอนนี้ และอ่านออก
5. ตัดสินใจโดเมนระยะยาว ถ้าเปลี่ยนต้องแก้ canonical ใน index.html, sitemap, robots, scripts/gen-roast-pages.mjs (ตัวแปร DOMAIN) และผูก Search Console ใหม่
   - เช็ก: grep -rn "tato-os.pages.dev" index.html public scripts | cut -c1-140

### B. งานโค้ดที่ยังไม่ทำ
6. [เสร็จ 29 ก.ย.] checkout_start / checkout_abandon (จะรู้ว่าลูกค้าหลุดที่ขั้นไหน)
   - เริ่มจาก: grep -n -E "onOrderSuccess|setStep|checkout|submit|onClick" src/components/ProductView.tsx | cut -c1-160 | head -30
   - ยิงผ่านฟังก์ชัน track() ใน src/App.tsx (หรือส่ง prop ลง ProductView)
   - เช็กหลังทำ (terminal): npm run lint ต้องผ่าน แล้วดูข้อมูลจริง:
       read -rs -p "ADMIN_PASSWORD: " PW; echo
       curl -s -u "admin:$PW" https://tato-os.pages.dev/api/behavior | python3 -c "import sys,json,collections;d=json.load(sys.stdin);print(collections.Counter(e.get('event_type') for e in d.get('events',[])))"; unset PW
     (สมมติว่า /api/behavior GET คืน {events:[...]} ตาม HQ ถ้าไม่ตรงให้ใช้ D1 Console:
       SELECT event_type, COUNT(*) FROM behavior_events GROUP BY event_type;)
7. [เสร็จ 29 ก.ย. ยืนยันด้วย D1: clicks 12-4=8] กรอง is_test ออกจากการวัด (ตอนนี้แค่บันทึกใน metadata ของ behavior_events ยังไม่ถูกกรอง)
   - แก้ที่ functions/api/content-measurement.js (getBehaviorEvents / getContentEvents)
   - เช็ก: grep -n "is_test" functions/api/content-measurement.js   (ตอนนี้ไม่มี)
   - ทดสอบ: เปิด https://tato-os.pages.dev/?test=1 ในเบราว์เซอร์หนึ่งครั้ง กดเลือกเมล็ด แล้ว POST วัดหนึ่งรอบ attention/clicks ต้องไม่เพิ่ม
8. [เสร็จ 29 ก.ย. แทนที่ด้วย 'ยังไม่มีข้อมูลพอสำหรับสรุป'; ปุ่ม agent ติดป้าย 'จำลอง' แล้ว] การ์ดล่างสุดของ HQ (AI Recommendation / "14 reorder candidates" / Growth Experiment) เป็นข้อความสำเร็จรูป ตัวเลขไม่มาจากข้อมูลจริง
   - หาที่มา: grep -n -E "reorder|candidates|café profit|Growth Experiment" public/system/index.html | cut -c1-200
   - ปุ่ม agent ใน HQ (บรรทัดที่มี setTimeout) เป็น toast จำลอง: grep -n "completed · founder review" public/system/index.html | cut -c1-120
9. [เสร็จ 29 ก.ย. เพิ่มเงื่อนไข Macintosh+maxTouchPoints แล้ว] ตัวตรวจอุปกรณ์ mobile ใน src/App.tsx ใช้ /Mobi/ ซึ่งตรวจ iPad ไม่เจอ
   - เช็ก: grep -n "Mobi" src/App.tsx | cut -c1-200
10. ข้อจำกัดของตัววัด (ไม่ใช่บั๊กเร่งด่วน)
   - getOrders ไม่เช็กว่าออเดอร์เกิดหลังคลิก (นับทุกออเดอร์ของลูกค้าที่ผูกไว้หลัง measurement_start)
   - Customers ไม่ผูกกับสถานะออเดอร์ (ยกเลิกแล้วยังนับ)
   - สัญญาณ PERSISTENT_* คำนวณจากจำนวนรอบวัด ซึ่งเพิ่มได้จากการกดวัดเอง
   - เช็ก: awk '/^async function getOrders/,/^}/' functions/api/content-measurement.js

### C. ส่วน AI (ยังไม่ทำงาน)
11. Workers AI ยังไม่เปิด (learning-ai.js เรียก env.AI.run โมเดล @cf/zai-org/glm-4.7-flash แต่ตกไป fallback)
   - เปิด: Cloudflare Pages > Settings > Bindings > Workers AI ตั้งชื่อ AI (Production และ Preview) แล้ว redeploy
   - เช็ก (ต้องเห็น ai_called เป็น True):
       read -rs -p "ADMIN_PASSWORD: " PW; echo
       curl -s -u "admin:$PW" "https://tato-os.pages.dev/api/learning-ai?content_id=5127d38f-6601-41dd-bb30-9e4346dd9a4c" | python3 -c "import sys,json;a=json.load(sys.stdin)['learning']['ai'];print(a['status']);print(a['debug'])"; unset PW
   - ข้อควรระวัง: HQ เรียก learning-ai ตอนโหลดหน้า เมื่อเปิด AI จะกินโควตาทุกครั้งที่เปิด HQ ควรเปลี่ยนเป็นกดเรียกเอง/ตั้งเวลาก่อน และผลจาก AI ยังไม่ถูกแสดงบน HQ (ไม่มีโค้ดอ่าน learning.ai)
12. ตัววิเคราะห์ SEO / GEO / พฤติกรรมเลือกซื้อ (เฟส 2-4 ของแผน) ยังไม่มี
   - เฟส 1 (เก็บข้อมูล) ทำแล้วบางส่วน: src, referrer, is_test, roast ใน content_click ยังขาด: option_change, checkout_start/abandon, utm, บันทึกบอท AI (GPTBot, ClaudeBot, PerplexityBot; _routes.json ให้ Functions ทำงานเฉพาะ /api,/system,/admin จึงต้องเพิ่ม path ก่อน และระวังไม่ให้ Basic Auth ครอบหน้าร้าน)
   - GEO: ชุดคำถามคงที่ 10-20 ข้อ ถามรายสัปดาห์ (ทำมือก่อน) เก็บผลลง market_signals (POST /api/market)
   - กฎ: AI สรุปหลักฐานและเสนอ ไม่ตัดสินใจ/ลงมือเอง คนอนุมัติ กำหนดเกณฑ์ขั้นต่ำก่อนสรุปผล (เช่น ไม่สรุปถ้าเซสชันน้อยกว่า N)
   - เช็กสถานะ:
       ls functions/api                      # ยังไม่มีไฟล์ของ discovery/choice analyst
       read -rs -p "ADMIN_PASSWORD: " PW; echo
       curl -s -u "admin:$PW" https://tato-os.pages.dev/api/market | python3 -c "import sys,json;print(len(json.load(sys.stdin).get('signals',[])))"; unset PW    # ตอนนี้ 0
13. ai-insights.js / market.js เป็นแค่ที่เก็บ (GET/POST ตาราง ai_insights, market_signals) ไม่มีตัวสร้างข้อมูลเข้าตาราง

## ลำดับที่แนะนำ
1) ข้อ 1-2 (เจ้าของ)  2) ข้อ 6-7  3) หาผู้ใช้จริง (ลิงก์ใน Facebook/LINE OA/Google Business Profile)  4) ข้อ 3-5  5) พอมีข้อมูลจริง ค่อยทำข้อ 11-12
