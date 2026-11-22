import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import test from "node:test";
import {
  createPaymobIntention,
  getPaymobConfig,
  paymobCheckoutUrl,
  paymobConfigFingerprint,
  paymobSandboxTestingAllowed,
  PaymobError,
  verifyPaymobTransactionHmac,
  type PaymobConfig,
} from "../lib/paymob";

const envKeys = [
  "PAYMOB_BASE_URL", "PAYMOB_MODE", "PAYMOB_SECRET_KEY", "PAYMOB_PUBLIC_KEY",
  "PAYMOB_HMAC_SECRET", "PAYMOB_CARD_INTEGRATION_ID", "CLIQO_PUBLIC_ORIGIN",
  "NEXT_PUBLIC_SITE_URL", "CLIQO_ALLOW_PAYMOB_SANDBOX", "NODE_ENV",
];

async function withEnv(values: Record<string, string | undefined>, run: () => unknown | Promise<unknown>) {
  const original = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { return await run(); }
  finally {
    for (const key of envKeys) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const validEnv = {
  PAYMOB_BASE_URL: "https://accept.paymob.com",
  PAYMOB_MODE: "test",
  PAYMOB_SECRET_KEY: "server-test-secret",
  PAYMOB_PUBLIC_KEY: "egy_pk_test_public",
  PAYMOB_HMAC_SECRET: "fake-local-hmac-secret-123456",
  PAYMOB_CARD_INTEGRATION_ID: "123456",
  CLIQO_PUBLIC_ORIGIN: "https://store.cliqo.example",
};

const testConfig: PaymobConfig = {
  baseUrl: "https://accept.paymob.com",
  mode: "test",
  secretKey: "server-test-secret",
  publicKey: "egy_pk_test_public",
  hmacSecret: "fake-local-hmac-secret-123456",
  integrationId: 123456,
  siteOrigin: "https://store.cliqo.example",
};

function signature(transaction: Record<string, unknown>, secret: string) {
  const order = transaction.order as Record<string, unknown>;
  const source = transaction.source_data as Record<string, unknown>;
  const fields = [
    transaction.amount_cents, transaction.created_at, transaction.currency, transaction.error_occured,
    transaction.has_parent_transaction, transaction.id, transaction.integration_id, transaction.is_3d_secure,
    transaction.is_auth, transaction.is_capture, transaction.is_refunded, transaction.is_standalone_payment,
    transaction.is_voided, order.id, transaction.owner, transaction.pending,
    source.pan, source.sub_type, source.type, transaction.success,
  ];
  return createHmac("sha512", secret).update(fields.map((value) => String(value)).join(""), "utf8").digest("hex");
}

test("Paymob config accepts only complete HTTPS configuration on supported hosts", async () => {
  await withEnv(validEnv, () => assert.deepEqual(getPaymobConfig(), testConfig));
  await withEnv({...validEnv, PAYMOB_BASE_URL: "http://accept.paymob.com"}, () => assert.equal(getPaymobConfig(), null));
  await withEnv({...validEnv, PAYMOB_BASE_URL: "https://attacker.example"}, () => assert.equal(getPaymobConfig(), null));
  await withEnv({...validEnv, CLIQO_PUBLIC_ORIGIN: "http://store.cliqo.example"}, () => assert.equal(getPaymobConfig(), null));
  await withEnv({...validEnv, PAYMOB_HMAC_SECRET: "short"}, () => assert.equal(getPaymobConfig(), null));
});

test("Paymob readiness fingerprint changes when credentials or public origin change", () => {
  const changed = {...testConfig, siteOrigin: "https://other.cliqo.example"};
  assert.notEqual(paymobConfigFingerprint(testConfig), paymobConfigFingerprint(changed));
});

test("sandbox flow requires explicit opt-in and a non-production runtime", async () => {
  await withEnv({NODE_ENV: "development", CLIQO_ALLOW_PAYMOB_SANDBOX: "true"}, () => {
    assert.equal(paymobSandboxTestingAllowed(testConfig), true);
  });
  await withEnv({NODE_ENV: "production", CLIQO_ALLOW_PAYMOB_SANDBOX: "true"}, () => {
    assert.equal(paymobSandboxTestingAllowed(testConfig), false);
  });
  await withEnv({NODE_ENV: "development", CLIQO_ALLOW_PAYMOB_SANDBOX: "false"}, () => {
    assert.equal(paymobSandboxTestingAllowed(testConfig), false);
  });
});

test("transaction HMAC accepts authentic fields and rejects tampered or incomplete callbacks", () => {
  const secret = "callback-test-secret-1234567890";
  const transaction: Record<string, unknown> = {
    amount_cents: 10000,
    created_at: "2026-10-28T09:00:00.000+02:00",
    currency: "EGP",
    error_occured: false,
    has_parent_transaction: false,
    id: 192036465,
    integration_id: 123456,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: {id: 217503754},
    owner: 1234,
    pending: false,
    source_data: {pan: "2346", sub_type: "MasterCard", type: "card"},
    success: true,
  };
  const hmac = signature(transaction, secret);
  assert.equal(verifyPaymobTransactionHmac(transaction, hmac, secret), true);
  assert.equal(verifyPaymobTransactionHmac({...transaction, amount_cents: 10001}, hmac, secret), false);
  assert.equal(verifyPaymobTransactionHmac({...transaction, source_data: undefined}, hmac, secret), false);
  assert.equal(verifyPaymobTransactionHmac(transaction, "bad", secret), false);
});

test("Paymob intention sends a server-authenticated EGP request and returns hosted checkout", async (context) => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestHeaders = new Headers();
  let payload: Record<string, unknown> = {};
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    requestHeaders = new Headers(init?.headers);
    payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({id: "pi_local_1", intention_order_id: 12345678, client_secret: "client-secret-local"});
  }) as typeof fetch;
  context.after(() => { globalThis.fetch = originalFetch; });

  const result = await createPaymobIntention({
    config: testConfig,
    amountMinor: 1300,
    reference: "CQ-001001-550e8400-e29b-41d4-a716-446655440000",
    orderReference: "CQ-001001",
    customerName: "CliQo Test Buyer",
    phone: "+201012345678",
    email: null,
    address: {governorate: "Cairo", city: "Nasr City", street: "Test Street 10"},
    lines: [{name: "CliQo stand", quantity: 1, unitPriceMinor: 1000}],
    shippingMinor: 300,
  });

  assert.equal(requestedUrl, "https://accept.paymob.com/v1/intention/");
  assert.equal(requestHeaders.get("authorization"), "Token server-test-secret");
  assert.equal(requestHeaders.get("content-type"), "application/json");
  assert.equal(payload.amount, 1300);
  assert.equal(payload.currency, "EGP");
  assert.deepEqual(payload.payment_methods, [123456]);
  assert.equal(payload.special_reference, "CQ-001001-550e8400-e29b-41d4-a716-446655440000");
  assert.equal(payload.notification_url, "https://store.cliqo.example/api/webhooks/paymob");
  assert.equal(payload.redirection_url, "https://store.cliqo.example/payments/result?reference=CQ-001001");
  assert.deepEqual(payload.items, [
    {name: "CliQo stand", amount: 1000, description: "CliQo order item", quantity: 1},
    {name: "Shipping", amount: 300, description: "Order delivery", quantity: 1},
  ]);
  assert.equal(result.providerOrderId, "12345678");
  assert.equal(result.intentionId, "pi_local_1");
  assert.equal(result.checkoutUrl, "https://accept.paymob.com/unifiedcheckout/?publicKey=egy_pk_test_public&clientSecret=client-secret-local");
});

