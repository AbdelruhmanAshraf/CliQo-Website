"use server";
import {getCopy} from "@/i18n/server";


import { revalidatePath } from "next/cache";
import { createHash, randomBytes } from "node:crypto";
import { requireStaff } from "@/lib/admin";
import { getDb } from "@/lib/db";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const standFaces: Record<string, string[]> = {
  review: ["أسود", "أبيض"], instapay: ["InstaPay"], vodafone: ["Vodafone Cash"],
  instagram: ["Instagram"], tiktok: ["TikTok"], facebook: ["Facebook"], "all-in-one": ["All-in-One"],
};
type Result = { ok: boolean; message: string };

export async function createSkuDraft(input: {
  familyId: string; displayName: string; face: string; variant: string; design: string;
}): Promise<Result> {
  const tr = await getCopy();
  const displayName = input.displayName.trim();
  if (!uuid.test(input.familyId) || displayName.length < 2 || displayName.length > 120) {
    return { ok: false, message: tr("اختار المنتج واكتب اسم SKU من حرفين إلى ١٢٠ حرفًا.") };
  }
  await requireStaff(["owner"]);
  const db = getDb();
  try {
    const familyResult = await db.query<{ family_key: string }>(
      "select family_key from public.product_families where id = $1", [input.familyId],
    );
    const family = familyResult.rows[0];
    if (!family) return { ok: false, message: tr("المنتج المحدد غير موجود.") };
    let options: Record<string, string> = {};
    if (family.family_key === "stand") {
      const variants = standFaces[input.face];
      if (!variants || !variants.includes(input.variant) || !["T0", "T1", "T2"].includes(input.design)) return { ok: false, message: tr("اختار وجه الستاند ولونه ومسار التصميم الصحيح.") };
      options = { face: input.face, variant: input.variant, design: input.design };
    }
    const skuCode = `CQ-${randomBytes(5).toString("hex").toUpperCase()}`;
    await db.query(
      `insert into public.product_skus (product_family_id, sku_code, display_name, options, state)
       values ($1, $2, $3, $4::jsonb, 'preparing')`,
      [input.familyId, skuCode, displayName, JSON.stringify(options)],
    );
    revalidatePath("/admin/inventory");
    return { ok: true, message: tr(`تم إنشاء ${skuCode} كصنف قيد التجهيز.`) };
  } catch {
    return { ok: false, message: tr("تعذر إنشاء الصنف. جرّب مرة أخرى.") };
  }
}

export async function updateSkuApprovals(input: {
  skuId: string; priceEgp: string; priceApproved: boolean; sampleApproved: boolean; fulfillmentApproved: boolean;
}): Promise<Result> {
  const tr = await getCopy();
  if (!uuid.test(input.skuId) || !/^\d{1,7}(?:\.\d{1,2})?$/.test(input.priceEgp)) {
    return { ok: false, message: tr("اكتب سعرًا صحيحًا بالجنيه.") };
  }
  const priceMinor = Math.round(Number(input.priceEgp) * 100);
  if (!Number.isSafeInteger(priceMinor) || priceMinor < 1) return { ok: false, message: tr("السعر يجب أن يكون أكبر من صفر.") };
  if (![input.priceApproved, input.sampleApproved, input.fulfillmentApproved].every((value) => typeof value === "boolean")) {
    return { ok: false, message: tr("بيانات الاعتماد غير صحيحة.") };
  }
  const { staff } = await requireStaff(["owner"]);
  const db = getDb();
  const client = await db.connect();
  try {
    await client.query("begin");
    const current = await client.query<{ product_family_id: string }>(
      "select product_family_id from public.product_skus where id = $1 for update", [input.skuId],
    );
    const sku = current.rows[0];
    if (!sku) { await client.query("rollback"); return { ok: false, message: tr("الصنف غير موجود.") }; }
    await client.query("select id from public.product_families where id = $1 for update", [sku.product_family_id]);
    const ready = input.priceApproved && input.sampleApproved && input.fulfillmentApproved;
    await client.query(
      `update public.product_skus set price_minor = $2, price_approved = $3, sample_approved = $4,
       fulfillment_approved = $5, state = $6, updated_at = now() where id = $1`,
      [input.skuId, priceMinor, input.priceApproved, input.sampleApproved, input.fulfillmentApproved, ready ? "ready" : "preparing"],
    );
    const familyCount = await client.query<{ count: string }>(
      "select count(*)::text as count from public.product_skus where product_family_id = $1 and state = 'ready'",
      [sku.product_family_id],
    );
    await client.query(
      "update public.product_families set state = $2, updated_at = now() where id = $1",
      [sku.product_family_id, Number(familyCount.rows[0]?.count ?? 0) > 0 ? "ready" : "preparing"],
    );
    await client.query("commit");
    revalidatePath("/admin/inventory");
    revalidatePath("/products");
    revalidatePath("/products/[slug]", "page");
    return { ok: true, message: tr(ready ? "تم اعتماد السعر والعينة والتجهيز. أضف المخزون عند جاهزيته." : "تم حفظ الاعتمادات؛ البيع يحتاج اكتمالها كلها.") };
  } catch {
    await client.query("rollback").catch(() => undefined);
    return { ok: false, message: tr("تعذر حفظ الاعتمادات. راجع السعر وحالة الصنف.") };
  } finally {
    client.release();
  }
}

export async function receiveStock(skuId: string, quantity: number, reason: string) {
  const tr = await getCopy();
  if (!uuid.test(skuId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 200
      || reason.trim().length < 3 || reason.trim().length > 500) {
    return { ok: false, message: tr("راجع الصنف والكمية وسبب إضافة المخزون.") };
  }
  const { staff } = await requireStaff(["owner"]);
  const client = await getDb().connect();
  const activationCodes: { publicId: string; activationCode: string }[] = [];
  try {
    await client.query("begin");
    await client.query("select app_private.receive_stock($1,$2,$3,$4)", [skuId, quantity, reason.trim(), staff.user_id]);
    const sku = await client.query<{ has_nfc_qr: boolean }>(
      "select f.has_nfc_qr from public.product_skus s join public.product_families f on f.id=s.product_family_id where s.id=$1",
      [skuId],
    );
    if (sku.rows[0]?.has_nfc_qr) {
      for (let index = 0; index < quantity; index += 1) {
        const activationCode = randomBytes(16).toString("hex");
        const tokenHash = createHash("sha256").update(activationCode).digest("hex");
        const item = await client.query<{ id: string; public_id: string }>(
          "insert into public.smart_items(sku_id,state) values($1,'ready') returning id,public_id", [skuId],
        );
        const created = item.rows[0];
        if (!created) throw new Error("Smart item insert did not return a row.");
        await client.query(
          "insert into public.smart_item_activation_tokens(smart_item_id,token_hash) values($1,$2)",
          [created.id, tokenHash],
        );
        activationCodes.push({ publicId: created.public_id, activationCode });
      }
    }
    await client.query("commit");
    revalidatePath("/admin/inventory");
    revalidatePath("/admin/items");
    return { ok: true, message: tr("تم تسجيل الكمية وتجهيز سجل مستقل لكل قطعة."), activationCodes };
  } catch {
    await client.query("rollback").catch(() => undefined);
    return { ok: false, message: tr("تعذر تسجيل الكمية. تأكد من اعتماد الصنف.") };
  } finally {
    client.release();
  }
}
