import {NextResponse} from "next/server";
import {getPaymobConfig, verifyPaymobTransactionHmac} from "@/lib/paymob";
import {PaymobWebhookError, processPaymobTransaction} from "@/lib/paymob-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class PayloadTooLarge extends Error {}

async function readLimitedBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 256_000) throw new PayloadTooLarge();
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 256_000) {
        await reader.cancel();
        throw new PayloadTooLarge();
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", {fatal: true}).decode(body);
}

export async function POST(request: Request) {
  const config = getPaymobConfig();
  if (!config) return NextResponse.json({error: "Payment notifications are not configured."}, {status: 503, headers: {"Cache-Control": "no-store"}});
  const receivedHmac = new URL(request.url).searchParams.get("hmac") ?? "";
  if (!/^[a-f0-9]{128}$/i.test(receivedHmac)) {
    return NextResponse.json({error: "Invalid notification signature."}, {status: 401, headers: {"Cache-Control": "no-store"}});
  }
  try {
    const raw = await readLimitedBody(request);
    const event = JSON.parse(raw) as {obj?: unknown};
    if (!event || typeof event !== "object" || !event.obj || typeof event.obj !== "object"
        || !verifyPaymobTransactionHmac(event.obj as Record<string, unknown>, receivedHmac, config.hmacSecret)) {
      return NextResponse.json({error: "Invalid notification signature."}, {status: 401, headers: {"Cache-Control": "no-store"}});
    }
    const result = await processPaymobTransaction(config, event);
    return NextResponse.json({received: true, duplicate: result.duplicate}, {headers: {"Cache-Control": "no-store"}});
  } catch (error) {
    if (error instanceof PayloadTooLarge) return NextResponse.json({error: "Notification is too large."}, {status: 413, headers: {"Cache-Control": "no-store"}});
    if (error instanceof SyntaxError || (error instanceof PaymobWebhookError && error.code === "invalid-event")) {
      return NextResponse.json({error: "Invalid payment notification."}, {status: 400, headers: {"Cache-Control": "no-store"}});
    }
    // Return a retryable response for unknown intentions and database failures. Never log callback PII.
    return NextResponse.json({error: "Payment notification could not be recorded."}, {status: 503, headers: {"Cache-Control": "no-store"}});
  }
}
