// Owner notifications (Telegram / LINE) + optional customer email via Resend.
// Customer email is OFF until RESEND_API_KEY and EMAIL_FROM are set in Pages > Variables.

export async function notifyOwner(env, msg) {
  const jobs = [];
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID)
    jobs.push(fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: msg }) }).catch(() => {}));
  if (env.LINE_CHANNEL_TOKEN && env.LINE_OWNER_USER_ID)
    jobs.push(fetch("https://api.line.me/v2/bot/message/push", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + env.LINE_CHANNEL_TOKEN }, body: JSON.stringify({ to: env.LINE_OWNER_USER_ID, messages: [{ type: "text", text: msg.slice(0, 4900) }] }) }).catch(() => {}));
  await Promise.all(jobs);
}

export function emailEnabled(env) {
  return !!(env.RESEND_API_KEY && env.EMAIL_FROM);
}

/** Returns true if handed to the provider. Never throws. */
export async function sendEmail(env, { to, subject, text }) {
  if (!emailEnabled(env) || !to) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + env.RESEND_API_KEY },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text }),
    });
    return r.ok;
  } catch (_) { return false; }
}
