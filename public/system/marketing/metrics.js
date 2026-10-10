/* TATO HQ metrics: revenue (excl. shipping), gross/net profit, customer status.
   Classic script: sets window.TatoMetrics. Also unit-tested from tests/metrics.test.mjs. */
(function (root) {
  function num(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function isPaid(o) { return String(o.status || "").toLowerCase() === "paid"; }
  function isReal(o) { return !num(o.is_test); }
  function kgOf(o) { return num(o.total_kg != null ? o.total_kg : (o.quantity != null ? o.quantity : o.qty)); }
  // Product revenue after discount. Shipping is pass-through money, so it is NOT revenue.
  function productRevenue(o) {
    if (o.subtotal != null && o.subtotal !== "") return num(o.subtotal) - num(o.discount_amount);
    return num(o.amount != null ? o.amount : o.total_amount) - num(o.shipping_fee);
  }
  var TIERS = ["new", "regular", "cafe"];

  function summarize(orders, customers, products, adRows) {
    orders = orders || []; customers = customers || []; products = products || []; adRows = adRows || [];
    var cost = {};
    products.forEach(function (p) { if (p.cost_price != null && p.cost_price !== "") cost[p.id] = num(p.cost_price); });
    var paid = orders.filter(function (o) { return isReal(o) && isPaid(o); });
    var pending = orders.filter(function (o) { return isReal(o) && !isPaid(o) && ["cancelled", "canceled"].indexOf(String(o.status || "").toLowerCase()) < 0; });

    var t = { revenue: 0, shipping: 0, discount: 0, kg: 0, cogs: 0, grossProfit: 0, costedRevenue: 0, ordersMissingCost: 0, paidOrders: paid.length, pendingOrders: pending.length };
    var by = {};
    paid.forEach(function (o) {
      var rev = productRevenue(o), k = kgOf(o), c = cost[o.product_id];
      t.revenue += rev; t.shipping += num(o.shipping_fee); t.discount += num(o.discount_amount); t.kg += k;
      var profit = null;
      if (c == null) t.ordersMissingCost++;
      else { t.cogs += c * k; t.costedRevenue += rev; profit = rev - c * k; t.grossProfit += profit; }
      var id = o.customer_id || "";
      if (id) {
        var s = by[id] || (by[id] = { orders: 0, kg: 0, revenue: 0, profit: 0, cafe: false, last: "" });
        s.orders++; s.kg += k; s.revenue += rev; if (profit != null) s.profit += profit;
        if (String(o.discount_code || "").toUpperCase().indexOf("CAFE") === 0) s.cafe = true;
        if (String(o.created_at || "") > s.last) s.last = String(o.created_at || "");
      }
    });
    t.adSpend = adRows.reduce(function (s, r) { return s + num(r.amount); }, 0);
    t.netProfit = t.grossProfit - t.adSpend;
    t.marginPct = t.costedRevenue > 0 ? (t.grossProfit / t.costedRevenue) * 100 : null;

    var rows = customers.map(function (c) {
      var s = by[c.id] || { orders: 0, kg: 0, revenue: 0, profit: 0, cafe: false, last: "" };
      var auto = s.orders >= 2 ? "regular" : s.orders === 1 ? "new" : "lead";
      var manual = TIERS.indexOf(String(c.tier || "")) >= 0 ? c.tier : null;
      return { id: c.id, name: c.name || c.email || c.id, phone: c.phone || "", status: manual || auto, auto: auto, manual: manual,
        orders: s.orders, kg: s.kg, revenue: s.revenue, profit: s.profit, cafePrice: s.cafe || manual === "cafe", last: s.last };
    });
    var buyers = Object.keys(by).length;
    var repeat = Object.keys(by).filter(function (k) { return by[k].orders > 1; }).length;
    t.buyers = buyers; t.repeat = repeat;
    t.repeatPct = buyers ? (repeat / buyers) * 100 : 0;
    // "regular" by status also counts customers the founder marked regular/cafe by hand
    t.regularCount = rows.filter(function (r) { return r.status === "regular" || r.status === "cafe"; }).length;
    return { totals: t, customers: rows };
  }
  root.TatoMetrics = { summarize: summarize, productRevenue: productRevenue, TIERS: TIERS };
})(typeof window !== "undefined" ? window : globalThis);
