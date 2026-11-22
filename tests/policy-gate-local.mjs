// Local-only policy release-gate proof. Every mutation runs inside a rolled-back transaction.
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {readFile} from "node:fs/promises";
import pg from "pg";

const env = Object.fromEntries((await readFile(new URL("../.env.local", import.meta.url), "utf8"))
  .split("\n")
  .filter((line) => /^[A-Z_]+=/.test(line))
  .map((line) => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).trim().replace(/^['"]|['"]$/g, "")]; }));
assert.ok(env.CLIQO_DATABASE_URL, "CLIQO_DATABASE_URL is required for local verification");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(env.CLIQO_DATABASE_URL).hostname), "This check only runs against a local database");

const db = new pg.Client({connectionString: env.CLIQO_DATABASE_URL, connectionTimeoutMillis: 10000});
await db.connect();
let transactionOpen = false;
async function snapshot() {
  return (await db.query(
    `select c.policies_approved,c.sales_enabled,c.support_channel_ready,c.support_email,c.support_whatsapp,
       c.transactional_email_ready,c.transactional_email_fingerprint,
       (select count(*)::int from app_private.store_policies where published_body is not null) as published_count,
       (select md5(coalesce(string_agg(policy_key || '|' || locale || '|' || draft_body || '|' ||
           coalesce(published_body,'') || '|' || coalesce(published_at::text,''), E'\\n' order by policy_key,locale),''))
        from app_private.store_policies) as policy_hash,
       (select count(*)::int from app_private.email_outbox) as email_outbox_count,
       (select count(*)::int from app_private.email_delivery_audit) as email_audit_count
     from app_private.checkout_config c where c.id=true`,
  )).rows[0];
}

try {
  const before = await snapshot();
  assert.ok(before, "checkout readiness row exists");
  assert.equal((await db.query("select count(*)::int as count from app_private.store_policies")).rows[0].count, 8);

  await db.query("begin"); transactionOpen = true;
  await db.query("update app_private.store_policies set published_body=null,published_by=null,published_at=null where policy_key='privacy' and locale='ar'");
  let rejected = false;
  try { await db.query("update app_private.checkout_config set policies_approved=true where id=true"); }
  catch (error) { rejected = error.code === "23514"; }
  assert.ok(rejected, "manual policy approval is rejected while a required language copy is missing");
  await db.query("rollback"); transactionOpen = false;

  await db.query("begin"); transactionOpen = true;
  const body = "Local policy gate verification content only. ".repeat(9);
  await db.query(
    "update app_private.store_policies set draft_body=$1,published_body=$1,published_by=null,published_at=now()",
    [body],
  );
  assert.equal((await snapshot()).policies_approved, true, "all eight publishable language copies derive an approved gate");
  await db.query("update app_private.store_policies set published_body=null,published_by=null,published_at=null where policy_key='privacy' and locale='ar'");
  const closed = await snapshot();
  assert.equal(closed.policies_approved, false, "withdrawing a required policy closes its approval gate");
  assert.equal(closed.sales_enabled, false, "withdrawing a required policy automatically closes sales");
  await db.query("rollback"); transactionOpen = false;

  await db.query("begin"); transactionOpen = true;
  await db.query("update app_private.checkout_config set sales_enabled=false,support_email=null,support_whatsapp=null,support_channel_ready=false where id=true");
  await db.query("savepoint support_gate");
  let supportWithoutContactRejected = false;
  try { await db.query("update app_private.checkout_config set support_channel_ready=true where id=true"); }
  catch (error) { supportWithoutContactRejected = error.code === "23514"; await db.query("rollback to savepoint support_gate"); }
  assert.ok(supportWithoutContactRejected, "support cannot be approved without a published contact");
  await db.query("update app_private.checkout_config set support_email='help@example.com',support_channel_ready=true where id=true");
  assert.equal((await snapshot()).support_channel_ready, false, "adding a contact clears stale verification");
  await db.query("update app_private.checkout_config set support_channel_ready=true where id=true");
  assert.equal((await snapshot()).support_channel_ready, true, "an owner can attest the configured channel after testing it");
  await db.query("update app_private.checkout_config set support_email='new@example.com' where id=true");
  assert.equal((await snapshot()).support_channel_ready, false, "changing a published channel clears verification");
  await db.query("rollback"); transactionOpen = false;

  await db.query("begin"); transactionOpen = true;
  await db.query(
    "update app_private.checkout_config set sales_enabled=false,cod_enabled=true,card_enabled=false," +
    "carrier_name='Local test carrier',shipping_minor=0,carrier_integration_ready=true," +
    "support_email='email-gate@example.test',support_whatsapp=null,support_channel_ready=false," +
    "transactional_email_ready=false,transactional_email_fingerprint=null where id=true",
  );
  const publishableCopy = "Local email release-gate test content. ".repeat(12);
  await db.query(
    "update app_private.store_policies set draft_body=$1,published_body=$1,published_by=null,published_at=now()",
    [publishableCopy],
  );
  await db.query("update app_private.checkout_config set support_channel_ready=true where id=true");
  await db.query("savepoint email_release_gate");
  let emailGateRejected = false;
  try { await db.query("update app_private.checkout_config set sales_enabled=true where id=true"); }
  catch (error) { emailGateRejected = error.code === "23514"; await db.query("rollback to savepoint email_release_gate"); }
  assert.ok(emailGateRejected, "sales cannot open unless transactional email passed its current test");
  await db.query("update app_private.checkout_config set transactional_email_ready=true,transactional_email_fingerprint=$1 where id=true", ["a".repeat(64)]);
  await db.query("update app_private.checkout_config set sales_enabled=true where id=true");
  assert.equal((await snapshot()).sales_enabled, true, "all release gates, including email, allow sales inside the test transaction");
  await db.query("rollback"); transactionOpen = false;

  await db.query("begin"); transactionOpen = true;
  await db.query("select set_config('cliqo.email_locale','en',true)");
  const trackingHash = randomBytes(32).toString("hex");
  const phone = "+2010" + String(Date.now()).slice(-8);
  const created = await db.query(
    "insert into public.orders(customer_name_snapshot,phone_snapshot,email_snapshot,shipping_address," +
    "payment_method,subtotal_minor,shipping_minor,total_minor,tracking_token_hash) " +
    "values('Local email queue check',$1,'outbox-check@example.test','{}'::jsonb,'cod',2500,0,2500,$2) " +
    "returning id,email_locale",
    [phone, trackingHash],
  );
  const testOrder = created.rows[0];
  assert.equal(testOrder.email_locale, "en", "order email locale follows the checkout locale");
  const received = await db.query(
    "select event_type,email_locale,payload from app_private.email_outbox where order_id=$1",
    [testOrder.id],
  );
  assert.equal(received.rowCount, 1, "order insert queues its receipt atomically");
  assert.equal(received.rows[0].event_type, "order_received");
  assert.equal(received.rows[0].email_locale, "en");
  assert.equal("shipping_address" in received.rows[0].payload, false, "outbox omits the customer shipping address");
  await db.query("update public.orders set payment_state='cod_collected' where id=$1", [testOrder.id]);
  const eventCount = await db.query(
    "select count(*)::int as count from app_private.email_outbox where order_id=$1 and event_type='order_update'",
    [testOrder.id],
  );
  assert.equal(eventCount.rows[0].count, 1, "meaningful payment-state changes queue an update");
  await db.query("rollback"); transactionOpen = false;

  assert.deepEqual(await snapshot(), before, "verification leaves policy and checkout data unchanged");
  console.log("Release gates passed: policy, support and email checks hold; order receipt and payment update queue atomically without shipping address; all test data rolled back.");
} finally {
  if (transactionOpen) await db.query("rollback").catch(() => undefined);
  await db.end();
}
