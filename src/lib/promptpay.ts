const tlv = (t: string, v: string) => t + String(v.length).padStart(2, '0') + v;

function crc16(s: string): string {
  let c = 0xffff;
  for (let i = 0; i < s.length; i++) {
    c ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      c = c & 0x8000 ? (c << 1) ^ 0x1021 : c << 1;
      c &= 0xffff;
    }
  }
  return c.toString(16).toUpperCase().padStart(4, '0');
}

export function promptpayPayload(rawId: string, amount?: number): string | null {
  const d = String(rawId || '').replace(/\D/g, '');
  let sub: string;
  if (d.length === 10 && d.startsWith('0')) sub = tlv('01', '0066' + d.slice(1));
  else if (d.length === 11 && d.startsWith('66')) sub = tlv('01', '00' + d);
  else if (d.length === 13) sub = tlv('02', d);
  else if (d.length === 15) sub = tlv('03', d);
  else return null;
  const amt = amount && amount > 0 ? tlv('54', amount.toFixed(2)) : '';
  const body =
    tlv('00', '01') +
    tlv('01', amt ? '12' : '11') +
    tlv('29', tlv('00', 'A000000677010111') + sub) +
    tlv('58', 'TH') +
    tlv('53', '764') +
    amt;
  const withCrc = body + '6304';
  return withCrc + crc16(withCrc);
}
