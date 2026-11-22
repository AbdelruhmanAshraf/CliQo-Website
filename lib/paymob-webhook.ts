import "server-only";

import type {PoolClient} from "pg";
import {getDb} from "@/lib/db";
import {sha256Json, type PaymobConfig} from "@/lib/paymob";

export class PaymobWebhookError extends Error {
  constructor(public readonly code: "unknown-order" | "invalid-event" | "persistence") {
    super(code);
    this.name = "PaymobWebhookError";
  }
}

type PaymobTransaction = Record<string, unknown> & {
  id: string | number;
  amount_cents: number;
  currency: string;
  integration_id: number;
  success: boolean;
  pending: boolean;
  error_occured: boolean;
  is_refunded: boolean;
  is_voided: boolean;
  is_live: boolean;
  order: Record<string, unknown> & {id: string | number};
};

function numeric(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

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
    if (changed.rowCount !== 1) throw new Error("Invalid reservation balance.");
    await client.query("update public.inventory_reservations set state='released' where id=$1", [reservation.id]);
    await client.query(
      "insert into public.inventory_movements(sku_id,kind,quantity,order_line_id,reason) values($1,'released',$2,$3,$4)",
      [reservation.sku_id, reservation.quantity, reservation.order_line_id, reason],
    );
  }
}

