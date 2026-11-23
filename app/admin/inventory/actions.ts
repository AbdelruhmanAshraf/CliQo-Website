"use server";
import {getCopy} from "@/i18n/server";


import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { requireStaff } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { getPrintTemplate, loadPrintArtwork, loadPrintTemplate } from "@/lib/qr-print-layout";
import { getSmartItemQrTarget } from "@/lib/smart-item-qr";
import { reservePrintBatch } from "@/lib/print-production-batch";
import { activationCodeForPrint, activationHash } from "@/lib/print-piece-identity";
import { issueActivationCode } from "@/lib/activation-code-issuer";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const standFaces: Record<string, string[]> = {
  review: ["أبيض", "شفاف"], instapay: ["InstaPay"], vodafone: ["Vodafone Cash"],
  instagram: ["Instagram"], tiktok: ["TikTok"], facebook: ["Facebook"], "all-in-one": ["All-in-One"],
};
const familyFaces:Record<string,Record<string,string[]>>={
  stand:standFaces,
  coaster:{review:['أبيض','شفاف'],instapay:['InstaPay'],vodafone:['Vodafone Cash'],instagram:['Instagram'],tiktok:['TikTok'],facebook:['Facebook'],'all-in-one':['All-in-One']},
  'pvc-card':{review:['Google Review'],instapay:['InstaPay'],instagram:['Instagram'],facebook:['Facebook'],'all-in-one':['أسود','أبيض']},
};
type Result = { ok: boolean; message: string };

