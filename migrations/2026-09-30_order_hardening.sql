-- TATO-OS order hardening (30 ก.ย. 2569)
-- ไม่ต้องรันเอง: โค้ด (shared/schema.js) เพิ่มคอลัมน์/ตารางเหล่านี้ให้อัตโนมัติเมื่อมีคนเรียก /api/checkout,
-- /api/admin-orders ฯลฯ ครั้งแรกหลัง deploy ไฟล์นี้เก็บไว้อ้างอิง หรือรันใน D1 Console เองก็ได้
-- (SQLite ไม่มี ADD COLUMN IF NOT EXISTS: ถ้าคอลัมน์มีอยู่แล้วบรรทัดนั้นจะ error ให้ข้ามบรรทัดนั้นได้)

-- orders
ALTER TABLE orders ADD COLUMN subtotal REAL;
ALTER TABLE orders ADD COLUMN discount_code TEXT;
ALTER TABLE orders ADD COLUMN discount_amount REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN fulfillment_status TEXT;   -- NULL | 'shipped'
ALTER TABLE orders ADD COLUMN tracking_no TEXT;
ALTER TABLE orders ADD COLUMN courier TEXT;
ALTER TABLE orders ADD COLUMN shipped_at TEXT;
ALTER TABLE orders ADD COLUMN cancel_reason TEXT;        -- 'expired_unpaid' | 'cancelled_by_admin'
ALTER TABLE orders ADD COLUMN cancelled_at TEXT;

-- order_details
ALTER TABLE order_details ADD COLUMN postal_code TEXT;
ALTER TABLE order_details ADD COLUMN consent_at TEXT;
ALTER TABLE order_details ADD COLUMN consent_version TEXT;
ALTER TABLE order_details ADD COLUMN request_id TEXT;
ALTER TABLE order_details ADD COLUMN lookup_token TEXT;
ALTER TABLE order_details ADD COLUMN ip_hash TEXT;
ALTER TABLE order_details ADD COLUMN reminder_sent_at TEXT;
ALTER TABLE order_details ADD COLUMN slip_ref TEXT;
ALTER TABLE order_details ADD COLUMN slip_checked_at TEXT;
ALTER TABLE order_details ADD COLUMN slip_result TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS order_details_request_idx ON order_details(request_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS order_details_slip_idx ON order_details(slip_ref) WHERE slip_ref IS NOT NULL;

-- new tables
CREATE TABLE IF NOT EXISTS checkout_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, ip_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS checkout_attempts_ip_idx ON checkout_attempts(ip_hash, created_at);
CREATE TABLE IF NOT EXISTS discount_codes (code TEXT PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('percent','fixed')), value REAL NOT NULL, min_kg REAL NOT NULL DEFAULT 0, max_uses INTEGER, used_count INTEGER NOT NULL DEFAULT 0, expires_at TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
