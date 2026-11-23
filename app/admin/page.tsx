import Link from "next/link";
import { getCopy } from "@/i18n/server";
import { requireStaff } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { AdminShell } from "./admin-shell";
import { SpendManager } from "./spend-manager";
import "./overview.css";

export const dynamic = "force-dynamic";

const periods = [
  { key: "7d", days: 7 }, { key: "30d", days: 30 }, { key: "90d", days: 90 }, { key: "all", days: null },
] as const;
type OverviewTotals = {
  orders: number; collected_minor: string; awaiting_minor: string; returned_minor: string;
  cancelled: number; returned: number; average_minor: string;
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const tr = await getCopy();
  const pick = (ar: string, en: string) => tr.locale === "ar" ? ar : en;
  const { staff } = await requireStaff();
  const params = await searchParams;
  const selected = periods.find((period) => period.key === params.period) ?? periods[1];
  const days = selected.days;
  const db = getDb();
  const [totalsResult, dailyResult, productsResult, spendResult, customerResult] = await Promise.all([
    db.query<OverviewTotals>(
      "select count(*) filter (where state not in ('cancelled','returned'))::int as orders, " +
      "coalesce(sum(total_minor) filter (where payment_state in ('paid','cod_collected','cod_settled') and state not in ('cancelled','returned')),0)::text as collected_minor, " +
      "coalesce(sum(total_minor) filter (where payment_state='cod_to_collect' and state not in ('cancelled','returned')),0)::text as awaiting_minor, " +
      "coalesce(sum(total_minor) filter (where state='returned' or payment_state='refunded'),0)::text as returned_minor, " +
      "count(*) filter (where state='cancelled')::int as cancelled, " +
      "count(*) filter (where state='returned' or payment_state='refunded')::int as returned, " +
      "coalesce(avg(total_minor) filter (where payment_state in ('paid','cod_collected','cod_settled') and state not in ('cancelled','returned')),0)::text as average_minor " +
      "from public.orders where payment_method<>'test' and ($1::int is null or created_at >= current_date - ($1::int - 1))", [days]),
    db.query<{ day: string; total_minor: string; count: number }>(
      "select days.day::date::text as day, " +
      "coalesce(sum(o.total_minor) filter(where o.payment_state in ('paid','cod_collected','cod_settled') and o.state not in ('cancelled','returned')),0)::text as total_minor, " +
      "count(o.id) filter(where o.state not in ('cancelled','returned'))::int as count " +
      "from generate_series((now() at time zone 'Africa/Cairo')::date - 13,(now() at time zone 'Africa/Cairo')::date,interval '1 day') as days(day) " +
      "left join public.orders o on o.payment_method<>'test' and (o.created_at at time zone 'Africa/Cairo')::date=days.day::date " +
      "group by days.day order by days.day"),
    db.query<{ name: string; quantity: number; total_minor: string }>(
      "select l.product_name_snapshot as name,sum(l.quantity)::int as quantity,coalesce(sum(l.line_total_minor),0)::text as total_minor " +
      "from public.order_lines l join public.orders o on o.id=l.order_id " +
      "where o.payment_method<>'test' and o.state not in ('cancelled','returned') and ($1::int is null or o.created_at >= current_date - ($1::int - 1)) " +
      "group by l.product_name_snapshot order by sum(l.quantity) desc,sum(l.line_total_minor) desc limit 5", [days]),
    Promise.all([
      db.query<{ total_minor: string }>("select coalesce(sum(amount_minor),0)::text as total_minor from app_private.admin_ad_spend where $1::int is null or spend_date >= current_date - ($1::int - 1)", [days]),
      db.query<{ id: string; spend_date: string; channel: string; campaign: string; amount_minor: number; note: string }>(
        "select id::text,spend_date::text,channel,campaign,amount_minor,note from app_private.admin_ad_spend " +
        "where $1::int is null or spend_date >= current_date - ($1::int - 1) order by spend_date desc,created_at desc limit 6", [days]),
    ]),
    db.query<{ total: number }>("select count(*)::int as total from public.customers"),
  ]);
  const totals = totalsResult.rows[0];
  const spendTotalMinor = Number(spendResult[0].rows[0]?.total_minor ?? 0);
  const collectedMinor = Number(totals?.collected_minor ?? 0);
  const returnedMinor = Number(totals?.returned_minor ?? 0);
  const maxSales = Math.max(1, ...dailyResult.rows.map((row) => Number(row.total_minor)));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const formatMoney = (minor: number) => tr.money(minor / 100);
  const periodLabel = selected.key === "all" ? pick("كل الفترات", "All time") : pick("آخر " + selected.days + " يوم", "Last " + selected.days + " days");

  return <AdminShell staffName={staff.display_name} staffRole={staff.role}>
    <section className="ops-content overview-page">
      <div className="ops-heading overview-heading"><div><p className="ops-eyebrow">{pick("أداء المتجر", "Store performance")}</p><h1>{pick("نظرة عامة", "Overview")}</h1><p>{pick("مبيعات وتحصيل ومتابعة من بيانات الطلبات الفعلية.", "Sales and operations based on real order records.")}</p></div>
        <a className="overview-export" href={"/api/admin/sales-export?period=" + selected.key} download>{pick("تصدير Excel", "Export Excel")} <span aria-hidden="true">↓</span></a>
      </div>
      <nav className="overview-periods" aria-label={pick("فترة التقرير", "Report period")}>
        {periods.map((period) => <Link key={period.key} href={"/cliqo-control?period=" + period.key} aria-current={selected.key === period.key ? "page" : undefined}>{period.key === "all" ? pick("كل الوقت", "All time") : (tr.locale === "ar" ? period.days + " يوم" : period.days + " days")}</Link>)}
        <span>{periodLabel}</span>
      </nav>
      <div className="overview-kpis">
        <article className="overview-kpi-primary"><span>{pick("مبيعات محصّلة", "Collected sales")}</span><strong>{formatMoney(collectedMinor)}</strong><small>{pick("بطاقة مدفوعة + COD محصّل أو مسوّى", "Paid card + collected or settled COD")}</small></article>
        <article><span>{pick("بانتظار تحصيل COD", "COD awaiting collection")}</span><strong>{formatMoney(Number(totals?.awaiting_minor ?? 0))}</strong><small>{pick("لا تُحسب ضمن المبيعات المحصّلة", "Excluded from collected sales")}</small></article>
        <article><span>{pick("قيمة الطلبات المرتجعة", "Value of returned orders")}</span><strong>{formatMoney(returnedMinor)}</strong><small>{tr.number(totals?.returned ?? 0)} {pick("طلب مرتجع أو مسترد", "returned or refunded orders")}</small></article>
        <article><span>{pick("مصروف الإعلانات", "Advertising spend")}</span><strong>{formatMoney(spendTotalMinor)}</strong><small>{pick("إدخال يدوي · للفترة المحددة", "Manual entries · selected period")}</small></article>
      </div>
      <div className="overview-main-grid">
        <section className="overview-chart-panel">
          <header><div><h2>{pick("التحصيل اليومي", "Daily collection")}</h2><p>{pick("آخر 14 يومًا · بعد استبعاد الطلبات الملغاة والمرتجعة", "Last 14 days · excludes cancelled and returned orders")}</p></div><strong>{formatMoney(collectedMinor)}</strong></header>
          <div className="overview-chart" role="img" aria-label={pick("رسم أعمدة للمبيعات المحصلة يوميًا خلال آخر 14 يومًا", "Bar chart of collected sales for the last 14 days")}>
            {dailyResult.rows.map((day) => <div className="overview-chart-day" key={day.day} title={tr.date(day.day) + " · " + formatMoney(Number(day.total_minor)) + " · " + day.count}><i style={{ height: Math.max(Number(day.total_minor) ? 8 : 2, Number(day.total_minor) / maxSales * 100) + "%" }} /><small>{day.day.slice(8)}</small></div>)}
          </div>
        </section>
        <section className="overview-snapshot-panel">
          <header><div><h2>{pick("ملخص الفترة", "Period summary")}</h2><p>{periodLabel}</p></div></header>
          <div className="overview-snapshot-row"><span>{pick("الطلبات غير الملغاة", "Orders excluding cancellations")}</span><strong>{tr.number(totals?.orders ?? 0)}</strong></div>
          <div className="overview-snapshot-row"><span>{pick("متوسط التحصيل للطلب", "Average collected order")}</span><strong>{formatMoney(Number(totals?.average_minor ?? 0))}</strong></div>
          <div className="overview-snapshot-row"><span>{pick("الطلبات الملغاة", "Cancelled orders")}</span><strong>{tr.number(totals?.cancelled ?? 0)}</strong></div>
          <div className="overview-snapshot-row"><span>{pick("العملاء المسجلون", "Registered customers")}</span><strong>{tr.number(customerResult.rows[0]?.total ?? 0)}</strong></div>
          <Link href="/cliqo-control/orders">{pick("افتح لوحة الطلبات", "Open order board")} ↗</Link>
        </section>
      </div>
      <div className="overview-lower-grid">
        <section className="overview-products-panel">
          <header><div><h2>{pick("الأكثر طلبًا", "Most ordered")}</h2><p>{pick("حسب الكمية في الطلبات غير الملغاة والمرتجعة", "By quantity in active and completed orders")}</p></div><Link href="/cliqo-control/products">{pick("المنتجات", "Products")} ↗</Link></header>
          {productsResult.rows.length ? productsResult.rows.map((product, index) => <article key={product.name}><span className="overview-rank">{String(index + 1).padStart(2, "0")}</span><b>{product.name}</b><strong>{tr.number(product.quantity)} <small>{pick("قطعة", "units")}</small></strong><em>{formatMoney(Number(product.total_minor))}</em></article>) : <p className="overview-empty">{pick("لا توجد مبيعات في الفترة المحددة.", "No sales in the selected period.")}</p>}
        </section>
        <SpendManager rows={spendResult[1].rows} today={today} totalMinor={spendTotalMinor} />
      </div>
      <p className="overview-accounting-note">{pick("الأرقام تعتمد على حالة الدفع وحالة الطلب. قيمة المرتجعات هي إجمالي الطلبات المرتجعة/المستردة، وليست مبلغ رد فعلي. التحصيل بعد الإعلانات ليس صافي ربح؛ تكلفة التصنيع والشحن والعمولات والإعلانات الجزئية تُسجّل منفصلة.", "Figures use order and payment states. Return value is the total value of returned/refunded orders, not an actual refund amount. Collection after advertising is not profit; manufacturing, shipping, fees and partial refunds are not included.")}</p>
    </section>
  </AdminShell>;
}