export async function preparePrintBatch(skuId: string, quantity: number, batchId: string): Promise<Result & { publicIds?: string[]; batchId?: string }> {
  await requireStaff(["owner"]);
  if (!uuid.test(skuId) || !uuid.test(batchId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    return { ok: false, message: "اكتب كمية من ١ إلى ٥٠ قطعة." };
  }
  if (!getSmartItemQrTarget()) return { ok: false, message: "اضبط عنوان QR قبل تجهيز الدفعة." };
  try {
    const result = await getDb().query<{ family: string; options: Record<string, string> }>(
      `select f.family_key as family,s.options from public.product_skus s
       join public.product_families f on f.id=s.product_family_id where s.id=$1`, [skuId]);
    const sku = result.rows[0];
    const template = sku && getPrintTemplate(sku.family, sku.options.face, sku.options.variant, sku.options.design);
    if (!template) return { ok: false, message: "اربط قالب طباعة بهذا الصنف أولًا." };
    if (template.retired) return { ok: false, message: "التصميم القديم متاح للدفعات السابقة فقط." };
    await loadPrintTemplate(template);
    if (template.frontFile) await loadPrintArtwork(template.frontFile, template.widthMm ?? 0, template.heightMm ?? 0);
    const publicIds = await reservePrintBatch(skuId, quantity, batchId);
    revalidatePath("/admin/inventory");
    revalidatePath("/admin/items");
    return { ok: true, message: `تم تجهيز ${publicIds.length} قطعة للطباعة. المخزون المتاح للبيع لم يتغير.`, publicIds, batchId };
  } catch {
    return { ok: false, message: "تعذر تجهيز الدفعة. أعد المحاولة بنفس الطلب؛ لن تتكرر القطع." };
  }
}

export async function prepareBulkPrintBatch(batchId: string, requested: Array<{ skuId: string; quantity: number }>): Promise<Result & { batchId?: string; quantity?: number }> {
  const tr = await getCopy();
  const pick = (ar: string, en: string) => tr.locale === "ar" ? ar : en;
  await requireStaff(["owner"]);
  if (!uuid.test(batchId) || !Array.isArray(requested) || requested.length < 1 || requested.length > 20
      || requested.some((line) => !line || typeof line !== "object")) {
    return { ok: false, message: pick("اختار صنفًا واحدًا على الأقل.", "Choose at least one SKU.") };
  }
  const cleaned = requested.map((line) => ({ skuId: line.skuId, quantity: line.quantity }))
    .filter((line) => Number.isInteger(line.quantity) && line.quantity > 0);
  const skuIds = cleaned.map((line) => line.skuId);
  const total = cleaned.reduce((sum, line) => sum + line.quantity, 0);
  if (cleaned.length !== requested.filter((line) => Number.isInteger(line.quantity) && line.quantity > 0).length
    || skuIds.some((id) => !uuid.test(id)) || new Set(skuIds).size !== skuIds.length || total < 1 || total > 50
    || cleaned.some((line) => line.quantity > 50)) {
    return { ok: false, message: pick("الحد الأقصى ٥٠ قطعة في الطلبية، من ٢٠ صنفًا بحد أقصى.", "Limit this production batch to 50 units and 20 SKUs.") };
  }
  if (!getSmartItemQrTarget()) return { ok: false, message: pick("اضبط عنوان QR قبل تجهيز الطلبية.", "Configure the QR origin before preparing this order.") };
  const sorted = [...cleaned].sort((a, b) => a.skuId.localeCompare(b.skuId));
  const client = await getDb().connect();
  try {
    const skuResult = await client.query<{ id: string; family_key: string; options: Record<string, string>; has_nfc_qr: boolean; state: string; checkout_test: boolean }>(
      "select s.id::text,f.family_key,s.options,f.has_nfc_qr,s.state::text,s.checkout_test from public.product_skus s " +
      "join public.product_families f on f.id=s.product_family_id where s.id=any($1::uuid[])", [skuIds],
    );
    const skuMap = new Map(skuResult.rows.map((sku) => [sku.id, sku]));
    if (skuMap.size !== cleaned.length) return { ok: false, message: pick("أحد الأصناف غير موجود.", "A selected SKU was not found.") };
    for (const line of sorted) {
      const sku = skuMap.get(line.skuId);
      const template = sku && getPrintTemplate(sku.family_key, sku.options.face, sku.options.variant, sku.options.design);
      if (!sku?.has_nfc_qr || sku.checkout_test || sku.state === "paused" || template?.retired) {
        return { ok: false, message: pick("أحد الأصناف لا يملك قالب طباعة حاليًا.", "A selected SKU has no active print template.") };
      }
      if (template) {
        await loadPrintTemplate(template);
        if (template.frontFile) await loadPrintArtwork(template.frontFile, template.widthMm ?? 0, template.heightMm ?? 0);
      }
    }
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [batchId]);
    const previous = await client.query<{ sku_id: string; quantity: number }>(
      "select sku_id::text,count(*)::int as quantity from public.smart_items where production_batch_id=$1 group by sku_id", [batchId],
    );
    if (previous.rows.length) {
      const recorded = new Map(previous.rows.map((row) => [row.sku_id, row.quantity]));
      const matches = recorded.size === cleaned.length && cleaned.every((line) => recorded.get(line.skuId) === line.quantity);
      if (!matches) throw new Error("batch already used");
      await client.query("commit");
      return { ok: true, batchId, quantity: total, message: pick("الطلبية محفوظة بالفعل بنفس الأصناف والكميات.", "This batch is already saved with the same SKUs and quantities.") };
    }
    for (const line of sorted) {
      const created = await client.query<{ id: string; public_id: string }>(
        "insert into public.smart_items(sku_id,state,production_planned_at,production_batch_id) " +
        "select $1,'unassigned',now(),$3 from generate_series(1,$2) returning id::text,public_id::text",
        [line.skuId, line.quantity, batchId],
      );
      for (const item of created.rows) {
        const issued = await issueActivationCode(client, item.public_id);
        await client.query(
          "insert into public.smart_item_activation_tokens(smart_item_id,token_hash,print_nonce) values($1,$2,$3)",
          [item.id, issued.tokenHash, issued.nonce],
        );
      }
    }
    await client.query("commit");
    revalidatePath("/cliqo-control/inventory");
    revalidatePath("/cliqo-control/items");
    return { ok: true, batchId, quantity: total, message: pick("تم حفظ طلبية التصنيع وتجهيز QR مستقل لكل قطعة.", "Production order saved with a unique QR for every unit.") };
  } catch {
    await client.query("rollback").catch(() => undefined);
    return { ok: false, message: pick("تعذر حفظ الطلبية. لم يتغير المخزون.", "Could not save the production order. Inventory was not changed.") };
  } finally {
    client.release();
  }
}

