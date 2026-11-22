import "server-only";
import { isPrintedLinkFace, matchesPrintedDestination } from "@/lib/smart-item-destination";
import { hasTestCheckoutSession } from "@/lib/test-checkout-session";
import {getCopy} from "@/i18n/server";
import {skuLabel} from "@/i18n/catalog";
import { getDb } from "@/lib/db";
import {emailTransportFingerprint} from "@/lib/email";
import {getPaymobConfig, paymobConfigFingerprint, paymobSandboxTestingAllowed} from "@/lib/paymob";

export type CheckoutItem = { sku_id: string; quantity: number; business_name?: string; destination_url?: string; design_brief?: string };
type SaleSku = {
  id: string; sku_code: string; display_name: string; options: Record<string, string>;
  price_minor: number; family_state: string; family_key: string; catalog_sale_ends_at: string | null; catalog_visible: boolean; catalog_deleted_at: string | null;
  state: string; price_approved: boolean; sample_approved: boolean;
  fulfillment_approved: boolean; on_hand: number | null; reserved: number | null;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CheckoutError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function parseCheckoutItems(value: unknown): CheckoutItem[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new CheckoutError("السلة غير صالحة.", 400);
  }
  const seen = new Set<string>();
  return value.map((item) => {
    const row = item && typeof item === "object" ? item as Partial<CheckoutItem> : {};
    const skuId = typeof row.sku_id === "string" ? row.sku_id.toLowerCase() : "";
    const businessName = typeof row.business_name === "string" ? row.business_name.trim() : "";
    const destinationUrl = typeof row.destination_url === "string" ? row.destination_url.trim() : "";
    const designBrief = typeof row.design_brief === "string" ? row.design_brief.trim() : "";
    const customFieldsValid = (!businessName && !destinationUrl) || (
      businessName.length >= 1 && businessName.length <= 100 && destinationUrl.length <= 2048 &&
      /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:[/?#][^\s]*)?$/i.test(destinationUrl)
    );
    const lineKey = JSON.stringify([skuId, businessName, destinationUrl]);
    if (!item || typeof item !== "object" || !uuid.test(skuId)
        || !Number.isInteger(row.quantity) || (row.quantity ?? 0) < 1 || (row.quantity ?? 0) > 20
        || !customFieldsValid || designBrief.length > 1200 || (designBrief && !businessName) || seen.has(lineKey)) {
      throw new CheckoutError("راجع المنتجات والكميات في السلة.", 400);
    }
    seen.add(lineKey);
    return {
      sku_id: skuId, quantity: row.quantity!,
      ...(businessName ? { business_name: businessName, destination_url: destinationUrl, ...(designBrief ? { design_brief: designBrief } : {}) } : {}),
    };
  });
}

export async function getCheckoutConfig() {
  if (!process.env.CLIQO_DATABASE_URL) return null;
  const emailFingerprint = emailTransportFingerprint();
  const paymobConfig = getPaymobConfig();
  const paymobFingerprint = paymobConfig ? paymobConfigFingerprint(paymobConfig) : null;
  try {
    const { rows } = await getDb().query<{
      sales_enabled: boolean; cod_enabled: boolean; card_enabled: boolean;
      carrier_name: string | null; shipping_minor: number | null; carrier_integration_ready: boolean;
      card_gateway_name: string | null; card_gateway_ready: boolean; card_gateway_fingerprint: string | null;
      policies_approved: boolean; support_channel_ready: boolean;
      transactional_email_ready: boolean; transactional_email_fingerprint: string | null;
    }>("select sales_enabled,cod_enabled,card_enabled,carrier_name,shipping_minor,carrier_integration_ready," +
      "card_gateway_name,card_gateway_ready,card_gateway_fingerprint,policies_approved,support_channel_ready,transactional_email_ready," +
      "transactional_email_fingerprint from app_private.checkout_config where id=true");
    const config = rows[0];
    if (await hasTestCheckoutSession()) {
      if (!config || config.sales_enabled || config.cod_enabled || config.card_enabled) return null;
      return {
        testMode: true, carrierName: "", shippingMinor: 0, codEnabled: false, cardEnabled: false,
        cardMode: null, paymentMethods: {cod: false, card: false},
      };
    }
    const emailReady = Boolean(emailFingerprint && config?.transactional_email_ready
      && config.transactional_email_fingerprint === emailFingerprint);
    const codEnabled = Boolean(config?.cod_enabled && config.carrier_integration_ready);
    const sandboxMode = Boolean(paymobConfig && paymobSandboxTestingAllowed(paymobConfig));
    const cardEnabled = Boolean(config?.card_enabled && config.card_gateway_ready
      && config.card_gateway_name === "Paymob" && paymobFingerprint
      && config.card_gateway_fingerprint === paymobFingerprint && paymobConfig
      && (paymobConfig.mode === "live" || paymobSandboxTestingAllowed(paymobConfig)));
    if (sandboxMode && cardEnabled) {
      return {
        testMode: false,
        carrierName: config?.carrier_name ?? "Paymob Sandbox",
        shippingMinor: config?.shipping_minor ?? 0,
        codEnabled: false,
        cardEnabled: true,
        cardMode: "test" as const,
        paymentMethods: {cod: false, card: true},
      };
    }
    if (!config?.sales_enabled || !config.carrier_integration_ready || !config.carrier_name
        || config.shipping_minor === null || !config.policies_approved || !config.support_channel_ready
        || !emailReady || (!codEnabled && !cardEnabled)) return null;
    return {
      testMode: false,
      carrierName: config.carrier_name,
      shippingMinor: config.shipping_minor,
      codEnabled,
      cardEnabled,
      cardMode: cardEnabled ? paymobConfig?.mode ?? null : null,
      paymentMethods: {cod: codEnabled, card: cardEnabled},
    };
  } catch {
    return null;
  }
}

export async function getCheckoutQuote(items: CheckoutItem[]) {
  const tr = await getCopy();
  const config = await getCheckoutConfig();
  if (!config) throw new CheckoutError("استقبال الطلبات غير متاح حاليًا.", 503);
  const ids = items.map((item) => item.sku_id);
  const { rows } = await getDb().query<SaleSku>(
    "select s.id,s.sku_code,s.display_name,s.options,s.price_minor,s.state,f.state as family_state,f.family_key,f.catalog_sale_ends_at," +
    "s.price_approved,s.sample_approved,s.fulfillment_approved,b.on_hand,b.reserved,f.catalog_visible,f.catalog_deleted_at " +
    "from public.product_skus s join public.product_families f on f.id=s.product_family_id " +
    "left join public.inventory_balances b on b.sku_id=s.id " +
    "where s.id=any($1::uuid[]) and s.checkout_test=$2",
    [ids, config.testMode]
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const requestedBySku = new Map<string, number>();
  for (const item of items) requestedBySku.set(item.sku_id, (requestedBySku.get(item.sku_id) ?? 0) + item.quantity);
  const lines = items.map((item) => {
    const sku = byId.get(item.sku_id);
    const customTier = sku?.options?.design === "T1" || sku?.options?.design === "T2";
    const hasCustomFields = Boolean(item.business_name && item.destination_url);
    if (customTier !== hasCustomFields) {
      throw new CheckoutError("أكمل بيانات التصميم المخصص أو اختار نسخة التصميم المناسبة.", 400);
    }
    if (customTier && item.destination_url && isPrintedLinkFace(sku?.options.face)) {
      let host = "";
      try { host = new URL(item.destination_url).hostname.toLowerCase(); } catch { /* Report through the validation below. */ }
      if (!matchesPrintedDestination(host, sku?.options.face)) {
        throw new CheckoutError("الرابط الأول لازم يطابق الاستخدام المطبوع على القطعة.", 400);
      }
    }
    if (sku?.options?.design === "T2" && !item.design_brief) {
      throw new CheckoutError("اكتب تفاصيل التصميم المطلوب.", 400);
    }
    const eligible = sku && (config.testMode
      ? sku.catalog_visible && !sku.catalog_deleted_at && sku.state === "preparing" && sku.family_state !== "paused"
      : sku.state === "ready" && sku.family_state === "ready" && sku.price_approved && sku.sample_approved && sku.fulfillment_approved
        && (sku.catalog_sale_ends_at === null || Date.parse(sku.catalog_sale_ends_at) > Date.now()));
    if (!sku || !eligible || !sku.price_minor
        || (sku.on_hand ?? 0) - (sku.reserved ?? 0) < (requestedBySku.get(item.sku_id) ?? item.quantity)) {
      throw new CheckoutError("منتج في السلة غير متاح بالكمية المطلوبة. راجع السلة.", 409);
    }
    return {
      skuId: sku.id, skuCode: sku.sku_code, name: skuLabel(tr, sku.family_key, sku.options, sku.display_name),
      quantity: item.quantity, unitPriceMinor: sku.price_minor,
      lineTotalMinor: sku.price_minor * item.quantity,
      ...(customTier ? { designTier: sku.options.design, businessName: item.business_name } : {}),
    };
  });
  const subtotalMinor = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  const totalMinor = subtotalMinor + config.shippingMinor;
  if (totalMinor > 2_000_000_000) throw new CheckoutError("قيمة الطلب أكبر من الحد المسموح.", 400);
  return {
    lines, subtotalMinor, shippingMinor: config.shippingMinor, totalMinor, carrierName: config.carrierName,
    paymentMethods: config.paymentMethods, cardMode: config.cardMode, testMode: config.testMode,
  };
}
