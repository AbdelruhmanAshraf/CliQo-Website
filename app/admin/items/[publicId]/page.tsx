import { notFound } from "next/navigation";
import Link from "next/link";
import { requireStaff } from "@/lib/admin";
import { AdminShell } from "../../admin-shell";
import { ManualHandoffForm } from "./manual-handoff-form";
import { ActivationCodeReset } from "../activation-code-reset";
import { getDb } from "@/lib/db";
import { PhysicalCheckForm } from "./physical-check-form";
import { getCopy } from "@/i18n/server";
import { getSmartItemQrTarget } from "@/lib/smart-item-qr";
import { getPrintTemplate } from "@/lib/qr-print-layout";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SmartItemAdminDetail({ params }: { params: Promise<{ publicId: string }> }) {
  const tr = await getCopy();
  const { publicId } = await params;
  if (!uuid.test(publicId)) notFound();
  const { supabase, staff } = await requireStaff(["owner"]);
  const { data: item } = await supabase.from("smart_items")
    .select("id,public_id,sku_id,order_line_id,owner_user_id,state,production_planned_at,manual_handoff_reference,manual_handoff_at")
    .eq("public_id", publicId).maybeSingle();
  if (!item) notFound();
  const { data: sku } = await supabase.from("product_skus")
    .select("display_name,options,product_family_id,checkout_test").eq("id", item.sku_id).maybeSingle();
  if (!sku) notFound();
  const { data: family } = await supabase.from("product_families")
    .select("name_ar,name_en,family_key").eq("id", sku.product_family_id).maybeSingle();
  const options = (sku.options ?? {}) as Record<string, string>;
  const qrTarget = getSmartItemQrTarget();
  const printTemplate = getPrintTemplate(family?.family_key ?? "", options.face ?? "", options.variant ?? "", options.design ?? "");
  const publicUrl = qrTarget ? new URL(`/s/${item.public_id}`, qrTarget.origin).toString() : null;
  const physical = await getDb().query<{
    nfc_mode: "unwritten" | "prewritten" | "customer_write";
    qr_scanned_at: string | null; nfc_tested_at: string | null; nfc_locked_at: string | null; note: string;
  }>(`select nfc_mode, qr_scanned_at, nfc_tested_at, nfc_locked_at, note
      from app_private.smart_item_physical_checks where smart_item_id = $1`, [item.id]);
  const canHandoff = !sku.checkout_test && item.state === "ready" && !item.owner_user_id && !item.order_line_id && !item.manual_handoff_reference;
  const canReset = !item.owner_user_id && (
    (item.state === "ready" && Boolean(item.order_line_id))
    || (item.state === "unassigned" && Boolean(item.manual_handoff_reference))
  );

  return <AdminShell staffName={staff.display_name} staffRole={staff.role}><section className="ops-content">
    <div className="ops-heading"><div><p className="ops-eyebrow">{tr(sku.checkout_test ? "قطعة اختبار" : "قطعة ذكية")}</p><h1>{sku.display_name}</h1><p>{tr.locale === "en" ? family?.name_en : family?.name_ar} · {options.face} · {options.variant}</p></div>
      <Link href="/cliqo-control/inventory#smart-items">← {tr("العودة إلى المخزون وسجل القطع")}</Link></div>
    <div className="orders-panel customer-panel" style={{ padding: 20 }}>
      <div className="smart-item-identity"><span>{tr("ID القطعة")}</span><code dir="ltr">{item.public_id}</code></div>
      <div className="smart-item-identity"><span>{tr("الرابط العام للـQR وNFC")}</span><code dir="ltr">{publicUrl ?? tr("عنوان الموقع غير مضبوط")}</code></div>
      {qrTarget && <img className="smart-item-qr-preview" src={`/admin/items/${item.public_id}/qr?preview=1`} alt={tr("QR الخاص بهذه القطعة")} width={220} height={220} />}
      {qrTarget && <p><a className="export-button" href={`/admin/items/${item.public_id}/qr`} download>{tr(qrTarget.preview ? "نزّل QR للتجربة · SVG" : "نزّل QR للطباعة · SVG")}</a></p>}
      {qrTarget && printTemplate?.frontFile && <p><a className="export-button" href={`/admin/items/${item.public_id}/print?side=front`} download>{tr.locale === "ar" ? "نزّل الوجه الأمامي للكارت · SVG" : "Download card front · SVG"}</a></p>}
      {qrTarget && printTemplate && <p><a className="export-button" href={`/admin/items/${item.public_id}/print`} download>{tr(qrTarget.preview ? "نزّل التصميم مع QR للتجربة" : "نزّل التصميم مع QR في موضعه")}</a></p>}
      {qrTarget?.preview && <p>{tr("QR التجربة يفتح الموقع المحلي فقط. لا تطبعه على منتج للبيع.")}</p>}
      <p>{tr("الحالة")}: {item.state === "claimed" ? tr("مفعّلة") : item.state === "disabled" ? tr("متوقفة") : item.manual_handoff_reference ? tr("بانتظار تفعيل عميل مباشر") : item.order_line_id ? tr("مخصصة لأوردر") : item.production_planned_at && item.state === "unassigned" ? tr("مخططة للتصنيع") : tr("متاحة في المخزون")}</p>
      {item.manual_handoff_reference && <p>{tr("مرجع التسليم المباشر")}: <strong dir="ltr">{item.manual_handoff_reference}</strong></p>}
      {canReset && <div><p>{tr("إذا فُقد كود التفعيل قبل استخدامه")}: </p><ActivationCodeReset publicId={item.public_id}/></div>}
    </div>
    <PhysicalCheckForm publicId={item.public_id} initial={physical.rows[0] ?? null} />
    <ManualHandoffForm publicId={item.public_id} face={options.face ?? ""} canHandoff={canHandoff} />
  </section></AdminShell>;
}
