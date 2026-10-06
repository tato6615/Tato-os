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
3. [เสร็จ ยืนยัน 3 ต.ค. จากตัวอย่างลิงก์ใน LINE] ภาพ og:image (JPG/PNG ~1200x630 วางใน public/images/) แล้วเพิ่ม meta og:image และ twitter:image ใน index.html และใน scripts/gen-roast-pages.mjs (URL เต็ม)
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

## ลิงก์แจกผู้ใช้จริง (ห้ามใส่ ?test=1)
- Facebook: https://tato-os.pages.dev/?src=facebook
- LINE OA: https://tato-os.pages.dev/?src=line
- Google Business Profile: https://tato-os.pages.dev/?src=gbp
- ทดสอบก่อนแจก: เปิดลิงก์ในเบราว์เซอร์ กดเลือกเมล็ด 1 ครั้ง แล้วดูใน D1 Console ว่าข้อมูลล่าสุดมีค่า src ตรงกับช่องทาง
  SELECT * FROM behavior_events ORDER BY created_at DESC LIMIT 5;
- เกณฑ์ "ข้อมูลจริงพอ" ก่อนทำข้อ 11-13: เซสชันจริงอย่างน้อย 30-50 ครั้ง ไม่นับ is_test

## อัปเดต 29 ก.ย. 2569 (รอบแก้คำว่า volcanic)
- ตัดคำว่า volcanic / ภูเขาไฟ ออกจากหน้าร้านแล้ว (Footer, DiscoverView, ProductView, i18n)
  - "Highland Climate", "Grown in the cool highlands of Doi Wiang Pa, Chiang Mai.", "steep northern highland slopes"
- ค้าง: "เก็บด้วยมือ" และ "หมักตอนกลางคืนอากาศเย็น" รอผู้ปลูกยืนยัน (ข้อความยังอยู่บนหน้าร้าน)
  - ประโยคไทยใน ProductView.tsx กับ i18n.tsx ยังไม่ตรงกันเป๊ะ ให้แก้ให้เหมือนกันหลังได้คำตอบ
- ก่อน push ต้อง git pull --rebase origin main เสมอ: มีคอมมิต "Build customer web assets" เข้า main อัตโนมัติหลัง push ทุกครั้ง ไม่ดึงก่อนจะโดนปฏิเสธ (fetch first)
- i18n.tsx: คีย์อังกฤษต้องตรงกับข้อความอังกฤษในโค้ด ถ้าแก้อังกฤษต้องแก้คีย์ตาม ไม่งั้นหน้าไทยจะแสดงเป็นอังกฤษ
  แก้ด้วยสคริปต์ตามเนื้อหา ไม่ใช้เลขบรรทัด (เลขเลื่อนเมื่อลบบรรทัด และ fold ตัดกลางตัวอักษรไทยได้ ให้ใช้ Python textwrap ดูข้อความไทย)


