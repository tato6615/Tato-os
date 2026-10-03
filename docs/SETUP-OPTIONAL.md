# ตั้งค่าที่ต้องกดในหน้าบริการ (โค้ดพร้อมแล้ว)

โค้ดทุกข้อด้านล่างอยู่ใน repo แล้วและปิดอยู่จนกว่าจะตั้งค่า (ไม่ตั้ง = ระบบทำงานเหมือนเดิม)
ตั้งค่าที่ Cloudflare Pages > Settings > Variables and Secrets (ค่าลับใช้ชนิด Secret) แล้ว Retry deployment

## 1) สำรอง D1 + ลบ lead เก่ากว่า 2 ปีอัตโนมัติ (.github/workflows/d1-backup.yml)
repo นี้เป็น public จึงเข้ารหัสไฟล์สำรองก่อนอัปโหลดเสมอ
1. Cloudflare > My Profile > API Tokens > Create Token > Custom: สิทธิ์ Account / D1 / Edit เท่านั้น
2. GitHub repo > Settings > Secrets and variables > Actions > New repository secret 3 ตัว:
   - CLOUDFLARE_API_TOKEN = token ข้อ 1
   - CLOUDFLARE_ACCOUNT_ID = Account ID (หน้า Workers & Pages ฝั่งขวา)
   - BACKUP_PASSPHRASE = รหัสผ่านยาวสุ่มเอง เก็บสำเนาใน password manager (หายแล้วถอดไฟล์สำรองไม่ได้)
3. แท็บ Actions > "D1 backup and lead retention" > Run workflow (ครั้งแรกไม่ติ๊ก run_retention) ต้องเขียวและมี artifact d1-backup-encrypted
4. หลังจากนั้นรันเองทุกวันที่ 1 ของเดือน เดือน ม.ค./เม.ย./ก.ค./ต.ค. จะลบ lead เก่ากว่า 2 ปีหลังสำรองสำเร็จเท่านั้น
- ไฟล์สำรองอยู่ 90 วัน และมีข้อมูลลูกค้า ควรแจ้งผู้ตรวจนโยบายว่ามีที่เก็บนี้
- ถอดรหัส: openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in so_tato-YYYY-MM-DD.sql.enc -out restore.sql
- GitHub หยุด schedule ของ repo ที่ไม่มีกิจกรรม 60 วัน ถ้า repo นิ่งนานให้กด Enable ใหม่ในแท็บ Actions
- สำรองมือ: bash scripts/backup-d1.sh (หลัง npx wrangler login) ไฟล์ลง backups/ ซึ่ง git ไม่เก็บ

## 2) Cloudflare Access แทนรหัสร่วม (shared/access.js, functions/_middleware.js)
เงื่อนไข: ตามที่ผมเข้าใจ *.pages.dev ตั้ง Access ครอบ production ไม่ได้ ต้องผูกโดเมนของตัวเองกับ Pages ก่อน (ยังไม่ได้ตรวจในบัญชีจริง ถ้าหน้า Zero Trust ทำได้ก็ใช้ได้เลย)
1. Zero Trust > Access > Applications > Self-hosted: โดเมนของคุณ path admin/* และอีกรายการ path system/*
2. Policy: Allow เฉพาะอีเมลของคุณ (One-time PIN ใช้ได้)
3. จดค่า Application Audience (AUD) Tag และ team domain (xxxx.cloudflareaccess.com)
4. Pages Variables: ACCESS_TEAM_DOMAIN และ ACCESS_AUD แล้ว Retry deployment
5. ทดสอบ: เปิด /admin/ ต้องเด้งหน้าล็อกอินอีเมลแล้วเข้าได้ (รหัสเดิมยังใช้เป็นทางสำรอง)
6. เมื่อมั่นใจแล้วตั้ง ADMIN_BASIC_DISABLED = 1 เพื่อปิดรหัสร่วม ถ้าติดขัดให้ลบตัวแปรนี้ ถ้า Access ตั้งไม่ครบตัวแปรนี้ไม่มีผล จึงไม่ล็อกตัวเอง

## 3) Turnstile (กันบอต) ฟอร์ม /cafe/ และหน้าสั่งซื้อรองรับแล้ว
1. Cloudflare > Turnstile > Add site (Managed) ได้ Site key + Secret key
2. Pages Variables: TURNSTILE_SITE_KEY และ TURNSTILE_SECRET (Secret) ตั้งพร้อมกัน แล้ว Retry deployment
3. ทดสอบ /cafe/?test=1 ต้องเห็นกล่องยืนยันและส่งฟอร์มผ่าน ถ้ามีปัญหาให้ลบ TURNSTILE_SECRET เพื่อปิดทันที
- /api/public-config เปิดเผยเฉพาะ Site key และจะว่างถ้าไม่ได้ตั้งทั้งสองค่า

## 4) อีเมลลูกค้า (Resend)
1. สมัคร resend.com เพิ่มและยืนยันโดเมนผู้ส่ง (ตั้ง DNS ตามที่ Resend บอก)
2. Pages Variables: RESEND_API_KEY (Secret), EMAIL_FROM
3. ทดสอบสั่งซื้อ 1 ออเดอร์ด้วยอีเมลตัวเอง

## 5) ตรวจสลิป (SlipOK)
1. สมัคร SlipOK รับ API key และ Branch ID
2. Pages Variables: SLIPOK_API_KEY (Secret), SLIPOK_BRANCH_ID
3. โค้ดฝั่งนี้ยังไม่เคยทดสอบกับบริการจริง ลองกับสลิปจริง/ปลอม/ซ้ำก่อนใช้งาน ระบบไม่ยืนยันเงินให้เอง
