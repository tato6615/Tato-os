// TATO-OS shared input validation (server + browser use the same rules).

export function normalizePhone(v) {
  let s = String(v == null ? "" : v).replace(/[\s\-().]/g, "");
  if (s.startsWith("+66")) s = "0" + s.slice(3);
  else if (s.startsWith("66") && s.length === 11) s = "0" + s.slice(2);
  return s;
}

/** Thai mobile: 10 digits, starts 06/08/09, not a run of one repeated digit. */
export function isValidThaiPhone(v) {
  const s = normalizePhone(v);
  if (!/^0[689]\d{8}$/.test(s)) return false;
  if (/^0[689](\d)\1{7}$/.test(s)) return false; // e.g. 0800000000, 0899999999
  return true;
}

export function isValidPostal(v) {
  return /^[1-9]\d{4}$/.test(String(v == null ? "" : v).trim());
}

export function isValidEmail(v) {
  const s = String(v == null ? "" : v).trim();
  return s.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

// Needs at least 2 letters (Thai or Latin), so "3333" or "..." fail.
export function isValidName(v) {
  const s = String(v == null ? "" : v).trim();
  if (s.length < 2 || s.length > 120) return false;
  const letters = s.match(/[A-Za-z\u0E00-\u0E7F]/g) || [];
  return letters.length >= 2;
}

export function isValidAddress(v) {
  const s = String(v == null ? "" : v).trim();
  if (s.length < 10 || s.length > 500) return false;
  return (s.match(/[A-Za-z\u0E00-\u0E7F]/g) || []).length >= 3 && /\d/.test(s);
}

/** Returns {field: message} (Thai messages). Empty object = OK. Email optional. */
export function validateCustomer(c) {
  const e = {};
  if (!isValidName(c.name)) e.name = "กรุณาระบุชื่อ-นามสกุลจริง";
  if (!isValidThaiPhone(c.phone)) e.phone = "กรุณาระบุเบอร์มือถือไทย 10 หลัก (เช่น 081 234 5678)";
  if (c.email && !isValidEmail(c.email)) e.email = "รูปแบบอีเมลไม่ถูกต้อง";
  if (!isValidAddress(c.address)) e.address = "กรุณาระบุที่อยู่ให้ครบ (บ้านเลขที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)";
  if (!isValidPostal(c.postal_code)) e.postal_code = "กรุณาระบุรหัสไปรษณีย์ 5 หลัก";
  if (!c.consent) e.consent = "กรุณายอมรับนโยบายความเป็นส่วนตัวและนโยบายการคืนสินค้า";
  return e;
}
