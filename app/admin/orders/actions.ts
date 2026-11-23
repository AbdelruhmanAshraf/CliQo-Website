"use server";
import {getCopy} from "@/i18n/server";


import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/admin";
import { lineStatusLabels, orderStatusLabels, type LineStatus, type OrderStatus } from "../data";

type Result = { ok: boolean; message: string };
const operations = ["owner", "admin", "operations", "fulfillment"] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function changeOrderStatus(id: string, status: OrderStatus, previous?: OrderStatus): Promise<Result> {
  const tr = await getCopy();
  if (!uuid.test(id) || !Object.hasOwn(orderStatusLabels, status)) return { ok: false, message: tr("حالة الطلب غير صحيحة.") };
  const { supabase } = await requireStaff(operations);
  let update = supabase.from("orders").update({ state: status }).eq("id", id).is("archived_at", null);
  if (previous) update = update.eq("state", previous);
  const { data, error } = await update.select("id").maybeSingle();
  if (error?.message.includes("T1 design file")) return { ok: false, message: tr("لا يمكن بدء الإنتاج قبل رفع ملف تصميم T1.") };
  if (error?.message.includes("confirm the order")) return { ok: false, message: tr("انقل الطلب إلى مؤكد أولًا.") };
  if (error || !data) return { ok: false, message: tr("تعذر نقل الطلب. راجع حالته والمخزون.") };
  revalidatePath("/admin/orders");
  revalidatePath("/cliqo-control/orders");
  return { ok: true, message: tr("تم تحديث حالة الطلب.") };
}

export async function changeLineStatus(id: string, status: LineStatus): Promise<Result> {
  const tr = await getCopy();
  if (!uuid.test(id) || !Object.hasOwn(lineStatusLabels, status)) return { ok: false, message: tr("حالة البند غير صحيحة.") };
  const { supabase } = await requireStaff(operations);
  const { data, error } = await supabase.from("order_lines").update({ state: status }).eq("id", id).select("id").single();
  if (error?.message.includes("T1 design file")) return { ok: false, message: tr("ارفع ملف تصميم T1 قبل بدء الإنتاج.") };
  if (error || !data) return { ok: false, message: tr("تعذر حفظ حالة البند. جرّب مرة ثانية.") };
  revalidatePath("/admin/orders");
  revalidatePath("/cliqo-control/orders");
  return { ok: true, message: tr("تم تحديث حالة البند.") };
}

export async function addOrderNote(orderId: string, body: string): Promise<Result> {
  const tr = await getCopy();
  const clean = body.trim();
  if (!uuid.test(orderId) || clean.length < 1 || clean.length > 2000) return { ok: false, message: tr("اكتب ملاحظة من ١ إلى ٢٠٠٠ حرف.") };
  const { supabase, staff } = await requireStaff();
  const { error } = await supabase.from("order_notes").insert({ order_id: orderId, author_id: staff.user_id, body: clean });
  if (error) return { ok: false, message: tr("تعذر حفظ الملاحظة. جرّب مرة ثانية.") };
  revalidatePath("/admin/orders");
  revalidatePath("/cliqo-control/orders");
  return { ok: true, message: tr("تم حفظ الملاحظة.") };
}


export async function setOrderArchived(id: string, archive: boolean): Promise<Result> {
  const tr = await getCopy();
  await requireStaff(["owner", "admin"]);
  if (!uuid.test(id) || typeof archive !== "boolean") return { ok: false, message: tr("تعذر تحديد الطلب.") };
  const { rowCount } = await getDb().query(
    `update public.orders set archived_at = case when $2::boolean then now() else null end
     where id = $1 and (state in ('cancelled', 'returned', 'delivered'))
       and (archived_at is null) = $2`,
    [id, archive],
  );
  if (!rowCount) return { ok: false, message: tr("تعذر تحديث الأرشيف. حدّث الصفحة وراجع حالة الطلب.") };
  revalidatePath("/admin/orders");
  revalidatePath("/cliqo-control/orders");
  return { ok: true, message: archive ? tr("تم حذف الطلب من اللوحة. تقدر تسترجعه من الأرشيف.") : tr("تم استرجاع الطلب.") };
}
