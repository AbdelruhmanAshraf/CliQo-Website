"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/admin";
import { getDb } from "@/lib/db";
import {EmailDeliveryError, emailTransportFingerprint, sendEmailTest} from "@/lib/email";
import {getPaymobConfig, paymobConfigFingerprint, paymobSandboxTestingAllowed} from "@/lib/paymob";

type CheckoutConfig = {
  sales_enabled: boolean;
  cod_enabled: boolean;
  card_enabled: boolean;
  carrier_name: string | null;
  shipping_minor: number | null;
  card_gateway_name: string | null;
  card_gateway_ready: boolean;
  card_gateway_fingerprint: string | null;
  carrier_integration_ready: boolean;
  policies_approved: boolean;
  support_channel_ready: boolean;
  support_email: string | null;
  support_whatsapp: string | null;
  transactional_email_ready: boolean;
  transactional_email_fingerprint: string | null;
};

const fail = (code: string): never => redirect(`/admin/settings?error=${encodeURIComponent(code)}`);
const isChecked = (formData: FormData, name: string) => formData.get(name) === "on";
const optionalText = (formData: FormData, name: string, maxLength = 120) => {
  const value = String(formData.get(name) ?? "").trim();
  if (value.length > maxLength || (value.length > 0 && value.length < 2)) return undefined;
  return value || null;
};

export async function updateCheckoutSettings(formData: FormData) {
  const { staff } = await requireStaff(["owner"]);

  const reason = String(formData.get("change_reason") ?? "").trim();
  const carrierName = optionalText(formData, "carrier_name");
  const gatewayName = optionalText(formData, "card_gateway_name");
  const rawSupportEmail = optionalText(formData, "support_email", 254);
  const rawWhatsapp = String(formData.get("support_whatsapp") ?? "").trim().replace(/^\+/, "");
  const shippingInput = String(formData.get("shipping_egp") ?? "").trim();
  if (reason.length < 3 || reason.length > 500) fail("reason");
  if (carrierName === undefined || gatewayName === undefined || rawSupportEmail === undefined) fail("invalid");
  const supportEmail = rawSupportEmail?.toLowerCase() ?? null;
  const supportWhatsapp = rawWhatsapp || null;
  if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) fail("support-details");
  if (supportWhatsapp && !/^[1-9][0-9]{7,14}$/.test(supportWhatsapp)) fail("support-details");

  let shippingMinor: number | null = null;
  if (shippingInput) {
    if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(shippingInput)) fail("invalid");
    shippingMinor = Math.round(Number(shippingInput) * 100);
    if (!Number.isSafeInteger(shippingMinor) || shippingMinor < 0 || shippingMinor > 100_000_000) fail("invalid");
  }

  const desired = {
    sales_enabled: isChecked(formData, "sales_enabled"),
    cod_enabled: isChecked(formData, "cod_enabled"),
    card_enabled: isChecked(formData, "card_enabled"),
    support_channel_ready: isChecked(formData, "support_channel_ready"),
  };
  const paymobConfig = getPaymobConfig();
  const paymobFingerprint = paymobConfig ? paymobConfigFingerprint(paymobConfig) : null;
  if (desired.support_channel_ready && !supportEmail && !supportWhatsapp) fail("support-details");

  const client = await getDb().connect();
  let errorCode: string | null = null;
  let supportChanged = false;
  let emailNeedsTest = false;
  try {
    await client.query("begin");
    const currentResult = await client.query<CheckoutConfig>(
      `select sales_enabled,cod_enabled,card_enabled,carrier_name,shipping_minor,
              card_gateway_name,card_gateway_ready,card_gateway_fingerprint,carrier_integration_ready,
              policies_approved,support_channel_ready,support_email,support_whatsapp,
              transactional_email_ready,transactional_email_fingerprint
       from app_private.checkout_config where id=true for update`,
    );
    const current = currentResult.rows[0];
    if (!current) {
      errorCode = "save";
      await client.query("rollback");
    } else {
      const currentCardGatewayReady = Boolean(current.card_gateway_ready
        && current.card_gateway_fingerprint === paymobFingerprint && gatewayName === "Paymob"
        && paymobConfig && (paymobConfig.mode === "live" || paymobSandboxTestingAllowed(paymobConfig)));
      supportChanged = supportEmail !== current.support_email || supportWhatsapp !== current.support_whatsapp;
      const supportReady = !supportChanged && desired.support_channel_ready && Boolean(supportEmail || supportWhatsapp);
      const emailReady = Boolean(current.transactional_email_ready
        && current.transactional_email_fingerprint
        && current.transactional_email_fingerprint === emailTransportFingerprint());
      emailNeedsTest = desired.sales_enabled && !emailReady;
      let salesEnabled = desired.sales_enabled && !emailNeedsTest;
      if (supportChanged || (current.sales_enabled && (!supportReady || !emailReady))) salesEnabled = false;

      if (desired.cod_enabled && !current.carrier_integration_ready) errorCode = "carrier";
      else if (desired.card_enabled && !currentCardGatewayReady) errorCode = "gateway";
      else if (desired.card_enabled && gatewayName !== "Paymob") errorCode = "gateway-name";
      else if (desired.cod_enabled && (!carrierName || shippingMinor === null)) errorCode = "carrier-details";
      else if (desired.sales_enabled && !current.sales_enabled && !supportReady) errorCode = "gate";

      if (!errorCode && salesEnabled) {
        const paymentReady = (desired.cod_enabled && current.carrier_integration_ready)
          || (desired.card_enabled && currentCardGatewayReady);
        if (!current.carrier_integration_ready || !paymentReady || !current.policies_approved || !supportReady || !emailReady) {
          errorCode = "gate";
        } else {
          const inventory = await client.query<{ available_skus: number }>(
            `select count(*)::int as available_skus
             from public.product_skus s
             join public.product_families f on f.id=s.product_family_id
             join public.inventory_balances b on b.sku_id=s.id
             where s.state='ready' and f.state='ready' and s.price_minor is not null
               and s.price_approved and s.sample_approved and s.fulfillment_approved
               and b.on_hand > b.reserved`,
          );
          if ((inventory.rows[0]?.available_skus ?? 0) < 1) errorCode = "inventory";
        }
      }

      if (errorCode) {
        await client.query("rollback");
      } else {
        const updatedResult = await client.query<CheckoutConfig>(
          `update app_private.checkout_config
           set sales_enabled=$1, cod_enabled=$2, card_enabled=$3, carrier_name=$4,
               shipping_minor=$5, card_gateway_name=$6,
               support_email=$7, support_whatsapp=$8,
               support_channel_ready=$9, updated_by=$10, updated_at=now()
           where id=true
           returning sales_enabled,cod_enabled,card_enabled,carrier_name,shipping_minor,
                     card_gateway_name,card_gateway_ready,card_gateway_fingerprint,carrier_integration_ready,
                     policies_approved,support_channel_ready,support_email,support_whatsapp,
                     transactional_email_ready,transactional_email_fingerprint`,
          [salesEnabled, desired.cod_enabled, desired.card_enabled, carrierName, shippingMinor,
            gatewayName, supportEmail, supportWhatsapp, supportReady, staff.user_id],
        );
        const updated = updatedResult.rows[0];
        if (!updated) throw new Error("Checkout settings were not returned after update.");
        await client.query(
          `insert into app_private.checkout_config_audit(changed_by,previous_state,next_state,change_reason)
           values($1,$2::jsonb,$3::jsonb,$4)`,
          [staff.user_id, JSON.stringify(current), JSON.stringify(updated), reason],
        );
        await client.query("commit");
      }
    }
  } catch {
    await client.query("rollback").catch(() => undefined);
    errorCode = "save";
  } finally {
    client.release();
  }

  if (errorCode) fail(errorCode);
  revalidatePath("/admin/settings");
  revalidatePath("/checkout");
  revalidatePath("/products");
  revalidatePath("/contact");
  revalidatePath("/");
  if (supportChanged) redirect("/admin/settings?saved=support-reset");
  if (emailNeedsTest) redirect("/admin/settings?saved=email-required");
  redirect("/admin/settings?saved=1");
}

