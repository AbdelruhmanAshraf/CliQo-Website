import "server-only";
import { getDb } from "./db";
import { activationCodeForPrint } from "./print-piece-identity";
import { issueActivationCode } from "./activation-code-issuer";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Called only after owner authorization. A repeated request returns the same IDs.
export async function reservePrintBatch(skuId: string, quantity: number, batchId: string) {
  if (!uuid.test(skuId) || !uuid.test(batchId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    throw new Error("اكتب كمية من ١ إلى ٥٠ قطعة.");
  }
  activationCodeForPrint(batchId); // Check configuration before creating any units.
  const client = await getDb().connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [batchId]);
    const previous = await client.query<{ public_id: string; sku_id: string }>(
      "select public_id::text,sku_id::text from public.smart_items where production_batch_id=$1 order by public_id", [batchId]);
    if (previous.rows.length) {
      if (previous.rows.length !== quantity || previous.rows.some((row) => row.sku_id !== skuId)) {
        throw new Error("هذه الدفعة محفوظة بكمية أو صنف مختلف. ابدأ دفعة جديدة.");
      }
      await client.query("commit");
      return previous.rows.map((row) => row.public_id);
    }
    const sku = await client.query<{ has_nfc_qr: boolean }>(
      `select f.has_nfc_qr from public.product_skus s join public.product_families f on f.id=s.product_family_id
       where s.id=$1 for update of s`, [skuId]);
    if (!sku.rows[0]?.has_nfc_qr) throw new Error("الصنف غير متاح لتجهيز QR.");
    const items = await client.query<{ id: string; public_id: string }>(
      `insert into public.smart_items(sku_id,state,production_planned_at,production_batch_id)
       select $1,'unassigned',now(),$3 from generate_series(1,$2) returning id::text,public_id::text`, [skuId, quantity, batchId]);
    for (const item of items.rows) {
      const issued = await issueActivationCode(client, item.public_id);
      await client.query("insert into public.smart_item_activation_tokens(smart_item_id,token_hash,print_nonce) values($1,$2,$3)",
        [item.id, issued.tokenHash, issued.nonce]);
    }
    await client.query("commit");
    return items.rows.map((row) => row.public_id).sort();
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
