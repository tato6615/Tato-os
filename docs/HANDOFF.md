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
- หน้า `/privacy/` เพิ่มหัวข้อ "ข้อมูลร้านกาแฟที่ติดต่อผ่านหน้า /cafe/" และเปลี่ยนวันปรับปรุงเป็น 2 ต.ค. 2569 (ระยะเก็บข้อมูลเขียนไว้ 2 ปี รอเจ้าของยืนยัน)
- ตรวจแล้วว่าที่นโยบายเขียนตรงกับโค้ด: ฟอร์มบังคับติ๊กยอมรับ, `ip_hash` ใช้ทำ rate limit จริง, ช่อง `website` เป็น honeypot, ตาราง `leads` ไม่มี IP ดิบ
- หน้า Overview/Café Leads ใน HQ ตรวจหน้าตาแล้วใช้ได้

### โค้ดที่ push แล้วแต่ยังไม่ยืนยันผลบนระบบจริง
- `shared/orders.js`: `ipHash` อ่าน `IP_HASH_SALT` ก่อน ถ้าไม่มีใช้ `ADMIN_PASSWORD` (คอมมิต `7192d72`) **ยังไม่ยืนยันว่าตั้ง Secret `IP_HASH_SALT` ใน Cloudflare แล้ว** ค่าที่เคยสร้างโผล่ในภาพหน้าจอ ถือว่าหลุด ต้องสร้างใหม่ (`openssl rand -hex 24`) แล้วตั้งเป็น Secret และ Retry deployment ถ้าตั้งแล้วฟอร์มส่งไม่ได้ ให้ลบตัวแปรออกเพื่อกลับไปใช้ค่าเดิม

### ยังไม่ได้ทำ (ก่อนแจกลิงก์จริง)
1. ตั้ง `IP_HASH_SALT` ใหม่ (ดูด้านบน) แล้วทดสอบส่งฟอร์ม `?test=1` และลบแถว/event ทดสอบ
2. รอตัวเลขจากเจ้าของ: ราคาต่อ กก., ต้นทุนต่อ กก., กำลังคั่วต่อสัปดาห์ เพื่อตั้งรหัสราคา CAFE และ `max_open_kg` (ยังไม่ได้ดูโค้ดส่วนนี้)
3. ยืนยันระยะเก็บข้อมูลร้านกาแฟ 2 ปีกับเจ้าของ ยังไม่มีระบบลบ lead อัตโนมัติ ต้องลบเองให้ตรงกับนโยบาย
4. ให้ผู้รู้กฎหมายตรวจนโยบาย (ไฟล์เดิมระบุว่าเป็นร่างสำหรับ PDPA)
5. ~~เทสต์ shipping ที่ล้ม 4 ข้อ~~ เสร็จแล้ว (คอมมิต `fddf4b4`): เทสต์อยู่ที่ `tests/backend.test.mjs` ปรับตัวเลขให้ตรงตารางค่าส่งใน `shared/shipping.js` แล้ว และเพิ่ม `npm test` (ผ่าน 15 ข้าม 1 คือเทสต์หน้า admin ที่ต้องติดตั้ง jsdom)
6. ~~placeholder ในฟอร์มให้จางลง~~ เสร็จแล้ว (คอมมิต `fddf4b4`, `public/cafe/index.html`)

### ข้อสังเกต
- rate limit ของ `lead.js` (5 ครั้ง/10 นาที ต่อ IP) ใช้ตารางร่วมกับ checkout และนับทุกครั้งที่ส่ง ถ้ามีคนแจ้งว่าส่งฟอร์มไม่ได้ ให้ตรวจข้อนี้ก่อน
- มีขั้นตอนอัตโนมัติคัดลอกไฟล์จาก `public/` ไป `dist/` เมื่อ push (เห็นจากคอมมิตที่แทรกเข้ามา) ก่อนแก้ไฟล์ทุกครั้งให้ `git pull --rebase origin main`
- ถ้าเปิด `/cafe/` เองด้วยเบราว์เซอร์ที่ล้างธงทดสอบแล้ว จะนับเป็นการเข้าชมจริง ใช้ `?test=1` เมื่อแค่เปิดดู และ `?test=0` เพื่อล้างธง
