import "server-only";

import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import {getDb} from "@/lib/db";
import {emailTransportFingerprint} from "@/lib/email";
import type {CheckoutItem} from "@/lib/checkout";
import {paymobConfigFingerprint, paymobSandboxTestingAllowed, type PaymobConfig, type PaymobLine} from "@/lib/paymob";
import {createPaymobIntention} from "@/lib/paymob";

export class CardOrderError extends Error {
  constructor(public readonly code: "closed" | "unavailable" | "in-progress" | "already-paid" | "manual-review" | "retry" | "provider") {
    super(code);
    this.name = "CardOrderError";
  }
}

type QuoteLine = {skuId: string; name: string; quantity: number; lineTotalMinor: number};
type CheckoutQuote = {lines: QuoteLine[]; subtotalMinor: number; shippingMinor: number; totalMinor: number};
type CardOrderResult = {orderId: string; reference: string; checkoutUrl: string; existing: boolean};

type LockedSku = {
  id: string; sku_code: string; display_name: string; options: Record<string, string>;
  family_key: string; family_state: string; state: string; price_minor: number;
  price_approved: boolean; sample_approved: boolean; fulfillment_approved: boolean;
  on_hand: number; reserved: number;
};

async function releaseReservations(client: PoolClient, orderId: string, reason: string) {
  const reservations = await client.query<{id: string; sku_id: string; quantity: number; order_line_id: string}>(
    "select r.id,r.sku_id,r.quantity,r.order_line_id from public.inventory_reservations r " +
    "join public.order_lines l on l.id=r.order_line_id where l.order_id=$1 and r.state='reserved' " +
    "order by r.sku_id for update of r",
    [orderId],
  );
  for (const reservation of reservations.rows) {
    const changed = await client.query(
      "update public.inventory_balances set reserved=reserved-$2 where sku_id=$1 and reserved >= $2",
      [reservation.sku_id, reservation.quantity],
    );
    if (changed.rowCount !== 1) throw new Error("Invalid card reservation balance.");
    await client.query("update public.inventory_reservations set state='released' where id=$1", [reservation.id]);
    await client.query(
      "insert into public.inventory_movements(sku_id,kind,quantity,order_line_id,reason) values($1,'released',$2,$3,$4)",
      [reservation.sku_id, reservation.quantity, reservation.order_line_id, reason],
    );
  }
}

