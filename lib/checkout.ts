import "server-only";
import {getCopy} from "@/i18n/server";
import {skuLabel} from "@/i18n/catalog";
import { getDb } from "@/lib/db";

export type CheckoutItem = { sku_id: string; quantity: number; business_name?: string; destination_url?: string };
type SaleSku = {
  id: string; sku_code: string; display_name: string; options: Record<string, string>;
  price_minor: number; family_state: string; family_key: string;
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
    const customFieldsValid = (!businessName && !destinationUrl) || (
      businessName.length >= 1 && businessName.length <= 100 && destinationUrl.length <= 2048 &&
      /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:[/?#][^\s]*)?$/i.test(destinationUrl)
    );
    const lineKey = JSON.stringify([skuId, businessName, destinationUrl]);
    if (!item || typeof item !== "object" || !uuid.test(skuId)
        || !Number.isInteger(row.quantity) || (row.quantity ?? 0) < 1 || (row.quantity ?? 0) > 20
        || !customFieldsValid || seen.has(lineKey)) {
      throw new CheckoutError("راجع المنتجات والكميات في السلة.", 400);
    }
    seen.add(lineKey);
    return {
      sku_id: skuId, quantity: row.quantity!,
      ...(businessName ? { business_name: businessName, destination_url: destinationUrl } : {}),
    };
  });
}

export async function getCheckoutConfig() {
  if (!process.env.CLIQO_DATABASE_URL) return null;
  try {
    const { rows } = await getDb().query<{
      sales_enabled: boolean; cod_enabled: boolean; carrier_name: string | null; shipping_minor: number | null;
    }>("select sales_enabled,cod_enabled,carrier_name,shipping_minor from app_private.checkout_config where id=true");
    const config = rows[0];
    if (!config?.sales_enabled || !config.cod_enabled || !config.carrier_name || config.shipping_minor === null) return null;
    return { carrierName: config.carrier_name, shippingMinor: config.shipping_minor };
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
    "select s.id,s.sku_code,s.display_name,s.options,s.price_minor,s.state,f.state as family_state,f.family_key," +
    "s.price_approved,s.sample_approved,s.fulfillment_approved,b.on_hand,b.reserved " +
    "from public.product_skus s join public.product_families f on f.id=s.product_family_id " +
    "left join public.inventory_balances b on b.sku_id=s.id " +
    "where s.id=any($1::uuid[])",
    [ids]
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
    if (!sku || sku.state !== "ready" || sku.family_state !== "ready"
        || !sku.price_approved || !sku.sample_approved
        || !sku.fulfillment_approved || !sku.price_minor
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
  return { lines, subtotalMinor, shippingMinor: config.shippingMinor, totalMinor, carrierName: config.carrierName };
}
