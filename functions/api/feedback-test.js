// TATO-OS
// Feedback Test Console V1.0
// Route: /api/feedback-test
//
// Purpose:
// - Test Feedback POST from inside TATO-OS
// - No Postman / curl / manual JSON required
// - Does NOT modify upstream layers
// - Uses the real /api/feedback endpoint

const VERSION = "1.0";
const LAYER = "FEEDBACK_TEST_CONSOLE_V1";

const CONTENT_ID = "5127d38f-6601-41dd-bb30-9e4346dd9a4c";
const FEEDBACK_API = "/api/feedback";

function html() {
  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TATO-OS Feedback Test</title>

<style>
  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background: #111;
    color: #f5f5f5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 20px;
  }

  .wrap {
    max-width: 900px;
    margin: 0 auto;
  }

  h1 {
    margin: 0 0 6px;
    font-size: 26px;
  }

  .sub {
    color: #999;
    margin-bottom: 24px;
  }

  .card {
    background: #1b1b1b;
    border: 1px solid #333;
    border-radius: 14px;
    padding: 18px;
    margin-bottom: 16px;
  }

  .label {
    color: #999;
    font-size: 13px;
    margin-bottom: 6px;
  }

  .value {
    font-size: 15px;
    word-break: break-all;
  }

  button {
    width: 100%;
    border: 0;
    border-radius: 10px;
    padding: 15px;
    margin-top: 10px;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    background: #f28c28;
    color: #111;
  }

  button.secondary {
    background: #333;
    color: #fff;
  }

  button:disabled {
    opacity: .5;
    cursor: not-allowed;
  }

  pre {
    background: #0a0a0a;
    border: 1px solid #292929;
    border-radius: 10px;
    padding: 14px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 12px;
    line-height: 1.5;
  }

  .status {
    padding: 12px;
    border-radius: 10px;
    background: #222;
    margin-top: 12px;
    font-weight: 700;
  }

  .step {
    display: flex;
    gap: 10px;
    align-items: center;
    margin: 8px 0;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #555;
    flex: 0 0 auto;
  }

  .done {
    background: #62c174;
  }

  .error {
    background: #d9534f;
  }
</style>
</head>

<body>

<div class="wrap">

  <h1>TATO-OS</h1>
  <div class="sub">
    Feedback Test Console V1.0
  </div>

  <div class="card">
    <div class="label">Content ID</div>
    <div class="value">${CONTENT_ID}</div>

    <div class="label" style="margin-top:14px">
      Feedback Endpoint
    </div>
    <div class="value">${FEEDBACK_API}</div>
  </div>

  <div class="card">

    <div class="step">
      <span id="dot1" class="dot"></span>
      <span>1. Load Feedback Preview</span>
    </div>

    <div class="step">
      <span id="dot2" class="dot"></span>
      <span>2. Record Test Feedback</span>
    </div>

    <div class="step">
      <span id="dot3" class="dot"></span>
      <span>3. Verify Result</span>
    </div>

    <button
      id="previewBtn"
      onclick="loadPreview()">
      ① LOAD FEEDBACK
    </button>

    <button
      id="recordBtn"
      class="secondary"
      onclick="recordFeedback()">
      ② RECORD TEST FEEDBACK
    </button>

    <button
      id="verifyBtn"
      class="secondary"
      onclick="verifyFeedback()">
      ③ VERIFY
    </button>

    <div id="status" class="status">
      Ready
    </div>

  </div>

  <div class="card">
    <div class="label">Result</div>
    <pre id="result">ยังไม่มีผลทดสอบ</pre>
  </div>

</div>

<script>

const CONTENT_ID =
  "${CONTENT_ID}";

const API =
  "${FEEDBACK_API}";

let lastRecordResult = null;

function setStatus(message) {
  document.getElementById("status").textContent = message;
}

function setDot(id, state) {
  const el = document.getElementById(id);

  el.className = "dot";

  if (state === "done") {
    el.classList.add("done");
  }

  if (state === "error") {
    el.classList.add("error");
  }
}

function showResult(data) {
  document.getElementById("result").textContent =
    JSON.stringify(data, null, 2);
}

async function loadPreview() {

  setStatus("กำลังโหลด Feedback Preview...");
  setDot("dot1", "");

  try {

    const response = await fetch(
      API +
      "?content_id=" +
      encodeURIComponent(CONTENT_ID),
      {
        method: "GET",
        cache: "no-store"
      }
    );

    const data = await response.json();

    showResult(data);

    if (data.success) {

      setDot("dot1", "done");

      setStatus(
        "PASS — Feedback Preview ทำงาน"
      );

    } else {

      setDot("dot1", "error");

      setStatus(
        "FAIL — Feedback Preview"
      );
    }

  } catch (error) {

    setDot("dot1", "error");

    setStatus(
      "ERROR — " + error.message
    );

    showResult({
      success: false,
      error: error.message
    });
  }
}

async function recordFeedback() {

  setStatus("กำลังส่ง POST Record Feedback...");
  setDot("dot2", "");

  const payload = {
    mode: "record",
    actual_outcome: "SYSTEM_TEST",
    outcome_status: "TEST",
    operator_note: "TATO-OS Feedback Test Console V1.0 — integration test only"
  };

  try {

    const response = await fetch(
      API +
      "?content_id=" +
      encodeURIComponent(CONTENT_ID),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();

    lastRecordResult = data;

    showResult(data);

    if (
      data.success &&
      data.saved === true
    ) {

      setDot("dot2", "done");

      setStatus(
        "PASS — Feedback ถูกบันทึกจริง"
      );

    } else {

      setDot("dot2", "error");

      setStatus(
        "ตรวจพบว่า POST ทำงาน แต่ต้องตรวจผลลัพธ์"
      );
    }

  } catch (error) {

    setDot("dot2", "error");

    setStatus(
      "ERROR — " + error.message
    );

    showResult({
      success: false,
      error: error.message
    });
  }
}

async function verifyFeedback() {

  setStatus("กำลัง Verify Feedback...");
  setDot("dot3", "");

  try {

    const response = await fetch(
      API +
      "?content_id=" +
      encodeURIComponent(CONTENT_ID),
      {
        method: "GET",
        cache: "no-store"
      }
    );

    const data = await response.json();

    showResult(data);

    const feedback =
      data.feedback || {};

    const actual =
      feedback.actual || {};

    const measurement =
      feedback.measurement || {};

    const recorded =
      data.guardrails &&
      data.guardrails.feedback_recorded === true;

    if (
      recorded ||
      actual.outcome === "SYSTEM_TEST" ||
      actual.status === "TEST" ||
      measurement.completed === true
    ) {

      setDot("dot3", "done");

      setStatus(
        "VERIFY PASS — ระบบเห็น Feedback"
      );

    } else {

      setDot("dot3", "error");

      setStatus(
        "VERIFY — ต้องตรวจ persistence ของ Feedback"
      );
    }

  } catch (error) {

    setDot("dot3", "error");

    setStatus(
      "ERROR — " + error.message
    );

    showResult({
      success: false,
      error: error.message
    });
  }
}

</script>

</body>
</html>`;
}

export async function onRequest(context) {
  const request = context.request;

  if (request.method !== "GET") {
    return new Response(
      JSON.stringify({
        success: false,
        error: "FEEDBACK_TEST_CONSOLE_ONLY_SUPPORTS_GET"
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  return new Response(html(), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}