## อัปเดต 30 ก.ย. 2569 (ระบบสั่งซื้อก่อนยิงแคมเปญ: ครบ 11 ข้อ)
โค้ดใหม่อยู่ใน shared/ (ใช้ร่วมกันระหว่างเซิร์ฟเวอร์กับหน้าเว็บ), functions/api/*, public/admin, public/order|privacy|refund
ทดสอบ: `node --test tests/backend.test.mjs` (จำลอง D1 ด้วย node:sqlite ต้อง Node 22.5+) และ tests/admin-ui.test.mjs (ต้องมี jsdom, ถ้าไม่มีจะข้าม)

| ข้อ | ทำอะไร | ไฟล์หลัก |
|---|---|---|
| 1 ตรวจข้อมูล | เบอร์มือถือไทย 10 หลัก (06/08/09) ชื่อ ที่อยู่ รหัสไปรษณีย์ 5 หลัก ตรวจทั้งหน้าเว็บและเซิร์ฟเวอร์ด้วยกฎเดียวกัน | shared/validate.js |
| 2 กันสแปม | จำกัด 5 คำขอ/10 นาที/IP (เก็บ hash), ช่องล่อบอท, Turnstile (เปิดเมื่อตั้ง env) | shared/orders.js, checkout.js |
| 3 ค่าส่ง | สูตรเดียว ใช้ทั้งหน้าเว็บ+เซิร์ฟเวอร์ รองรับตารางตามน้ำหนักและรหัสไปรษณีย์; เซิร์ฟเวอร์ปฏิเสธถ้ายอดหน้าเว็บไม่ตรง (PRICE_MISMATCH) | shared/shipping.js |
| 4 เลขพัสดุ | ช่องกรอกใน admin ออเดอร์ต้องจ่ายแล้วก่อน ลูกค้าเห็นที่หน้าสถานะ | admin-orders.js, public/admin |
| 5 แจ้งลูกค้า | ลิงก์สถานะเปิดซ้ำได้ /order/?id=..&t=.. (โทเคนส่วนตัว) + อีเมลยืนยัน/จัดส่ง (เปิดเมื่อตั้ง RESEND) | order-status.js, public/order |
| 6 ออเดอร์ค้างจ่าย | ยกเลิกอัตโนมัติเมื่อเกิน 48 ชม. + เตือนอีเมลที่ 24 ชม. + ปุ่มเปิดกลับใน admin | shared/orders.js |
| 7 ตรวจสลิป | ปุ่มอัปโหลดสลิปใน admin เรียก SlipOK (เปิดเมื่อตั้ง env) ไม่ยืนยันเงินให้เอง | verify-slip.js |
| 8 PDPA | ช่องติ๊กยินยอม (บังคับ) เก็บเวลา+เวอร์ชัน, หน้า /privacy/ /refund/ (ร่าง) | ProductView.tsx, public/privacy|refund |
| 9 กันกดซ้ำ | ล็อกปุ่มด้วย ref + request_id ไม่ซ้ำ (unique index) ต่อให้กดพร้อมกันก็ได้ออเดอร์เดียว | checkout.js |
| 10 ทีหลัง | รหัสส่วนลด, สั่งซ้ำ (ปุ่มในใบเสร็จ เติมฟอร์มให้), จำกัดกก. รวมของออเดอร์ที่ยังไม่ส่ง (max_open_kg) | admin-config.js |
| 11 รายงาน | แท็บ "รายงาน" ใน admin แยกตาม UTM ใช้ WHERE is_test=0 ไม่นับออเดอร์ที่ยกเลิก | sales-report.js |

### ตั้งค่า env ใน Cloudflare Pages (Settings > Variables) ถ้าอยากเปิดฟีเจอร์เสริม
- Turnstile: TURNSTILE_SITE_KEY + TURNSTILE_SECRET (สร้างไซต์ที่ Cloudflare > Turnstile; ฟรี)
- อีเมลลูกค้า: RESEND_API_KEY + EMAIL_FROM (โดเมนผู้ส่งต้องยืนยันกับ Resend ก่อน)
- ตรวจสลิป: SLIPOK_API_KEY + SLIPOK_BRANCH_ID (ยังไม่ได้ทดสอบกับบริการจริง ดูหมายเหตุในไฟล์)
- ไม่ตั้ง = ฟีเจอร์นั้นปิด ระบบยังใช้งานได้ตามปกติ (ดูสถานะที่แถบใต้หัวข้อหน้า admin)

### ข้อจำกัดที่ควรรู้
- Pages Functions ไม่มี cron: การยกเลิก/เตือนออเดอร์ค้างจ่ายทำเมื่อมีคนเปิดหน้า admin หรือมีออเดอร์ใหม่เข้า (admin โหลดทุก 10 วินาทีขณะเปิดหน้าอยู่) ถ้าอยากให้ทำเองแม้ไม่มีใครเปิด ต้องเพิ่ม Cron Trigger Worker
- ค่าส่งตอนนี้ยังเป็นเรทเดิม (50 บาท ต่ำกว่า 2 กก. ฟรีตั้งแต่ 2 กก.) แก้ตัวเลขที่ shared/shipping.js ที่เดียว
- ข้อความ "FREE SHIPPING ON 2+ KG" ใน ProductView เป็นข้อความคงที่ ถ้าเปลี่ยน freeFromKg ต้องแก้ข้อความนี้กับ i18n ด้วย
- อีเมลในฟอร์มกลายเป็นตัวเลือก (เบอร์โทรบังคับแทน)
- ก่อนยิงแคมเปญ: ล้างข้อมูลตัวอย่างด้วย scripts/reset-test-data.sql (เปิด Time Travel จดจุดกู้ไว้ก่อน) และให้ผู้รู้กฎหมายตรวจ /privacy/ /refund/ แก้ข้อความใน [วงเล็บเหลี่ยม]

## สถานะ 2 ต.ค. 2569 (อัปเดตท้ายวัน)

### ทำเสร็จและยืนยันแล้ว
- หน้า `/cafe/` ใช้งานจริง ฟอร์มบันทึกลง D1 และแจ้งเตือน LINE ถึงเจ้าของ
- Lead จริง (`is_test = 0`) ขึ้นใน HQ เมนู Café Leads การ์ดตัวเลขและป้ายช่องทางถูกต้อง
- ธงทดสอบถูกตัดสินจาก localStorage (`tato_is_test`) ตั้งด้วย `?test=1` และล้างด้วย `?test=0` (แก้ใน `public/cafe/index.html`)
- HQ (`public/system/index.html`): ฟอนต์ใหญ่ขึ้น, แถบบนขึ้นบรรทัดใหม่ได้, การ์ด Café Leads ใช้กฎ responsive ร่วมกับหน้าอื่น
- ลิงก์ "สำหรับร้านกาแฟ" (`/cafe/?src=site`) อยู่ 4 จุด: ปุ่มกลางหน้าแรก, เมนูบน (เดสก์ท็อป+มือถือ), Footer
- Reissue LINE token และใส่ใหม่ใน Cloudflare/Render แล้ว (เจ้าของยืนยัน)
- เปลี่ยน `ADMIN_PASSWORD` เป็น Secret แล้ว (เจ้าของยืนยัน)

### ยังไม่ได้ทำ
1. ปรับ `/privacy/` ให้ครอบคลุมข้อมูลที่ `/cafe/` เก็บ (ชื่อ เบอร์ ชื่อร้าน สถานะ เมนู เครื่อง ปริมาณ หมายเหตุ ช่องทาง/UTM บันทึกการยินยอม ค่า hash ของ IP) ต้องทำก่อนแจกลิงก์จริง
2. รอตัวเลขจากเจ้าของ: ราคาต่อ กก., ต้นทุนต่อ กก., กำลังคั่วต่อสัปดาห์ เพื่อตั้งรหัสราคา CAFE และ `max_open_kg`
3. เก็บของเล็ก ๆ: เทสต์ shipping ที่ล้ม 4 ข้อ, placeholder ให้จางลง, ตรวจหัวหน้า Overview หลังแก้แถบบน
4. สถิติ "เข้าชม → ส่งฟอร์ม" ใน HQ ยังนับการทดสอบของทีม ควรล้างหรือเริ่มนับใหม่ก่อนมีลูกค้าจริง

### หมายเหตุการ deploy
- รีโปเก็บ `dist/` ใน git แก้ `src/` แล้วต้อง `npm run build` และ commit `dist/` ด้วย (ห้ามใช้ `npm run clean`)
- ไฟล์ใน `public/` เป็นสแตติก ไม่ต้อง build

## อัปเดตรอบสอง 2 ต.ค. 2569 (ปิดงานวันนี้)

### เสร็จเพิ่มจากรอบแรก
- ปุ่ม "สำหรับร้านกาแฟ" กลางหน้าแรก (`src/components/DiscoverView.tsx`, คีย์แปล `'FOR CAFÉS'` ใน `src/i18n.tsx`) ลิงก์ไป `/cafe/?src=site`
- ล้าง event ทดสอบของ `/cafe/` ใน `behavior_events` แล้ว (27 แถว) การ์ด "เข้าชม → ส่งฟอร์ม" ใน HQ กลับเป็น "-"
- ลบ lead ทดสอบทั้งหมดใน D1 แล้ว HQ แสดง 0 lead จริง
- หน้า `/privacy/` เพิ่มหัวข้อ "ข้อมูลร้านกาแฟที่ติดต่อผ่านหน้า /cafe/" และเปลี่ยนวันปรับปรุงเป็น 2 ต.ค. 2569 (ระยะเก็บข้อมูล 2 ปี นับจากวันที่ส่งฟอร์ม เจ้าของกำหนดแล้ว 2 ต.ค. 2569)
- ตรวจแล้วว่าที่นโยบายเขียนตรงกับโค้ด: ฟอร์มบังคับติ๊กยอมรับ, `ip_hash` ใช้ทำ rate limit จริง, ช่อง `website` เป็น honeypot, ตาราง `leads` ไม่มี IP ดิบ
- หน้า Overview/Café Leads ใน HQ ตรวจหน้าตาแล้วใช้ได้

### โค้ดที่ push แล้ว (ยืนยันผลบนระบบจริงแล้ว 2 ต.ค. 2569)
- `shared/orders.js`: `ipHash` อ่าน `IP_HASH_SALT` ก่อน ถ้าไม่มีใช้ `ADMIN_PASSWORD` (คอมมิต `7192d72`) ตั้ง Secret `IP_HASH_SALT` ใน Cloudflare แล้ว และฟอร์มส่งผ่านจริง ถ้าฟอร์มส่งไม่ได้ในอนาคต ให้ลบตัวแปรออกเพื่อกลับไปใช้ `ADMIN_PASSWORD` ตามเดิม

### ยังไม่ได้ทำ (ก่อนแจกลิงก์จริง)
1. ~~ตั้ง `IP_HASH_SALT` ใหม่~~ เสร็จแล้ว 2 ต.ค. 2569: ตั้ง Secret ใน Cloudflare, deploy ใหม่, ทดสอบส่งฟอร์มผ่าน, ลบ lead/event ทดสอบแล้ว HQ กลับเป็น 0 หมายเหตุ: ค่า salt ที่ใช้อยู่อาจเป็นค่าที่เคยปรากฏในแชตช่วยงาน (ความเสี่ยงต่ำ เพราะตาราง `leads` เก็บแค่ hash ไม่มี IP ดิบ) ถ้าต้องการให้สะอาด ให้หมุนค่าใหม่ในหน้า Cloudflare แล้ว Retry deployment
2. ~~รอตัวเลขจากเจ้าของ~~ เสร็จแล้ว 2 ต.ค. 2569: เจ้าของตั้งส่วนลด CAFE และกำลังคั่วจริงที่ `/admin/` แท็บ "ตั้งค่า" แล้ว (ตัวเลขดูที่หน้านั้น ไม่ได้บันทึกในไฟล์นี้) หมายเหตุ: รหัสส่วนลดมี `percent`/`fixed` เท่านั้น ไม่มีราคาต่อ กก. แยก ถ้าต้องการต้องเพิ่มโค้ด
3. ~~ยืนยันระยะเก็บข้อมูลร้านกาแฟ~~ กำหนดแล้ว 2 ต.ค. 2569: เก็บ 2 ปีนับจากวันที่ส่งฟอร์ม แล้วลบ (ตรงกับหน้า `/privacy/` ไม่ต้องแก้นโยบาย) ยังไม่มีระบบลบอัตโนมัติ ให้รันคำสั่งลบใน D1 ทุกไตรมาส (คำสั่งอยู่ในหัวข้อสถานะด้านล่าง) และลบทันทีเมื่อมีร้านขอให้ลบ
4. ~~ให้ผู้รู้กฎหมายตรวจนโยบาย~~ เสร็จแล้ว 2 ต.ค. 2569 (ตามที่เจ้าของแจ้ง) ถ้านโยบายถูกแก้ ให้ตรวจโค้ดกับหน้า `/privacy/` ให้ตรงกัน
5. ~~เทสต์ shipping ที่ล้ม 4 ข้อ~~ เสร็จแล้ว (คอมมิต `fddf4b4`): เทสต์อยู่ที่ `tests/backend.test.mjs` ปรับตัวเลขให้ตรงตารางค่าส่งใน `shared/shipping.js` แล้ว และเพิ่ม `npm test` (ผ่าน 15 ข้าม 1 คือเทสต์หน้า admin ที่ต้องติดตั้ง jsdom)
6. ~~placeholder ในฟอร์มให้จางลง~~ เสร็จแล้ว (คอมมิต `fddf4b4`, `public/cafe/index.html`)
7. ~~เปลี่ยน `ADMIN_PASSWORD`~~ เสร็จแล้ว 2 ต.ค. 2569 (เจ้าของเปลี่ยนเอง) เดิม: เปลี่ยน `ADMIN_PASSWORD` ใน Cloudflare เป็นรหัสสุ่ม (`openssl rand -base64 18`) และเปลี่ยนชนิดจาก Text เป็น Secret ค่าเดิมเดาง่ายและเคยโผล่ในภาพหน้าจอ

### สถานะ ณ ปิดงาน 2 ต.ค. 2569
- **ข้อที่ต้องทำก่อนแจกลิงก์ครบแล้ว (ข้อ 1-7)** ตามที่เจ้าของแจ้ง พร้อมแจกลิงก์ `/cafe/` ให้ร้านกาแฟ ก่อนแจกจริงควรเช็กหน้า `/admin/` ว่ารหัส CAFE เปิดอยู่และกำลังคั่วถูกต้อง
- ค่าส่วนลด CAFE และ `max_open_kg` เจ้าของตั้งค่าจริงแล้วที่ `/admin/` (เดิมเป็นค่าชั่วคราว 10% / 5 กก. / 50 กก.)
- รหัส `WELCOME10` (30%, ขั้นต่ำ 10 กก.) หมดอายุ 2026-09-30 และถูกปิดไว้แล้ว
- ในหน้า `/admin/` Turnstile, อีเมลลูกค้า และตรวจสลิป ยังไม่เปิดใช้ (ไม่ใช่ข้อผิดพลาด) การกันสแปมของฟอร์มตอนนี้คือ rate limit กับ honeypot เท่านั้น
- คำสั่งลบ lead เก่ากว่า 2 ปี (ใช้หลังเจ้าของยืนยันระยะเก็บ): `DELETE FROM leads WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 years');` ตรวจจำนวนด้วย `SELECT COUNT(*)` ก่อนลบ

### ข้อสังเกต
- rate limit ของ `lead.js` (5 ครั้ง/10 นาที ต่อ IP) ใช้ตารางร่วมกับ checkout และนับทุกครั้งที่ส่ง ถ้ามีคนแจ้งว่าส่งฟอร์มไม่ได้ ให้ตรวจข้อนี้ก่อน
- มีขั้นตอนอัตโนมัติคัดลอกไฟล์จาก `public/` ไป `dist/` เมื่อ push (เห็นจากคอมมิตที่แทรกเข้ามา) ก่อนแก้ไฟล์ทุกครั้งให้ `git pull --rebase origin main`
- ทดสอบฟอร์มให้เปิด `/cafe/?test=1` โดยตรงเสมอ ปุ่มบนหน้าแรกลิงก์ไป `/cafe/?src=site` ไม่มีธงทดสอบ lead ที่ส่งผ่านปุ่มจะนับเป็น lead จริง ลบเองใน D1 (`DELETE FROM leads WHERE name = ...`) และ **ห้ามใช้ `scripts/reset-test-data.sql` ล้าง lead** ไฟล์นั้นลบออเดอร์ทั้งหมด
- ถ้าเปิด `/cafe/` เองด้วยเบราว์เซอร์ที่ล้างธงทดสอบแล้ว จะนับเป็นการเข้าชมจริง ใช้ `?test=1` เมื่อแค่เปิดดู และ `?test=0` เพื่อล้างธง

## อัปเดต 2-3 ต.ค. 2569 (รอบความปลอดภัย/ระบบ 9 ข้อ)
คอมมิตหลัก: b80ab55 (เทสต์/workflow/access), c13ae7f (กู้ lead.js), ddb38d4 (lead-admin), 9f381de (HQ + Turnstile ใน /cafe/) เทสต์ผ่าน 29/29 และ npm run lint ผ่านก่อน push ล่าสุด
ขั้นตอนตั้งค่าในหน้าบริการอยู่ที่ docs/SETUP-OPTIONAL.md สรุปสำหรับผู้ตรวจ PDPA อยู่ที่ docs/TRACKER-PDPA-REVIEW.md

| ข้อ | สถานะ | ไฟล์ / หมายเหตุ |
|---|---|---|
| 1 สำรอง D1 | โค้ดพร้อม ต้องตั้ง GitHub secret 3 ตัวก่อน | .github/workflows/d1-backup.yml, scripts/backup-d1.sh (เข้ารหัสก่อนอัปโหลด เพราะ repo เป็น public) |
| 2 Cloudflare Access | โค้ดพร้อม ยังไม่เปิด ต้องมีโดเมนของตัวเอง | shared/access.js, functions/_middleware.js (ACCESS_TEAM_DOMAIN + ACCESS_AUD, ปิดรหัสร่วมด้วย ADMIN_BASIC_DISABLED=1) |
| 3 CI | เสร็จ (ยังไม่ได้ยืนยันสีของ run ในแท็บ Actions) | .github/workflows/test.yml, jsdom เป็น devDependency |
| 4 แจ้งเตือน LINE ของ lead | ของเดิมทำงานอยู่ มีเทสต์ยืนยัน | functions/api/lead.js |
| 5 ปุ่มลบ/ติดป้ายทดสอบใน HQ | เสร็จ | functions/api/lead-admin.js (PATCH/DELETE ต้องมี header x-requested-with: tato-hq), public/system/index.html |
| 6 ลบ lead เก่าอัตโนมัติ | โค้ดพร้อม ต้องตั้ง secret เดียวกับข้อ 1 | ใน d1-backup.yml (รายไตรมาส หลังสำรองสำเร็จ) ใช้ GitHub Actions แทน Worker แยก |
| 7 Turnstile | โค้ดพร้อม ต้องตั้ง TURNSTILE_SITE_KEY + TURNSTILE_SECRET | public/cafe/index.html, functions/api/public-config.js |
| 8 อีเมลลูกค้า/ตรวจสลิป | รอสมัครบริการ | SlipOK ยังไม่เคยทดสอบกับบริการจริง |
| 9 tracker / PDPA | รอผู้ตรวจ | public/tracker.js ไม่ถูกใช้, /privacy/ ยังไม่พูดถึงการเก็บพฤติกรรมหน้าร้าน |

### บทเรียนจากเหตุการณ์ 2 ต.ค. (สำคัญ)
- functions/api/lead.js เคยถูกวางทับด้วยมือจนฟังก์ชัน POST หายและถูก push เข้า main (ฟอร์ม /cafe/ ได้ 405) กู้แล้วใน c13ae7f ตรวจด้วย: curl -s -o /dev/null -w "%{http_code}\n" -X POST https://tato-os.pages.dev/api/lead -H "content-type: application/json" -d "{}" ต้องได้ 400
- ห้ามต่อคำสั่ง commit/push โดยไม่ผูกกับผลเทสต์ (ใช้ npm test && npm run lint && git commit ...)
- ห้ามวางโค้ดลงเทอร์มินัลโดยไม่ใช้ heredoc (cat > ไฟล์ <<'X') และห้ามวางเนื้อไฟล์ลงเทอร์มินัลตรง ๆ
- ฟีเจอร์แอดมินใหม่ให้แยกเป็นไฟล์ใหม่ ไม่แก้ lead.js ที่รับฟอร์มสาธารณะ

### ข้อสังเกตที่ยังไม่แก้
- /api/behavior รับ metadata ไม่จำกัดขนาด/ฟิลด์ และ behavior_events ยังไม่มีระยะเวลาลบ
- ไฟล์สำรอง D1 (ข้อมูลลูกค้า) เก็บ 90 วันใน GitHub ควรแจ้งผู้ตรวจนโยบาย
- เว็บยังใช้ tato-os.pages.dev ซึ่งตั้ง Cloudflare Access ครอบ production ไม่ได้ (ตามที่เข้าใจ ยังไม่ได้ตรวจ) ต้องผูกโดเมนก่อน


## อัปเดต 3 ต.ค. 2569 (Marketing Brain: ชั้น Decision แบบมีกฎ)
รายละเอียดและสูตรอยู่ที่ `docs/MARKETING-BRAIN.md` หน้า `/system/marketing/` (ลิงก์จาก HQ เมนู Marketing Brain)
- ใหม่: `shared/marketing.js` (กฎ), `functions/api/marketing-brain.js`, `functions/api/ad-spend.js`, ตาราง `ad_spend` (สร้างอัตโนมัติใน `shared/schema.js`, migration `2026-10-03_ad_spend.sql`), `public/system/marketing/index.html`, `tests/marketing.test.mjs`, `tests/marketing-ui.test.mjs`
- **แก้บั๊กการระบุช่องทาง:** `saveUtm()` ใน `src/App.tsx` ไม่เก็บ `?src=` จึงทำให้ออเดอร์จากลิงก์ `?src=facebook|line|gbp` ไม่มีช่องทาง (ขึ้น "(direct)") ตอนนี้ใช้ `src` / fbclid / gclid / ttclid เป็นสำรอง ใช้กับผู้เข้าเว็บหลัง deploy เท่านั้น ถ้าแก้ `src/` ต้องให้ CI build `dist/` (ขั้นตอนอัตโนมัติ)
- **ต้องตั้งค่าก่อนเชื่อกำไร:** ต้นทุนต่อ กก. (เริ่มต้น 390 บาท ยืนยันว่านับต่อเมล็ดคั่วหรือเมล็ดสาร) และต้นทุนอื่นต่อออเดอร์ (เริ่มต้น 0) ที่หน้า Marketing Brain
- กฎกันเงินรั่ว: ช่องที่มีค่าโฆษณาถึงงบทดสอบ (เริ่มต้น 1,500 บาท) แต่ไม่มีออเดอร์ที่จ่ายแล้ว แนะนำให้หยุด ไม่ว่าจะมีเซสชันกี่ครั้ง
- ยังไม่ทำ: AI (เปิด Workers AI เมื่อมีเซสชันจริง 30-50+ ต่อช่องทาง), วัดแยกแคมเปญ/ครีเอทีฟ, Meta Pixel / Google tag (รอผู้ตรวจ PDPA)
- ชั้น Decision ตอนนี้เป็นกฎล้วน ไม่ใช่ AI และยังเป็นแค่คำแนะนำให้คนตัดสินใจ

## ของล่อร้านกาแฟ 5 ชั้น (5 ต.ค. 2569, กิ่ง feature/cafe-lure-ladder)
1. /cafe/calculator/ เครื่องคำนวณต้นทุนต่อแก้ว (คำนวณในเบราว์เซอร์ ใช้เฉพาะตัวเลขที่ร้านกรอก + ราคา TATO 550 บาท/กก. เป็นค่าเปรียบเทียบ)
2. /cafe/checklist/ เช็กลิสต์ปลดล็อกด้วยชื่อ+เบอร์ (POST /api/lead kind=checklist) เนื้อหาเป็นร่างทั่วไป เจ้าของต้องตรวจก่อนใช้จริง ข้อกฎหมายให้ยืนยันกับเทศบาล
3. ขอตัวอย่างใน /cafe/ (ต้องมีชื่อร้าน ปริมาณ ที่อยู่ ไปรษณีย์) ตัวแปร Cloudflare Pages: SAMPLE_GRAMS (ค่าเริ่มต้น 100), SAMPLE_WEEKLY_LIMIT (ค่าเริ่มต้น 5, ตั้ง 0 = ปิดรับ) 1 เบอร์ต่อ 1 ครั้ง HQ > Café Leads มีปุ่ม "ส่งตัวอย่างแล้ว"
4. สั่งครั้งแรก: ปุ่มหลังส่งฟอร์มพาไปหน้าร้าน (550 บาท/กก. ราคาเดียวกับหน้าร้าน ยังไม่มีขั้นต่ำพิเศษ)
5. GET /api/cafe-reorder (admin) ประมาณวันสั่งซ้ำจากประวัติ/ปริมาณที่ร้านแจ้ง + POST สร้างโค้ดแนะนำเพื่อน REF-XXXX (REFERRAL_DISCOUNT ค่าเริ่มต้น 50 บาท ใช้ครั้งเดียว 90 วัน ขั้นต่ำ 1 กก.) ไม่ส่งข้อความอัตโนมัติ
- คอลัมน์ใหม่ใน leads เพิ่มเองผ่าน shared/schema.js (migrations/2026-10-05_cafe_lure_ladder.sql ไว้รันมือถ้าต้องการ)
- เหตุการณ์ใหม่ใน behavior: calc_view, calc_result, calc_to_checklist, calc_to_form, checklist_view, checklist_unlock, cafe_sample_toggle, cafe_first_order_click
- ทดสอบ: node --test tests/cafe-ladder.test.mjs

## อัปเดต 5 ต.ค. 2569 (SEO พื้นฐาน + Header/Footer + ปุ่ม LINE, กิ่ง seo/basics-th)
**merge เข้า main แล้ว (PR #8 และ #9) และ deploy สำเร็จ 5 ต.ค. 2569** ตรวจบนเว็บสดแล้ว: sitemap 7 URL, หน้า `/cafe/checklist/` มี header/footer/เค้าโครงหมวด, หน้าแรก title+description เป็นไทย (บรรทัด hero ในหน้าแรกสร้างด้วย JS ตรวจจากการเรนเดอร์จริงในเครื่อง) ก่อน push ครั้งต่อไปให้ `git pull --rebase origin main` (CI จะ build `dist/` ให้เอง)

### ที่ทำแล้ว
- **SEO หน้าแรก** (`index.html`): title/description/og เป็นไทย, `og:locale`, schema Organization + WebSite (มีเบอร์ 064-293-6615 และ "เชียงใหม่ TH" ไม่มีที่อยู่ถนน; ถ้าไม่อยากให้เบอร์อยู่ใน schema ให้ลบ `telephone`)
- **SEO หน้า `/cafe/*`**: canonical, BreadcrumbList, WebPage (เครื่องคำนวณเป็น WebApplication ฟรี), ขนาดรูป og
- **เช็กลิสต์**: แสดงหัวข้อ 5 หมวดให้ทุกคนอ่านได้ก่อนกรอกฟอร์ม (`#outline` ซ่อนเมื่อปลดล็อก) รายการติ๊กยังล็อกด้วยฟอร์มเหมือนเดิม
- **sitemap**: มี 7 URL (รวม `/cafe/`, `/cafe/calculator/`, `/cafe/checklist/`) และ `scripts/gen-roast-pages.mjs` เติม 3 URL นี้ให้เองแล้ว (เดิมสคริปต์เขียนทับแล้ว URL `/cafe/*` หาย) หมายเหตุ: ตอนรันสคริปต์ หน้า `public/roast/*` จะต่างจากที่ commit อยู่เล็กน้อย (ท้ายแท็ก og) ยังไม่ได้ commit ส่วนนั้น
- **Header/Footer ร่วมของ `/cafe/*`**: `public/cafe/shared.css` + ส่วน header/footer ในแต่ละหน้า (ฟอนต์ Manrope + Anuphan, ปุ่มแคปซูล, ปุ่ม "แชต LINE" ลิงก์ lin.ee/8EwFz5i) ไม่มีปุ่มสลับ TH/EN เพราะหน้า `/cafe/*` เป็นไทยล้วน `_headers` ตั้ง `shared.css` เป็น no-cache
- **ปุ่ม LINE พร้อมผลคำนวณ** (`/cafe/calculator/`): กดแล้วส่งตัวเลขที่คำนวณ (ราคาขาย กรัม/แก้ว ต้นทุนเมล็ด ต้นทุน/กำไรต่อแก้ว กำไรต่อเดือน) ไปในข้อความ ไม่มีข้อมูลส่วนตัว
  - ถ้าตั้ง `PAYMENT_LINE_OA` (เช่น `@xxxx`) ใน Cloudflare: ใช้ `line.me/R/oaMessage/...` ฝังข้อความในแชตให้เลย (`/api/public-config` คืนค่า `line_oa` เพิ่ม ตรวจรูปแบบก่อนส่ง)
  - ถ้าไม่ตั้ง: ลิงก์สั้น lin.ee ฝังข้อความไม่ได้ จึงคัดลอกข้อความลงคลิปบอร์ดแล้วบอกให้กดวางในแชต
  - event ใหม่ใน behavior: `calc_to_line` (มี `prefilled` บอกว่าฝังข้อความได้หรือไม่)
- เทสต์: 55 ผ่านทั้งหมด (เพิ่มเทสต์ `line_oa` ใน `tests/access.test.mjs`) lint ผ่าน

### เพิ่มภายหลัง (วันเดียวกัน)
- **hero หน้าแรก** (`src/components/DiscoverView.tsx`): เพิ่มบรรทัด "เมล็ดคั่วสดสำหรับร้านกาแฟและดื่มที่บ้าน" + ลิงก์ "เป็นร้านกาแฟ? ขอตัวอย่างเมล็ด →" ไป `/cafe/?src=site-hero-line` (ใช้ `tr()` ไทย/อังกฤษ ไม่ต้องเพิ่มใน i18n DICT) ต้อง build `dist/` ผ่าน CI หลัง merge
- **เช็กลิสต์**: หลังปลดล็อกมีปุ่ม "คัดลอกเช็กลิสต์ แล้วเปิด LINE" คัดลอกรายการทั้ง 20 ข้อเป็นข้อความแล้วเปิด LINE ให้วางใน Keep/แชตตัวเอง (ลิงก์แชร์ของ LINE รับข้อความยาวขนาดนี้ไม่ได้ จึงใช้การคัดลอก) event ใหม่ `checklist_to_line`

### ยังเหลือ
- เจ้าของทำ: Google Business Profile, แปะลิงก์ `/cafe/calculator/?src=facebook|tiktok|line` ตามช่องทาง, ซื้อโดเมนแล้วผูก Custom domains (ต้องแก้ DOMAIN ใน `scripts/gen-roast-pages.mjs`, canonical ทุกหน้า, sitemap, robots ตามข้อ A5 ด้านบน), หลัง deploy ส่ง sitemap ใหม่ใน Search Console แล้ว Request indexing 3 หน้า `/cafe/*`
- เจ้าของทำ: ตั้ง `PAYMENT_LINE_OA` ใน Cloudflare ถ้าอยากให้ข้อความขึ้นในแชต LINE เอง
- ยังไม่ทำ: หลักฐานความน่าเชื่อถือ (รูปจริงของไร่/การคั่ว/วันที่คั่ว/ร้านที่ใช้จริง) ต้องเป็นของจริงเท่านั้น รอเจ้าของส่งรูปและข้อมูล
- ควรเปิดหน้า `/cafe/*` และหน้าแรกบนมือถือจริงอีกครั้ง (ตรวจเนื้อหาบนเว็บสดผ่านแล้ว แต่ยังไม่ได้ดูภาพบนเครื่องจริง)


## อัปเดต 6 ต.ค. 2569 (ปิดงานหลังบ้านก่อนลุยตลาดจริง)

### โค้ดที่ push แล้ว (เทสต์ผ่าน 76/76, lint ผ่าน, Cloudflare deploy เขียวทุกคอมมิต)
- `711c9fd` ปุ่ม Sync ใน HQ โหลดข้อมูลจริง (เดิมเป็น toast จำลอง) และ `/api/behavior` จำกัดขนาด (body 8 KB, metadata 4 KB, ตัดความยาวช่อง, ปฏิเสธ body ที่ไม่ใช่ object)
- `c046ee0` ตัวเลข Behavior events ใน HQ ใช้ยอดรวมจริงจาก `total` (เดิมค้างที่ 200 เพราะ LIMIT 200); เพิ่มลบ `behavior_events` เก่ากว่า 365 วันใน `d1-backup.yml`; เพิ่มหัวข้อ "ข้อมูลการใช้งานหน้าเว็บ" ใน `/privacy/`
- `54b0178` `npm audit fix` ปิดช่องโหว่ `source-map-js` (เหลือ 0 vulnerabilities)
- แก้ข้อความ `/privacy/` ให้บอกว่าเหตุการณ์ตอนสั่งซื้อ (`customer_created`, `purchase_intent`) ผูกกับ `customer_id`
- เทสต์ใหม่: `tests/behavior.test.mjs`

### ที่เจ้าของแจ้งว่าทำแล้ว (ผู้ช่วยตรวจในระบบจริงไม่ได้)
- ล้างข้อมูลทดสอบใน D1 แล้ว (ลูกค้า/ออเดอร์ทดสอบ, เซสชัน `52b31d9d…` ติดธงทดสอบ, สินค้า `test-product-001` ปิดใช้งาน)
- ทดลองสั่งซื้อครบวงจรหนึ่งรอบผ่าน
- ตั้ง GitHub secret ของงานสำรอง D1 แล้ว
- ส่งสรุปให้ผู้ตรวจ PDPA แล้ว (ไฟล์สรุปอยู่นอก repo)
- สถานะ: พร้อมแจกลิงก์ให้กลุ่มเล็กก่อน (`/?src=facebook|line|gbp`, `/cafe/?src=...`) ห้ามใส่ `?test=1`

### ข้อควรรู้
- งานลบ lead (2 ปี) และ behavior_events (1 ปี) รันเฉพาะเดือน ม.ค./เม.ย./ก.ค./ต.ค. หลังสำรองสำเร็จเท่านั้น ถ้าแก้ระยะเก็บ ต้องแก้ตัวเลขใน `d1-backup.yml` กับข้อความใน `/privacy/` ให้ตรงกัน
- เหตุการณ์ `purchase_intent` ที่มีหน้า `/buy.html` ยังถูกเขียนโดย `functions/api/checkout.js` ตามปกติ ไม่ใช่ข้อมูลเก่า
- `GET /api/orders` ช่อง `revenue`/`total_kg` นับออเดอร์ที่ยกเลิกรวมด้วย HQ ไม่ใช้ค่านี้ (คำนวณเองจากออเดอร์ที่จ่ายแล้ว) แต่ห้ามเอาไปใช้เป็นยอดขาย
- เครื่อง Codespace: หลัง `npm run build` ถ้า `dist/` เปลี่ยน ให้ `git restore dist` ก่อน `git pull --rebase` (CI สร้าง `dist/` ให้เอง)
- Node ใหม่พิมพ์ผลเทสต์เป็น `ℹ pass`/`ℹ fail` (ไม่ใช่ `# pass`) ใช้ `npm test 2>&1 | tail -10` ดูผล

### ยังไม่ทำ (ไม่ขวางการเปิดตัวกลุ่มเล็ก)
1. CSP ยังไม่ใส่ โดยไม่ทดสอบ เพราะหน้าร้านใช้สคริปต์ inline และอาจโหลด Turnstile; HSTS ไว้ใส่ตอนผูกโดเมนของตัวเอง (header พื้นฐาน 4 ตัวใส่แล้ว)
2. รอคำตอบผู้ตรวจ PDPA: ต้องมีแบนเนอร์ขอความยินยอมก่อนบันทึกพฤติกรรมหรือไม่, เลิกส่ง `customer_id` เข้า `behavior_events` (ตัด referrer และ session_id หมดอายุ 30 วัน ทำแล้ว)
3. ตรวจชื่อภาษาไทยของลูกค้าเก่า (29-30 ก.ย.) ที่เพี้ยนเป็นอักขระแปลก ว่าตอนนี้ยังเกิดอยู่ไหม (ดูจากออเดอร์ทดสอบรอบล่าสุด)
4. ยังไม่เปิด: Turnstile, อีเมลลูกค้า (Resend), ตรวจสลิป (SlipOK, ยังไม่เคยทดสอบกับของจริง), Workers AI, ตัววิเคราะห์ SEO/GEO (รอเซสชันจริง 30-50 ครั้งขึ้นไป)
5. เจ้าของ: Search Console (ส่ง sitemap 7 URL), โดเมนของตัวเอง + Cloudflare Access, `PAYMENT_LINE_OA`, รูปจริงของไร่/การคั่ว, ยืนยันข้อความ "เก็บด้วยมือ"/"หมักตอนกลางคืนอากาศเย็น" กับผู้ปลูก
6. ข้อมูลของเซสชันอื่นที่เหลือใน `behavior_events` (เช่น `fbpage`/`cafe01` วันที่ 5 ต.ค.) ยังไม่ได้ตรวจว่าเป็นของทดสอบหรือคนจริง

## อัปเดต 6 ต.ค. 2569 (ปิดงานหลังบ้าน พร้อมลุยตลาดจริง)
สถานะ: ระบบหลังบ้านครบ ผ่านหมด (เจ้าของยืนยัน 6 ต.ค.) เทสต์ 76/76, lint, build, Cloudflare deploy เขียว

ทำแล้ว
- ปุ่ม Sync ใน HQ โหลดข้อมูลจริง, ตัวเลข Behavior events ใช้ยอดรวมจริง (`total`)
- `/api/behavior` จำกัดขนาดข้อมูล, ลบ `behavior_events` เก่ากว่า 365 วันอัตโนมัติ (รายไตรมาส หลังสำรอง D1)
- `/privacy/` เพิ่มหัวข้อข้อมูลการใช้งานหน้าเว็บ และระบุว่าเหตุการณ์ตอนสั่งซื้อผูกกับ `customer_id`
- `npm audit fix` เหลือ 0 ช่องโหว่
- ล้างข้อมูลทดสอบ, ทดลองสั่งซื้อครบวงจร, ตั้งสำรอง D1, ส่งสรุปให้ผู้ตรวจ PDPA

ข้อควรรู้
- แจกลิงก์จริงห้ามใส่ `?test=1` (`/?src=facebook|line|gbp`, `/cafe/?src=...`)
- ถ้าแก้ระยะเก็บข้อมูล ต้องแก้ `d1-backup.yml` กับ `/privacy/` ให้ตรงกัน
- `revenue` ใน `GET /api/orders` นับออเดอร์ที่ยกเลิกด้วย อย่าใช้เป็นยอดขาย (HQ คำนวณเองถูกแล้ว)
- หลัง `npm run build` ถ้า `dist/` เปลี่ยน ให้ `git restore dist` ก่อน `git pull --rebase`

ต่อยอดภายหลัง (ไม่ขวางการขาย)
- ตามคำตอบผู้ตรวจ PDPA (แบนเนอร์ยินยอม)
- Workers AI และตัววิเคราะห์ SEO/GEO เมื่อมีเซสชันจริง 30-50 ครั้งขึ้นไป

## อัปเดต 6 ต.ค. 2569 (ปิดงานความปลอดภัย)
ทำแล้วและตรวจบนเว็บจริงแล้ว
- ตัด referrer ออกจาก behavior tracking ทุกหน้า, session_id หมดอายุ 30 วัน (`tato_session_at`)
- Security header: nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy, HSTS (30 วัน), CSP แบบ allowlist (ทดสอบ Turnstile + สั่งซื้อ + HQ ผ่านแล้ว)
- `/privacy/` และ `docs/TRACKER-PDPA-REVIEW.md` ตรงกับระบบจริง
- Turnstile, อีเมลลูกค้า, ตรวจสลิป, โดเมน + Access: เจ้าของทดสอบผ่านแล้ว

ต่อยอดภายหลัง (ไม่ขวางการขาย)
- ส่ง `TRACKER-PDPA-REVIEW.md` ฉบับใหม่ให้ผู้ตรวจ แล้วทำตามคำตอบ (แบนเนอร์ยินยอมถ้าจำเป็น)
- Workers AI และตัววิเคราะห์ SEO/GEO เมื่อมีเซสชันจริง 30-50 ครั้งขึ้นไป
- CSP ยังต้องเปิด `'unsafe-inline'` เพราะ `/system/` มี onclick 43 จุดและหน้า cafe มี inline script/style ถ้าอยากเข้มขึ้นต้องย้ายออกเป็นไฟล์ก่อน (ไม่เร่งด่วน)
- HSTS ตอนนี้ 30 วัน ถ้าเว็บนิ่งแล้วค่อยขยายเป็น 6 เดือน
\n