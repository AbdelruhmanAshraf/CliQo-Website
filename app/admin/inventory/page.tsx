import {snapshotLabel} from "@/i18n/catalog";
import {optionLabel} from "@/i18n/catalog";
import { getCopy } from '@/i18n/server';
import { requireStaff } from "@/lib/admin";
import { AdminShell } from "../admin-shell";
import { ReceiveStockForm } from "./receive-stock-form";
import { SkuManager } from "./sku-manager";

export async function generateMetadata() {
  const tr = await getCopy();
  return { title: tr("المخزون | CliQo Ops") };
}
export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const tr = await getCopy();

  const { supabase, staff } = await requireStaff(["owner", "admin", "operations", "fulfillment"]);
  const [skusResult, balancesResult, movementsResult, familiesResult] = await Promise.all([
    supabase.from("product_skus").select("id,sku_code,display_name,options,state,price_minor,price_approved,sample_approved,fulfillment_approved").order("sku_code").limit(100),
    supabase.from("inventory_balances").select("sku_id,on_hand,reserved").limit(100),
    supabase.from("inventory_movements").select("id,sku_id,kind,quantity,reason,created_at").order("created_at", { ascending: false }).limit(30),
    supabase.from("product_families").select("id,family_key,name_ar,name_en").order("sort_order"),
  ]);
  if (skusResult.error || balancesResult.error || movementsResult.error || familiesResult.error) throw new Error("تعذر تحميل المخزون.");
  const skus = skusResult.data ?? [];
  const balances = new Map((balancesResult.data ?? []).map((balance) => [balance.sku_id, balance]));
  const ready = skus.filter((sku) => sku.state === "ready" && sku.price_approved && sku.sample_approved && sku.fulfillment_approved);
  const reserved = (balancesResult.data ?? []).reduce((sum, balance) => sum + balance.reserved, 0);
  return <AdminShell staffName={staff.display_name} staffRole={staff.role}><section className="ops-content">
    <div className="ops-heading"><div><p className="ops-eyebrow">{tr("المخزون والتجهيز")}</p><h1>{tr("المخزون")}</h1><p>{tr("كميات وحالة اعتماد نسخ البيع المسجلة.")}</p></div></div>
    <div className="inventory-summary"><article><span>{tr("أصناف معتمدة")}</span><strong>{ready.length}</strong><small>{tr("سعر وعينة وتجهيز معتمدون")}</small></article><article><span>{tr("إجمالي المحجوز")}</span><strong>{reserved}</strong><small>{tr("من سجلات المخزون")}</small></article><article><span>{tr("تحتاج اعتماد")}</span><strong>{skus.length - ready.length}</strong><small>{tr("ليست متاحة للبيع بعد")}</small></article></div>
    <div className="inventory-gate"><span className="gate-icon">!</span><p><strong>{tr("البيع يتطلب اعتماد كل SKU")}</strong><span>{tr("السعر والعينة والتجهيز والمخزون الفعلي شروط فتح الشراء.")}</span></p></div>
    <div className="orders-panel customer-panel"><div className="orders-toolbar"><div className="toolbar-title"><strong>{tr("نسخ المنتجات")}</strong><span>{skus.length}  {tr("مسجلة من أحدث ١٠٠")}</span></div></div>
      <div className="table-scroll"><table className="orders-table inventory-table"><thead><tr><th>SKU</th><th>{tr("المنتج")}</th><th>{tr("الخيار")}</th><th>{tr("المتاح")}</th><th>{tr("محجوز")}</th><th>{tr("السعر")}</th><th>{tr("الحالة")}</th></tr></thead><tbody>
        {skus.map((sku) => {
          const balance = balances.get(sku.id);
          const approved = sku.state === "ready" && sku.price_approved && sku.sample_approved && sku.fulfillment_approved;
          return <tr key={sku.id}><td dir="ltr" className="sku-cell">{sku.sku_code}</td><td><strong>{snapshotLabel(tr, sku.display_name)}</strong></td><td>{Object.values(sku.options ?? {}).map((value) => optionLabel(tr, String(value))).join(" · ") || "—"}</td><td>{(balance?.on_hand ?? 0) - (balance?.reserved ?? 0)}</td><td>{balance?.reserved ?? 0}</td><td>{sku.price_minor ? tr("{value0} ج.م", {value0: (sku.price_minor / 100).toLocaleString(tr.numberLocale)}) : "—"}</td><td><span className="stock-state">{approved ? tr("معتمد") : tr("قيد الاعتماد")}</span></td></tr>;
        })}
        {skus.length === 0 && <tr><td colSpan={7} className="empty-results">{tr("لسه مفيش SKU مسجلة.")}</td></tr>}
      </tbody></table></div><footer className="table-footer"><span>{tr("الكميات من قاعدة البيانات. إضافة حركات المخزون قيد التطوير.")}</span></footer>
    </div>
    {staff.role === "owner" && <SkuManager families={familiesResult.data ?? []} skus={skus} />}
    {staff.role === "owner" && <ReceiveStockForm skus={ready.map((sku) => ({ id: sku.id, name: sku.display_name + " · " + sku.sku_code }))} />}
    <div className="orders-panel customer-panel"><div className="orders-toolbar"><div className="toolbar-title"><strong>{tr("آخر حركات المخزون")}</strong><span>{movementsResult.data?.length ?? 0}  {tr("حركة")}</span></div></div>
      <div className="table-scroll"><table className="orders-table"><thead><tr><th>SKU</th><th>{tr("الحركة")}</th><th>{tr("الكمية")}</th><th>{tr("السبب")}</th><th>{tr("التاريخ")}</th></tr></thead><tbody>
        {(movementsResult.data ?? []).map((movement) => <tr key={movement.id}><td dir="ltr">{skus.find((sku) => sku.id === movement.sku_id)?.sku_code ?? "—"}</td><td>{({ received: tr("استلام"), adjusted: tr("تعديل"), reserved: tr("حجز"), released: tr("تحرير"), consumed: tr("صرف"), damaged: tr("تالف") } as Record<string, string>)[movement.kind] ?? movement.kind}</td><td>{movement.quantity}</td><td>{movement.reason}</td><td>{new Intl.DateTimeFormat(tr.numberLocale, { dateStyle: "medium", timeZone: "Africa/Cairo" }).format(new Date(movement.created_at))}</td></tr>)}
        {!movementsResult.data?.length && <tr><td colSpan={5} className="empty-results">{tr("لسه مفيش حركات مخزون.")}</td></tr>}
      </tbody></table></div>
    </div>
  </section></AdminShell>;
}
