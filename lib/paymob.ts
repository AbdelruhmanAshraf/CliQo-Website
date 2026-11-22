import "server-only";

import {createHash, createHmac, timingSafeEqual} from "node:crypto";

export type PaymobConfig = {
  baseUrl: string;
  mode: "test" | "live";
  secretKey: string;
  publicKey: string;
  hmacSecret: string;
  integrationId: number;
  siteOrigin: string;
};

export type PaymobLine = {name: string; quantity: number; unitPriceMinor: number};

export class PaymobError extends Error {
  constructor(public readonly code: "not-configured" | "invalid-config" | "provider-unavailable") {
    super(code);
    this.name = "PaymobError";
  }
}

function publicHttpsOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (["localhost", "127.0.0.1", "::1"].includes(url.hostname) || url.hostname.endsWith(".test")) return null;
    return url.origin;
  } catch { return null; }
}

export function getPaymobConfig(): PaymobConfig | null {
  const base = process.env.PAYMOB_BASE_URL?.trim() || "https://accept.paymob.com";
  const mode = process.env.PAYMOB_MODE?.trim();
  const secretKey = process.env.PAYMOB_SECRET_KEY?.trim() ?? "";
  const publicKey = process.env.PAYMOB_PUBLIC_KEY?.trim() ?? "";
  const hmacSecret = process.env.PAYMOB_HMAC_SECRET?.trim() ?? "";
  const rawIntegrationId = process.env.PAYMOB_CARD_INTEGRATION_ID?.trim() ?? "";
  const integrationId = Number(rawIntegrationId);
  const siteOrigin = publicHttpsOrigin(process.env.CLIQO_PUBLIC_ORIGIN?.trim() || process.env.NEXT_PUBLIC_SITE_URL);
  let baseUrl: URL;
  try { baseUrl = new URL(base); } catch { return null; }
  if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash
      || !["accept.paymob.com", "oman.paymob.com", "ksa.paymob.com", "uae.paymob.com"].includes(baseUrl.hostname)
      || !["test", "live"].includes(mode ?? "") || !secretKey || !publicKey || hmacSecret.length < 16
      || !/^\d{1,12}$/.test(rawIntegrationId) || !Number.isSafeInteger(integrationId) || integrationId < 1 || !siteOrigin) {
    return null;
  }
  return {baseUrl: baseUrl.origin, mode: mode as "test" | "live", secretKey, publicKey, hmacSecret, integrationId, siteOrigin};
}

export function paymobConfigFingerprint(config: PaymobConfig) {
  return createHash("sha256").update(JSON.stringify([
    config.baseUrl, config.mode, config.secretKey, config.publicKey, config.hmacSecret,
    config.integrationId, config.siteOrigin,
  ])).digest("hex");
}

export function paymobSandboxTestingAllowed(config: PaymobConfig) {
  return config.mode === "test" && process.env.NODE_ENV !== "production"
    && process.env.CLIQO_ALLOW_PAYMOB_SANDBOX === "true";
}

export function paymobCheckoutUrl(config: PaymobConfig, clientSecret: string) {
  const url = new URL("/unifiedcheckout/", config.baseUrl);
  url.searchParams.set("publicKey", config.publicKey);
  url.searchParams.set("clientSecret", clientSecret);
  return url.toString();
}

export async function createPaymobIntention(input: {
  config: PaymobConfig;
  amountMinor: number;
  reference: string;
  orderReference: string;
  customerName: string;
  phone: string;
  email: string | null;
  address: {governorate: string; city: string; street: string};
  lines: PaymobLine[];
  shippingMinor: number;
  notificationUrl?: string;
}) {
  const {config} = input;
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 1
      || input.amountMinor > 2_000_000_000 || !/^CQ-[0-9]{6,}-[0-9a-f-]{36}$/i.test(input.reference)
      || !/^\+[1-9][0-9]{7,14}$/.test(input.phone) || !input.lines.length) {
    throw new PaymobError("invalid-config");
  }
  const nameParts = input.customerName.trim().split(/\s+/);
  const firstName = nameParts.shift() || "CliQo";
  const lastName = nameParts.join(" ") || firstName;
  const items = input.lines.map((line) => ({
    name: line.name.slice(0, 120),
    amount: line.unitPriceMinor,
    description: "CliQo order item",
    quantity: line.quantity,
  }));
  if (input.shippingMinor > 0) items.push({name: "Shipping", amount: input.shippingMinor, description: "Order delivery", quantity: 1});
  const payload = {
    amount: input.amountMinor,
    currency: "EGP",
    payment_methods: [config.integrationId],
    items,
    billing_data: {
      apartment: "NA", first_name: firstName, last_name: lastName,
      street: input.address.street.slice(0, 250), building: "NA", phone_number: input.phone,
      city: input.address.city.slice(0, 100), country: "EGY", email: input.email || "no-email@cliqo.invalid",
      floor: "NA", state: input.address.governorate.slice(0, 100), postal_code: "NA",
    },
    special_reference: input.reference,
    expiration: 1800,
    notification_url: input.notificationUrl || `${config.siteOrigin}/api/webhooks/paymob`,
    redirection_url: `${config.siteOrigin}/payments/result?reference=${encodeURIComponent(input.orderReference)}`,
  };
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/v1/intention/`, {
      method: "POST",
      headers: {authorization: `Token ${config.secretKey}`, "content-type": "application/json", accept: "application/json"},
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new PaymobError("provider-unavailable");
  }
  if (!response.ok) throw new PaymobError("provider-unavailable");
  let result: {id?: unknown; intention_order_id?: unknown; client_secret?: unknown};
  try { result = await response.json(); } catch { throw new PaymobError("provider-unavailable"); }
  const clientSecret = typeof result.client_secret === "string" && result.client_secret.length <= 512 ? result.client_secret : "";
  const providerOrderId = String(result.intention_order_id ?? "");
  const intentionId = typeof result.id === "string" || typeof result.id === "number" ? String(result.id) : "";
  if (!clientSecret || !/^\d{1,30}$/.test(providerOrderId) || !intentionId || intentionId.length > 160) {
    throw new PaymobError("provider-unavailable");
  }
  return {
    providerOrderId,
    intentionId,
    checkoutUrl: paymobCheckoutUrl(config, clientSecret),
  };
}

function hmacFieldValue(value: unknown) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return null;
}

export function verifyPaymobTransactionHmac(transaction: Record<string, unknown>, received: string, secret: string) {
  const order = transaction.order as Record<string, unknown> | null;
  const source = transaction.source_data as Record<string, unknown> | null;
  if (!order || !source || !/^[a-f0-9]{128}$/i.test(received) || secret.length < 16) return false;
  const fields = [
    transaction.amount_cents, transaction.created_at, transaction.currency, transaction.error_occured,
    transaction.has_parent_transaction, transaction.id, transaction.integration_id, transaction.is_3d_secure,
    transaction.is_auth, transaction.is_capture, transaction.is_refunded, transaction.is_standalone_payment,
    transaction.is_voided, order.id, transaction.owner, transaction.pending,
    source.pan, source.sub_type, source.type, transaction.success,
  ];
  const values = fields.map(hmacFieldValue);
  if (values.some((value) => value === null)) return false;
  const expected = createHmac("sha512", secret).update((values as string[]).join(""), "utf8").digest();
  const supplied = Buffer.from(received, "hex");
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
}

export function sha256Json(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
