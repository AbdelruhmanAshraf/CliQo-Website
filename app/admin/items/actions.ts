"use server";
import {getCopy} from "@/i18n/server";


import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { issueActivationCode } from "@/lib/activation-code-issuer";
import { activationCodeForPrint, activationHash } from "@/lib/print-piece-identity";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function recordPhysicalCheck(publicId: string, input: {
  mode: "unwritten" | "prewritten" | "customer_write";
  qrScanned: boolean; nfcTested: boolean; nfcLocked: boolean; note: string;
}) {
  if (!uuid.test(publicId) || !["unwritten", "prewritten", "customer_write"].includes(input.mode)
    || input.note.trim().length > 300 || (input.nfcTested && input.mode !== "prewritten")
    || (input.nfcLocked && (input.mode !== "prewritten" || !input.nfcTested || !input.qrScanned))) {
    return { ok: false as const, message: "راجع فحص QR وNFC. القفل يحتاج اختبار الاثنين أولًا." };
  }
  const { staff } = await requireStaff(["owner"]);
  const client = await getDb().connect();
  try {
    await client.query("begin");
    const item = await client.query<{ id: string }>(
      "select id from public.smart_items where public_id = $1::uuid for update", [publicId],
    );
    if (!item.rows[0]) { await client.query("rollback"); return { ok: false as const, message: "القطعة غير موجودة." }; }
    const previous = await client.query<{
      qr_scanned_at: string | null; nfc_written_at: string | null;
      nfc_tested_at: string | null; nfc_locked_at: string | null;
    }>(`select * from app_private.smart_item_physical_checks where smart_item_id = $1`, [item.rows[0].id]);
    const old = previous.rows[0];
    if (old?.nfc_locked_at && (!input.nfcLocked || !input.nfcTested || !input.qrScanned || input.mode !== "prewritten")) {
      await client.query("rollback");
      return { ok: false as const, message: "الشريحة مسجلة كمقفولة نهائيًا؛ لا يمكن تغيير حالتها من هذه الشاشة." };
    }
    const updated = await client.query(
      `insert into app_private.smart_item_physical_checks
        (smart_item_id, nfc_mode, qr_scanned_at, nfc_written_at, nfc_tested_at, nfc_locked_at, note, updated_by)
       values ($1, $2, case when $3 then now() else null end,
         case when $2 = 'prewritten' then now() else null end,
         case when $4 then now() else null end, case when $5 then now() else null end, $6, $7)
       on conflict (smart_item_id) do update set
         nfc_mode = excluded.nfc_mode,
         qr_scanned_at = case when $3 then coalesce(app_private.smart_item_physical_checks.qr_scanned_at, now()) else null end,
         nfc_written_at = case when $2 = 'prewritten' then coalesce(app_private.smart_item_physical_checks.nfc_written_at, now()) else null end,
         nfc_tested_at = case when $4 then coalesce(app_private.smart_item_physical_checks.nfc_tested_at, now()) else null end,
         nfc_locked_at = case when $5 then coalesce(app_private.smart_item_physical_checks.nfc_locked_at, now()) else null end,
         note = excluded.note, updated_by = excluded.updated_by, updated_at = now()
       returning *`,
      [item.rows[0].id, input.mode, input.qrScanned, input.nfcTested, input.nfcLocked, input.note.trim(), staff.user_id],
    );
    await client.query(
      `insert into app_private.smart_item_physical_check_events
       (smart_item_id, actor_id, previous_state, new_state)
       values ($1, $2, $3::jsonb, $4::jsonb)`,
      [item.rows[0].id, staff.user_id, JSON.stringify(old ?? {}), JSON.stringify(updated.rows[0])],
    );
    await client.query("commit");
    revalidatePath(`/admin/items/${publicId}`);
    return { ok: true as const, message: "تم حفظ فحص القطعة في سجل التجهيز." };
  } catch {
    await client.query("rollback").catch(() => undefined);
    return { ok: false as const, message: "تعذر حفظ الفحص. راجع بيانات القطعة." };
  } finally { client.release(); }
}

