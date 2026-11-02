// TATO-OS price table: ONE source of truth for per-roast prices.
// Imported by functions/api/checkout.js (server decides the real price) and by src/ (browser display).
//
//   Retail  per kg: light 690 / medium 650 / dark 650
//   Café    per kg: light 590 / medium 550 / dark 550   (retail price minus CAFE_DISCOUNT_PER_KG)
//
// products.price in D1 stays 650 (the medium/dark price). Light roast adds ROAST_SURCHARGE.light.
// Why light costs more: it loses the least weight in the roaster (lowest cost per roasted kg) but is
// priced like specialty light roasts; dark loses the most weight, so it must NOT be discounted.
// Change prices here only (and tests/pricing-by-roast.test.mjs).

export const ROASTS = ["light", "medium", "dark"];

/** Extra THB per kg on top of products.price (the medium/dark price). */
export const ROAST_SURCHARGE = { light: 40, medium: 0, dark: 0 };

/** Café price = retail price minus this many THB per kg (code CAFE). */
export const CAFE_DISCOUNT_PER_KG = 100;

/** @param {any} r */
export function isRoast(r) {
  return ROASTS.includes(String(r || ""));
}

/**
 * Retail unit price (THB/kg) for a roast. Unknown or missing roast = base price (medium).
 * @param {number} basePrice products.price from D1
 * @param {string=} roast
 */
export function unitPriceFor(basePrice, roast) {
  const extra = isRoast(roast) ? ROAST_SURCHARGE[/** @type {"light"|"medium"|"dark"} */ (roast)] : 0;
  return Number(basePrice) + extra;
}

/**
 * Café unit price (THB/kg) for a roast.
 * @param {number} basePrice
 * @param {string=} roast
 */
export function cafePriceFor(basePrice, roast) {
  return unitPriceFor(basePrice, roast) - CAFE_DISCOUNT_PER_KG;
}

/**
 * The CAFE row in D1 is a percent code (the code table only allows 'percent' | 'fixed'), and a percent
 * cannot give exactly -100/kg on both 690 and 650. So for code CAFE the discount is a flat
 * CAFE_DISCOUNT_PER_KG per kg and the percent stored in D1 is ignored. Everything else about the row
 * (active, expires_at, max_uses, used_count, min_kg) still applies.
 * @param {any} row discount_codes row
 */
export function cafeCodeAsPerKg(row) {
  if (row && String(row.code || "").toUpperCase() === "CAFE") {
    return { ...row, type: "per_kg", value: CAFE_DISCOUNT_PER_KG };
  }
  return row;
}
