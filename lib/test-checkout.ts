import "server-only";
import { createHash } from "node:crypto";
import { getCatalogProducts } from "@/lib/catalog";
import { designsForProduct } from "@/lib/catalog-designs";
import { getDb } from "@/lib/db";
import { issueActivationCode } from "@/lib/activation-code-issuer";
import { CheckoutError, type CheckoutItem } from "@/lib/checkout";
import { testCheckoutEnabled } from "@/lib/test-checkout-session";
import type { PoolClient } from "pg";

const testFamilies = ["stand", "coaster", "pvc-card"];

async function requireClosedSales(client: PoolClient) {
  if (!testCheckoutEnabled()) throw new CheckoutError("وضع الاختبار غير متاح حاليًا.", 503);
  const { rowCount } = await client.query(
    "select id from app_private.checkout_config where id and not sales_enabled and not cod_enabled and not card_enabled for share",
  );
  if (rowCount !== 1) throw new CheckoutError("وضع الاختبار غير متاح حاليًا.", 503);
}

export async function prepareTestCheckoutInventory(actor: string) {
  const products = (await getCatalogProducts()).filter(product => product.id && testFamilies.includes(product.familyKey));
  if (!products.length) throw new CheckoutError("وضع الاختبار غير متاح حاليًا.", 503);
  const client = await getDb().connect();
  try {
    await client.query("begin");
    await requireClosedSales(client);
    await client.query("select pg_advisory_xact_lock(hashtext('cliqo private test stock'))");
    for (const product of products) {
      for (const design of designsForProduct(product)) {
        for (const tier of ["T0", "T1", "T2"]) {
          const options = { face: design.face, variant: design.variant, design: tier };
          const hash = createHash("sha256").update(JSON.stringify([product.familyKey, options])).digest("hex");
          const skuCode = `TST-${hash.slice(0, 20).toUpperCase()}`;
          await client.query(`
            insert into public.product_skus(product_family_id,sku_code,display_name,options,price_minor,checkout_test)
            values($1,$2,$3,$4::jsonb,100,true) on conflict (sku_code) do nothing`,
          [product.id, skuCode, design.nameAr, JSON.stringify(options)]);
          const { rows: [sku] } = await client.query<{ id: string; ready: number }>(`
            select s.id, (select count(*)::int from public.smart_items i where i.sku_id=s.id and i.state='ready'
              and i.owner_user_id is null and i.order_line_id is null and i.manual_handoff_reference is null) as ready
            from public.product_skus s where s.sku_code=$1 and s.checkout_test`, [skuCode]);
          if (!sku) throw new Error("Could not prepare test stock");
          const quantity = Math.max(2 - sku.ready, 0);
          if (!quantity) continue;
          await client.query("select app_private.receive_stock($1,$2,$3,$4)", [sku.id, quantity, "Private test checkout stock", actor]);
          for (let index = 0; index < quantity; index += 1) {
            const { rows: [item] } = await client.query<{ id: string; public_id: string }>(
              "insert into public.smart_items(sku_id,state) values($1,'ready') returning id,public_id",
              [sku.id],
            );
            const code = await issueActivationCode(client, item.public_id);
            await client.query("insert into public.smart_item_activation_tokens(smart_item_id,token_hash,print_nonce) values($1,$2,$3)",
              [item.id, code.tokenHash, code.nonce]);
          }
        }
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

type TestOrder = {
  keyHash: string; name: string; phone: string; address: unknown; note: string | null;
  locale: "ar" | "en"; items: CheckoutItem[]; subtotal: number;
  lines: { skuId: string; name: string; skuCode: string; unitPriceMinor: number; designTier?: string }[];
};

export async function createTestOrder(input: TestOrder) {
  const client = await getDb().connect();
  try {
    await client.query("begin");
    await requireClosedSales(client);
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [input.keyHash]);
    const { rows: [existing] } = await client.query<{ order_reference: string; is_test: boolean }>(
      "select order_reference,payment_method::text='test' as is_test from public.orders where idempotency_key=$1", [input.keyHash],
    );
    if (existing) {
      if (!existing.is_test) throw new CheckoutError("جرّب فتح صفحة الطلب من جديد.", 409);
      await client.query("commit");
      return { reference: existing.order_reference, existing: true };
    }

    await client.query("select set_config('cliqo.email_locale',$1,true)", [input.locale]);
    const { rows: [order] } = await client.query<{ id: string; order_reference: string }>(`
      insert into public.orders(customer_name_snapshot,phone_snapshot,shipping_address,customer_note,
        payment_method,payment_state,subtotal_minor,total_minor,idempotency_key,tracking_token_hash)
      values($1,$2,$3::jsonb,$4,'test','pending',$5,$5,$6,$6)
      returning id,order_reference`,
    [input.name, input.phone, JSON.stringify(input.address), input.note, input.subtotal, input.keyHash]);

    for (const [index, line] of input.lines.entries()) {
      const item = input.items[index];
      const result = await client.query(`
        insert into public.order_lines(order_id,sku_id,sku_code_snapshot,product_name_snapshot,options_snapshot,
          quantity,unit_price_minor,line_total_minor,state,design_business_name,design_request_url,design_brief)
        select $1,id,sku_code,$2,options,$3,price_minor,price_minor*$3,$4,$5,$6,$7
        from public.product_skus where id=$8 and checkout_test and price_minor=$9`,
      [order.id, line.name, item.quantity, line.designTier ? "awaiting_design" : "pending",
        item.business_name ?? null, item.destination_url ?? null, item.design_brief ?? null, line.skuId, line.unitPriceMinor]);
      if (result.rowCount !== 1) throw new CheckoutError("منتج في السلة غير متاح بالكمية المطلوبة. راجع السلة.", 409);
    }

    await client.query("commit");
    return { reference: order.order_reference, existing: false };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