export async function prepareManualHandoff(publicId: string, input: {
  destinationUrl: string; paymentIdentifier: string; recipientLabel: string; note: string;
}) {
  if (!uuid.test(publicId) || input.note.trim().length > 300) {
    return { ok: false as const, message: "راجع بيانات القطعة وملاحظة التسليم." };
  }
  const { staff } = await requireStaff(["owner"]);
  const client = await getDb().connect();
  const reference = `FIELD-${randomBytes(6).toString("hex").toUpperCase()}`;
  try {
    await client.query("begin");
    const found = await client.query<{ id: string; sku_id: string; face: string; family_key: string }>(
      `select i.id, i.sku_id, s.options ->> 'face' as face, f.family_key
       from public.smart_items i
       join public.product_skus s on s.id = i.sku_id
       join public.product_families f on f.id = s.product_family_id
       where i.public_id = $1::uuid and i.state = 'ready' and i.owner_user_id is null
         and i.order_line_id is null and i.manual_handoff_reference is null
       for update of i`, [publicId],
    );
    const item = found.rows[0];
    if (!item || !["stand", "coaster", "pvc-card"].includes(item.family_key)) {
      await client.query("rollback");
      return { ok: false as const, message: "القطعة غير متاحة للتسليم المباشر." };
    }
    const checked = await client.query<{
      nfc_mode: string; qr_scanned_at: string | null; nfc_tested_at: string | null;
    }>(`select nfc_mode, qr_scanned_at, nfc_tested_at
        from app_private.smart_item_physical_checks where smart_item_id = $1`, [item.id]);
    const physical = checked.rows[0];
    if (!physical?.qr_scanned_at || !(
      physical.nfc_mode === "customer_write"
      || (physical.nfc_mode === "prewritten" && physical.nfc_tested_at)
    )) {
      await client.query("rollback");
      return { ok: false as const, message: "سجّل فحص QR وقراءة NFC، أو اختَر تسليم NFC مفتوحة ليكتبها العميل، قبل التسليم." };
    }
    const destinationUrl = input.destinationUrl.trim() || null;
    const paymentIdentifier = input.paymentIdentifier.trim() || null;
    const recipientLabel = input.recipientLabel.trim() || null;
    if (item.face === "all-in-one" && (destinationUrl || paymentIdentifier || recipientLabel)) {
      await client.query("rollback");
      return { ok: false as const, message: "عميل All-in-One ينشئ صفحته بنفسه بعد التفعيل." };
    }
    if (item.face && ["instapay", "vodafone"].includes(item.face)
      ? Boolean(destinationUrl) || Boolean(paymentIdentifier) !== Boolean(recipientLabel)
      : Boolean(paymentIdentifier || recipientLabel)) {
      await client.query("rollback");
      return { ok: false as const, message: "راجع بيانات الوجهة أو وسيلة الدفع المطبوعة." };
    }
    const issued = await issueActivationCode(client, publicId);
    const stock = await client.query(
      `update public.inventory_balances set on_hand = on_hand - 1
       where sku_id = $1 and on_hand - reserved >= 1 returning sku_id`, [item.sku_id],
    );
    if (!stock.rowCount) throw new Error("No available physical stock.");
    await client.query(
      `update public.smart_items set state = 'unassigned', manual_handoff_reference = $2,
         manual_handoff_at = now(), manual_handoff_by = $3,
         destination_url = $4, payment_identifier = $5, recipient_label = $6
       where id = $1`,
      [item.id, reference, staff.user_id, destinationUrl, paymentIdentifier, recipientLabel],
    );
    const token = await client.query(
      `update public.smart_item_activation_tokens
       set token_hash = $2, print_nonce = $3, consumed_at = null, expires_at = null
       where smart_item_id = $1 returning id`, [item.id, issued.tokenHash, issued.nonce],
    );
    if (!token.rowCount) throw new Error("Activation token is missing.");
    await client.query(
      `insert into public.inventory_movements(sku_id, kind, quantity, reason, created_by)
       values ($1, 'consumed', 1, $2, $3)`,
      [item.sku_id, `تسليم مباشر ${reference}`, staff.user_id],
    );
    await client.query(
      `insert into app_private.manual_item_handoff_events(smart_item_id, action, reference, note, actor_id)
       values ($1, 'handoff', $2, $3, $4)`,
      [item.id, reference, input.note.trim(), staff.user_id],
    );
    await client.query("commit");
    revalidatePath("/admin/items");
    revalidatePath(`/admin/items/${publicId}`);
    return { ok: true as const, message: "تم تجهيز القطعة للتسليم. اطبع كود التفعيل المكوّن من ٦ أرقام على بطاقة وضعها داخل العبوة؛ لا تحفره على القطعة ولا تضعه في QR أو NFC.", reference, activationCode: issued.code };
  } catch {
    await client.query("rollback").catch(() => undefined);
    return { ok: false as const, message: "تعذر تجهيز القطعة. راجع الرابط والبيانات والمخزون." };
  } finally {
    client.release();
  }
}

