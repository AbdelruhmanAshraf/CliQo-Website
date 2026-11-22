import { getCopy } from '@/i18n/server';
import { requireStaff } from "@/lib/admin";
import { ActivationCodeReset } from "./activation-code-reset";
import Link from "next/link";
import { getSmartItemQrTarget } from "@/lib/smart-item-qr";

export async function SmartItemsRegistry() {
  const tr = await getCopy();

  const { supabase } = await requireStaff(["owner"]);
  const qrTarget = getSmartItemQrTarget();
  const { data, error } = await supabase.from("smart_items")
    .select("id,public_id,sku_id,order_line_id,owner_user_id,state,production_planned_at,manual_handoff_reference,created_at,sku:product_skus!inner(checkout_test)").eq("sku.checkout_test",false)
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
  const unclaimed = items.filter((item) => item.state === "ready" || (item.state === "unassigned" && item.manual_handoff_reference)).length;
  const claimed = items.filter((item) => item.state === "claimed").length;
  const assigned = items.filter((item) => item.order_line_id).length;

  return <section className="ops-content" id="smart-items">
    <div className="ops-heading"><div><p className="ops-eyebrow">{tr("سجل القطع الذكية")}</p><h1>{tr("قطع NFC/QR")}</h1><p>{tr("كل وحدة لها رابط عام ثابت وكود تفعيل خاص منفصل.")}</p></div></div>
    <div className="qr-workflow"><article><span>01</span><strong>{tr('اختار القطعة')}</strong><p>{tr('كل صف يمثل قطعة فعلية لها معرّف ورابط عام مستقلان.')}</p></article><article><span>02</span><strong>{tr('نزّل QR')}</strong><p>{tr('افتح سجل القطعة للمعاينة والتنزيل، أو استخدم ملف الدفعة للطباعة.')}</p></article><article><span>03</span><strong>{tr('افحص قبل التسليم')}</strong><p>{tr('امسح QR، اختبر NFC، وسجّل نتيجة الفحص داخل سجل القطعة.')}</p></article></div>
    <div className={`qr-domain-state ${qrTarget?.preview ? 'preview' : ''}`}><strong>{qrTarget?.preview ? tr('وضع تجربة محلي') : qrTarget ? tr('نطاق QR المعتمد') : tr('QR غير جاهز للتنزيل')}</strong><span dir="ltr">{qrTarget?.origin ?? tr('اضبط عنوان الموقع أولًا')}</span>{qrTarget?.preview && <small>{tr('ملفات التجربة لا تُطبع على المنتجات. رابط الإنتاج المعتمد: https://cliqoeg.com')}</small>}</div>
    <div className="inventory-summary"><article><span>{tr("إجمالي القطع")}</span><strong>{items.length}</strong><small>{tr("آخر ٣٠٠ سجل")}</small></article><article><span>{tr("بانتظار التفعيل")}</span><strong>{unclaimed}</strong><small>{tr("كودها محفور على الظهر")}</small></article><article><span>{tr("مخصصة لأوردر")}</span><strong>{assigned}</strong><small>{tr("تتخصص عند تأكيد الطلب")}</small></article><article><span>{tr("مرتبطة بحساب")}</span><strong>{claimed}</strong><small>{tr("ملكية مثبتة بكود")}</small></article></div>
    <div className="inventory-gate"><span className="gate-icon">!</span><p><strong>{tr("الرابط العام ليس كود تفعيل")}</strong><span>{tr("QR يحمل رابط القطعة العام. احفر المعرّف القصير على ظهر القطعة، وضع كود التفعيل الخاص على بطاقة داخل العبوة.")}</span></p></div>
    <div className="orders-panel customer-panel"><div className="orders-toolbar"><div className="toolbar-title"><strong>{tr("سجل الروابط والملكية")}</strong><span>{items.length}  {tr("قطعة")}</span></div>{qrTarget&&<div className="qr-print-actions"><a href="/admin/items/qr-batch" className="export-button">{tr(qrTarget.preview ? "دفعة QR للتجربة" : "دفعة QR للطباعة")}</a><a href="/admin/items/print-manifest" className="export-button">{tr("كشف ID والروابط")}</a></div>}</div>
      <div className="table-scroll"><table className="orders-table"><thead><tr><th>{tr("ID القطعة")}</th><th>{tr("الرابط العام")}</th><th>QR</th><th>SKU</th><th>{tr("الأوردر")}</th><th>{tr("حالة الملكية")}</th><th>{tr("المالك")}</th><th>{tr("استعادة التفعيل")}</th><th>{tr("تاريخ التجهيز")}</th></tr></thead><tbody>
        {items.map((item) => <tr key={item.id}>
          <td dir="ltr"><Link href={`/admin/items/${item.public_id}`}>{item.public_id}</Link></td>
          <td dir="ltr">{qrTarget ? <a href={new URL(`/s/${item.public_id}`, qrTarget.origin).toString()} target="_blank" rel="noreferrer">{new URL(`/s/${item.public_id}`, qrTarget.origin).toString()}</a> : tr("عنوان الموقع غير مضبوط")}</td>
          <td>{qrTarget ? <a href={`/admin/items/${item.public_id}/qr`} download>{tr(qrTarget.preview ? "QR تجربة · SVG" : "نزّل QR · SVG")}</a> : tr("عنوان الموقع غير مضبوط")}</td>
          <td>{skuNames.get(item.sku_id) ?? item.sku_id}</td>
          <td dir="ltr">{item.order_line_id ? orderReferences.get(item.order_line_id) ?? tr("تم التخصيص") : item.manual_handoff_reference ?? tr("مخزون جاهز")}</td>
          <td><span className="stock-state">{item.state === "claimed" ? tr("مفعّلة") : item.state === "disabled" ? tr("متوقفة") : item.manual_handoff_reference ? tr("تسليم مباشر · بانتظار التفعيل") : item.state === "ready" ? tr("جاهزة للتفعيل") : item.production_planned_at ? tr("مخططة للتصنيع") : tr("غير مجهزة")}</span></td>
          <td dir="ltr">{item.owner_user_id ?? "—"}</td>
          <td>{!item.owner_user_id && ((item.state === "ready" && item.order_line_id) || (item.state === "unassigned" && item.manual_handoff_reference)) ? <ActivationCodeReset publicId={item.public_id} /> : "—"}</td>
          <td>{new Intl.DateTimeFormat(tr.numberLocale, { dateStyle: "medium", timeZone: "Africa/Cairo" }).format(new Date(item.created_at))}</td>
        </tr>)}
        {!error && items.length === 0 && <tr><td colSpan={9} className="empty-results">{tr("استلام مخزون SKU ذكي ينشئ سجلًا مستقلًا لكل قطعة.")}</td></tr>}
        {error && <tr><td colSpan={9} className="empty-results">{tr("تعذر تحميل سجل القطع. تأكد من تطبيق ترقية Supabase المحلية.")}</td></tr>}
      </tbody></table></div>
    </div>
  </section>;
}

