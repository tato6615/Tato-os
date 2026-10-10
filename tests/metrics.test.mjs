// Tests for public/system/metrics.js (revenue, profit, customer status).
// Run:  node --test tests/metrics.test.mjs
// Numbers come from the shop's real orders on 10 Oct 2026. Cost = 390 THB/kg.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// metrics.js is a plain browser script, so load it in a sandbox with a fake `window`.
const sandbox = { window: {} };
vm.runInNewContext(
  fs.readFileSync(new URL("../public/system/metrics.js", import.meta.url), "utf8"),
  sandbox
);
const { summarize } = sandbox.window.TatoMetrics;

const PRODUCTS = [{ id: "p1", cost_price: 390 }];

const CUSTOMERS = [
  { id: "c1", name: "Baan Luang Cafe" },
  { id: "c2", name: "Customer B" },
  { id: "c3", name: "Tester" },
];

function order(extra) {
  return {
    product_id: "p1",
    status: "paid",
    is_test: 0,
    discount_amount: 0,
    discount_code: null,
    ...extra,
  };
}

const ORDERS = [
  order({ id: "o1", customer_id: "c1", subtotal: 6400, shipping_fee: 260, amount: 6660, total_kg: 10, created_at: "2026-10-09" }),
  order({ id: "o2", customer_id: "c2", subtotal: 1200, shipping_fee: 97, amount: 1297, total_kg: 2, created_at: "2026-10-10" }),
  order({ id: "o3", customer_id: "c3", subtotal: 650, shipping_fee: 67, amount: 717, total_kg: 1, is_test: 1 }), // test order: must be ignored
];

test("revenue excludes shipping and test orders", () => {
  const { totals } = summarize(ORDERS, CUSTOMERS, PRODUCTS, []);
  assert.equal(totals.revenue, 7600); // 6400 + 1200, not 7957
  assert.equal(totals.shipping, 357); // 260 + 97, shown separately
  assert.equal(totals.kg, 12);
  assert.equal(totals.paidOrders, 2);
});

test("gross profit = revenue - cost x kg", () => {
  const { totals } = summarize(ORDERS, CUSTOMERS, PRODUCTS, []);
  assert.equal(totals.cogs, 4680); // 12 kg x 390
  assert.equal(totals.grossProfit, 2920); // 7600 - 4680
  assert.equal(Math.round(totals.marginPct * 10) / 10, 38.4);
});

test("net profit subtracts ad spend", () => {
  const { totals } = summarize(ORDERS, CUSTOMERS, PRODUCTS, [{ amount: 500 }]);
  assert.equal(totals.adSpend, 500);
  assert.equal(totals.netProfit, 2420);
});

test("cafe price 550/kg: discount is taken off revenue", () => {
  const cafe = order({
    id: "o4", customer_id: "c1", subtotal: 650, discount_amount: 100,
    discount_code: "CAFE", shipping_fee: 67, amount: 617, total_kg: 1,
  });
  const { totals, customers } = summarize([cafe], CUSTOMERS, PRODUCTS, []);
  assert.equal(totals.revenue, 550);
  assert.equal(totals.grossProfit, 160); // 550 - 390
  assert.equal(customers.find((c) => c.id === "c1").cafePrice, true);
});

test("customer status is automatic: lead / new / regular", () => {
  const repeat = order({ id: "o5", customer_id: "c2", subtotal: 650, shipping_fee: 67, amount: 717, total_kg: 1, created_at: "2026-10-11" });
  const { customers } = summarize([...ORDERS, repeat], CUSTOMERS, PRODUCTS, []);
  const status = (id) => customers.find((c) => c.id === id).status;
  assert.equal(status("c1"), "new"); // 1 paid order
  assert.equal(status("c2"), "regular"); // 2 paid orders
  assert.equal(status("c3"), "lead"); // only a test order
});

test("manual tier set by the founder overrides the automatic status", () => {
  const withTier = [{ id: "c1", name: "Baan Luang Cafe", tier: "regular" }];
  const { customers } = summarize(ORDERS, withTier, PRODUCTS, []);
  assert.equal(customers[0].status, "regular");
  assert.equal(customers[0].auto, "new"); // automatic value is still reported
});

test("repeat-customer rate counts only real paid orders", () => {
  const { totals } = summarize(ORDERS, CUSTOMERS, PRODUCTS, []);
  assert.equal(totals.buyers, 2);
  assert.equal(totals.repeat, 0);
  assert.equal(totals.repeatPct, 0);
});

test("missing cost price is flagged, not treated as zero cost", () => {
  const { totals } = summarize(ORDERS, CUSTOMERS, [{ id: "p1", cost_price: null }], []);
  assert.equal(totals.ordersMissingCost, 2);
  assert.equal(totals.grossProfit, 0);
  assert.equal(totals.marginPct, null);
});

test("works with no data", () => {
  const { totals, customers } = summarize([], [], [], []);
  assert.equal(totals.revenue, 0);
  assert.equal(totals.repeatPct, 0);
  assert.deepEqual(customers, []);
});
