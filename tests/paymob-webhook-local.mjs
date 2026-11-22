// Local-only payment callback proof. Uses synthetic Paymob events and removes all fixtures.
import assert from "node:assert/strict";
import {createHash, randomBytes, randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import pg from "pg";

const env = Object.fromEntries((await readFile(new URL("../.env.local", import.meta.url), "utf8"))
  .split("\n")
  .filter((line) => /^[A-Z_]+=/.test(line))
  .map((line) => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).trim().replace(/^['"]|['"]$/g, "")]; }));
assert.ok(env.CLIQO_DATABASE_URL, "CLIQO_DATABASE_URL is required for local verification");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(env.CLIQO_DATABASE_URL).hostname), "This check only runs against a local database");
process.env.CLIQO_DATABASE_URL = env.CLIQO_DATABASE_URL;

const db = new pg.Client({connectionString: env.CLIQO_DATABASE_URL, connectionTimeoutMillis: 10000});
const fixtures = [];
const providerConfig = {
  baseUrl: "https://accept.paymob.com",
  mode: "test",
  secretKey: "local-only-test-key",
  publicKey: "local-only-test-public-key",
  hmacSecret: "local-only-test-hmac-secret",
  integrationId: 7654321,
  siteOrigin: "https://store.cliqo.example",
};

await db.connect();
const {processPaymobTransaction, PaymobWebhookError} = await import("../lib/paymob-webhook.ts");
const {getDb} = await import("../lib/db.ts");

async function createFixture(label, {attemptStatus = "pending", paymentState = "pending", expiresSeconds = 600, hasReservation = true} = {}) {
  const familyId = randomUUID();
  const familyKey = "test-paymob-" + randomBytes(4).toString("hex");
  const skuId = randomUUID();
  const skuCode = "CQ-PAY-" + randomBytes(4).toString("hex").toUpperCase();
  fixtures.push({familyId, skuId, orderId: null});
  await db.query(
    "insert into public.product_families(id,family_key,name_ar,name_en,state,supports_landing_page,has_nfc_qr) " +
    "values($1,$2,'اختبار محلي','Local test','ready',false,true)",
    [familyId, familyKey],
  );
  await db.query(
    "insert into public.product_skus(id,product_family_id,sku_code,display_name,options) values($1,$2,$3,$4,$5::jsonb)",
    [skuId, familyId, skuCode, "Local payment test " + label, JSON.stringify({face: "all-in-one", design: "T0"})],
  );
  await db.query("insert into public.inventory_balances(sku_id,on_hand,reserved) values($1,1,$2)", [skuId, hasReservation ? 1 : 0]);
  const trackingHash = createHash("sha256").update(randomBytes(32)).digest("hex");
  const order = await db.query(
    "insert into public.orders(customer_name_snapshot,phone_snapshot,shipping_address,payment_method,payment_state,state," +
    "subtotal_minor,shipping_minor,total_minor,tracking_token_hash) " +
    "values($1,'+201012345678','{}'::jsonb,'card',$2,'new',1000,0,1000,$3) returning id,order_reference",
    ["Local payment test " + label, paymentState, trackingHash],
  );
  const orderId = order.rows[0].id;
  fixtures.at(-1).orderId = orderId;
  const line = await db.query(
    "insert into public.order_lines(order_id,sku_id,sku_code_snapshot,product_name_snapshot,options_snapshot,quantity,unit_price_minor,line_total_minor) " +
    "values($1,$2,$3,$4,$5::jsonb,1,1000,1000) returning id",
    [orderId, skuId, skuCode, "Local payment test " + label, JSON.stringify({design: "T0"})],
  );
  const lineId = line.rows[0].id;
  await db.query(
    "insert into public.inventory_reservations(order_line_id,sku_id,quantity,state,expires_at) values($1,$2,1,$3,now()+interval '20 minutes')",
    [lineId, skuId, hasReservation ? "reserved" : "released"],
  );
  if (hasReservation) {
    await db.query(
      "insert into public.inventory_movements(sku_id,kind,quantity,order_line_id,reason) values($1,'reserved',1,$2,'Local Paymob callback test')",
      [skuId, lineId],
    );
  }
  const providerOrderId = String(9_000_000_000 + Math.floor(Math.random() * 899_999_999));
  const attempt = await db.query(
    "insert into app_private.payment_attempts(order_id,attempt_number,status,provider_order_id,amount_minor,currency,expires_at) " +
    "values($1,1,$2,$3,1000,'EGP',now()+($4::text || ' seconds')::interval) returning id",
    [orderId, attemptStatus, providerOrderId, expiresSeconds],
  );
  return {skuId, orderId, orderReference: order.rows[0].order_reference, lineId, providerOrderId, attemptId: attempt.rows[0].id};
}

function event(fixture, transactionId, values = {}) {
  return {
    type: "TRANSACTION",
    obj: {
      id: transactionId,
      amount_cents: 1000,
      currency: "EGP",
      integration_id: providerConfig.integrationId,
      success: true,
      pending: false,
      error_occured: false,
      is_refunded: false,
      is_voided: false,
      is_live: false,
      is_auth: false,
      is_capture: false,
      refunded_amount_cents: 0,
      created_at: new Date().toISOString(),
      order: {id: fixture.providerOrderId},
      ...values,
    },
  };
}

async function state(fixture) {
  return (await db.query(
    "select o.payment_state,a.status as attempt_status,b.on_hand,b.reserved,r.state as reservation_state " +
    "from public.orders o join app_private.payment_attempts a on a.order_id=o.id " +
    "join public.order_lines l on l.order_id=o.id join public.inventory_balances b on b.sku_id=l.sku_id " +
    "join public.inventory_reservations r on r.order_line_id=l.id where o.id=$1",
    [fixture.orderId],
  )).rows[0];
}

try {
  const paidFixture = await createFixture("paid");
  const successfulEvent = event(paidFixture, 987654321);
  assert.deepEqual(await processPaymobTransaction(providerConfig, successfulEvent), {duplicate: false, outcome: "succeeded"});
  assert.deepEqual(await processPaymobTransaction(providerConfig, successfulEvent), {duplicate: true, outcome: "succeeded"});
  assert.deepEqual(await state(paidFixture), {
    payment_state: "paid", attempt_status: "succeeded", on_hand: 1, reserved: 1, reservation_state: "reserved",
  });
  assert.equal((await db.query("select count(*)::int as count from app_private.payment_events where order_id=$1", [paidFixture.orderId])).rows[0].count, 1);

  assert.deepEqual(await processPaymobTransaction(providerConfig, event(paidFixture, 987654322, {
    is_refunded: true, refunded_amount_cents: 400, success: true,
  })), {duplicate: false, outcome: "partial_refund"});
  assert.deepEqual(await state(paidFixture), {
    payment_state: "paid", attempt_status: "succeeded", on_hand: 1, reserved: 1, reservation_state: "reserved",
  });
  assert.equal((await db.query("select outcome from app_private.payment_events where order_id=$1 and provider_transaction_id='987654322'", [paidFixture.orderId])).rows[0].outcome, "partial_refund");

  assert.deepEqual(await processPaymobTransaction(providerConfig, event(paidFixture, 987654323, {
    is_refunded: true, refunded_amount_cents: 1000, success: true,
  })), {duplicate: false, outcome: "refunded"});
  assert.deepEqual(await state(paidFixture), {
    payment_state: "refunded", attempt_status: "refunded", on_hand: 1, reserved: 0, reservation_state: "released",
  });

  const refundReviewFixture = await createFixture("refund-review", {attemptStatus: "succeeded", paymentState: "paid"});
  assert.deepEqual(await processPaymobTransaction(providerConfig, event(refundReviewFixture, 987654324, {
    is_refunded: true, refunded_amount_cents: null, success: true,
  })), {duplicate: false, outcome: "refund_review"});
  assert.deepEqual(await state(refundReviewFixture), {
    payment_state: "paid", attempt_status: "succeeded", on_hand: 1, reserved: 1, reservation_state: "reserved",
  });

  const lateFixture = await createFixture("late", {
    attemptStatus: "expired", paymentState: "failed", expiresSeconds: -60, hasReservation: false,
  });
  assert.deepEqual(await processPaymobTransaction(providerConfig, event(lateFixture, 987654325)), {duplicate: false, outcome: "succeeded"});
  assert.deepEqual(await state(lateFixture), {
    payment_state: "failed", attempt_status: "late_success", on_hand: 1, reserved: 0, reservation_state: "released",
  });
  assert.equal((await db.query("select count(*)::int as count from public.order_notes where order_id=$1", [lateFixture.orderId])).rows[0].count, 1);

  const voidFixture = await createFixture("void");
  assert.deepEqual(await processPaymobTransaction(providerConfig, event(voidFixture, 987654326, {
    success: false, is_voided: true,
  })), {duplicate: false, outcome: "voided"});
  assert.deepEqual(await state(voidFixture), {
    payment_state: "failed", attempt_status: "failed", on_hand: 1, reserved: 0, reservation_state: "released",
  });

  const invalidFixture = await createFixture("amount-mismatch");
  await assert.rejects(
    processPaymobTransaction(providerConfig, event(invalidFixture, 987654327, {amount_cents: 999})),
    (error) => error instanceof PaymobWebhookError && error.code === "invalid-event",
  );
  assert.deepEqual(await state(invalidFixture), {
    payment_state: "pending", attempt_status: "pending", on_hand: 1, reserved: 1, reservation_state: "reserved",
  });
  assert.equal((await db.query("select count(*)::int as count from app_private.payment_events where order_id=$1", [invalidFixture.orderId])).rows[0].count, 0);

  console.log("Local synthetic Paymob flow passed: captured payment, duplicate callback, partial/full refund, refund review, late success, void release, and amount mismatch rejection.");
} finally {
  const orderIds = fixtures.map((fixture) => fixture.orderId).filter(Boolean);
  const skuIds = fixtures.map((fixture) => fixture.skuId);
  const familyIds = fixtures.map((fixture) => fixture.familyId);
  if (orderIds.length) {
    await db.query("delete from app_private.payment_events where order_id=any($1::uuid[])", [orderIds]).catch(() => undefined);
    await db.query("delete from app_private.payment_attempts where order_id=any($1::uuid[])", [orderIds]).catch(() => undefined);
    await db.query("delete from app_private.email_outbox where order_id=any($1::uuid[])", [orderIds]).catch(() => undefined);
    await db.query("delete from public.order_notes where order_id=any($1::uuid[])", [orderIds]).catch(() => undefined);
    await db.query("delete from public.order_status_events where order_id=any($1::uuid[])", [orderIds]).catch(() => undefined);
    await db.query(
      "delete from public.order_line_status_events where order_line_id in (select id from public.order_lines where order_id=any($1::uuid[]))",
      [orderIds],
    ).catch(() => undefined);
  }
  if (skuIds.length) {
    await db.query("delete from public.inventory_movements where sku_id=any($1::uuid[])", [skuIds]).catch(() => undefined);
    await db.query("delete from public.inventory_reservations where sku_id=any($1::uuid[])", [skuIds]).catch(() => undefined);
  }
  if (orderIds.length) await db.query("delete from public.order_lines where order_id=any($1::uuid[])", [orderIds]).catch(() => undefined);
  if (orderIds.length) await db.query("delete from public.orders where id=any($1::uuid[])", [orderIds]).catch(() => undefined);
  if (skuIds.length) {
    await db.query("delete from public.inventory_balances where sku_id=any($1::uuid[])", [skuIds]).catch(() => undefined);
    await db.query("delete from public.product_skus where id=any($1::uuid[])", [skuIds]).catch(() => undefined);
  }
  if (familyIds.length) await db.query("delete from public.product_families where id=any($1::uuid[])", [familyIds]).catch(() => undefined);
  await db.end();
  await getDb().end();
}
