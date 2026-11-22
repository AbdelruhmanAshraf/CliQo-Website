import "server-only";
import { hasTestCheckoutSession } from "@/lib/test-checkout-session";
import {getCopy} from "@/i18n/server";
import {skuLabel} from "@/i18n/catalog";
import { getDb } from "@/lib/db";
import {getPaymobConfig, paymobConfigFingerprint, paymobSandboxTestingAllowed} from "@/lib/paymob";

export type SaleSku = {
  id: string;
  skuCode: string;
  displayName: string;
  options: Record<string, string>;
  priceEgp: number;
  available: number;
};

export async function getSaleFamilyKeys(): Promise<Set<string>> {
  if (!process.env.CLIQO_DATABASE_URL) return new Set();
  try {
  const paymobConfig = getPaymobConfig();
  const paymobFingerprint = paymobConfig && (paymobConfig.mode === "live" || paymobSandboxTestingAllowed(paymobConfig))
    ? paymobConfigFingerprint(paymobConfig) : null;
  const sandboxMode = Boolean(paymobConfig && paymobSandboxTestingAllowed(paymobConfig));
  if (await hasTestCheckoutSession()) {
    const { rows } = await getDb().query<{family_key: string}>(`
      select distinct f.family_key from public.product_families f
      join public.product_skus s on s.product_family_id=f.id
      join public.inventory_balances b on b.sku_id=s.id
      cross join app_private.checkout_config c
      where s.checkout_test and b.on_hand>b.reserved and f.catalog_visible and f.catalog_deleted_at is null
      and f.state<>'paused' and c.id and not c.sales_enabled and not c.cod_enabled and not c.card_enabled`);
    return new Set(rows.map(row=>row.family_key));
  }
  const { rows } = await getDb().query<{ family_key: string }>(
    "select distinct f.family_key from public.product_families f " +
    "join public.product_skus s on s.product_family_id=f.id " +
    "join public.inventory_balances b on b.sku_id=s.id " +
    "cross join app_private.checkout_config c " +
    "where not s.checkout_test and f.state='ready' and f.catalog_visible and f.catalog_deleted_at is null and (f.catalog_sale_ends_at is null or f.catalog_sale_ends_at>now()) and s.state='ready' and s.price_approved " +
    "and s.sample_approved and s.fulfillment_approved and s.price_minor is not null " +
    "and b.on_hand>b.reserved and c.id=true " +
    "and ((c.sales_enabled and ((c.cod_enabled and c.carrier_integration_ready) or " +
    "(c.card_enabled and c.card_gateway_ready and c.card_gateway_name='Paymob' and c.card_gateway_fingerprint=$1::text)) " +
    "and c.carrier_name is not null and c.shipping_minor is not null) or " +
    "($2::boolean and c.card_enabled and c.card_gateway_ready and c.card_gateway_name='Paymob' and c.card_gateway_fingerprint=$1::text))",
    [paymobFingerprint, sandboxMode]
  );
  return new Set(rows.map((row) => row.family_key));
  } catch { return new Set(); }
}

export async function getSaleSkus(familyKey: string): Promise<SaleSku[]> {
  if (!process.env.CLIQO_DATABASE_URL) return [];
  try {
  const paymobConfig = getPaymobConfig();
  const paymobFingerprint = paymobConfig && (paymobConfig.mode === "live" || paymobSandboxTestingAllowed(paymobConfig))
    ? paymobConfigFingerprint(paymobConfig) : null;
  const sandboxMode = Boolean(paymobConfig && paymobSandboxTestingAllowed(paymobConfig));
  const testMode = await hasTestCheckoutSession();
  const { rows } = await getDb().query<{
    id: string; sku_code: string; display_name: string; options: Record<string, string>;
    price_minor: number; available: number;
  }>(
    "select s.id,s.sku_code,s.display_name,s.options,s.price_minor," +
    "(b.on_hand-b.reserved) as available from public.product_skus s " +
    "join public.product_families f on f.id=s.product_family_id " +
    "join public.inventory_balances b on b.sku_id=s.id " +
    "cross join app_private.checkout_config c " +
    "where f.family_key=$1 and f.catalog_visible and f.catalog_deleted_at is null " +
    "and s.price_minor is not null and b.on_hand>b.reserved and c.id and " +
    "(($4::boolean and s.checkout_test and f.state<>'paused' and not c.sales_enabled and not c.cod_enabled and not c.card_enabled) or " +
    "(not $4::boolean and not s.checkout_test and f.state='ready' and s.state='ready' " +
    "and (f.catalog_sale_ends_at is null or f.catalog_sale_ends_at>now()) " +
    "and s.price_approved and s.sample_approved and s.fulfillment_approved " +
    "and ((c.sales_enabled and ((c.cod_enabled and c.carrier_integration_ready) or " +
    "(c.card_enabled and c.card_gateway_ready and c.card_gateway_name='Paymob' and c.card_gateway_fingerprint=$2::text)) " +
    "and c.carrier_name is not null and c.shipping_minor is not null) or " +
    "($3::boolean and c.card_enabled and c.card_gateway_ready and c.card_gateway_name='Paymob' and c.card_gateway_fingerprint=$2::text)))) " +
    "order by s.sku_code",
    [familyKey, paymobFingerprint, sandboxMode, testMode]
  );
  const tr = await getCopy();
  return rows.map((row) => ({
    id: row.id, skuCode: row.sku_code, displayName: skuLabel(tr, familyKey, row.options, row.display_name),
    options: row.options, priceEgp: row.price_minor / 100, available: row.available,
  }));
  } catch { return []; }
}