async function failCreatingAttempt(attemptId: string, orderId: string) {
  const client = await getDb().connect();
  try {
    await client.query("begin");
    const locked = await client.query<{status: string}>(
      "select status from app_private.payment_attempts where id=$1 for update",
      [attemptId],
    );
    if (locked.rows[0]?.status === "creating") {
      await releaseReservations(client, orderId, "Paymob intention could not be created");
      await client.query("update app_private.payment_attempts set status='failed',checkout_url=null,updated_at=now() where id=$1", [attemptId]);
      await client.query(
        "update public.orders set payment_state='failed',updated_at=now() where id=$1 and payment_method='card' and payment_state='pending'",
        [orderId],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function createOrResumeCardOrder(input: {
  requestKey: string;
  name: string;
  phone: string;
  email: string | null;
  address: {governorate: string; city: string; street: string};
  note: string | null;
  items: CheckoutItem[];
  quote: CheckoutQuote;
  locale: "ar" | "en";
  config: PaymobConfig;
}): Promise<CardOrderResult> {
  const keyHash = createHash("sha256").update(input.requestKey).digest("hex");
  const client = await getDb().connect();
  let orderId = "";
  let reference = "";
  let trackingHash = "";
  let attemptId = "";
  let attemptNumber = 1;
  let linesForProvider: PaymobLine[] = [];
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(pg_catalog.hashtextextended($1,0))", [keyHash]);
    const existing = await client.query<{
      id: string; order_reference: string; tracking_token_hash: string; payment_state: string; payment_method: string;
    }>(
      "select id,order_reference,tracking_token_hash,payment_state,payment_method from public.orders where idempotency_key=$1 for update",
      [keyHash],
    );
    if (existing.rows[0]) {
      const order = existing.rows[0];
      if (order.payment_method !== "card") throw new CardOrderError("unavailable");
      const attempt = await client.query<{id: string; status: string; checkout_url: string | null}>(
        "select id,status,checkout_url from app_private.payment_attempts where order_id=$1 order by attempt_number desc limit 1 for update",
        [order.id],
      );
      const latest = attempt.rows[0];
      if (latest?.status === "pending" && latest.checkout_url) {
        orderId = order.id; reference = order.order_reference; trackingHash = order.tracking_token_hash;
        attemptId = latest.id;
        await client.query("commit");
        return {orderId, reference, checkoutUrl: latest.checkout_url, existing: true};
      }
      if (latest?.status === "creating") throw new CardOrderError("in-progress");
      if (order.payment_state === "paid") throw new CardOrderError("already-paid");
      if (latest?.status === "late_success") throw new CardOrderError("manual-review");
      if (latest?.status === "failed" || latest?.status === "expired") throw new CardOrderError("retry");
      throw new CardOrderError("unavailable");
    }

    const emailFingerprint = emailTransportFingerprint();
    const checkout = await client.query<{
      sales_enabled: boolean; card_enabled: boolean; card_gateway_ready: boolean; card_gateway_name: string | null; card_gateway_fingerprint: string | null;
      carrier_integration_ready: boolean; carrier_name: string | null; shipping_minor: number | null;
      policies_approved: boolean; support_channel_ready: boolean; transactional_email_ready: boolean;
      transactional_email_fingerprint: string | null;
    }>(
      "select sales_enabled,card_enabled,card_gateway_ready,card_gateway_name,card_gateway_fingerprint,carrier_integration_ready,carrier_name," +
      "shipping_minor,policies_approved,support_channel_ready,transactional_email_ready,transactional_email_fingerprint " +
      "from app_private.checkout_config where id=true for share",
    );
    const gate = checkout.rows[0];
    const sandboxMode = paymobSandboxTestingAllowed(input.config);
    const shippingMinor = gate?.shipping_minor ?? (sandboxMode ? 0 : null);
    const commercialGatesReady = Boolean(gate?.sales_enabled && gate.carrier_integration_ready && gate.carrier_name
      && gate.shipping_minor !== null && gate.policies_approved && gate.support_channel_ready
      && emailFingerprint && gate.transactional_email_ready && gate.transactional_email_fingerprint === emailFingerprint);
    if (!gate?.card_enabled || !gate.card_gateway_ready || gate.card_gateway_name !== "Paymob"
        || (input.config.mode !== "live" && !sandboxMode)
        || gate.card_gateway_fingerprint !== paymobConfigFingerprint(input.config)
        || (!sandboxMode && !commercialGatesReady)
        || shippingMinor === null || shippingMinor !== input.quote.shippingMinor
        || input.quote.totalMinor !== input.quote.subtotalMinor + shippingMinor) {
      throw new CardOrderError("closed");
    }

    const skuIds = [...new Set(input.items.map((item) => item.sku_id))].sort();
    const stock = await client.query<LockedSku>(
      "select s.id,s.sku_code,s.display_name,s.options,f.family_key,f.state as family_state,s.state,s.price_minor," +
      "s.price_approved,s.sample_approved,s.fulfillment_approved,b.on_hand,b.reserved " +
      "from public.product_skus s join public.product_families f on f.id=s.product_family_id " +
      "join public.inventory_balances b on b.sku_id=s.id where s.id=any($1::uuid[]) " +
      "order by s.id for update of s,f,b",
      [skuIds],
    );
    const skuById = new Map(stock.rows.map((sku) => [sku.id, sku]));
    const requested = new Map<string, number>();
    for (const item of input.items) requested.set(item.sku_id, (requested.get(item.sku_id) ?? 0) + item.quantity);
    if (stock.rows.length !== skuIds.length) throw new CardOrderError("unavailable");
    for (const [skuId, quantity] of requested) {
      const sku = skuById.get(skuId);
      if (!sku || sku.state !== "ready" || sku.family_state !== "ready" || !sku.price_approved
          || !sku.sample_approved || !sku.fulfillment_approved || !sku.price_minor
          || sku.on_hand - sku.reserved < quantity) throw new CardOrderError("unavailable");
    }

    const subtotal = input.items.reduce((sum, item, index) => {
      const sku = skuById.get(item.sku_id)!;
      const quoteLine = input.quote.lines[index];
      if (!quoteLine || quoteLine.skuId !== item.sku_id || quoteLine.quantity !== item.quantity
          || quoteLine.lineTotalMinor !== sku.price_minor * item.quantity) throw new CardOrderError("unavailable");
      return sum + sku.price_minor * item.quantity;
    }, 0);
    if (subtotal !== input.quote.subtotalMinor || subtotal + shippingMinor !== input.quote.totalMinor
        || input.quote.totalMinor > 2_000_000_000) throw new CardOrderError("unavailable");

    await client.query("select set_config('cliqo.email_locale',$1,true)", [input.locale]);
    await client.query(
      "insert into public.customers(full_name,phone_e164,email) values($1,$2,$3) on conflict(phone_e164) do nothing",
      [input.name, input.phone, input.email],
    );
    const customer = await client.query<{id: string}>("select id from public.customers where phone_e164=$1", [input.phone]);
    const order = await client.query<{id: string; order_reference: string; tracking_token_hash: string}>(
      "insert into public.orders(customer_id,customer_name_snapshot,phone_snapshot,email_snapshot,shipping_address," +
      "customer_note,payment_method,payment_state,state,subtotal_minor,shipping_minor,total_minor,idempotency_key,tracking_token_hash) " +
      "values($1,$2,$3,$4,$5::jsonb,$6,'card','pending','new',$7,$8,$9,$10,$10) " +
      "returning id,order_reference,tracking_token_hash",
      [customer.rows[0]?.id ?? null, input.name, input.phone, input.email, JSON.stringify(input.address), input.note,
        subtotal, shippingMinor, input.quote.totalMinor, keyHash],
    );
    orderId = order.rows[0].id;
    reference = order.rows[0].order_reference;
    trackingHash = order.rows[0].tracking_token_hash;

    for (let index = 0; index < input.items.length; index += 1) {
      const item = input.items[index];
      const quoteLine = input.quote.lines[index];
      const sku = skuById.get(item.sku_id)!;
      const isCustom = sku.options.design === "T1" || sku.options.design === "T2";
      const customData = Boolean(item.business_name && item.destination_url);
      if (isCustom !== customData) throw new CardOrderError("unavailable");
      const line = await client.query<{id: string}>(
        "insert into public.order_lines(order_id,sku_id,sku_code_snapshot,product_name_snapshot,options_snapshot," +
        "quantity,unit_price_minor,line_total_minor,design_business_name,design_request_url,design_brief,state) " +
        "values($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12) returning id",
        [orderId, sku.id, sku.sku_code, quoteLine.name, JSON.stringify(sku.options), item.quantity, sku.price_minor,
          sku.price_minor * item.quantity, isCustom ? item.business_name : null, isCustom ? item.destination_url : null,
          isCustom ? item.design_brief ?? null : null, isCustom ? "awaiting_design" : "pending"],
      );
      const reserved = await client.query(
        "update public.inventory_balances set reserved=reserved+$2 where sku_id=$1 and on_hand-reserved >= $2",
        [sku.id, item.quantity],
      );
      if (reserved.rowCount !== 1) throw new CardOrderError("unavailable");
      await client.query(
        "insert into public.inventory_reservations(order_line_id,sku_id,quantity,expires_at) " +
        "values($1,$2,$3,now()+interval '30 minutes')",
        [line.rows[0].id, sku.id, item.quantity],
      );
      await client.query(
        "insert into public.inventory_movements(sku_id,kind,quantity,order_line_id,reason) " +
        "values($1,'reserved',$2,$3,'Paymob card checkout hold')",
        [sku.id, item.quantity, line.rows[0].id],
      );
    }
    linesForProvider = input.items.map((item, index) => ({
      name: input.quote.lines[index].name,
      quantity: item.quantity,
      unitPriceMinor: skuById.get(item.sku_id)!.price_minor,
    }));
    const createdAttempt = await client.query<{id: string}>(
      "insert into app_private.payment_attempts(order_id,attempt_number,status,amount_minor,currency,expires_at) " +
      "values($1,1,'creating',$2,'EGP',now()+interval '30 minutes') returning id",
      [orderId, input.quote.totalMinor],
    );
    attemptId = createdAttempt.rows[0].id;
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if (error instanceof CardOrderError) throw error;
    throw new CardOrderError("unavailable");
  } finally { client.release(); }

  try {
    const intention = await createPaymobIntention({
      config: input.config,
      amountMinor: input.quote.totalMinor,
      reference: `${reference}-${attemptId}`,
      orderReference: reference,
      customerName: input.name,
      phone: input.phone,
      email: input.email,
      address: input.address,
      lines: linesForProvider,
      shippingMinor: input.quote.shippingMinor,
    });
    const client = await getDb().connect();
    try {
      await client.query("begin");
      const saved = await client.query(
        "update app_private.payment_attempts set status='pending',provider_intention_id=$2,provider_order_id=$3," +
        "checkout_url=$4,updated_at=now() where id=$1 and status='creating' and expires_at>now() returning id",
        [attemptId, intention.intentionId, intention.providerOrderId, intention.checkoutUrl],
      );
      if (!saved.rowCount) throw new CardOrderError("unavailable");
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }
    return {orderId, reference, checkoutUrl: intention.checkoutUrl, existing: false};
  } catch (error) {
    await failCreatingAttempt(attemptId, orderId).catch(() => undefined);
    if (error instanceof CardOrderError) throw error;
    throw new CardOrderError("provider");
  }
}

export async function releaseExpiredCardOrders() {
  const client = await getDb().connect();
  let expired = 0;
  try {
    await client.query("begin");
    const attempts = await client.query<{id: string; order_id: string}>(
      "select id,order_id from app_private.payment_attempts where status in ('creating','pending') and expires_at<=now() " +
      "order by expires_at for update skip locked limit 100",
    );
    for (const attempt of attempts.rows) {
      const updated = await client.query(
        "update app_private.payment_attempts set status='expired',checkout_url=null,updated_at=now() " +
        "where id=$1 and status in ('creating','pending') returning id",
        [attempt.id],
      );
      if (!updated.rowCount) continue;
      await releaseReservations(client, attempt.order_id, "Card checkout expired");
      await client.query(
        "update public.orders set payment_state='failed',updated_at=now() " +
        "where id=$1 and payment_method='card' and payment_state='pending'",
        [attempt.order_id],
      );
      expired += 1;
    }
    await client.query("commit");
    return expired;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
