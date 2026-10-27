import "server-only";
import {getCopy} from "@/i18n/server";
import {skuLabel} from "@/i18n/catalog";
import { getDb } from "@/lib/db";

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
  const { rows } = await getDb().query<{ family_key: string }>(
    "select distinct f.family_key from public.product_families f " +
    "join public.product_skus s on s.product_family_id=f.id " +
    "join public.inventory_balances b on b.sku_id=s.id " +
    "cross join app_private.checkout_config c " +
    "where f.state='ready' and s.state='ready' and s.price_approved " +
    "and s.sample_approved and s.fulfillment_approved and s.price_minor is not null " +
    "and b.on_hand>b.reserved and c.id=true and c.sales_enabled and c.cod_enabled " +
    "and c.carrier_name is not null and c.shipping_minor is not null"
  );
  return new Set(rows.map((row) => row.family_key));
  } catch { return new Set(); }
}

export async function getSaleSkus(familyKey: string): Promise<SaleSku[]> {
  if (!process.env.CLIQO_DATABASE_URL) return [];
  try {
  const { rows } = await getDb().query<{
    id: string; sku_code: string; display_name: string; options: Record<string, string>;
    price_minor: number; available: number;
  }>(
    "select s.id,s.sku_code,s.display_name,s.options,s.price_minor," +
    "(b.on_hand-b.reserved) as available from public.product_skus s " +
    "join public.product_families f on f.id=s.product_family_id " +
    "join public.inventory_balances b on b.sku_id=s.id " +
    "cross join app_private.checkout_config c " +
    "where f.family_key=$1 and f.state='ready' and s.state='ready' " +
    "and s.price_approved and s.sample_approved and s.fulfillment_approved " +
    "and s.price_minor is not null and b.on_hand>b.reserved " +
    "and c.id=true and c.sales_enabled and c.cod_enabled " +
    "and c.carrier_name is not null and c.shipping_minor is not null " +
    "order by s.sku_code",
    [familyKey]
  );
  const tr = await getCopy();
  return rows.map((row) => ({
    id: row.id, skuCode: row.sku_code, displayName: skuLabel(tr, familyKey, row.options, row.display_name),
    options: row.options, priceEgp: row.price_minor / 100, available: row.available,
  }));
  } catch { return []; }
}
