// Per-roast prices (shared/pricing.js).
//   Retail  : light 690 / medium 650 / dark 650 THB/kg
//   Café    : light 590 / medium 550 / dark 550 THB/kg (code CAFE = flat -100 THB/kg)
import test from "node:test";
import assert from "node:assert/strict";
import { quote } from "../shared/shipping.js";
import { unitPriceFor, cafePriceFor, cafeCodeAsPerKg, isRoast, ROASTS } from "../shared/pricing.js";

const BASE = 650; // products.price in D1
const CAFE_ROW = { code: "CAFE", type: "percent", value: 15.38462, min_kg: 0, active: 1 };

test("retail price per roast", () => {
  assert.equal(unitPriceFor(BASE, "light"), 690);
  assert.equal(unitPriceFor(BASE, "medium"), 650);
  assert.equal(unitPriceFor(BASE, "dark"), 650);
});

test("missing or unknown roast is priced as the base (medium) price", () => {
  assert.equal(unitPriceFor(BASE, undefined), 650);
  assert.equal(unitPriceFor(BASE, ""), 650);
  assert.equal(unitPriceFor(BASE, "extra-dark"), 650);
  assert.equal(isRoast("extra-dark"), false);
  for (const r of ROASTS) assert.equal(isRoast(r), true);
});

test("café price per roast", () => {
  assert.equal(cafePriceFor(BASE, "light"), 590);
  assert.equal(cafePriceFor(BASE, "medium"), 550);
  assert.equal(cafePriceFor(BASE, "dark"), 550);
});

test("code CAFE becomes a flat 100 THB/kg whatever percent is stored in D1", () => {
  const code = cafeCodeAsPerKg(CAFE_ROW);
  assert.equal(code.type, "per_kg");
  assert.equal(code.value, 100);
  assert.equal(code.active, 1); // the rest of the row (limits, expiry) is untouched
  // other codes are returned as they are
  const other = { code: "WELCOME", type: "percent", value: 10 };
  assert.equal(cafeCodeAsPerKg(other), other);
  assert.equal(cafeCodeAsPerKg(null), null);
});

test("CAFE gives exactly 590 / 550 / 550 per kg for every orderable quantity", () => {
  const code = cafeCodeAsPerKg(CAFE_ROW);
  for (const roast of ROASTS) {
    const expected = cafePriceFor(BASE, roast);
    for (let half = 1; half <= 200; half++) { // sold in 0.5 kg steps up to 100 kg
      const kg = half / 2;
      const q = quote({ kg, unitPrice: unitPriceFor(BASE, roast), code });
      assert.equal(q.subtotal - q.discount, expected * kg, `${roast} kg=${kg}`);
    }
  }
});

test("retail customers get no discount and pay the roast price", () => {
  for (const [roast, price] of [["light", 690], ["medium", 650], ["dark", 650]]) {
    const q = quote({ kg: 2, unitPrice: unitPriceFor(BASE, roast) });
    assert.equal(q.subtotal, price * 2);
    assert.equal(q.discount, 0);
  }
});

test("per_kg discount never exceeds the subtotal and respects min_kg", () => {
  assert.equal(quote({ kg: 1, unitPrice: 50, code: { type: "per_kg", value: 100, min_kg: 0 } }).discount, 50);
  assert.equal(quote({ kg: 1, unitPrice: 650, code: { type: "per_kg", value: 100, min_kg: 5 } }).discount, 0);
});
