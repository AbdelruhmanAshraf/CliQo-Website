import { getCopy } from '@/i18n/server';
import { requireStaff } from "@/lib/admin";
import { AdminShell } from "../admin-shell";

export async function generateMetadata() {
  const tr = await getCopy();
  return { title: tr("العملاء | CliQo Ops") };
}
export const dynamic = "force-dynamic";

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const tr = await getCopy();

  const { supabase, staff } = await requireStaff(["owner", "admin", "operations", "support"]);
  const [customersResult, ordersResult] = await Promise.all([
    supabase.from("customers").select("id,full_name,phone_e164,email,created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("orders").select("customer_id,created_at,shipping_address").order("created_at", { ascending: false }).limit(1000),
  ]);
  if (customersResult.error || ordersResult.error) throw new Error("تعذر تحميل العملاء.");
  const customers = customersResult.data ?? [];
  const query = ((await searchParams).q ?? "").trim().toLowerCase();
  const visible = customers.filter((customer) => `${customer.full_name} ${customer.phone_e164} ${customer.email ?? ""}`.toLowerCase().includes(query));
  const date = (value: string) => new Intl.DateTimeFormat(tr.numberLocale, { dateStyle: "medium", timeZone: "Africa/Cairo" }).format(new Date(value));
  return <AdminShell staffName={staff.display_name} staffRole={staff.role}><section className="ops-content">
    <div className="ops-heading"><div><p className="ops-eyebrow">{tr("علاقات العملاء")}</p><h1>{tr("العملاء")} <span className="count-pill">{customers.length}</span></h1><p>{tr("حسابات العملاء المحفوظة في قاعدة البيانات.")}</p></div></div>
    <div className="orders-panel customer-panel"><div className="orders-toolbar"><div className="toolbar-title"><strong>{tr("كل العملاء")}</strong><span>{visible.length}  {tr("نتيجة من أحدث ١٠٠")}</span></div><form method="get" className="search-field"><span aria-hidden="true">⌕</span><input name="q" defaultValue={query} placeholder={tr("ابحث بالاسم أو رقم الهاتف")} aria-label={tr("ابحث بالاسم أو رقم الهاتف")} /></form></div>
      <div className="table-scroll"><table className="orders-table"><thead><tr><th>{tr("العميل")}</th><th>{tr("رقم الهاتف")}</th><th>{tr("البريد")}</th><th>{tr("عدد الطلبات")}</th><th>{tr("آخر طلب")}</th></tr></thead><tbody>
        {visible.map((customer) => {
          const orders = (ordersResult.data ?? []).filter((order) => order.customer_id === customer.id);
          return <tr key={customer.id}><td><strong>{customer.full_name}</strong></td><td dir="ltr" className="phone-cell">{customer.phone_e164}</td><td dir="ltr">{customer.email ?? "—"}</td><td>{orders.length}</td><td>{orders[0] ? date(orders[0].created_at) : "—"}</td></tr>;
        })}
        {visible.length === 0 && <tr><td colSpan={5} className="empty-results">{customers.length ? tr("مفيش عملاء مطابقين للبحث.") : tr("لسه مفيش عملاء مسجلين.")}</td></tr>}
      </tbody></table></div><footer className="table-footer"><span>{tr("البيانات من Supabase المحلي. يعرض أحدث ١٠٠ عميل.")}</span></footer>
    </div>
  </section></AdminShell>;
}
