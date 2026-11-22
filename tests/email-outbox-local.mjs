import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {readFile} from "node:fs/promises";
import pg from "pg";

function parseEnv(contents) {
  return Object.fromEntries(contents.split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).trim().replace(/^['"]|['"]$/g, "")]; }));
}

const local = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const runtime = parseEnv(await readFile(new URL("../deploy/app.env", import.meta.url), "utf8"));
assert.ok(local.CLIQO_DATABASE_URL, "local database URL is required");
assert.ok(["127.0.0.1", "localhost"].includes(new URL(local.CLIQO_DATABASE_URL).hostname), "refusing a non-local database");
Object.assign(process.env, local, runtime);

const emailModule = await import("../lib/email.ts");
const accessModule = await import("../lib/order-access.ts");
const {emailTransportFingerprint} = emailModule.default ?? emailModule;
const {createOrderAccessToken} = accessModule.default ?? accessModule;
const fingerprint = emailTransportFingerprint();
assert.ok(fingerprint, "application email configuration must be valid");
assert.ok(process.env.CLIQO_EMAIL_CRON_SECRET?.length >= 32, "local email queue secret is required");

const db = new pg.Client({connectionString: local.CLIQO_DATABASE_URL, connectionTimeoutMillis: 10000});
await db.connect();
let originalReadiness;
let orderId = null;
let skuId = null;
let familyId = null;
let transactionOpen = false;

try {
  const previous = await db.query(
    "select transactional_email_ready,transactional_email_fingerprint from app_private.checkout_config where id=true",
  );
  originalReadiness = previous.rows[0];
  assert.ok(originalReadiness, "checkout config exists");

  await db.query("begin"); transactionOpen = true;
  await db.query(
    "update app_private.checkout_config set transactional_email_ready=true,transactional_email_fingerprint=$1 where id=true",
    [fingerprint],
  );
  const suffix = randomBytes(4).toString("hex");
  const family = await db.query(
    "insert into public.product_families(family_key,name_ar,name_en,state) values($1,'اختبار محلي','Local test','ready') returning id",
    ["local-email-" + suffix],
  );
  familyId = family.rows[0].id;
  const sku = await db.query(
    "insert into public.product_skus(product_family_id,sku_code,display_name,state,price_minor," +
    "price_approved,sample_approved,fulfillment_approved) values($1,$2,'Local email test item','ready',10000,true,true,true) returning id",
    [familyId, "LOCAL-" + suffix.toUpperCase()],
  );
  skuId = sku.rows[0].id;
  await db.query("select set_config('cliqo.email_locale','en',true)");
  const trackingHash = randomBytes(32).toString("hex");
  const phone = "+2010" + String(10000000 + (randomBytes(4).readUInt32BE(0) % 90000000));
  const order = await db.query(
    "insert into public.orders(customer_name_snapshot,phone_snapshot,email_snapshot,shipping_address," +
    "payment_method,payment_state,subtotal_minor,shipping_minor,total_minor,tracking_token_hash) " +
    "values('CliQo local queue check',$1,'cliqo-outbox-smoke@example.test','{}'::jsonb," +
    "'cod','cod_to_collect',10000,2500,12500,$2) returning id,order_reference",
    [phone, trackingHash],
  );
  orderId = order.rows[0].id;
  const reference = order.rows[0].order_reference;
  await db.query(
    "insert into public.order_lines(order_id,sku_id,sku_code_snapshot,product_name_snapshot,quantity," +
    "unit_price_minor,line_total_minor) values($1,$2,'LOCAL-TEST','CliQo test item',1,10000,10000)",
    [orderId, skuId],
  );
  await db.query("commit"); transactionOpen = false;

  const response = await fetch("http://127.0.0.1:3000/api/internal/email-outbox", {
    method: "POST",
    headers: {authorization: "Bearer " + process.env.CLIQO_EMAIL_CRON_SECRET, accept: "application/json"},
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, "Docker outbox endpoint responds successfully");
  const result = await response.json();
  assert.ok(result.sent >= 1, "Docker worker delivers a queued order email");
  const delivered = await db.query(
    "select status,sent_at,email_locale from app_private.email_outbox where order_id=$1 and event_type='order_received'",
    [orderId],
  );
  assert.equal(delivered.rows[0]?.status, "sent", "outbox row reaches sent state");
  assert.ok(delivered.rows[0]?.sent_at, "delivery timestamp is saved");
  assert.equal(delivered.rows[0]?.email_locale, "en", "checkout locale is preserved in delivery");

  const token = createOrderAccessToken(reference, trackingHash);
  const tokenExpiry = Number(token.split(".")[1]);
  const now = Math.floor(Date.now() / 1000);
  assert.ok(tokenExpiry > now && tokenExpiry <= now + 30 * 24 * 60 * 60, "order access token expires within 30 days");
  const access = await fetch(
    "http://127.0.0.1:3000/orders/" + reference + "/access?token=" + encodeURIComponent(token),
    {redirect: "manual", signal: AbortSignal.timeout(15000)},
  );
  assert.equal(access.status, 302, "signed email link is accepted and redirected to a clean URL");
  assert.match(access.headers.get("set-cookie") ?? "", new RegExp("cliqo_order_" + reference));
  const statusPage = await fetch("http://127.0.0.1:3000/orders/" + reference, {
    headers: {cookie: "cliqo_order_" + reference + "=" + token},
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(statusPage.status, 200, "signed email link opens the private order status page");
  assert.ok((await statusPage.text()).includes(reference), "authorized order page shows the order reference");

  const mailbox = await fetch("http://127.0.0.1:54334/api/v1/messages");
  assert.equal(mailbox.status, 200, "local mail capture is available");
  const mailRows = await mailbox.json();
  const messages = Array.isArray(mailRows) ? mailRows : (Array.isArray(mailRows?.messages) ? mailRows.messages : []);
  const matches = messages.filter((message) =>
    JSON.stringify(message).includes("cliqo-outbox-smoke@example.test") &&
    String(message.Subject ?? "").includes(reference),
  );
  assert.ok(matches.length >= 1, "Mailpit captured the order confirmation");
  console.log("Local order email flow passed: database queue → Docker SMTP delivery → secure order link → private status page.");
} finally {
  if (transactionOpen) await db.query("rollback").catch(() => undefined);
  if (orderId) {
    await db.query("begin").catch(() => undefined);
    await db.query("delete from public.order_line_status_events where order_line_id in (select id from public.order_lines where order_id=$1)", [orderId]).catch(() => undefined);
    await db.query("delete from public.order_status_events where order_id=$1", [orderId]).catch(() => undefined);
    await db.query("delete from public.order_lines where order_id=$1", [orderId]).catch(() => undefined);
    await db.query("delete from public.orders where id=$1", [orderId]).catch(() => undefined);
    if (skuId) await db.query("delete from public.product_skus where id=$1", [skuId]).catch(() => undefined);
    if (familyId) await db.query("delete from public.product_families where id=$1", [familyId]).catch(() => undefined);
    if (originalReadiness) {
      await db.query(
        "update app_private.checkout_config set transactional_email_ready=$1,transactional_email_fingerprint=$2 where id=true",
        [originalReadiness.transactional_email_ready, originalReadiness.transactional_email_fingerprint],
      ).catch(() => undefined);
    }
    await db.query("commit").catch(() => db.query("rollback").catch(() => undefined));
  } else if (originalReadiness) {
    await db.query(
      "update app_private.checkout_config set transactional_email_ready=$1,transactional_email_fingerprint=$2 where id=true",
      [originalReadiness.transactional_email_ready, originalReadiness.transactional_email_fingerprint],
    ).catch(() => undefined);
    if (skuId) await db.query("delete from public.product_skus where id=$1", [skuId]).catch(() => undefined);
    if (familyId) await db.query("delete from public.product_families where id=$1", [familyId]).catch(() => undefined);
  }
  await db.end();
}
