// Retail 650 THB/kg; cafés reach 550 THB/kg through discount code CAFE.
// CAFE is a percent code (the code table has no per-kg price): value 15.38462 = 100/650, nudged up so the
// floor() in calcDiscount never lands one baht short. Keep this value in sync with the CAFE row in D1.
import test from "node:test";
import assert from "node:assert/strict";
import { quote } from "../shared/shipping.js";

const RETAIL = 650;
const CAFE = { type: "percent", value: 15.38462, min_kg: 0 };

test("retail customers pay 650 THB/kg", () => {
  for (const kg of [0.5, 1, 2, 5]) {
    const q = quote({ kg, unitPrice: RETAIL });
    assert.equal(q.subtotal, RETAIL * kg);
    assert.equal(q.discount, 0);
  }
});

test("code CAFE brings every orderable quantity to exactly 550 THB/kg", () => {
  // The shop sells in 0.5 kg steps up to 100 kg.
  for (let half = 1; half <= 200; half++) {
    const kg = half / 2;
    const q = quote({ kg, unitPrice: RETAIL, code: CAFE });
    assert.equal(q.subtotal - q.discount, 550 * kg, `kg=${kg}`);
  }
});