export async function recordPaymobGatewayReadiness(formData: FormData) {
  const {staff} = await requireStaff(["owner"]);
  const ready = formData.get("gateway_ready") === "true";
  const reason = String(formData.get("gateway_reason") ?? "").trim();
  if (reason.length < 3 || reason.length > 500) fail("reason");
  const config = getPaymobConfig();
  const sandbox = Boolean(config && paymobSandboxTestingAllowed(config));
  if (ready && (!config || (config.mode !== "live" && !sandbox))) fail("paymob-config");
  if (ready && (sandbox
      ? (!isChecked(formData, "confirm_sandbox") || !isChecked(formData, "confirm_webhooks"))
      : (!isChecked(formData, "confirm_sandbox") || !isChecked(formData, "confirm_live")
        || !isChecked(formData, "confirm_webhooks") || !isChecked(formData, "confirm_refunds")))) {
    fail("paymob-confirmations");
  }
  const fingerprint = ready && config ? paymobConfigFingerprint(config) : null;
  const client = await getDb().connect();
  try {
    await client.query("begin");
    const previous = await client.query("select * from app_private.checkout_config where id=true for update");
    if (!previous.rows[0]) throw new Error("Checkout settings are unavailable.");
    const updated = await client.query(
      "update app_private.checkout_config set card_gateway_name=case when $1 then 'Paymob' else card_gateway_name end, " +
      "card_gateway_ready=$1,card_gateway_fingerprint=$2,card_enabled=case when $1 then card_enabled else false end, " +
      "sales_enabled=case when not $1 and not cod_enabled then false else sales_enabled end,updated_by=$3,updated_at=now() " +
      "where id=true returning *",
      [ready, fingerprint, staff.user_id],
    );
    await client.query(
      "insert into app_private.checkout_config_audit(changed_by,previous_state,next_state,change_reason) " +
      "values($1,$2::jsonb,$3::jsonb,$4)",
      [staff.user_id, JSON.stringify(previous.rows[0]), JSON.stringify(updated.rows[0]), reason],
    );
    await client.query("commit");
  } catch {
    await client.query("rollback").catch(() => undefined);
    fail("save");
  } finally { client.release(); }
  revalidatePath("/admin/settings");
  revalidatePath("/checkout");
  revalidatePath("/products");
  revalidatePath("/");
  redirect(ready ? "/admin/settings?saved=card-ready" : "/admin/settings?saved=card-revoked");
}

