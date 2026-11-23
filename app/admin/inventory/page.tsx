import {snapshotLabel} from "@/i18n/catalog";
import {optionLabel} from "@/i18n/catalog";
import { getCopy } from '@/i18n/server';
import { requireStaff } from "@/lib/admin";
import { getSmartItemQrTarget } from "@/lib/smart-item-qr";
import { getDb } from "@/lib/db";
import { getPrintTemplate } from "@/lib/qr-print-layout";
import { catalogDesigns } from "@/lib/catalog-designs";
import { productPhotos } from "@/lib/product-photos";
import { AdminShell } from "../admin-shell";
import { ReceiveStockForm } from "./receive-stock-form";
import { BulkProductionOrder } from "./bulk-production-order";
import { StockAdjustmentForm } from "./stock-adjustment-form";
import { SkuManager } from "./sku-manager";
import { SmartItemsRegistry } from "../items/registry";
import './inventory-refine.css';

export async function generateMetadata() {
  const tr = await getCopy();
  return { title: tr("المخزون | CliQo Ops") };
}
export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const tr = await getCopy();

  const { supabase, staff } = await requireStaff(["owner", "admin"]);
  const [skusResult, balancesResult, movementsResult, familiesResult] = await Promise.all([
    supabase.from("product_skus").select("id,product_family_id,sku_code,display_name,options,state,price_minor,price_approved,sample_approved,fulfillment_approved").eq("checkout_test",false).order("sku_code").limit(200),
    supabase.from("inventory_balances").select("sku_id,on_hand,reserved,sku:product_skus!inner(checkout_test)").eq("sku.checkout_test",false).limit(100),
    supabase.from("inventory_movements").select("id,sku_id,kind,quantity,reason,created_at,sku:product_skus!inner(checkout_test)").eq("sku.checkout_test",false).order("created_at", { ascending: false }).limit(30),
    supabase.from("product_families").select("id,family_key,name_ar,name_en,has_nfc_qr,catalog_deleted_at").order("sort_order"),
  ]);
  if (skusResult.error || balancesResult.error || movementsResult.error || familiesResult.error) throw new Error("تعذر تحميل المخزون.");
  const skus = skusResult.data ?? [];
  const batches = staff.role === "owner" ? (await getDb().query<{ sku_id: string; batch_id: string; quantity: number; created_at: Date }>(`
    select * from (select sku_id,production_batch_id::text as batch_id,count(*)::int as quantity,min(created_at) as created_at,
      row_number() over(partition by sku_id order by min(created_at) desc) as rank
    from public.smart_items where production_batch_id is not null group by sku_id,production_batch_id) b where rank<=5`)).rows : [];
  const pendingBatches = staff.role === "owner" ? (await getDb().query<{ sku_id: string; batch_id: string; quantity: number; created_at: Date }>(`
    select sku_id,production_batch_id::text as batch_id,count(*)::int as quantity,min(created_at) as created_at
    from public.smart_items where production_batch_id is not null and state='unassigned'
      and production_planned_at is not null and owner_user_id is null and order_line_id is null and manual_handoff_reference is null
    group by sku_id,production_batch_id order by min(created_at) desc`)).rows : [];
  const printSkus = skus.map((sku) => {
    const family = familiesResult.data?.find((item) => item.id === sku.product_family_id);
    const options = sku.options as Record<string, string>;
    const designFamily = family?.family_key === "pvc-card" ? "card" : family?.family_key ?? "";
    const catalogDesign = catalogDesigns[designFamily]?.find((item) => item.face === options?.face && item.variant === options?.variant);
    const inventoryImage = catalogDesign?.images.find((image) => image.kind === "mockup")?.src
      ?? productPhotos[designFamily] ?? productPhotos.stand;
    const printTemplate = getPrintTemplate(family?.family_key ?? "", options?.face, options?.variant, options?.design);
    const printTemplateFile = printTemplate?.file;
    const printTemplatePreview = catalogDesign?.images.find((image) => image.kind === "preview")?.src;
    const printPreviewHasQr = Boolean(printTemplatePreview);
    const printSize = printTemplate?.widthMm && printTemplate.heightMm
      ? `${(printTemplate.widthMm/10).toLocaleString(tr.numberLocale)} × ${(printTemplate.heightMm/10).toLocaleString(tr.numberLocale)}`
      : family?.family_key === "stand" ? "١٠ × ١٥" : family?.family_key === "pvc-card" ? "٥٫٤ × ٨٫٥٦" : "١٢ × ١٢";
    const balance=(balancesResult.data??[]).find(item=>item.sku_id===sku.id);
    return { ...sku, hasNfcQr: family?.has_nfc_qr ?? false, onHand:balance?.on_hand??0, reserved:balance?.reserved??0, inventoryImage, printTemplateFile, printTemplatePreview, printPreviewHasQr,
      printTemplateRetired: printTemplate?.retired,
      printTemplateLabel: `${sku.display_name} · ${printSize} سم`,
      printBatches: batches.filter((batch) => batch.sku_id === sku.id).map((batch) => ({ batchId: batch.batch_id, quantity: batch.quantity, createdAt: batch.created_at.toISOString() })) };
  });
  const plannedResult = await getDb().query<{ sku_id: string; count: number }>(
    `select sku_id,count(*)::int as count from public.smart_items
      where state='unassigned' and production_planned_at is not null
        and owner_user_id is null and order_line_id is null and manual_handoff_reference is null
     group by sku_id`,
  );
  const plannedBySku = Object.fromEntries(plannedResult.rows.map((row) => [row.sku_id, row.count]));
  const plannedTotal = plannedResult.rows.reduce((sum, row) => sum + row.count, 0);
  const legacyPlannedResult = staff.role === "owner" ? await getDb().query<{ sku_id: string; count: number }>(
    `select sku_id,count(*)::int as count from public.smart_items
      where state='unassigned' and production_planned_at is not null and production_batch_id is null
        and owner_user_id is null and order_line_id is null and manual_handoff_reference is null
      group by sku_id`,
  ) : { rows: [] as { sku_id: string; count: number }[] };
  const legacyPlannedBySku = Object.fromEntries(legacyPlannedResult.rows.map((row) => [row.sku_id, row.count]));
  const balances = new Map((balancesResult.data ?? []).map((balance) => [balance.sku_id, balance]));
  const productionSkus = printSkus.filter((sku) => sku.state !== "paused" && sku.hasNfcQr && !sku.printTemplateRetired).map((sku) => {
    const family = familiesResult.data?.find((item) => item.id === sku.product_family_id);
    return { id: sku.id, sku_code: sku.sku_code, name: snapshotLabel(tr, sku.display_name), hasTemplate: Boolean(sku.printTemplateFile),
      category: tr(family?.name_ar ?? "غير مصنف"), options: sku.options as Record<string, string>, image: sku.inventoryImage };
  });
  const stockAdjustmentSkus = printSkus.filter((sku) => sku.onHand > sku.reserved).map((sku) => ({
    id: sku.id, label: `${snapshotLabel(tr, sku.display_name)} · ${sku.sku_code} · ${sku.onHand - sku.reserved} ${tr("متاح")}`,
  }));
  return <AdminShell staffName={staff.display_name} staffRole={staff.role}><section className="ops-content">
    <div className="ops-heading"><div><p className="ops-eyebrow">{tr("المخزون والتجهيز")}</p><h1>{tr("المخزون")}</h1><p>{tr("من طلبية المصنع إلى الاستلام والجرد، كل حركة مربوطة بالصنف والكمية.")}</p></div><a className="export-button" href="#bulk-production">{tr("طلبية تصنيع جديدة ↓")}</a></div>
    <div className="inventory-summary"><article><span>{tr("أصناف مسجلة")}</span><strong>{skus.length}</strong><small>{tr("ستاند · كوستر · كارت")}</small></article><article><span>{tr("قطع مخططة للتصنيع")}</span><strong>{plannedTotal}</strong><small>{tr("لها ID وQR ولم تصل بعد")}</small></article><article><span>{tr("رصيد فعلي بالمخزون")}</span><strong>{(balancesResult.data ?? []).reduce((sum, row) => sum + row.on_hand, 0)}</strong><small>{tr("البيع يحتاج اعتماد السعر والعينة")}</small></article></div>
    {staff.role === "owner" && <div id="bulk-production" className="inventory-primary-workflow"><BulkProductionOrder skus={productionSkus} /></div>}
    {staff.role === "owner" && <SkuManager families={familiesResult.data ?? []} skus={printSkus} plannedBySku={plannedBySku} />}
    {staff.role === "owner" && <details id="stock-receipt" className="inventory-stock-section inventory-workflow-panel"><summary><span>＋</span><strong>{tr("إضافة مخزون فعلي")}</strong><small>{tr("سجّل القطع التي وصلت من المصنع")}</small></summary><ReceiveStockForm skus={printSkus.filter((sku) => sku.state !== "paused").map((sku) => ({ id: sku.id, name: sku.display_name + " · " + sku.sku_code, image: sku.inventoryImage }))} pendingBatches={pendingBatches.map((batch) => ({ skuId: batch.sku_id, batchId: batch.batch_id, quantity: batch.quantity, createdAt: batch.created_at.toISOString() }))} legacyPendingBySku={legacyPlannedBySku} qrTarget={getSmartItemQrTarget()} /></details>}
    {staff.role === "owner" && <details className="inventory-workflow-panel inventory-adjustment-panel"><summary><span>−</span><strong>{tr("خصم أو تصحيح مخزون")}</strong><small>{tr("بتوثيق سبب التعديل")}</small></summary><StockAdjustmentForm skus={stockAdjustmentSkus} /></details>}
    <details className="inventory-details"><summary>{tr("عرض نسخ المنتجات وحالة اعتمادها")}</summary><div className="orders-panel customer-panel"><div className="orders-toolbar"><div className="toolbar-title"><strong>{tr("نسخ المنتجات")}</strong><span>{skus.length}  {tr("مسجلة في هذه القائمة")}</span></div></div>
      <div className="table-scroll"><table className="orders-table inventory-table"><thead><tr><th>SKU</th><th>{tr("المنتج")}</th><th>{tr("الخيار")}</th><th>{tr("مخطط للتصنيع")}</th><th>{tr("المتاح")}</th><th>{tr("محجوز")}</th><th>{tr("السعر")}</th><th>{tr("الحالة")}</th></tr></thead><tbody>
        {skus.map((sku) => {
          const balance = balances.get(sku.id);
          const approved = sku.state === "ready" && sku.price_approved && sku.sample_approved && sku.fulfillment_approved;
          const missing = [
            !sku.price_minor ? tr("أدخل السعر") : !sku.price_approved ? tr("اعتمد السعر") : "",
            !sku.sample_approved ? tr("اعتمد العينة") : "",
            !sku.fulfillment_approved ? tr("اعتمد التجهيز والتغليف") : "",
          ].filter(Boolean);
          const status = approved ? ((balance?.on_hand ?? 0) - (balance?.reserved ?? 0) > 0 ? tr("متاح للبيع") : tr("نفد المخزون · أضف كمية")) : missing[0];
          return <tr key={sku.id}><td dir="ltr" className="sku-cell">{sku.sku_code}</td><td><strong>{snapshotLabel(tr, sku.display_name)}</strong></td><td>{Object.values(sku.options ?? {}).map((value) => optionLabel(tr, String(value))).join(" · ") || "—"}</td><td>{plannedBySku[sku.id] ?? 0}</td><td>{Math.max(0,(balance?.on_hand ?? 0) - (balance?.reserved ?? 0))}</td><td>{balance?.reserved ?? 0}</td><td>{sku.price_minor ? tr("{value0} ج.م", {value0: (sku.price_minor / 100).toLocaleString(tr.numberLocale)}) : "—"}</td><td><span className={`stock-state ${approved ? "stock-state-ready" : "stock-state-pending"}`}>{status}</span>{missing.length > 1 && <small className="stock-next-step">{tr("أيضًا:")} {missing.slice(1).join("، ")}</small>}</td></tr>;
        })}
        {skus.length === 0 && <tr><td colSpan={8} className="empty-results">{tr("لسه مفيش SKU مسجلة.")}</td></tr>}
      </tbody></table></div><footer className="table-footer"><span>{tr("الكميات من قاعدة البيانات.")}</span></footer>
    </div></details>
    <details className="inventory-details"><summary>{tr("عرض آخر حركات المخزون")} · {movementsResult.data?.length ?? 0}</summary><div className="orders-panel customer-panel">
      <div className="table-scroll"><table className="orders-table"><thead><tr><th>SKU</th><th>{tr("الحركة")}</th><th>{tr("الكمية")}</th><th>{tr("السبب")}</th><th>{tr("التاريخ")}</th></tr></thead><tbody>
        {(movementsResult.data ?? []).map((movement) => <tr key={movement.id}><td dir="ltr">{skus.find((sku) => sku.id === movement.sku_id)?.sku_code ?? "—"}</td><td>{({ received: tr("استلام"), adjusted: tr("تعديل"), reserved: tr("حجز"), released: tr("تحرير"), consumed: tr("صرف"), damaged: tr("تالف") } as Record<string, string>)[movement.kind] ?? movement.kind}</td><td>{movement.quantity}</td><td>{movement.reason}</td><td>{new Intl.DateTimeFormat(tr.numberLocale, { dateStyle: "medium", timeZone: "Africa/Cairo" }).format(new Date(movement.created_at))}</td></tr>)}
        {!movementsResult.data?.length && <tr><td colSpan={5} className="empty-results">{tr("لسه مفيش حركات مخزون.")}</td></tr>}
      </tbody></table></div>
    </div></details>
    {staff.role === "owner" && <details className="inventory-workflow-panel inventory-registry-panel"><summary><span>▣</span><strong>{tr("سجل القطع وQR")}</strong><small>{tr("افتحه لمراجعة القطع الفريدة")}</small></summary><SmartItemsRegistry /></details>}
  </section></AdminShell>;
}