export async function processPaymobTransaction(config: PaymobConfig, value: unknown) {
  if (!value || typeof value !== "object") throw new PaymobWebhookError("invalid-event");
  const event = value as {type?: unknown; obj?: unknown};
  if (event.type !== "TRANSACTION" || !event.obj || typeof event.obj !== "object") throw new PaymobWebhookError("invalid-event");
  const transaction = event.obj as PaymobTransaction;
  const transactionId = String(transaction.id ?? "");
  const providerOrderId = String(transaction.order?.id ?? "");
  const amount = numeric(transaction.amount_cents);
  const integrationId = numeric(transaction.integration_id);
  if (!/^[0-9]{1,40}$/.test(transactionId) || !/^[0-9]{1,40}$/.test(providerOrderId)
      || amount === null || amount < 0 || transaction.currency !== "EGP" || integrationId === null
      || typeof transaction.success !== "boolean" || typeof transaction.pending !== "boolean"
      || typeof transaction.error_occured !== "boolean" || typeof transaction.is_refunded !== "boolean"
      || typeof transaction.is_voided !== "boolean" || typeof transaction.is_live !== "boolean"
      || integrationId !== config.integrationId || transaction.is_live !== (config.mode === "live")) {
    throw new PaymobWebhookError("invalid-event");
  }

  const payloadHash = sha256Json([
    transaction.id, transaction.amount_cents, transaction.currency, transaction.created_at,
    transaction.integration_id, transaction.order.id, transaction.success, transaction.pending,
    transaction.error_occured, transaction.is_refunded, transaction.refunded_amount_cents,
    transaction.is_voided, transaction.is_live, transaction.is_auth, transaction.is_capture,
  ]);
  const client = await getDb().connect();
  try {
    await client.query("begin");
    const found = await client.query<{
      attempt_id: string; attempt_status: string; amount_minor: number; order_id: string;
      payment_state: string; order_state: string; total_minor: number; not_expired: boolean;
    }>(
      "select a.id as attempt_id,a.status as attempt_status,a.amount_minor,o.id as order_id,o.payment_state," +
      "o.state as order_state,o.total_minor,(a.expires_at>now()) as not_expired from app_private.payment_attempts a " +
      "join public.orders o on o.id=a.order_id where a.provider='paymob' and a.provider_order_id=$1 " +
      "for update of a,o",
      [providerOrderId],
    );
    const attempt = found.rows[0];
    if (!attempt) throw new PaymobWebhookError("unknown-order");
    if (amount !== attempt.amount_minor || amount !== attempt.total_minor) throw new PaymobWebhookError("invalid-event");

    const refundedAmount = numeric(transaction.refunded_amount_cents);
    const fullyRefunded = transaction.is_refunded && refundedAmount === attempt.amount_minor;
    const partiallyRefunded = transaction.is_refunded && refundedAmount !== null
      && refundedAmount > 0 && refundedAmount < attempt.amount_minor;
    const refundNeedsReview = transaction.is_refunded && !fullyRefunded && !partiallyRefunded;
    const isSuccessful = transaction.success && !transaction.pending && !transaction.error_occured
      && !transaction.is_voided && !transaction.is_refunded
      && (transaction.is_auth !== true || transaction.is_capture === true);
    const isVoided = transaction.is_voided;
    const outcome = fullyRefunded ? "refunded" : partiallyRefunded ? "partial_refund"
      : refundNeedsReview ? "refund_review" : isVoided ? "voided" : isSuccessful
        ? "succeeded" : transaction.pending ? "pending" : "failed";
    const recorded = await client.query<{id: number}>(
      "insert into app_private.payment_events(provider,provider_transaction_id,payload_hash,payment_attempt_id,order_id," +
      "amount_minor,currency,outcome) values('paymob',$1,$2,$3,$4,$5,'EGP',$6) " +
      "on conflict(provider,provider_transaction_id,payload_hash) do nothing returning id",
      [transactionId, payloadHash, attempt.attempt_id, attempt.order_id, amount, outcome],
    );
    if (!recorded.rowCount) {
      await client.query("commit");
      return {duplicate: true, outcome};
    }

    if (isSuccessful) {
      const alreadyPaid = attempt.attempt_status === "succeeded" && attempt.payment_state === "paid";
      const late = !alreadyPaid && (attempt.attempt_status !== "pending" || !attempt.not_expired
        || attempt.order_state === "cancelled" || attempt.payment_state !== "pending");
      if (!alreadyPaid) {
        await client.query(
          "update app_private.payment_attempts set status=$2,checkout_url=null,updated_at=now() where id=$1",
          [attempt.attempt_id, late ? "late_success" : "succeeded"],
        );
      }
      if (!late && !alreadyPaid) {
        await client.query("update public.orders set payment_state='paid',updated_at=now() where id=$1", [attempt.order_id]);
      }
      if (late) {
        await client.query(
          "insert into public.order_notes(order_id,body) values($1,$2)",
          [attempt.order_id, "Payment arrived after the checkout reservation or order state had expired. Verify available stock and contact the customer before fulfillment."],
        );
      }
    } else if (fullyRefunded) {
      await client.query("update app_private.payment_attempts set status='refunded',checkout_url=null,updated_at=now() where id=$1", [attempt.attempt_id]);
      await client.query("update public.orders set payment_state='refunded',updated_at=now() where id=$1", [attempt.order_id]);
      if (["new", "confirmed"].includes(attempt.order_state)) {
        await releaseReservations(client, attempt.order_id, "Paymob card payment refunded");
      }
    } else if (partiallyRefunded) {
      await client.query(
        "insert into public.order_notes(order_id,body) values($1,$2)",
        [attempt.order_id, `Paymob reported a partial refund of ${refundedAmount} minor units. Reconcile it in the payment dashboard.`],
      );
    } else if (refundNeedsReview) {
      await client.query(
        "insert into public.order_notes(order_id,body) values($1,$2)",
        [attempt.order_id, "Paymob reported a refund amount that does not match the original payment. Reconcile it in the payment dashboard before changing the order state."],
      );
    } else if (isVoided) {
      await client.query("update app_private.payment_attempts set status='failed',checkout_url=null,updated_at=now() where id=$1", [attempt.attempt_id]);
      if (attempt.payment_state === "pending") {
        await client.query("update public.orders set payment_state='failed',updated_at=now() where id=$1", [attempt.order_id]);
        await releaseReservations(client, attempt.order_id, "Paymob card payment voided");
      }
    }
    // A declined transaction does not expire the intention: the customer may retry inside hosted checkout.
    await client.query("commit");
    return {duplicate: false, outcome};
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if (error instanceof PaymobWebhookError) throw error;
    throw new PaymobWebhookError("persistence");
  } finally { client.release(); }
}