export async function removeInventoryStock(skuId: string, quantity: number, reason: string): Promise<Result> {
  const tr = await getCopy();
  const pick = (ar: string, en: string) => tr.locale === "ar" ? ar : en;
  if (!uuid.test(skuId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 200
      || reason.trim().length < 3 || reason.trim().length > 500) {
    return { ok: false, message: pick("راجع الصنف والكمية وسبب التعديل.", "Check the SKU, quantity and reason.") };
  }
  const { staff } = await requireStaff(["owner"]);
  const client = await getDb().connect();
  try {
    await client.query("begin");
    const sku = await client.query<{ has_nfc_qr: boolean }>(
      "select f.has_nfc_qr from public.product_skus s join public.product_families f on f.id=s.product_family_id where s.id=$1 for update of s",
      [skuId],
    );
    if (!sku.rows[0]) throw new Error("SKU not found");
    const balance = await client.query<{ on_hand: number; reserved: number }>(
      "select on_hand,reserved from public.inventory_balances where sku_id=$1 for update", [skuId],
    );
    const current = balance.rows[0];
    if (!current || quantity > current.on_hand - current.reserved) {
      await client.query("rollback");
      return { ok: false, message: pick("الكمية أكبر من المتاح غير المحجوز.", "Quantity exceeds unreserved stock.") };
    }
    if (sku.rows[0].has_nfc_qr) {
      const items = await client.query<{ id: string }>(
        `select i.id::text from public.smart_items i where i.sku_id=$1 and i.state='ready'
          and i.owner_user_id is null and i.order_line_id is null and i.manual_handoff_reference is null
          order by i.created_at desc,i.id desc limit $2 for update of i skip locked`, [skuId, quantity],
      );
      if (items.rows.length !== quantity) {
        await client.query("rollback");
        return { ok: false, message: pick("سجل القطع لا يطابق الرصيد. لم يتغير المخزون.", "Unit records do not match stock. No changes were made.") };
      }
      const ids = items.rows.map((item) => item.id);
      await client.query("update public.smart_item_activation_tokens set consumed_at=coalesce(consumed_at,now()) where smart_item_id=any($1::uuid[])", [ids]);
      await client.query("update public.smart_items set state='disabled',updated_at=now() where id=any($1::uuid[])", [ids]);
    }
    await client.query("update public.inventory_balances set on_hand=on_hand-$2,updated_at=now() where sku_id=$1", [skuId, quantity]);
    await client.query(
      "insert into public.inventory_movements(sku_id,kind,quantity,reason,created_by) values($1,'adjusted',$2,$3,$4)",
      [skuId, quantity, reason.trim(), staff.user_id],
    );
    await client.query("commit");
    revalidatePath("/cliqo-control/inventory");
    revalidatePath("/cliqo-control/items");
    revalidatePath("/products");
    return { ok: true, message: pick("تم خصم الكمية وتوثيق الحركة.", "Stock reduced and movement recorded.") };
  } catch {
    await client.query("rollback").catch(() => undefined);
    return { ok: false, message: pick("تعذر تعديل المخزون. راجع حركات الصنف.", "Could not adjust stock. Review this SKU's movements.") };
  } finally {
    client.release();
  }
}

const faceNames: Record<string, string> = {
  review: "Google", instapay: "InstaPay", vodafone: "Vodafone Cash",
  instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", "all-in-one": "All-in-One",
};

export async function createCoreProductSkus(): Promise<Result> {
  const tr = await getCopy();
  await requireStaff(["owner"]);
  const client = await getDb().connect();
  let added = 0;
  try {
    await client.query("begin");
    const families = await client.query<{ id: string; family_key: string; name_ar: string }>(
      "select id,family_key,name_ar from public.product_families where family_key=any($1::text[]) for update",
      [["stand", "coaster", "pvc-card"]],
    );
    for (const family of families.rows) {
      for (const [face, variants] of Object.entries(familyFaces[family.family_key] ?? {})) {
        for (const variant of variants) {
          if (getPrintTemplate(family.family_key, face, variant, "T0")?.retired) continue;
          const options = { face, variant, design: "T0" };
          const exists = await client.query(
            "select 1 from public.product_skus where not checkout_test and product_family_id=$1 and options @> $2::jsonb limit 1",
            [family.id, JSON.stringify(options)],
          );
          if (exists.rowCount) continue;
          await client.query(
            `insert into public.product_skus(product_family_id,sku_code,display_name,options,state)
             values($1,$2,$3,$4::jsonb,'preparing')`,
            [family.id, `CQ-${randomBytes(5).toString("hex").toUpperCase()}`,
              `${family.name_ar} · ${faceNames[face]} · ${variant}`, JSON.stringify(options)],
          );
          added += 1;
        }
      }
    }
    await client.query("commit");
    revalidatePath("/admin/inventory");
    return { ok: true, message: tr("تم تجهيز {value0} نسخة جديدة بدون أسعار أو مخزون.", { value0: added }) };
  } catch {
    await client.query("rollback").catch(() => undefined);
    return { ok: false, message: tr("تعذر تجهيز قائمة المنتجات.") };
  } finally { client.release(); }
}

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
    const familyResult = await db.query<{ family_key: string; has_nfc_qr: boolean }>(
      "select family_key,has_nfc_qr from public.product_families where id = $1", [input.familyId],
    );
    const family = familyResult.rows[0];
    if (!family) return { ok: false, message: tr("المنتج المحدد غير موجود.") };
    let options: Record<string, string> = {};
    if (familyFaces[family.family_key]) {
      const variants = familyFaces[family.family_key][input.face];
      if (!variants || !variants.includes(input.variant) || !["T0", "T1", "T2"].includes(input.design)) return { ok: false, message: tr("اختار وجه الستاند ولونه ومسار التصميم الصحيح.") };
      if (getPrintTemplate(family.family_key, input.face, input.variant, "T0")?.retired) {
        return { ok: false, message: "التصميم القديم متاح للدفعات السابقة فقط." };
      }
      options = { face: input.face, variant: input.variant, design: input.design };
    } else {
      const variant = input.variant.trim();
      if (variant.length < 1 || variant.length > 80 || !["T0", "T1", "T2"].includes(input.design)
          || (!family.has_nfc_qr && input.design !== "T0")) {
        return { ok: false, message: tr("الصنف الجديد يحتاج نسخة واضحة من حرف إلى ٨٠ حرفًا.") };
      }
      options = { face: "default", variant, design: family.has_nfc_qr ? input.design : "T0" };
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

export async function updateSkuDetails(input: {
  skuId: string; familyId: string; displayName: string; face: string; variant: string; design: string;
}): Promise<Result> {
  const tr = await getCopy();
  const name = input.displayName.trim();
  if (!uuid.test(input.skuId) || !uuid.test(input.familyId) || name.length < 2 || name.length > 120) {
    return { ok: false, message: tr("راجع اسم النسخة وعائلة المنتج.") };
  }
  await requireStaff(["owner"]);
  const client = await getDb().connect();
  try {
    await client.query("begin");
    const current = await client.query<{ product_family_id: string; options: Record<string, string> }>(
      "select product_family_id, options from public.product_skus where id=$1 for update", [input.skuId],
    );
    const sku = current.rows[0];
    const family = await client.query<{ family_key: string; has_nfc_qr: boolean }>(
      "select family_key,has_nfc_qr from public.product_families where id=$1", [input.familyId],
    );
    if (!sku || !family.rows[0]) { await client.query("rollback"); return { ok: false, message: tr("الصنف غير موجود.") }; }
    const familyRow = family.rows[0];
    const variants = familyFaces[familyRow.family_key]?.[input.face];
    let options: Record<string, string>;
    if (familyFaces[familyRow.family_key]) {
      if (!variants || !variants.includes(input.variant) || !["T0", "T1", "T2"].includes(input.design)) {
        await client.query("rollback"); return { ok: false, message: tr("راجع الفئة الفرعية والنسخة والتصميم.") };
      }
      options = { face: input.face, variant: input.variant, design: input.design };
    } else {
      const variant = input.variant.trim();
      if (variant.length < 1 || variant.length > 80 || !["T0", "T1", "T2"].includes(input.design)
          || (!familyRow.has_nfc_qr && input.design !== "T0")) {
        await client.query("rollback"); return { ok: false, message: tr("اكتب نسخة من حرف إلى ٨٠ حرفًا لفئة المنتج.") };
      }
      options = { face: "default", variant, design: familyRow.has_nfc_qr ? input.design : "T0" };
    }
    const classificationChanged = sku.product_family_id !== input.familyId
      || ["face", "variant", "design"].some((key) => sku.options[key] !== options[key as keyof typeof options]);
    if (classificationChanged) {
      const history = await client.query<{ used: boolean }>(
        `select exists(select 1 from public.smart_items where sku_id=$1)
          or exists(select 1 from public.inventory_movements where sku_id=$1)
          or exists(select 1 from public.order_lines where sku_id=$1) as used`, [input.skuId],
      );
      if (history.rows[0]?.used) {
        await client.query("rollback");
        return { ok: false, message: tr("يمكن تعديل الاسم والسعر الآن. فئة صنف له قطع أو حركات محفوظة لا تتغير؛ أنشئ نسخة جديدة.") };
      }
    }
    await client.query(
      "update public.product_skus set display_name=$2, product_family_id=$3, options=$4::jsonb, updated_at=now() where id=$1",
      [input.skuId, name, input.familyId, JSON.stringify(options)],
    );
    for (const familyId of new Set([sku.product_family_id, input.familyId])) {
      await client.query(`update public.product_families f set state = case
        when not f.catalog_visible or f.catalog_deleted_at is not null then 'paused'::public.product_state
        when exists(select 1 from public.product_skus s where s.product_family_id=f.id and s.state='ready') then 'ready'::public.product_state
        else 'preparing'::public.product_state end, updated_at=now() where f.id=$1`, [familyId]);
    }
    await client.query("commit");
    revalidatePath("/admin/inventory");
    revalidatePath("/products");
    return { ok: true, message: tr("تم تحديث بيانات الصنف.") };
  } catch {
    await client.query("rollback").catch(() => undefined);
    return { ok: false, message: tr("تعذر تعديل بيانات الصنف.") };
  } finally { client.release(); }
}

export async function setPlannedQuantity(skuId: string, target: number): Promise<Result> {
  const tr = await getCopy();
  if (!uuid.test(skuId) || !Number.isInteger(target) || target < 0 || target > 200) {
    return { ok: false, message: tr("اكتب كمية تصنيع من ٠ إلى ٢٠٠.") };
  }
  await requireStaff(["owner"]);
  const client = await getDb().connect();
  try {
    await client.query("begin");
    const sku = await client.query<{ has_nfc_qr: boolean }>(
      `select f.has_nfc_qr from public.product_skus s
       join public.product_families f on f.id=s.product_family_id
       where s.id=$1 for update of s`, [skuId],
    );
    if (!sku.rows[0]?.has_nfc_qr) { await client.query("rollback"); return { ok: false, message: tr("الصنف غير متاح لتجهيز QR.") }; }
    const planned = await client.query<{ id: string }>(
      `select id from public.smart_items where sku_id=$1 and state='unassigned'
        and production_planned_at is not null and owner_user_id is null
        and order_line_id is null and manual_handoff_reference is null
        and production_batch_id is null
       order by created_at desc, id desc for update`, [skuId],
    );
    const difference = target - planned.rows.length;
    if (difference > 0) {
      await client.query(
        `insert into public.smart_items(sku_id,state,production_planned_at)
         select $1,'unassigned',now() from generate_series(1,$2)`, [skuId, difference],
      );
    } else if (difference < 0) {
      const cancelled = planned.rows.slice(0, -difference).map((row) => row.id);
      await client.query("update public.smart_items set state='disabled', updated_at=now() where id=any($1::uuid[])", [cancelled]);
    }
    await client.query("commit");
    revalidatePath("/admin/inventory");
    revalidatePath("/admin/items");
    return { ok: true, message: tr("تم تحديث خطة التصنيع. كل قطعة مخططة لها ID وQR مستقل؛ الرصيد المتاح لم يتغير.") };
  } catch {
    await client.query("rollback").catch(() => undefined);
    return { ok: false, message: tr("تعذر تجهيز خطة التصنيع.") };
  } finally { client.release(); }
}

export async function updateSkuApprovals(input: {
  skuId: string; priceEgp: string; priceApproved: boolean; sampleApproved: boolean; fulfillmentApproved: boolean;
}): Promise<Result> {
  const tr = await getCopy();
  if (!uuid.test(input.skuId) || (input.priceEgp !== "" && !/^\d{1,7}(?:\.\d{1,2})?$/.test(input.priceEgp))) {
    return { ok: false, message: tr("اكتب سعرًا صحيحًا بالجنيه.") };
  }
  const priceMinor = input.priceEgp === "" ? null : Math.round(Number(input.priceEgp) * 100);
  if (priceMinor !== null && (!Number.isSafeInteger(priceMinor) || priceMinor < 1)) return { ok: false, message: tr("السعر يجب أن يكون أكبر من صفر.") };
  if (input.priceApproved && priceMinor === null) return { ok: false, message: tr("اكتب السعر قبل اعتماده.") };
  if (![input.priceApproved, input.sampleApproved, input.fulfillmentApproved].every((value) => typeof value === "boolean")) {
    return { ok: false, message: tr("بيانات الاعتماد غير صحيحة.") };
  }
  await requireStaff(["owner"]);
  const db = getDb();
  const client = await db.connect();
  try {
    await client.query("begin");
    const current = await client.query<{ product_family_id: string }>(
      "select product_family_id from public.product_skus where id = $1 for update", [input.skuId],
    );
    const sku = current.rows[0];
    if (!sku) { await client.query("rollback"); return { ok: false, message: tr("الصنف غير موجود.") }; }
    const familyResult = await client.query<{catalog_visible:boolean;catalog_deleted_at:string|null}>("select id,catalog_visible,catalog_deleted_at from public.product_families where id = $1 for update", [sku.product_family_id]);
    const ready = priceMinor !== null && input.priceApproved && input.sampleApproved && input.fulfillmentApproved;
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
      [sku.product_family_id, familyResult.rows[0]?.catalog_visible && !familyResult.rows[0]?.catalog_deleted_at ? Number(familyCount.rows[0]?.count ?? 0) > 0 ? "ready" : "preparing" : "paused"],
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

export async function deleteSku(skuId: string): Promise<Result> {
  const tr = await getCopy();
  if (!uuid.test(skuId)) return { ok: false, message: tr("الصنف غير موجود.") };
  await requireStaff(["owner"]);
  const client = await getDb().connect();
  try {
    await client.query("begin");
    const skuResult = await client.query<{ id: string; product_family_id: string }>(
      "select id, product_family_id from public.product_skus where id = $1 for update", [skuId],
    );
    const sku = skuResult.rows[0];
    if (!sku) {
      await client.query("rollback");
      return { ok: false, message: tr("الصنف غير موجود.") };
    }
    const references = await client.query<{ used: boolean }>(
      `select
        exists(select 1 from public.inventory_movements where sku_id = $1) or
        exists(select 1 from public.smart_items where sku_id = $1) or
        exists(select 1 from public.order_lines where sku_id = $1) or
        exists(select 1 from public.inventory_reservations where sku_id = $1) or
        exists(select 1 from public.inventory_balances where sku_id = $1 and (on_hand > 0 or reserved > 0)) as used`,
      [skuId],
    );
    if (references.rows[0]?.used) {
      await client.query("rollback");
      return { ok: false, message: tr("لا يمكن حذف صنف له مخزون أو طلبات أو سجل حركات. احتفظ به للمراجعة.") };
    }
    await client.query("delete from public.inventory_balances where sku_id = $1", [skuId]);
    await client.query("delete from public.product_skus where id = $1", [skuId]);
    const familyState = await client.query<{ catalog_visible: boolean; catalog_deleted_at: string | null }>(
      "select catalog_visible,catalog_deleted_at from public.product_families where id = $1 for update", [sku.product_family_id],
    );
    const readyCount = await client.query<{ count: string }>(
      "select count(*)::text as count from public.product_skus where product_family_id = $1 and state = 'ready'",
      [sku.product_family_id],
    );
    const family = familyState.rows[0];
    await client.query(
      "update public.product_families set state = $2, updated_at = now() where id = $1",
      [sku.product_family_id, family?.catalog_visible && !family.catalog_deleted_at && Number(readyCount.rows[0]?.count ?? 0) > 0 ? "ready" : "paused"],
    );
    await client.query("commit");
    revalidatePath("/admin/inventory");
    revalidatePath("/products");
    return { ok: true, message: tr("تم حذف SKU.") };
  } catch {
    await client.query("rollback").catch(() => undefined);
    return { ok: false, message: tr("تعذر حذف الصنف. قد يكون مرتبطًا بمخزون أو طلب.") };
  } finally {
    client.release();
  }
}

export async function receiveStock(skuId: string, quantity: number, reason: string, source: string) {
  const tr = await getCopy();
  if (!uuid.test(skuId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 200
      || reason.trim().length < 3 || reason.trim().length > 500
      || (source !== "new" && source !== "legacy" && !uuid.test(source))) {
    return { ok: false, message: tr("راجع الصنف والكمية وسبب إضافة المخزون.") };
  }
  const { staff } = await requireStaff(["owner"]);
  const client = await getDb().connect();
  const activationCodes: { publicId: string; activationCode: string }[] = [];
  try {
    await client.query("begin");
    const sku = await client.query<{ has_nfc_qr: boolean }>(
      "select f.has_nfc_qr from public.product_skus s join public.product_families f on f.id=s.product_family_id where s.id=$1",
      [skuId],
    );
    if (!sku.rows[0]) throw new Error("SKU not found.");
    let planned: { id: string; public_id: string; production_batch_id: string | null }[] = [];
    if (sku.rows[0]?.has_nfc_qr) {
      if (source !== "new") {
        const plannedFilter = source === "legacy" ? "production_batch_id is null" : "production_batch_id=$3::uuid";
        const plannedParams = source === "legacy" ? [skuId, quantity] : [skuId, quantity, source];
        const plannedResult = await client.query<{ id: string; public_id: string; production_batch_id: string | null }>(
          `select id,public_id,production_batch_id from public.smart_items where sku_id=$1 and state='unassigned'
          and production_planned_at is not null and owner_user_id is null
          and order_line_id is null and manual_handoff_reference is null
          and ${plannedFilter} order by created_at,id limit $2 for update`, plannedParams,
        );
        planned = plannedResult.rows;
        if (planned.length < quantity) {
          await client.query("rollback");
          return { ok: false, message: tr("الكمية أكبر من المتبقي في الدفعة المختارة. حدّث الصفحة أو اختر دفعة أخرى.") };
        }
      }
    } else if (source !== "new") {
      await client.query("rollback");
      return { ok: false, message: tr("الدفعة المختارة لا تحتوي قطع QR.") };
    }
    await client.query("select app_private.receive_stock($1,$2,$3,$4)", [skuId, quantity, reason.trim(), staff.user_id]);
    if (sku.rows[0]?.has_nfc_qr) {
      for (let index = 0; index < quantity; index += 1) {
        const reserved = source === "new" ? undefined : planned[index];
        const created = reserved ?? (await client.query<{ id: string; public_id: string }>(
          "insert into public.smart_items(sku_id,state) values($1,'ready') returning id,public_id", [skuId],
        )).rows[0];
        if (!created) throw new Error("Smart item insert did not return a row.");
        if (reserved) await client.query("update public.smart_items set state='ready', updated_at=now() where id=$1", [created.id]);
        const existing = await client.query<{ token_hash: string; print_nonce: string | null; consumed_at: string | null }>(
          "select token_hash,print_nonce,consumed_at from public.smart_item_activation_tokens where smart_item_id=$1", [created.id]);
        const token = existing.rows[0];
        const derived = token?.print_nonce === null || token?.print_nonce === undefined
          ? null : activationCodeForPrint(created.public_id, Number(token.print_nonce));
        let activationCode = derived && token?.token_hash === activationHash(derived) && !token.consumed_at ? derived : "";
        if (!activationCode) {
          const issued = await issueActivationCode(client, created.public_id);
          activationCode = issued.code;
          if (token) {
            await client.query(
              "update public.smart_item_activation_tokens set token_hash=$2,print_nonce=$3,consumed_at=null,expires_at=null where smart_item_id=$1",
              [created.id, issued.tokenHash, issued.nonce]);
          } else {
            await client.query(
              "insert into public.smart_item_activation_tokens(smart_item_id,token_hash,print_nonce) values($1,$2,$3)",
              [created.id, issued.tokenHash, issued.nonce]);
          }
        }
        activationCodes.push({ publicId: created.public_id, activationCode });
      }
    }
    await client.query("commit");
    revalidatePath("/admin/inventory");
    revalidatePath("/admin/items");
    return { ok: true, message: tr("تم تسجيل الكمية وتجهيز سجل مستقل لكل قطعة."), activationCodes };
  } catch {
    await client.query("rollback").catch(() => undefined);
    return { ok: false, message: tr("تعذر تسجيل الكمية. راجع الصنف والكمية.") };
  } finally {
    client.release();
  }
}

export async function resetAndRebuildStandCoasterStock(): Promise<Result & {
  retiredUnits?: number; retiredPlans?: number; createdUnits?: number;
}> {
  const tr = await getCopy();
  const { staff } = await requireStaff(["owner"]);
  const target = getSmartItemQrTarget();
  if (!target || target.preview) return { ok: false, message: tr("عنوان QR الإنتاجي غير مضبوط؛ لم يتغير المخزون.") };

  const client = await getDb().connect();
  try {
    await client.query("begin");
    const skuResult = await client.query<{
      id: string; family_key: "stand" | "coaster"; sku_code: string; has_nfc_qr: boolean; state: string;
    }>(`
      select s.id::text,f.family_key,s.sku_code,f.has_nfc_qr,s.state::text
      from public.product_skus s join public.product_families f on f.id=s.product_family_id
      where not s.checkout_test and f.family_key=any($1::text[])
      order by f.family_key,s.sku_code for update of s`, [["stand", "coaster"]]);

    const standSkus = skuResult.rows.filter((sku) => sku.family_key === "stand");
    const coasterSkus = skuResult.rows.filter((sku) => sku.family_key === "coaster");
    if (standSkus.length !== 8 || coasterSkus.length !== 8
        || skuResult.rows.some((sku) => !sku.has_nfc_qr || sku.state === "paused")) {
      await client.query("rollback");
      return { ok: false, message: tr("قائمة الأصناف لم تعد ٨ استاند و٨ كوستر؛ لم يتغير المخزون.") };
    }

    const skuIds = skuResult.rows.map((sku) => sku.id);
    await client.query(
      `insert into public.inventory_balances(sku_id) select unnest($1::uuid[])
       on conflict (sku_id) do nothing`, [skuIds],
    );
    const balanceResult = await client.query<{ sku_id: string; on_hand: number; reserved: number }>(
      `select sku_id::text,on_hand,reserved from public.inventory_balances
       where sku_id=any($1::uuid[]) order by sku_id for update`, [skuIds],
    );
    const balanceBySku = new Map(balanceResult.rows.map((balance) => [balance.sku_id, balance]));
    const standOnHand = standSkus.reduce((sum, sku) => sum + (balanceBySku.get(sku.id)?.on_hand ?? 0), 0);
    const coasterOnHand = coasterSkus.reduce((sum, sku) => sum + (balanceBySku.get(sku.id)?.on_hand ?? 0), 0);
    if (balanceResult.rows.length !== skuIds.length
        || balanceResult.rows.some((balance) => balance.reserved !== 0)
        || standOnHand !== 8 || coasterOnHand !== 9) {
      await client.query("rollback");
      return { ok: false, message: tr("المخزون تغيّر عن ٨ استاند و٩ كوستر أو فيه حجز؛ لم يتغير أي شيء.") };
    }

    const reservationResult = await client.query<{ count: number }>(
      `select count(*)::int as count from public.inventory_reservations
       where sku_id=any($1::uuid[]) and state='reserved'`, [skuIds],
    );
    if ((reservationResult.rows[0]?.count ?? 0) !== 0) {
      await client.query("rollback");
      return { ok: false, message: tr("فيه حجوزات مخزون نشطة؛ لم يتغير أي شيء.") };
    }

    const itemResult = await client.query<{
      id: string; public_id: string; sku_id: string; state: string;
    }>(`
      select id::text,public_id::text,sku_id::text,state::text from public.smart_items
      where sku_id=any($1::uuid[]) and (
        (state='ready' and owner_user_id is null and order_line_id is null and manual_handoff_reference is null)
        or (state='unassigned' and production_planned_at is not null and owner_user_id is null
            and order_line_id is null and manual_handoff_reference is null)
      ) order by sku_id,created_at,id for update`, [skuIds]);
    const readyCountBySku = new Map<string, number>();
    for (const item of itemResult.rows) {
      if (item.state !== "ready") continue;
      readyCountBySku.set(item.sku_id, (readyCountBySku.get(item.sku_id) ?? 0) + 1);
    }
    if (skuResult.rows.some((sku) => (readyCountBySku.get(sku.id) ?? 0) !== (balanceBySku.get(sku.id)?.on_hand ?? 0))) {
      await client.query("rollback");
      return { ok: false, message: tr("سجل القطع لا يطابق الرصيد؛ لم يتغير أي شيء.") };
    }

    const retiredUnits = itemResult.rows.filter((item) => item.state === "ready").length;
    const retiredPlans = itemResult.rows.filter((item) => item.state === "unassigned").length;
    const retiredIds = itemResult.rows.map((item) => item.id);
    if (retiredIds.length) {
      await client.query(
        `update public.smart_item_activation_tokens set consumed_at=coalesce(consumed_at,now())
         where smart_item_id=any($1::uuid[])`, [retiredIds],
      );
      await client.query(
        `update public.smart_items set state='disabled',updated_at=now() where id=any($1::uuid[])`, [retiredIds],
      );
    }

    const reason = "شطب المخزون القديم وإعادة إصدار قطع جديدة بأمر المالك";
    for (const sku of skuResult.rows) {
      const oldQuantity = balanceBySku.get(sku.id)?.on_hand ?? 0;
      if (oldQuantity > 0) {
        await client.query(
          `insert into public.inventory_movements(sku_id,kind,quantity,reason,created_by)
           values($1,'adjusted',$2,$3,$4)`, [sku.id, oldQuantity, reason, staff.user_id],
        );
      }
    }
    await client.query(
      `update public.inventory_balances set on_hand=0,reserved=0,updated_at=now()
       where sku_id=any($1::uuid[])`, [skuIds],
    );

    for (const sku of skuResult.rows) {
      await client.query("select app_private.receive_stock($1,1,$2,$3)", [sku.id, reason, staff.user_id]);
      const created = await client.query<{ id: string; public_id: string }>(
        `insert into public.smart_items(sku_id,state) values($1,'ready') returning id::text,public_id::text`, [sku.id],
      );
      const item = created.rows[0];
      if (!item) throw new Error("Smart item insert did not return a row.");
      const issued = await issueActivationCode(client, item.public_id);
      await client.query(
        `insert into public.smart_item_activation_tokens(smart_item_id,token_hash,print_nonce)
         values($1,$2,$3)`, [item.id, issued.tokenHash, issued.nonce],
      );
    }

    await client.query("commit");
    revalidatePath("/admin/inventory");
    revalidatePath("/admin/items");
    revalidatePath("/products");
    return {
      ok: true,
      retiredUnits,
      retiredPlans,
      createdUnits: skuResult.rows.length,
      message: `${tr("اتشطب")} ${retiredUnits.toLocaleString(tr.numberLocale)} ${tr("قطعة قديمة واتلغت")} ${retiredPlans.toLocaleString(tr.numberLocale)} ${tr("خطة قديمة، واتجهزت ٨ استاند و٨ كوستر بأكواد ومعرّفات جديدة.")}`,
    };
  } catch {
    await client.query("rollback").catch(() => undefined);
    return { ok: false, message: tr("تعذر تجديد المخزون؛ لم يتغير أي شيء.") };
  } finally {
    client.release();
  }
}
