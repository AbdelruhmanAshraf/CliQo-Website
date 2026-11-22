const secret = process.env.CLIQO_EMAIL_CRON_SECRET ?? "";
const endpoint = process.env.CLIQO_EMAIL_OUTBOX_URL ?? "http://127.0.0.1:3000/api/internal/email-outbox";

if (secret.length < 32) throw new Error("Email queue secret is missing or too short.");
const url = new URL(endpoint);
if (!(["127.0.0.1", "localhost", "::1"].includes(url.hostname)) || url.pathname !== "/api/internal/email-outbox") {
  throw new Error("Email queue runner must use the local application endpoint.");
}

const response = await fetch(url, {
  method: "POST",
  headers: {authorization: `Bearer ${secret}`, accept: "application/json"},
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Email queue returned HTTP ${response.status}.`);
const result = await response.json();
if (typeof result.sent !== "number" || typeof result.retried !== "number" || typeof result.failed !== "number"
    || (result.expiredPayments !== undefined && typeof result.expiredPayments !== "number")) {
  throw new Error("Email queue returned an invalid result.");
}
console.log(`Email queue: sent=${result.sent}, retried=${result.retried}, failed=${result.failed}, expiredPayments=${result.expiredPayments ?? 0}`);
