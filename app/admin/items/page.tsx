import { getCopy } from '@/i18n/server';
import { requireStaff } from "@/lib/admin";
import { AdminShell } from "../admin-shell";
import { ActivationCodeReset } from "./activation-code-reset";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const tr = await getCopy();
  return { title: tr("قطع NFC/QR | CliQo Ops") };
}

export default async function AdminSmartItemsPage() {
  const tr = await getCopy();

  const { supabase, staff } = await requireStaff(["owner"]);
  const { data, error } = await supabase.from("smart_items")
    .select("id,public_id,sku_id,order_line_id,owner_user_id,state,created_at")
    .order("created_at", { ascending: false }).limit(300);
  const items = data ?? [];
  const skuIds = [...new Set(items.map((item) => item.sku_id))];
  const orderLineIds = [...new Set(items.flatMap((item) => item.order_line_id ? [item.order_line_id] : []))];
  const skuNames = new Map<string, string>();
  const orderReferences = new Map<string, string>();
  if (skuIds.length) {
    const { data: skus } = await supabase.from("product_skus").select("id,display_name").in("id", skuIds);
    for (const sku of skus ?? []) skuNames.set(sku.id, sku.display_name);
  }
  if (orderLineIds.length) {
    const { data: lines } = await supabase.from("order_lines").select("id,order_id").in("id", orderLineIds);
    const orderIds = [...new Set((lines ?? []).map((line) => line.order_id))];
    if (orderIds.length) {
      const { data: orders } = await supabase.from("orders").select("id,order_reference").in("id", orderIds);
      const referencesByOrder = new Map((orders ?? []).map((order) => [order.id, order.order_reference]));
      for (const line of lines ?? []) {
        const reference = referencesByOrder.get(line.order_id);
        if (reference) orderReferences.set(line.id, reference);
      }
    }
  }
  const unclaimed = items.filter((item) => item.state === "ready").length;
  const claimed = items.filter((item) => item.state === "claimed").length;
  const assigned = items.filter((item) => item.order_line_id).length;

  return <AdminShell staffName={staff.display_name} staffRole={staff.role}><section className="ops-content">
    <div className="ops-heading"><div><p className="ops-eyebrow">{tr("سجل القطع الذكية")}</p><h1>{tr("قطع NFC/QR")}</h1><p>{tr("كل وحدة لها رابط عام ثابت وكود تفعيل خاص منفصل.")}</p></div></div>
    <div className="inventory-summary"><article><span>{tr("إجمالي القطع")}</span><strong>{items.length}</strong><small>{tr("آخر ٣٠٠ سجل")}</small></article><article><span>{tr("بانتظار التفعيل")}</span><strong>{unclaimed}</strong><small>{tr("أكوادها داخل العبوات")}</small></article><article><span>{tr("مخصصة لأوردر")}</span><strong>{assigned}</strong><small>{tr("تتخصص عند تأكيد الطلب")}</small></article><article><span>{tr("مرتبطة بحساب")}</span><strong>{claimed}</strong><small>{tr("ملكية مثبتة بكود")}</small></article></div>
    <div className="inventory-gate"><span className="gate-icon">!</span><p><strong>{tr("الرابط العام ليس كود تفعيل")}</strong><span>{tr("تخصيص القطعة يظهر هنا بعد تأكيد الأوردر، وتعود للمخزون عند إلغائه قبل الشحن. لا تطبع QR على نطاق CliQo قبل اعتماد النطاق النهائي.")}</span></p></div>
    <div className="orders-panel customer-panel"><div className="orders-toolbar"><div className="toolbar-title"><strong>{tr("سجل الروابط والملكية")}</strong><span>{items.length}  {tr("قطعة")}</span></div></div>
      <div className="table-scroll"><table className="orders-table"><thead><tr><th>{tr("المعرف العام")}</th><th>QR</th><th>SKU</th><th>{tr("الأوردر")}</th><th>{tr("حالة الملكية")}</th><th>{tr("المالك")}</th><th>{tr("استعادة التفعيل")}</th><th>{tr("تاريخ التجهيز")}</th></tr></thead><tbody>
        {items.map((item) => <tr key={item.id}>
          <td dir="ltr"><a href={`/s/${item.public_id}`} target="_blank" rel="noreferrer">/s/{item.public_id}</a></td>
          <td><a href={`/admin/items/${item.public_id}/qr`}>{tr("تنزيل SVG")}</a></td>
          <td>{skuNames.get(item.sku_id) ?? item.sku_id}</td>
          <td dir="ltr">{item.order_line_id ? orderReferences.get(item.order_line_id) ?? tr("تم التخصيص") : tr("مخزون جاهز")}</td>
          <td><span className="stock-state">{item.state === "claimed" ? tr("مفعّلة") : item.state === "disabled" ? tr("متوقفة") : item.state === "ready" ? tr("جاهزة للتفعيل") : tr("غير مجهزة")}</span></td>
          <td dir="ltr">{item.owner_user_id ?? "—"}</td>
          <td>{item.state === "ready" && item.order_line_id ? <ActivationCodeReset publicId={item.public_id} /> : "—"}</td>
          <td>{new Intl.DateTimeFormat(tr.numberLocale, { dateStyle: "medium", timeZone: "Africa/Cairo" }).format(new Date(item.created_at))}</td>
        </tr>)}
        {!error && items.length === 0 && <tr><td colSpan={8} className="empty-results">{tr("استلام مخزون SKU ذكي ينشئ سجلًا مستقلًا لكل قطعة.")}</td></tr>}
        {error && <tr><td colSpan={8} className="empty-results">{tr("تعذر تحميل سجل القطع. تأكد من تطبيق ترقية Supabase المحلية.")}</td></tr>}
      </tbody></table></div>
    </div>
  </section></AdminShell>;
}
