import {timingSafeEqual} from "node:crypto";
import {NextResponse, type NextRequest} from "next/server";
import {EmailDeliveryError, createEmailTransport, emailTransportFingerprint} from "@/lib/email";
import {buildOrderEmail, type EmailLocale, type OrderEmailLine} from "@/lib/email-templates";
import {getDb} from "@/lib/db";
import {createOrderAccessToken} from "@/lib/order-access";
import {releaseExpiredCardOrders} from "@/lib/card-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OutboxRow = {
  id: number;
  order_id: string;
  recipient: string;
  event_type: "order_received" | "order_update";
  email_locale: EmailLocale;
  attempts: number;
  payload: {
    reference: string;
    customer_name: string;
    state: string;
    payment_state: string;
    payment_method: string;
    subtotal_minor: number;
    shipping_minor: number;
    total_minor: number;
  };
};

function isAuthorized(request: NextRequest) {
  const expected = process.env.CLIQO_EMAIL_CRON_SECRET ?? "";
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  if (expectedBytes.length < 32 || providedBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(providedBytes, expectedBytes);
}

function errorCode(error: unknown) {
  const raw = typeof error === "object" && error !== null && "code" in error
    ? String((error as {code?: unknown}).code ?? "") : "";
  return /^[A-Za-z0-9_-]{1,80}$/.test(raw) ? raw : "delivery_error";
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({error: "Unauthorized"}, {status: 401});

  let expiredPayments = 0;
  try {
    expiredPayments = await releaseExpiredCardOrders();
  } catch {
    return NextResponse.json({error: "Payment reservation cleanup failed."}, {status: 503, headers: {"Cache-Control": "no-store"}});
  }

  const fingerprint = emailTransportFingerprint();
  if (!fingerprint) return NextResponse.json({error: "Email delivery is not configured.", expiredPayments}, {status: 503});

  const db = getDb();
  try {
    const readiness = await db.query<{transactional_email_ready: boolean; transactional_email_fingerprint: string | null}>(
      "select transactional_email_ready,transactional_email_fingerprint from app_private.checkout_config where id=true",
    );
    const status = readiness.rows[0];
    if (!status?.transactional_email_ready || status.transactional_email_fingerprint !== fingerprint) {
      return NextResponse.json({error: "Email delivery has not passed its current configuration test.", expiredPayments}, {status: 503});
    }

    await db.query(
      "delete from app_private.email_outbox where status in ('sent','failed') and created_at < now() - interval '90 days'",
    );
    await db.query(
      "update app_private.email_outbox set status='failed',locked_at=null,last_error_code='retry_limit' " +
      "where status='processing' and attempts >= 8 and locked_at < now() - interval '15 minutes'",
    );

    const claimed = await db.query<OutboxRow>(
      "with candidates as (" +
        " select id from app_private.email_outbox " +
        " where attempts < 8 and (" +
        "   (status='queued' and available_at <= now())" +
        "   or (status='processing' and locked_at < now() - interval '15 minutes')" +
        " ) order by created_at for update skip locked limit 15" +
        ") update app_private.email_outbox as queued " +
        "set status='processing',attempts=queued.attempts + 1,locked_at=now(),last_error_code=null " +
        "from candidates where queued.id=candidates.id " +
        "returning queued.id,queued.order_id,queued.recipient,queued.event_type,queued.email_locale,queued.attempts,queued.payload",
    );

    if (!claimed.rows.length) return NextResponse.json({sent: 0, retried: 0, failed: 0, expiredPayments}, {headers: {"Cache-Control": "no-store"}});

    let mailer: ReturnType<typeof createEmailTransport>;
    try {
      mailer = createEmailTransport();
    } catch (error) {
      await db.query(
        "update app_private.email_outbox set status='queued',locked_at=null,available_at=now() where id=any($1::bigint[])",
        [claimed.rows.map((row) => row.id)],
      );
      if (error instanceof EmailDeliveryError) return NextResponse.json({error: "Email delivery is not configured.", expiredPayments}, {status: 503});
      throw error;
    }

    let sent = 0;
    let retried = 0;
    let failed = 0;
    try {
      const orderIds = [...new Set(claimed.rows.map((row) => row.order_id))];
      const lineResult = await db.query<OrderEmailLine & {order_id: string}>(
        "select order_id,product_name_snapshot,quantity,line_total_minor from public.order_lines " +
        "where order_id=any($1::uuid[]) order by created_at",
        [orderIds],
      );
      const linesByOrder = new Map<string, OrderEmailLine[]>();
      for (const line of lineResult.rows) {
        const current = linesByOrder.get(line.order_id) ?? [];
        current.push({product_name_snapshot: line.product_name_snapshot, quantity: line.quantity, line_total_minor: line.line_total_minor});
        linesByOrder.set(line.order_id, current);
      }
      const accessResult = await db.query<{id: string; order_reference: string; tracking_token_hash: string}>(
        "select id,order_reference,tracking_token_hash from public.orders where id=any($1::uuid[])",
        [orderIds],
      );
      const accessByOrder = new Map(accessResult.rows.map((order) => [order.id, order]));

      for (const row of claimed.rows) {
        try {
          const access = accessByOrder.get(row.order_id);
          if (!access || access.order_reference !== row.payload.reference) {
            throw new Error("order_access_unavailable");
          }
          const message = buildOrderEmail({
            locale: row.email_locale,
            eventType: row.event_type,
            reference: row.payload.reference,
            customerName: row.payload.customer_name,
            state: row.payload.state,
            paymentState: row.payload.payment_state,
            paymentMethod: row.payload.payment_method,
            subtotalMinor: Number(row.payload.subtotal_minor),
            shippingMinor: Number(row.payload.shipping_minor),
            totalMinor: Number(row.payload.total_minor),
            lines: linesByOrder.get(row.order_id) ?? [],
            siteUrl: mailer.siteUrl,
            orderAccessToken: createOrderAccessToken(access.order_reference, access.tracking_token_hash),
          });
          await mailer.transport.sendMail({
            from: mailer.from,
            to: row.recipient,
            subject: message.subject,
            text: message.text,
            html: message.html,
          });
          await db.query(
            "update app_private.email_outbox set status='sent',locked_at=null,sent_at=now(),last_error_code=null where id=$1",
            [row.id],
          );
          sent += 1;
        } catch (error) {
          const finalAttempt = row.attempts >= 8;
          const delayMinutes = Math.min(360, 2 ** Math.max(0, row.attempts - 1));
          await db.query(
            "update app_private.email_outbox set status=$2,locked_at=null," +
            "available_at=case when $2='failed' then available_at else now() + ($3::text || ' minutes')::interval end," +
            "last_error_code=$4 where id=$1",
            [row.id, finalAttempt ? "failed" : "queued", delayMinutes, errorCode(error)],
          );
          if (finalAttempt) failed += 1;
          else retried += 1;
        }
      }
    } finally {
      mailer.transport.close();
    }
    return NextResponse.json({sent, retried, failed, expiredPayments}, {headers: {"Cache-Control": "no-store"}});
  } catch {
    return NextResponse.json({error: "Email queue processing failed."}, {status: 500, headers: {"Cache-Control": "no-store"}});
  }
}