test("Paymob intention rejects network and malformed provider responses without exposing them", async (context) => {
  const originalFetch = globalThis.fetch;
  const validInput = {
    config: testConfig,
    amountMinor: 1000,
    reference: "CQ-001001-550e8400-e29b-41d4-a716-446655440000",
    orderReference: "CQ-001001",
    customerName: "CliQo Test Buyer",
    phone: "+201012345678",
    email: null,
    address: {governorate: "Cairo", city: "Nasr City", street: "Test Street 10"},
    lines: [{name: "CliQo stand", quantity: 1, unitPriceMinor: 1000}],
    shippingMinor: 0,
  };
  context.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = (async () => Response.json({id: "pi_missing", intention_order_id: 12345678})) as typeof fetch;
  await assert.rejects(createPaymobIntention(validInput), (error: unknown) => error instanceof PaymobError && error.code === "provider-unavailable");

  globalThis.fetch = (async () => { throw new Error("test network failure"); }) as typeof fetch;
  await assert.rejects(createPaymobIntention(validInput), (error: unknown) => error instanceof PaymobError && error.code === "provider-unavailable");
});

test("hosted checkout URL encodes public and per-order client keys", () => {
  const url = new URL(paymobCheckoutUrl(testConfig, "secret with spaces"));
  assert.equal(url.origin, "https://accept.paymob.com");
  assert.equal(url.pathname, "/unifiedcheckout/");
  assert.equal(url.searchParams.get("publicKey"), testConfig.publicKey);
  assert.equal(url.searchParams.get("clientSecret"), "secret with spaces");
});
