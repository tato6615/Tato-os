// TATO-OS shared shipping formula.
// ONE source of truth: imported by functions/api/checkout.js (server) and
// src/components/ProductView.tsx (browser). Edit rates here only.
//
// NOTE: rates below reproduce the previous behaviour (50 THB under 2 kg, free from 2 kg)
// because no new rates were provided. Change the numbers to your real courier prices.

export const SHIPPING = {
  freeFromKg: 2,
  // Default zone. Tiers are checked in order: first tier whose maxKg >= kg wins.
  defaultZone: {
    name: "default",
    tiers: [
      { maxKg: 0.5, fee: 50 },
      { maxKg: 1, fee: 50 },
      { maxKg: 1.5, fee: 50 },
      { maxKg: 1.99, fee: 50 },
    ],
  },
  // Optional per-postal-code overrides, e.g. remote areas.
  // Match by postal prefix (string). Example (disabled):
  //   { prefixes: ["57", "58"], name: "north-remote", tiers: [{ maxKg: 1.99, fee: 80 }] }
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
  if (w >= SHIPPING.freeFromKg) return 0;
  const zone = zoneFor(postal);
  const tier = zone.tiers.find((t) => w <= t.maxKg) || zone.tiers[zone.tiers.length - 1];
  return tier.fee;
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
 * Full price quote. Free-shipping threshold uses kg, not discounted price.
 * @param {{kg:number, unitPrice:number, postal?:string, code?:any}} p
 * @returns {{subtotal:number, discount:number, shipping:number, total:number}}
 */
export function quote({ kg, unitPrice, postal, code }) {
  const subtotal = calcSubtotal(kg, unitPrice);
  const discount = calcDiscount(subtotal, kg, code);
  const shipping = calcShipping(kg, postal);
  return { subtotal, discount, shipping, total: subtotal - discount + shipping };
}
