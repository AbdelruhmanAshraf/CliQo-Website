"use server";
import {getCopy} from "@/i18n/server";


import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/admin";
import { getDb } from "@/lib/db";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function issueReplacementActivationCode(publicId: string) {
  const tr = await getCopy();
  if (!uuid.test(publicId)) return { ok: false as const, message: tr("معرّف القطعة غير صالح.") };

  const { staff } = await requireStaff(["owner"]);
  const client = await getDb().connect();
  const activationCode = randomBytes(16).toString("hex");
  const tokenHash = createHash("sha256").update(activationCode).digest("hex");

  try {
    await client.query("begin");
    const result = await client.query<{ id: string; order_id: string }>(
      `select i.id, o.id as order_id
       from public.smart_items i
       join public.order_lines l on l.id = i.order_line_id
       join public.orders o on o.id = l.order_id
       where i.public_id = $1 and i.owner_user_id is null and i.state = 'ready'
         and o.state not in ('new', 'cancelled', 'returned')
       for update of i, o`,
      [publicId],
    );
    const item = result.rows[0];
    if (!item) {
      await client.query("rollback");
      return { ok: false as const, message: tr("ماينفعش استعادة الكود إلا لقطعة غير مفعّلة مرتبطة بأوردر مؤكد.") };
    }

    const rotated = await client.query(
      `update public.smart_item_activation_tokens
       set token_hash = $2, consumed_at = null, expires_at = null
       where smart_item_id = $1
       returning id`,
      [item.id, tokenHash],
    );
    if (!rotated.rowCount) throw new Error("Activation token record missing.");

    await client.query(
      `insert into public.order_notes (order_id, author_id, body)
       values ($1, $2, $3)`,
      [item.order_id, staff.user_id, `إعادة إصدار كود تفعيل للقطعة ${publicId}. أُلغي الكود السابق.`],
    );
    await client.query("commit");
    revalidatePath("/admin/items");
    return { ok: true as const, message: tr("الكود الجديد يظهر مرة واحدة. انسخه إلى بطاقة تفعيل العميل."), activationCode };
  } catch {
    await client.query("rollback").catch(() => undefined);
    return { ok: false as const, message: tr("تعذر إصدار كود جديد. راجع سجل القطعة وحالة الأوردر.") };
  } finally {
    client.release();
  }
}
