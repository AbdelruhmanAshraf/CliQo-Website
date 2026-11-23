"use server";

import { revalidatePath } from "next/cache";
import { getCopy } from "@/i18n/server";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/admin";

type Result = { ok: boolean; message: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function addAdSpend(formData: FormData): Promise<Result> {
  const tr = await getCopy();
  const pick = (ar: string, en: string) => tr.locale === "ar" ? ar : en;
  const { staff } = await requireStaff(["owner"]);
  const spendDate = String(formData.get("spendDate") ?? "");
  const channel = String(formData.get("channel") ?? "").trim();
  const campaign = String(formData.get("campaign") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const amount = String(formData.get("amount") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(spendDate) || !Number.isFinite(Date.parse(`${spendDate}T12:00:00Z`))
    || channel.length < 1 || channel.length > 40 || campaign.length < 2 || campaign.length > 120
    || note.length > 300 || !/^\d{1,7}(?:\.\d{1,2})?$/.test(amount)) {
    return { ok: false, message: pick("راجع التاريخ والمصدر واسم الحملة والمبلغ.", "Check the date, channel, campaign name and amount.") };
  }
  const amountMinor = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1 || amountMinor > 999_999_999) {
    return { ok: false, message: pick("المبلغ يجب أن يكون أكبر من صفر وأقل من عشرة ملايين جنيه.", "Amount must be greater than zero and below EGP 10,000,000.") };
  }
  try {
    await getDb().query(
      `insert into app_private.admin_ad_spend(spend_date,channel,campaign,amount_minor,note,created_by)
       values($1::date,$2,$3,$4,$5,$6)`,
      [spendDate, channel, campaign, amountMinor, note, staff.user_id],
    );
    revalidatePath("/cliqo-control");
    return { ok: true, message: pick("تم تسجيل مصروف الإعلان.", "Advertising spend saved.") };
  } catch {
    return { ok: false, message: pick("تعذر حفظ المصروف. حدّث الصفحة وحاول مرة أخرى.", "Could not save spend. Refresh and try again.") };
  }
}

export async function deleteAdSpend(id: string): Promise<Result> {
  const tr = await getCopy();
  const pick = (ar: string, en: string) => tr.locale === "ar" ? ar : en;
  await requireStaff(["owner"]);
  if (!uuid.test(id)) return { ok: false, message: pick("سجل المصروف غير صالح.", "Invalid spend record.") };
  try {
    const result = await getDb().query("delete from app_private.admin_ad_spend where id=$1", [id]);
    if (!result.rowCount) return { ok: false, message: pick("سجل المصروف غير موجود.", "Spend record not found.") };
    revalidatePath("/cliqo-control");
    return { ok: true, message: pick("تم حذف سجل المصروف.", "Spend record deleted.") };
  } catch {
    return { ok: false, message: pick("تعذر حذف سجل المصروف.", "Could not delete spend record.") };
  }
}
