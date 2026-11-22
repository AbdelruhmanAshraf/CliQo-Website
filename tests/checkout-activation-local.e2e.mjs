// Local-only checkout, fulfillment, activation and redirect proof with reversible fixtures.
import assert from "node:assert/strict";
import {createHash, createHmac, randomBytes, randomInt, randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {createClient} from "@supabase/supabase-js";
import {createServerClient} from "@supabase/ssr";
import pg from "pg";
import {chromium} from "playwright";

const envFile = Object.fromEntries((await readFile(new URL("../.env.local", import.meta.url), "utf8"))
  .split("\n").filter((line) => /^[A-Z_]+=/.test(line))
  .map((line) => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).trim().replace(/^['"]|['"]$/g, "")]; }));
Object.assign(process.env, envFile);

const base = process.env.CLIQO_TEST_URL || "http://localhost:4175";
const localHosts = ["localhost", "127.0.0.1"];
assert.ok(localHosts.includes(new URL(base).hostname), "Checkout test only runs against a local web server");
assert.ok(localHosts.includes(new URL(envFile.NEXT_PUBLIC_SUPABASE_URL).hostname), "Checkout test only runs against local Supabase");
assert.ok(localHosts.includes(new URL(envFile.CLIQO_DATABASE_URL).hostname), "Checkout test only runs against a local database");

// Give the local server a fake, non-deliverable email fingerprint. No email worker is started.
Object.assign(process.env, {
  NODE_ENV: "development",
  CLIQO_SMTP_HOST: "127.0.0.1",
  CLIQO_SMTP_PORT: "2525",
  CLIQO_SMTP_SECURE: "false",
  CLIQO_SMTP_USER: "",
  CLIQO_SMTP_PASSWORD: "",
  CLIQO_EMAIL_FROM: "checkout@example.invalid",
  CLIQO_EMAIL_FROM_NAME: "CliQo Local Test",
  CLIQO_ORDER_ACCESS_SECRET: "local-synthetic-order-access-secret-0000000000",
  NEXT_PUBLIC_SITE_URL: base,
});
const {emailTransportFingerprint} = await import("../lib/email.ts");
const emailFingerprint = emailTransportFingerprint();
assert.ok(emailFingerprint, "Synthetic local email fingerprint is valid");

const db = new pg.Client({connectionString: envFile.CLIQO_DATABASE_URL, connectionTimeoutMillis: 10000});
const admin = createClient(envFile.NEXT_PUBLIC_SUPABASE_URL, envFile.SUPABASE_SECRET_KEY, {auth: {persistSession: false}});
const browser = await chromium.launch({channel: "chrome", headless: true});
const users = [];
const fixture = {
  familyId: null, familyState: null, skuId: randomUUID(), itemId: null,
  publicId: null, orderId: null, orderReference: null, orderLineId: null,
  phone: "+2010" + String(randomInt(0, 100_000_000)).padStart(8, "0"),
  buyerEmail: `checkout-${randomUUID()}@example.invalid`,
  customerId: null, secondId: null, ownerId: null, pageId: null,
};
let customer, second, owner, configBefore, policiesBefore, auditBefore;
let dbConnected = false;
const cleanupErrors = [];

function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replace(/=+$/, "")) bits += alphabet.indexOf(character.toUpperCase()).toString(2).padStart(5, "0");
  const key = Buffer.from((bits.match(/.{8}/g) || []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", key).update(counter).digest(), offset = digest[19] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function createAccount(role) {
  const email = `cliqo-checkout-${randomUUID()}@example.invalid`;
  const password = randomBytes(24).toString("hex");
  const created = await admin.auth.admin.createUser({email, password, email_confirm: true});
  if (created.error) throw new Error("Could not create a local test account");
  const id = created.data.user.id; users.push(id);
  if (role) await db.query("insert into public.staff_members(user_id,display_name,role) values($1,$2,$3)", [id, "Local test owner", role]);

  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  let cookies = [];
  const auth = createServerClient(envFile.NEXT_PUBLIC_SUPABASE_URL, envFile.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: {name: "sb-cliqo-auth-token"},
    cookies: {getAll: () => [], setAll: (values) => { cookies = values; }},
  });
  const signedIn = await auth.auth.signInWithPassword({email, password});
  if (signedIn.error) throw new Error("Could not sign in a local test account");
  if (role) {
    const enrolled = await auth.auth.mfa.enroll({factorType: "totp"});
    if (enrolled.error) throw new Error("Could not enroll local owner MFA");
    const challenge = await auth.auth.mfa.challenge({factorId: enrolled.data.id});
    if (challenge.error) throw new Error("Could not challenge local owner MFA");
    const verified = await auth.auth.mfa.verify({factorId: enrolled.data.id, challengeId: challenge.data.id, code: totp(enrolled.data.totp.secret)});
    if (verified.error) throw new Error("Could not verify local owner MFA");
  }
  await context.addCookies(cookies.map((cookie) => ({
    name: cookie.name, value: cookie.value, url: base, httpOnly: cookie.options?.httpOnly ?? false, sameSite: "Lax",
  })));
  await context.addCookies([{name: "cliqo-locale", value: "en", url: base}]);
  const page = await context.newPage();
  page.setDefaultTimeout(20000); page.setDefaultNavigationTimeout(60000);
  return {id, context, page, auth};
}

async function waitForDb(sql, params, predicate, message) {
  let last;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await db.query(sql, params);
    last = result.rows[0] ?? null;
    if (predicate(result.rows[0])) return result.rows[0];
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${message}: ${JSON.stringify(last)}`);
}

async function attemptCleanup(label, fn) {
  try { await fn(); } catch { cleanupErrors.push(label); }
}

try {
  await db.connect(); dbConnected = true;
  configBefore = (await db.query("select * from app_private.checkout_config where id=true")).rows[0];
  policiesBefore = (await db.query("select * from app_private.store_policies order by policy_key,locale")).rows;
  auditBefore = Number((await db.query("select coalesce(max(id),0)::bigint as id from app_private.checkout_config_audit")).rows[0].id);
  const family = (await db.query("select id,state::text from public.product_families where family_key='stand' limit 1")).rows[0];
  assert.ok(family, "A local stand product family exists");
  fixture.familyId = family.id; fixture.familyState = family.state;

  const policyBody = "Local synthetic checkout test policy content. ".repeat(12);
  await db.query(
    "update app_private.store_policies set draft_body=$1,published_body=$1,published_by=null,published_at=now(),draft_updated_by=null,draft_updated_at=now()",
    [policyBody],
  );
  await db.query(
    `update app_private.checkout_config set sales_enabled=false,cod_enabled=true,card_enabled=false,
      carrier_name='Local synthetic carrier',shipping_minor=2000,carrier_integration_ready=true,
      card_gateway_name=null,card_gateway_ready=false,card_gateway_fingerprint=null,
      support_email='checkout@example.invalid',support_whatsapp=null,support_channel_ready=false,
      transactional_email_ready=true,transactional_email_fingerprint=$1,updated_by=null where id=true`,
    [emailFingerprint],
  );
  await db.query("update app_private.checkout_config set support_channel_ready=true,sales_enabled=true where id=true");
  const opened = (await db.query("select sales_enabled,cod_enabled,policies_approved from app_private.checkout_config where id=true")).rows[0];
  assert.deepEqual(opened, {sales_enabled: true, cod_enabled: true, policies_approved: true}, "Only the local checkout gates opened for the test");

  await db.query("update public.product_families set state='ready' where id=$1", [fixture.familyId]);
  await db.query(
    `insert into public.product_skus
      (id,product_family_id,sku_code,display_name,options,currency,price_minor,state,price_approved,sample_approved,fulfillment_approved)
     values($1,$2,$3,'Synthetic checkout stand',$4::jsonb,'EGP',10000,'ready',true,true,true)`,
    [fixture.skuId, fixture.familyId, "CQ-LOCAL-" + randomBytes(4).toString("hex").toUpperCase(), JSON.stringify({face: "all-in-one", design: "T0", variant: "Synthetic"})],
  );
  await db.query("insert into public.inventory_balances(sku_id,on_hand,reserved) values($1,1,0)", [fixture.skuId]);
  const item = (await db.query("insert into public.smart_items(sku_id,state) values($1,'ready') returning id,public_id", [fixture.skuId])).rows[0];
  fixture.itemId = item.id; fixture.publicId = item.public_id;
  const {issueActivationCode} = await import("../lib/activation-code-issuer.ts");
  await db.query("begin");
  try {
    const issued = await issueActivationCode(db, item.public_id);
    assert.match(issued.code, /^\d{6}$/);
    await db.query("insert into public.smart_item_activation_tokens(smart_item_id,token_hash,print_nonce) values($1,$2,$3)", [item.id, issued.tokenHash, issued.nonce]);
    fixture.activationCode = issued.code;
    await db.query("commit");
  } catch (error) { await db.query("rollback"); throw error; }

  customer = await createAccount(); fixture.customerId = customer.id;
  second = await createAccount(); fixture.secondId = second.id;
  owner = await createAccount("owner"); fixture.ownerId = owner.id;

  const page = await customer.auth.rpc("save_merchant_page", {
    p_page_id: null, p_display_name: "Synthetic customer profile", p_short_description: "Local test only",
    p_avatar_path: null, p_cover_path: null, p_is_published: true,
    p_links: [{id: null, label: "Website", destination_url: "https://example.com/local-start", is_enabled: true}],
  });
  assert.equal(page.error, null, "Customer can create the synthetic destination page");
  fixture.pageId = page.data;

  const cart = [{
    key: fixture.skuId, skuId: fixture.skuId, slug: "stand", name: "Synthetic checkout stand",
    unitPriceEgp: 100, quantity: 1, choices: ["Synthetic"],
    optionValues: {face: "all-in-one", design: "T0", variant: "Synthetic"},
  }];
  await customer.page.addInitScript((items) => {
    if (location.pathname === "/checkout") localStorage.setItem("cliqo-cart-v1", JSON.stringify(items));
  }, cart);
  let apiRequestKey = null;
  customer.page.on("request", (request) => {
    if (request.url().endsWith("/api/orders") && request.method() === "POST") {
      try { apiRequestKey = request.postDataJSON().requestKey; } catch { /* The API assertion reports failure. */ }
    }
  });
  await customer.page.goto(base + "/checkout", {waitUntil: "domcontentloaded"});
  await customer.page.locator("input[name=name]").waitFor();
  await customer.page.locator("button[type=submit]").waitFor();
  await customer.page.waitForFunction(() => Boolean(document.querySelector(".checkout-summary .checkout-total")));
  await customer.page.locator("input[name=name]").fill("Synthetic Local Buyer");
  await customer.page.locator("input[name=phone]").fill(fixture.phone);
  await customer.page.locator("input[name=email]").fill(fixture.buyerEmail);
  await customer.page.locator("input[name=governorate]").fill("Cairo");
  await customer.page.locator("input[name=city]").fill("Synthetic City");
  await customer.page.locator("input[name=street]").fill("1 Local Test Street");
  const orderResponsePromise = customer.page.waitForResponse((response) => response.url().endsWith("/api/orders") && response.request().method() === "POST");
  await customer.page.locator("form.checkout-form button[type=submit]").click();
  const orderResponse = await orderResponsePromise;
  assert.equal(orderResponse.status(), 201, "Checkout creates a synthetic COD order");
  assert.ok(apiRequestKey, "Checkout submits an idempotency key");
  const idempotencyHash = createHash("sha256").update(apiRequestKey).digest("hex");
  const order = await waitForDb(
    "select id,order_reference,state::text,payment_method::text,payment_state::text,subtotal_minor,shipping_minor,total_minor,email_locale from public.orders where idempotency_key=$1",
    [idempotencyHash], (row) => Boolean(row), "Synthetic order was not written to the database",
  );
  fixture.orderId = order.id; fixture.orderReference = order.order_reference;
  assert.match(fixture.orderReference, /^CQ-[0-9]{6,}$/);
  await customer.page.waitForURL((url) => url.pathname === "/orders/" + fixture.orderReference, {timeout: 30000});
  assert.deepEqual({state: order.state, payment_method: order.payment_method, payment_state: order.payment_state}, {
    state: "new", payment_method: "cod", payment_state: "cod_to_collect",
  });
  assert.equal(order.subtotal_minor, 10000);
  assert.equal(order.shipping_minor, 2000);
  assert.equal(order.total_minor, 12000);
  assert.equal(order.email_locale, "en");
  const line = (await db.query("select id,sku_id,quantity from public.order_lines where order_id=$1", [order.id])).rows[0];
  assert.ok(line); fixture.orderLineId = line.id;
  const outbox = (await db.query("select event_type,email_locale,payload from app_private.email_outbox where order_id=$1", [order.id])).rows;
  assert.equal(outbox.length, 1, "Order receipt was queued");
  assert.equal(outbox[0].event_type, "order_received");
  assert.equal(outbox[0].email_locale, "en");
  assert.equal("shipping_address" in outbox[0].payload, false, "Email queue excludes the address");

  await owner.page.goto(base + "/cliqo-control/orders?q=" + encodeURIComponent(fixture.orderReference), {waitUntil: "domcontentloaded"});
  const status = owner.page.locator("select.status-select").first();
  await status.waitFor();
  assert.equal(await status.inputValue(), "new");
  await status.selectOption("confirmed");
  await waitForDb(
    `select o.state::text, b.reserved, i.order_line_id
     from public.orders o join public.order_lines l on l.order_id=o.id
     join public.inventory_balances b on b.sku_id=l.sku_id
     join public.smart_items i on i.sku_id=l.sku_id where o.id=$1 and i.id=$2`,
    [order.id, fixture.itemId], (row) => row?.state === "confirmed" && row.reserved === 1 && row.order_line_id === line.id,
    "Confirming the order did not reserve stock and assign the prepared smart item",
  );
  assert.equal((await db.query("select count(*)::int as count from app_private.email_outbox where order_id=$1 and event_type='order_update'", [order.id])).rows[0].count, 1);

  await customer.page.goto(base + "/activate?item=" + fixture.publicId, {waitUntil: "domcontentloaded"});
  await customer.page.locator('[data-testid="activation-form"][data-hydrated="true"] #activation:not([disabled])').waitFor();
  await customer.page.locator("#activation").fill(fixture.activationCode);
  await customer.page.locator("button[type=submit]").click();
  await customer.page.waitForURL("**/dashboard/items/" + fixture.publicId, {timeout: 30000});
  const claimed = await db.query("select owner_user_id,state::text from public.smart_items where id=$1", [fixture.itemId]);
  assert.deepEqual(claimed.rows[0], {owner_user_id: customer.id, state: "claimed"});
  const wrongReuse = await second.auth.rpc("claim_stand_activation", {
    p_token_hash: createHash("sha256").update(fixture.activationCode).digest("hex"), p_public_id: fixture.publicId,
  });
  assert.equal(wrongReuse.error, null);
  assert.equal(wrongReuse.data, false, "A second account cannot re-use the activated item's code");

  const attached = await customer.auth.from("smart_items").update({landing_page_id: fixture.pageId}).eq("id", fixture.itemId).select("id");
  assert.equal(attached.error, null); assert.deepEqual(attached.data.map((row) => row.id), [fixture.itemId]);
  const linkRow = await customer.auth.from("merchant_page_links").select("id").eq("page_id", fixture.pageId).single();
  assert.equal(linkRow.error, null);
  await second.page.goto(base + "/s/" + fixture.publicId, {waitUntil: "domcontentloaded"});
  const linkPath = await second.page.locator('a[href*="/go/"]').getAttribute("href");
  assert.ok(linkPath.startsWith("/s/" + fixture.publicId + "/go/"));
  const firstRedirect = await second.context.request.get(base + linkPath, {maxRedirects: 0});
  assert.equal(firstRedirect.status(), 307);
  assert.equal(firstRedirect.headers()["location"], "https://example.com/local-start");
  const changed = await customer.auth.rpc("save_merchant_page", {
    p_page_id: fixture.pageId, p_display_name: "Synthetic customer profile", p_short_description: "Local test only",
    p_avatar_path: null, p_cover_path: null, p_is_published: true,
    p_links: [{id: linkRow.data.id, label: "Website", destination_url: "https://example.org/local-updated", is_enabled: true}],
  });
  assert.equal(changed.error, null);
  await second.page.reload({waitUntil: "domcontentloaded"});
  assert.equal(await second.page.locator('a[href*="/go/"]').getAttribute("href"), linkPath, "Public item URL stays fixed");
  const updatedRedirect = await second.context.request.get(base + linkPath, {maxRedirects: 0});
  assert.equal(updatedRedirect.status(), 307);
  assert.equal(updatedRedirect.headers()["location"], "https://example.org/local-updated");

  console.log("PASS: synthetic checkout order, COD totals, admin confirmation, stock reservation, per-piece activation across two accounts, one-time claim, and stable redirect destination");
} finally {
  await browser.close().catch(() => undefined);
  if (dbConnected) {
    await attemptCleanup("find synthetic order", async () => {
      if (!fixture.orderId) {
        const result = await db.query(
          "select id,order_reference from public.orders where email_snapshot=$1 order by created_at desc limit 1",
          [fixture.buyerEmail],
        );
        fixture.orderId = result.rows[0]?.id ?? null;
        fixture.orderReference = fixture.orderReference ?? result.rows[0]?.order_reference ?? null;
      }
      if (!fixture.orderLineId && fixture.orderId) {
        const result = await db.query("select id from public.order_lines where order_id=$1 limit 1", [fixture.orderId]);
        fixture.orderLineId = result.rows[0]?.id ?? null;
      }
    });
    await attemptCleanup("find synthetic order", async () => {
      if (!fixture.orderId && fixture.orderReference) {
        const result = await db.query("select id from public.orders where order_reference=$1", [fixture.orderReference]);
        fixture.orderId = result.rows[0]?.id ?? null;
      }
      if (!fixture.orderLineId && fixture.orderId) {
        const result = await db.query("select id from public.order_lines where order_id=$1", [fixture.orderId]);
        fixture.orderLineId = result.rows[0]?.id ?? null;
      }
    });
    await attemptCleanup("test item", async () => {
      if (fixture.itemId) await db.query("delete from public.smart_items where id=$1", [fixture.itemId]);
    });
    await attemptCleanup("order events", async () => {
      if (fixture.orderId) await db.query("delete from public.order_status_events where order_id=$1", [fixture.orderId]);
      if (fixture.orderLineId) await db.query("delete from public.order_line_status_events where order_line_id=$1", [fixture.orderLineId]);
    });
    await attemptCleanup("order notes and movements", async () => {
      if (fixture.orderId) await db.query("delete from public.order_notes where order_id=$1", [fixture.orderId]);
      if (fixture.orderLineId) await db.query("delete from public.inventory_movements where order_line_id=$1", [fixture.orderLineId]);
    });
    await attemptCleanup("test order", async () => {
      if (fixture.orderId) await db.query("delete from public.orders where id=$1", [fixture.orderId]);
      else if (fixture.orderReference) await db.query("delete from public.orders where order_reference=$1", [fixture.orderReference]);
    });
    await attemptCleanup("test customer", async () => {
      await db.query("delete from public.customers where phone_e164=$1", [fixture.phone]);
    });
    await attemptCleanup("synthetic SKU", async () => {
      await db.query("delete from public.inventory_balances where sku_id=$1", [fixture.skuId]);
      await db.query("delete from public.product_skus where id=$1", [fixture.skuId]);
    });
    await attemptCleanup("product family state", async () => {
      if (fixture.familyId && fixture.familyState) await db.query("update public.product_families set state=$2 where id=$1", [fixture.familyId, fixture.familyState]);
    });
    await attemptCleanup("store policy drafts", async () => {
      if (!policiesBefore) return;
      for (const policy of policiesBefore) {
        await db.query(
          `update app_private.store_policies set draft_body=$3,published_body=$4,draft_updated_by=$5,draft_updated_at=$6,
           published_by=$7,published_at=$8 where policy_key=$1 and locale=$2`,
          [policy.policy_key, policy.locale, policy.draft_body, policy.published_body, policy.draft_updated_by,
            policy.draft_updated_at, policy.published_by, policy.published_at],
        );
      }
    });
    await attemptCleanup("checkout settings", async () => {
      if (!configBefore) return;
      await db.query(
        `update app_private.checkout_config set sales_enabled=false,cod_enabled=$1,card_enabled=$2,
          carrier_name=$3,shipping_minor=$4,carrier_integration_ready=$5,card_gateway_name=$6,
          card_gateway_ready=$7,card_gateway_fingerprint=$8,policies_approved=$9,
          support_email=$10,support_whatsapp=$11,support_channel_ready=false,
          transactional_email_ready=$12,transactional_email_fingerprint=$13,updated_by=$14 where id=true`,
        [configBefore.cod_enabled, configBefore.card_enabled, configBefore.carrier_name, configBefore.shipping_minor,
          configBefore.carrier_integration_ready, configBefore.card_gateway_name, configBefore.card_gateway_ready,
          configBefore.card_gateway_fingerprint, configBefore.policies_approved, configBefore.support_email,
          configBefore.support_whatsapp, configBefore.transactional_email_ready,
          configBefore.transactional_email_fingerprint, configBefore.updated_by],
      );
      await db.query("update app_private.checkout_config set support_channel_ready=$1,sales_enabled=$2,updated_at=$3 where id=true", [
        configBefore.support_channel_ready, configBefore.sales_enabled, configBefore.updated_at,
      ]);
    });
    await attemptCleanup("synthetic gate audit", async () => {
      if (auditBefore !== undefined) await db.query("delete from app_private.checkout_config_audit where id>$1", [auditBefore]);
    });
    await attemptCleanup("verify local cleanup", async () => {
      const left = await db.query(
        `select (select count(*)::int from public.orders where order_reference=$1) as orders,
          (select count(*)::int from public.customers where phone_e164=$2) as customers,
          (select count(*)::int from public.product_skus where id=$3) as skus,
          (select count(*)::int from public.smart_items where id=$4) as items,
          (select sales_enabled from app_private.checkout_config where id=true) as sales_enabled`,
        [fixture.orderReference ?? "", fixture.phone, fixture.skuId, fixture.itemId ?? randomUUID()],
      );
      assert.equal(left.rows[0].orders, 0);
      assert.equal(left.rows[0].customers, 0);
      assert.equal(left.rows[0].skus, 0);
      assert.equal(left.rows[0].items, 0);
      assert.equal(left.rows[0].sales_enabled, configBefore?.sales_enabled);
    });
    for (const id of users) await attemptCleanup("test account", async () => { await admin.auth.admin.deleteUser(id); });
    await db.end().catch(() => undefined);
  }
  if (cleanupErrors.length) {
    console.error("Cleanup needs attention: " + cleanupErrors.join(", "));
    process.exitCode = 1;
  }
}
