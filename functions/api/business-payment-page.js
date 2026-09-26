// TATO-OS
// Business Payment Desk V1.1
// Route: /api/business-payment-page
//
// Purpose:
// - Show real pending orders
// - Let the operator confirm only real received payments
// - Send payment confirmation to BUSINESS_MONEY
// - Never invent payment, revenue, or profit

const LAYER = "BUSINESS_PAYMENT_DESK_V1.1";
const VERSION = "1.1";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}

async function tableExists(db, table) {
  const row = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).bind(table).first();

  return !!row;
}

async function getTableColumns(db, table) {
  const result = await db.prepare("PRAGMA table_info(" + table + ")").all();
  return (result.results || []).map(function (column) {
    return column.name;
  });
}

async function getPendingOrders(db) {
  if (!(await tableExists(db, "orders"))) {
    return [];
  }

  const columns = await getTableColumns(db, "orders");

  const selectParts = [
    "o.id",
    columns.includes("customer_id") ? "o.customer_id" : "NULL AS customer_id",
    columns.includes("product_id") ? "o.product_id" : "NULL AS product_id",
    columns.includes("quantity")
      ? "o.quantity"
      : columns.includes("qty")
        ? "o.qty AS quantity"
        : "1 AS quantity",
    columns.includes("total_amount")
      ? "o.total_amount"
      : columns.includes("amount")
        ? "o.amount AS total_amount"
        : "0 AS total_amount",
    columns.includes("status")
      ? "o.status"
      : "'pending' AS status",
    columns.includes("created_at")
      ? "o.created_at"
      : "NULL AS created_at"
  ];

  const where = columns.includes("status")
    ? "LOWER(COALESCE(o.status,'pending')) <> 'paid'"
    : "1=1";

  const orderBy = columns.includes("created_at")
    ? "o.created_at DESC"
    : "o.id DESC";

  const sql =
    "SELECT " +
    selectParts.join(", ") +
    " FROM orders o WHERE " +
    where +
    " ORDER BY " +
    orderBy +
    " LIMIT 50";

  const result = await db.prepare(sql).all();

  return result.results || [];
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildOrderCard(order, index) {
  const amount = Number(order.total_amount || 0);

  let html = "";

  html += '<div class="order">';
  html += '<div class="order-id">Order: ' + escapeHtml(order.id) + "</div>";
  html += '<div class="amount">' + amount.toLocaleString("th-TH") + " บาท</div>";
  html += '<div class="status">สถานะ: ' + escapeHtml(order.status || "pending") + "</div>";

  html += '<label for="ref-' + index + '">เลขอ้างอิงการโอน</label>';
  html += '<input id="ref-' + index + '" placeholder="เลขรายการจากธนาคาร" autocomplete="off">';

  html += '<label for="amount-' + index + '">จำนวนเงินที่ได้รับจริง</label>';
  html += '<input id="amount-' + index + '" type="number" step="0.01" value="' +
    escapeHtml(amount) +
    '" inputmode="decimal">';

  html += '<button id="btn-' + index + '" type="button" onclick="confirmPayment(' +
    index +
    ')">ยืนยันว่าได้รับเงินจริง</button>';

  html += '<div id="result-' + index + '" class="result" hidden></div>';

  html += '<div class="warning">กดปุ่มนี้เฉพาะเมื่อเงินเข้าจริงและตรวจสอบเลขอ้างอิงแล้ว</div>';
  html += "</div>";

  return html;
}

function renderPage(orders) {
  const cards = orders.length
    ? orders.map(buildOrderCard).join("")
    : '<div class="empty">ยังไม่มีออเดอร์ที่รอชำระ</div>';

  const ordersJson = JSON.stringify(orders).replace(/</g, "\\u003c");

  let html = "";

  html += "<!DOCTYPE html>";
  html += '<html lang="th">';
  html += "<head>";
  html += '<meta charset="UTF-8">';
  html += '<meta name="viewport" content="width=device-width,initial-scale=1">';
  html += "<title>TATO Payment Desk</title>";

  html += "<style>";
  html += "*{box-sizing:border-box}";
  html += 'body{margin:0;background:#111;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}';
  html += ".wrap{max-width:720px;margin:auto;padding:20px}";
  html += ".brand{color:#f28c28;font-size:13px;font-weight:800;letter-spacing:3px}";
  html += "h1{font-size:28px;margin:8px 0}";
  html += ".sub{color:#aaa;line-height:1.6}";
  html += ".card{background:#1b1b1b;border:1px solid #303030;border-radius:18px;padding:18px;margin-top:16px}";
  html += ".order{background:#121212;border:1px solid #333;border-radius:14px;padding:16px;margin-top:12px}";
  html += ".order-id{font-size:12px;color:#888;word-break:break-all}";
  html += ".amount{font-size:25px;font-weight:800;margin:8px 0}";
  html += ".status{font-size:13px;color:#f28c28}";
  html += "label{display:block;color:#aaa;font-size:13px;margin:14px 0 6px}";
  html += 'input{width:100%;padding:13px;border-radius:10px;border:1px solid #444;background:#181818;color:#fff;font-size:16px}';
  html += 'button{width:100%;border:0;border-radius:11px;padding:14px;margin-top:14px;background:#f28c28;color:#111;font-weight:800;font-size:16px}';
  html += "button:disabled{opacity:.5}";
  html += ".result{margin-top:12px;padding:12px;border-radius:10px;background:#151515;color:#bbb;line-height:1.5;white-space:pre-wrap}";
  html += ".warning{font-size:12px;color:#999;line-height:1.5;margin-top:12px}";
  html += ".empty{color:#aaa;text-align:center;padding:24px}";
  html += ".ok{color:#9fe3ad}";
  html += ".error{color:#ff9a9a}";
  html += "</style>";
  html += "</head>";

  html += "<body>";
  html += '<div class="wrap">';
  html += '<div class="brand">TATO COFFEE</div>';
  html += "<h1>Payment Desk</h1>";
  html += '<div class="sub">ตรวจออเดอร์และบันทึกเฉพาะเงินที่ได้รับจริง</div>';

  html += '<div class="card">';
  html += "<strong>ออเดอร์รอชำระ</strong>";
  html += '<div id="orders">' + cards + "</div>";
  html += "</div>";

  html += "</div>";

  html += "<script>";
  html += "const ORDERS = " + ordersJson + ";";

  html += "async function confirmPayment(index) {";
  html += "  const order = ORDERS[index];";
  html += '  const refInput = document.getElementById("ref-" + index);';
  html += '  const amountInput = document.getElementById("amount-" + index);';
  html += '  const button = document.getElementById("btn-" + index);';
  html += '  const result = document.getElementById("result-" + index);';
  html += "  const ref = refInput.value.trim();";
  html += "  const amount = Number(amountInput.value);";
  html += "  result.hidden = false;";

  html += '  if (!ref) { result.className = "result error"; result.textContent = "กรุณาใส่เลขอ้างอิงการชำระเงินจริง"; return; }';
  html += '  if (!Number.isFinite(amount) || amount <= 0) { result.className = "result error"; result.textContent = "จำนวนเงินไม่ถูกต้อง"; return; }';
  html += '  if (Math.abs(amount - Number(order.total_amount || 0)) > 0.000001) { result.className = "result error"; result.textContent = "จำนวนเงินไม่ตรงกับยอดออเดอร์"; return; }';

  html += "  button.disabled = true;";
  html += '  result.className = "result";';
  html += '  result.textContent = "กำลังตรวจสอบและบันทึก...";';

  html += "  try {";
  html += '    const response = await fetch(window.location.origin + "/api/business-money", {';
  html += '      method: "POST",';
  html += '      headers: {"Content-Type":"application/json"},';
  html += "      body: JSON.stringify({";
  html += '        operation: "confirm_payment",';
  html += "        order_id: order.id,";
  html += "        external_payment_id: ref,";
  html += "        amount: amount,";
  html += '        currency: "THB"';
  html += "      })";
  html += "    });";

  html += "    const data = await response.json();";

  html += '    if (!response.ok || !data.success) throw new Error(data.error || data.status || "PAYMENT_FAILED");';

  html += '    result.className = "result ok";';
  html += '    result.textContent = "บันทึกสำเร็จ\\nPayment: " + (data.payment?.id || "-") + "\\nRevenue: " + (data.revenue?.amount || 0) + " บาท\\nProfit: " + (data.profit?.gross_profit || 0) + " บาท";';

  html += "    setTimeout(function(){ window.location.reload(); }, 1200);";
  html += "  } catch (error) {";
  html += "    button.disabled = false;";
  html += '    result.className = "result error";';
  html += '    result.textContent = "ยังบันทึกไม่ได้: " + (error && error.message ? error.message : String(error));';
  html += "  }";
  html += "}";
  html += "</script>";

  html += "</body>";
  html += "</html>";

  return html;
}

export async function onRequestGet(context) {
  try {
    const db = context.env && context.env.DB;

    if (!db) {
      return json({
        success: false,
        layer: LAYER,
        version: VERSION,
        status: "DB_BINDING_NOT_FOUND"
      }, 500);
    }

    const orders = await getPendingOrders(db);

    return new Response(renderPage(orders), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    return json({
      success: false,
      layer: LAYER,
      version: VERSION,
      status: "ERROR",
      error: error && error.message ? error.message : String(error)
    }, 500);
  }
}
