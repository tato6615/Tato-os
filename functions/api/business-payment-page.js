// TATO-OS
// Business Payment Desk V1.0
// Route: /api/business-payment-page

const LAYER = "BUSINESS_PAYMENT_DESK_V1.0";

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

async function getPendingOrders(db) {
  if (!(await tableExists(db, "orders"))) return [];

  const info = await db.prepare("PRAGMA table_info(orders)").all();
  const names = (info.results || []).map(c => c.name);

  const select = [
    "o.id",
    names.includes("customer_id") ? "o.customer_id" : "NULL AS customer_id",
    names.includes("product_id") ? "o.product_id" : "NULL AS product_id",
    names.includes("quantity") ? "o.quantity" : (names.includes("qty") ? "o.qty AS quantity" : "1 AS quantity"),
    names.includes("total_amount") ? "o.total_amount" : (names.includes("amount") ? "o.amount AS total_amount" : "0 AS total_amount"),
    names.includes("status") ? "o.status" : "'pending' AS status",
    names.includes("created_at") ? "o.created_at" : "NULL AS created_at"
  ].join(",");

  const result = await db.prepare(
    "SELECT " + select +
    " FROM orders o WHERE " +
    (names.includes("status") ? "LOWER(COALESCE(o.status,'pending')) <> 'paid'" : "1=1") +
    " ORDER BY " +
    (names.includes("created_at") ? "o.created_at DESC" : "o.id DESC") +
    " LIMIT 50"
  ).all();

  return result.results || [];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPage(orders) {
  const cards = orders.length
    ? orders.map((order, index) => {
        const amount = Number(order.total_amount || 0);
        return `
          <div class="order">
            <div class="order-id">Order: ${escapeHtml(order.id)}</div>
            <div class="amount">${amount.toLocaleString("th-TH")} บาท</div>
            <div class="status">สถานะ: ${escapeHtml(order.status || "pending")}</div>

            <label>เลขอ้างอิงการโอน</label>
            <input id="ref-${index}" placeholder="เลขรายการจากธนาคาร">

            <label>จำนวนเงินที่ได้รับจริง</label>
            <input id="amount-${index}" type="number" step="0.01" value="${amount}" inputmode="decimal">

            <button id="btn-${index}" onclick="confirmPayment(${index})">
              ยืนยันว่าได้รับเงินจริง
            </button>

            <div id="result-${index}" class="result" style="display:none"></div>

            <div class="warning">
              กดปุ่มนี้เฉพาะเมื่อเงินเข้าจริงและตรวจสอบเลขอ้างอิงแล้ว
            </div>
          </div>
        `;
      }).join("")
    : '<div class="empty">ยังไม่มีออเดอร์ที่รอชำระ</div>';

  const ordersJson = JSON.stringify(orders).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TATO Payment Desk</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#111;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.wrap{max-width:720px;margin:auto;padding:20px}
.brand{color:#f28c28;font-size:13px;font-weight:800;letter-spacing:3px}
h1{font-size:28px;margin:8px 0}
.sub{color:#aaa;line-height:1.6}
.card{background:#1b1b1b;border:1px solid #303030;border-radius:18px;padding:18px;margin-top:16px}
.order{background:#121212;border:1px solid #333;border-radius:14px;padding:16px;margin-top:12px}
.order-id{font-size:12px;color:#888;word-break:break-all}
.amount{font-size:25px;font-weight:800;margin:8px 0}
.status{font-size:13px;color:#f28c28}
label{display:block;color:#aaa;font-size:13px;margin:14px 0 6px}
input{width:100%;padding:13px;border-radius:10px;border:1px solid #444;background:#181818;color:#fff;font-size:16px}
button{width:100%;border:0;border-radius:11px;padding:14px;margin-top:14px;background:#f28c28;color:#111;font-weight:800;font-size:16px}
button:disabled{opacity:.5}
.result{margin-top:12px;padding:12px;border-radius:10px;background:#151515;color:#bbb;line-height:1.5;white-space:pre-wrap}
.warning{font-size:12px;color:#999;line-height:1.5;margin-top:12px}
.empty{color:#aaa;text-align:center;padding:24px}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">TATO COFFEE</div>
  <h1>Payment Desk</h1>
  <div class="sub">ตรวจออเดอร์และบันทึกเฉพาะเงินที่ได้รับจริง</div>

  <div class="card">
    <strong>ออเดอร์รอชำระ</strong>
    <div id="orders">${cards}</div>
  </div>
</div>

<script>
const ORDERS = ${ordersJson};

async function confirmPayment(index) {
  const order = ORDERS[index];
  const ref = document.getElementById("ref-" + index).value.trim();
  const amount = Number(document.getElementById("amount-" + index).value);
  const button = document.getElementById("btn-" + index);
  const result = document.getElementById("result-" + index);

  result.style.display = "block";

  if (!ref) {
    result.textContent = "กรุณาใส่เลขอ้างอิงการชำระเงินจริง";
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    result.textContent = "จำนวนเงินไม่ถูกต้อง";
    return;
  }

  if (Math.abs(amount - Number(order.total_amount || 0)) > 0.000001) {
    result.textContent = "จำนวนเงินไม่ตรงกับยอดออเดอร์";
    return;
  }

  button.disabled = true;
  result.textContent = "กำลังตรวจสอบและบันทึก...";

  try {
    const response = await fetch("/api/business-money", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        operation: "confirm_payment",
        order_id: order.id,
        external_payment_id: ref,
        amount: amount,
        currency: "THB"
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || data.status || "PAYMENT_FAILED");
    }

    result.textContent =
      "บันทึกสำเร็จ\\n" +
      "Payment: " + (data.payment?.id || "-") + "\\n" +
      "Revenue: " + (data.revenue?.amount || 0) + " บาท\\n" +
      "Profit: " + (data.profit?.gross_profit || 0) + " บาท";

    setTimeout(function () {
      window.location.reload();
    }, 1200);
  } catch (error) {
    button.disabled = false;
    result.textContent = "ยังบันทึกไม่ได้: " + (error.message || String(error));
  }
}
</script>
</body>
</html>`;
}

export async function onRequestGet(context) {
  try {
    const db = context.env?.DB;
    if (!db) {
      return json({
        success: false,
        layer: LAYER,
        version: "1.0",
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
      version: "1.0",
      status: "ERROR",
      error: error?.message || String(error)
    }, 500);
  }
}