export async function issueReplacementActivationCode(publicId: string) {
  const tr = await getCopy();
  if (!uuid.test(publicId)) return { ok: false as const, message: tr("معرّف القطعة غير صالح.") };

  const { staff } = await requireStaff(["owner"]);
  const client = await getDb().connect();
  try {
    await client.query("begin");
    const result = await client.query<{ id: string; order_id: string; public_id: string }>(
      `select i.id, o.id as order_id, i.public_id::text
       from public.smart_items i
       join public.order_lines l on l.id = i.order_line_id
       join public.orders o on o.id = l.order_id
       where i.public_id = $1 and i.owner_user_id is null and i.state = 'ready'
         and o.state not in ('new', 'cancelled', 'returned')
       for update of i, o`,
      [publicId],
    );
    let item: { id: string; order_id: string | null; public_id: string; manual_handoff_reference?: string } | undefined = result.rows[0];
    if (!item) {
      const manual = await client.query<{ id: string; public_id: string; manual_handoff_reference: string }>(
        `select id, public_id::text, manual_handoff_reference from public.smart_items
         where public_id = $1::uuid and owner_user_id is null and state = 'unassigned'
           and manual_handoff_reference is not null for update`, [publicId],
      );
      if (manual.rows[0]) item = { ...manual.rows[0], order_id: null };
    }
    if (!item) {
      await client.query("rollback");
      return { ok: false as const, message: tr("ماينفعش استعادة الكود إلا لقطعة غير مفعّلة مرتبطة بأوردر أو تسليم مباشر.") };
    }

    const current = await client.query<{ token_hash: string; print_nonce: string | null; consumed_at: string | null }>(
      "select token_hash,print_nonce,consumed_at from public.smart_item_activation_tokens where smart_item_id=$1 for update",
      [item.id],
    );
    const token = current.rows[0];
    if (!token) throw new Error("Activation token record missing.");
    if (token.print_nonce !== null) {
      const existingCode = activationCodeForPrint(item.public_id, Number(token.print_nonce));
      if (token.token_hash === activationHash(existingCode) && !token.consumed_at) {
        await client.query("commit");
        return { ok: true as const, message: tr("ده نفس كود التفعيل الموجود على البطاقة داخل العبوة."), activationCode: existingCode };
      }
    }
    const issued = await issueActivationCode(client, item.public_id);

    const rotated = await client.query(
      `update public.smart_item_activation_tokens
       set token_hash = $2, print_nonce = $3, consumed_at = null, expires_at = null
       where smart_item_id = $1
       returning id`,
      [item.id, issued.tokenHash, issued.nonce],
    );
    if (!rotated.rowCount) throw new Error("Activation token record missing.");

    if (item.order_id) {
      await client.query(
        `insert into public.order_notes (order_id, author_id, body) values ($1, $2, $3)`,
        [item.order_id, staff.user_id, `إعادة إصدار كود تفعيل للقطعة ${publicId}. أُلغي الكود السابق.`],
      );
    } else if (item.manual_handoff_reference) {
      await client.query(
        `insert into app_private.manual_item_handoff_events(smart_item_id, action, reference, note, actor_id)
         values ($1, 'activation_code_replaced', $2, $3, $4)`,
        [item.id, item.manual_handoff_reference, "إعادة إصدار كود تفعيل وإلغاء السابق", staff.user_id],
      );
    }
    await client.query("commit");
    revalidatePath("/admin/items");
    return { ok: true as const, message: tr("الكود الجديد يظهر مرة واحدة. اطبعه على بطاقة وضعها داخل العبوة؛ لا تحفره على القطعة ولا تضعه في QR أو NFC."), activationCode: issued.code };
  } catch {
    await client.query("rollback").catch(() => undefined);
    return { ok: false as const, message: tr("تعذر إصدار كود جديد. راجع سجل القطعة وحالة الأوردر.") };
  } finally {
    client.release();
  }
}
