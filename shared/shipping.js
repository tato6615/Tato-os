// TATO-OS shared shipping formula.
// ONE source of truth: imported by functions/api/checkout.js (server) and
// src/components/ProductView.tsx (browser). Edit rates here only.
//
// Shipping is charged by real packed weight (no permanent free shipping).
// Rates = the table supplied by the shop (weight ceiling -> THB). Replace when rates change. Orders above maxKg cannot go as a normal parcel:
// quote() flags contactShop:true and the server refuses the order.

export const SHIPPING = {
  // Orders heavier than this: "contact the shop for shipping cost".
  maxKg: 20,
  // Default zone (nationwide). Tiers are checked in order: first tier whose maxKg >= kg wins.
  // Source: rate table supplied by the shop (weight ceiling -> THB). Anything up to 1 kg is
  // charged at the 1 kg rate because packed coffee weighs more than its net weight.
  defaultZone: {
    name: "default",
    tiers: [
      { maxKg: 1, fee: 67 },
      { maxKg: 1.5, fee: 82 },
      { maxKg: 2, fee: 97 },
      { maxKg: 2.5, fee: 100 },
      { maxKg: 3, fee: 105 },
      { maxKg: 3.5, fee: 110 },
      { maxKg: 4, fee: 120 },
      { maxKg: 4.5, fee: 130 },
      { maxKg: 5, fee: 140 },
      { maxKg: 5.5, fee: 150 },
      { maxKg: 6, fee: 160 },
      { maxKg: 6.5, fee: 170 },
      { maxKg: 7, fee: 180 },
      { maxKg: 7.5, fee: 190 },
      { maxKg: 8, fee: 200 },
      { maxKg: 8.5, fee: 215 },
      { maxKg: 9, fee: 230 },
      { maxKg: 9.5, fee: 245 },
      { maxKg: 10, fee: 260 },
      { maxKg: 11, fee: 300 },
      { maxKg: 12, fee: 320 },
      { maxKg: 13, fee: 340 },
      { maxKg: 14, fee: 360 },
      { maxKg: 15, fee: 380 },
      { maxKg: 16, fee: 395 },
      { maxKg: 17, fee: 410 },
      { maxKg: 18, fee: 425 },
      { maxKg: 19, fee: 435 },
      { maxKg: 20, fee: 445 },
    ],
  },
  // Optional per-postal-code overrides, e.g. remote areas.
  // Match by postal prefix (string). Example (disabled):
  //   { prefixes: ["57", "58"], name: "north-remote", tiers: [{ maxKg: 20, fee: 495 }] }
  zones: [],
};

export function zoneFor(postal) {
  const p = String(postal || "").trim();
  if (p) {
    for (const z of SHIPPING.zones) {
      if (z.prefixes.some((x) => p.startsWith(x))) return z;
    }
  }
  return SHIPPING.defaultZone;
}

/** Shipping fee in THB for a total weight (kg) and optional postal code. */
/** @param {number} kg @param {string=} postal */
export function calcShipping(kg, postal) {
  const w = Number(kg);
  if (!(w > 0)) return 0;
  if (w > SHIPPING.maxKg) return 0; // caller must check isOverMax() and ask the customer to contact the shop
  const zone = zoneFor(postal);
  const tier = zone.tiers.find((t) => w <= t.maxKg) || zone.tiers[zone.tiers.length - 1];
  return tier.fee;
}

/** True when the order is too heavy for the fee table (contact the shop). */
/** @param {number} kg */
export function isOverMax(kg) {
  return Number(kg) > SHIPPING.maxKg;
}

/** Product subtotal in whole baht (unitPrice per kg). Same rounding everywhere. */
export function calcSubtotal(kg, unitPrice) {
  return Math.round((Math.round(Number(kg) * 1000) * Number(unitPrice)) / 1000);
}

/** Discount in baht. code = {type:'percent'|'fixed', value, min_kg}. Never exceeds subtotal. */
/** @param {number} subtotal @param {number} kg @param {any=} code */
export function calcDiscount(subtotal, kg, code) {
  if (!code) return 0;
  if (code.min_kg && Number(kg) < Number(code.min_kg)) return 0;
  let d = 0;
  if (code.type === "percent") d = Math.floor((subtotal * Number(code.value)) / 100);
  else if (code.type === "fixed") d = Math.floor(Number(code.value));
  return Math.max(0, Math.min(d, subtotal));
}

/**
 * Full price quote. Shipping is by weight. Over SHIPPING.maxKg the result carries
 * contactShop:true (shipping 0 is NOT a real price; the order must be refused).
 * @param {{kg:number, unitPrice:number, postal?:string, code?:any}} p
 * @returns {{subtotal:number, discount:number, shipping:number, total:number, contactShop?:boolean}}
 */
export function quote({ kg, unitPrice, postal, code }) {
  const subtotal = calcSubtotal(kg, unitPrice);
  const discount = calcDiscount(subtotal, kg, code);
  const shipping = calcShipping(kg, postal);
  const q = { subtotal, discount, shipping, total: subtotal - discount + shipping };
  return isOverMax(kg) ? { ...q, contactShop: true } : q;
}