export async function testTransactionalEmail(formData: FormData) {
  const {staff} = await requireStaff(["owner"]);
  const recipient = String(formData.get("test_recipient") ?? "").trim().toLowerCase();
  if (recipient.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) fail("email-address");

  let testedFingerprint: string | null = null;
  try {
    testedFingerprint = await sendEmailTest(recipient);
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      fail(error.code === "not-configured" ? "email-config" : error.code === "invalid-config" ? "email-address" : "email-delivery");
    }
    fail("email-delivery");
  }
  if (!testedFingerprint || testedFingerprint !== emailTransportFingerprint()) fail("email-config");
  const verifiedFingerprint = testedFingerprint;

  const client = await getDb().connect();
  let saveFailed = false;
  try {
    await client.query("begin");
    const current = await client.query<{
      sales_enabled: boolean; transactional_email_ready: boolean; transactional_email_fingerprint: string | null;
    }>(
      "select sales_enabled,transactional_email_ready,transactional_email_fingerprint " +
      "from app_private.checkout_config where id=true for update",
    );
    const before = current.rows[0];
    if (!before) {
      saveFailed = true;
      await client.query("rollback");
    } else {
      const changedFingerprint = before.transactional_email_fingerprint !== verifiedFingerprint;
      const updated = await client.query(
        "update app_private.checkout_config set sales_enabled=case when $3 then false else sales_enabled end," +
        "transactional_email_ready=true,transactional_email_fingerprint=$1,updated_by=$2,updated_at=now() where id=true " +
        "returning sales_enabled,transactional_email_ready,transactional_email_fingerprint",
        [verifiedFingerprint, staff.user_id, changedFingerprint],
      );
      const after = updated.rows[0];
      if (!after) throw new Error("Email readiness update returned no row.");
      await client.query(
        "insert into app_private.checkout_config_audit(changed_by,previous_state,next_state,change_reason) " +
        "values($1,$2::jsonb,$3::jsonb,$4)",
        [staff.user_id, JSON.stringify(before), JSON.stringify(after), "Owner received a transactional email test successfully."],
      );
      await client.query("commit");
    }
  } catch {
    await client.query("rollback").catch(() => undefined);
    saveFailed = true;
  } finally {
    client.release();
  }

  if (saveFailed) fail("email-save");
  revalidatePath("/admin/settings");
  revalidatePath("/checkout");
  redirect("/admin/settings?saved=email-tested");
}

export async function retryFailedOrderEmails() {
  const {staff} = await requireStaff(["owner"]);
  const fingerprint = emailTransportFingerprint();
  if (!fingerprint) fail("email-config");
  const readiness = await getDb().query<{transactional_email_ready: boolean; transactional_email_fingerprint: string | null}>(
    "select transactional_email_ready,transactional_email_fingerprint from app_private.checkout_config where id=true",
  );
  const emailConfig = readiness.rows[0];
  if (!emailConfig?.transactional_email_ready || emailConfig.transactional_email_fingerprint !== fingerprint) fail("email-config");
  const client = await getDb().connect();
  let retryCount = 0;
  try {
    await client.query("begin");
    const result = await client.query(
      "with selected as (" +
      "select id from app_private.email_outbox where status='failed' and created_at > now() - interval '90 days' " +
      "order by created_at for update skip locked limit 1000" +
      ") update app_private.email_outbox as queued set status='queued',attempts=0,available_at=now()," +
      "locked_at=null,sent_at=null,last_error_code=null from selected where queued.id=selected.id returning queued.id",
    );
    retryCount = result.rowCount ?? 0;
    await client.query(
      "insert into app_private.email_delivery_audit(changed_by,action,affected_count) values($1,'retry_failed',$2)",
      [staff.user_id, retryCount],
    );
    await client.query("commit");
  } catch {
    await client.query("rollback").catch(() => undefined);
    fail("email-retry");
  } finally {
    client.release();
  }
  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=email-retried&count=" + retryCount);
}
