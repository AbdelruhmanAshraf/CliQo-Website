import {skuLabel} from "@/i18n/catalog";
import { getCopy } from '@/i18n/server';
import {LanguageSwitcher} from "@/app/language-switcher";
import Link from "next/link";
import { CliqoLogo } from "@/app/cliqo-logo";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/signout-actions";
import styles from "../dashboard.module.css";

export const dynamic = "force-dynamic";

type SmartItem = { id: string; public_id: string; sku_id: string; internal_name: string; state: string; landing_page_id: string | null };
type Metric = { smart_item_id: string; opens: number; clicks: number };
type PageClickMetric = { landing_page_id: string; page_link_id: string | null; smart_item_id: string; clicks: number };
const periods = [
  { key: "24h", label: "آخر 24 ساعة", duration: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "7 أيام", duration: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "30 يوم", duration: 30 * 24 * 60 * 60 * 1000 },
  { key: "all", label: "السجل المتاح", duration: null },
] as const;

export default async function CustomerAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const tr = await getCopy();

  const query = await searchParams;
  const requestedPeriod = Array.isArray(query.period) ? query.period[0] : query.period;
  const selectedPeriod = periods.find((period) => period.key === requestedPeriod) ?? periods[1];
  const until = new Date();
  const since = selectedPeriod.duration === null
    ? null
    : new Date(until.getTime() - selectedPeriod.duration);
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return <main className="utility-page" ><Link className="brand" href="/" aria-label={tr("CliQo الرئيسية")}><CliqoLogo width={145} variant="light" /></Link><section><p className="eyebrow">{tr("لوحة CliQo")}</p><h1>{tr("إحصائيات قطعك")}</h1><p className="utility-copy">{tr("فعّل Supabase المحلي لعرض الإحصائيات.")}</p><Link className="utility-back" href="/dashboard">{tr("الرجوع للوحة العميل")}</Link></section></main>;
  }
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login?next=%2Fdashboard%2Fanalytics");
  const [itemsResult, pagesResult, metricsResult, pageMetricsResult, pageLinksResult, pageClickBreakdownResult] = await Promise.all([
    supabase.from("smart_items").select("id,public_id,sku_id,internal_name,state,landing_page_id").order("created_at", { ascending: false }),
    supabase.from("merchant_pages").select("id,display_name,is_published").order("updated_at", { ascending: false }),
    supabase.rpc("get_my_item_analytics", { p_since: since?.toISOString() ?? null, p_until: selectedPeriod.duration === null ? null : until.toISOString() }),
    supabase.rpc("get_my_page_analytics", { p_since: since?.toISOString() ?? null, p_until: selectedPeriod.duration === null ? null : until.toISOString() }),
    supabase.from("merchant_page_links").select("id,page_id,label,sort_order").order("sort_order", { ascending: true }),
    supabase.rpc("get_my_page_click_breakdown", { p_since: since?.toISOString() ?? null, p_until: selectedPeriod.duration === null ? null : until.toISOString() }),
  ]);
  const items = (itemsResult.data ?? []) as SmartItem[];
  const pages = pagesResult.data ?? [];
  const metrics = (metricsResult.data ?? []) as Metric[];
  const pageClickMetrics = (pageClickBreakdownResult.data ?? []) as PageClickMetric[];
  const pageLinks = pageLinksResult.data ?? [];
  const metricByItem = new Map(metrics.map((metric) => [metric.smart_item_id, metric]));
  const pageMetricById = new Map<string, { opens: number; clicks: number }>(
    (pageMetricsResult.data ?? []).map((metric: { landing_page_id: string; opens: number; clicks: number }) => [metric.landing_page_id, metric]),
  );
  const skuIds = [...new Set(items.map((item) => item.sku_id))];
  const skuNames = new Map<string, string>();
  if (skuIds.length) {
    const [skuResult, familyResult] = await Promise.all([
      supabase.from("product_skus").select("id,display_name,options,product_family_id").in("id", skuIds),
      supabase.from("product_families").select("id,family_key"),
    ]);
    const familyKeys = new Map((familyResult.data ?? []).map((family) => [family.id, family.family_key]));
    for (const sku of skuResult.data ?? []) skuNames.set(sku.id, skuLabel(tr, familyKeys.get(sku.product_family_id) ?? "", sku.options ?? {}, sku.display_name));
  }
  const totals = metrics.reduce((sum, metric) => ({
    opens: sum.opens + Number(metric.opens), clicks: sum.clicks + Number(metric.clicks),
  }), { opens: 0, clicks: 0 });

  return <main className={`${styles.page} dashboard-page`} >
    <header className={styles.header}><Link className="brand" href="/" aria-label={tr("CliQo الرئيسية")}><CliqoLogo width={124} /></Link><nav className={styles.nav}><Link href="/dashboard">{tr("قطعك")}</Link><Link href="/dashboard/pages">{tr("صفحات الهبوط")}</Link><Link href="/dashboard/analytics">{tr("الإحصائيات")}</Link><Link href="/guides">{tr("تعليمات NFC")}</Link></nav><form action={signOut}><button className="signout-button" type="submit">{tr("تسجيل الخروج")}</button></form><LanguageSwitcher/></header>
    <section className={styles.content}>
      <p className={styles.eyebrow}>{tr("لوحة العميل")}</p><h1>{tr("إحصائيات قطعك")}</h1><p className={styles.intro}>{tr("تابع فتحات روابطك ونقرات الأزرار حسب الفترة، من غير جمع بيانات شخصية للزوار.")}</p>
      {(itemsResult.error || pagesResult.error || metricsResult.error || pageMetricsResult.error || pageLinksResult.error || pageClickBreakdownResult.error) && <p className={styles.note}>{tr("تعذر تحميل بعض الإحصائيات. حاول مرة أخرى.")}</p>}
      <nav className={styles.periodFilters} aria-label={tr("مدة الإحصائيات")}>
        {periods.map((period) => <Link key={period.key} href={`/dashboard/analytics?period=${period.key}`} aria-current={selectedPeriod.key === period.key ? "page" : undefined}>{tr(period.label)}</Link>)}
      </nav>
      <p className={styles.periodCaption}>{tr("الفترة:")} {tr(selectedPeriod.label)}</p>
      <div className={styles.metrics}><article><span>{tr("إجمالي مرات الفتح")}</span><strong>{totals.opens.toLocaleString(tr.numberLocale)}</strong></article><article><span>{tr("نقرات الأزرار")}</span><strong>{totals.clicks.toLocaleString(tr.numberLocale)}</strong></article><article><span>{tr("قطعك الذكية")}</span><strong>{items.length}</strong></article><article><span>{tr("صفحاتك")}</span><strong>{pages.length}</strong></article></div>
      <p className={styles.note}>{tr("الفتحة مش شخصًا فريدًا؛ ممكن نفس الزائر يفتح أكتر من مرة. QR وNFC لنفس القطعة بيتحسبوا معًا. النقرات تقيس الضغط على الزر فقط، ولا تؤكد إتمام الدفع أو التقييم في التطبيق الخارجي. نحتفظ بسجل الإحصائيات 13 شهرًا.")}</p>
      <section className={styles.analyticsSection}><div className={styles.analyticsHeading}><h2>{tr("حسب القطعة")}</h2><Link href="/dashboard">{tr("إدارة القطع")}</Link></div>
        {items.length === 0 ? <p className={styles.emptyAnalytics}>{tr("فعّل قطعة عشان تبدأ تشوف الفتحات والنقرات هنا.")}</p> : <div className={styles.analyticsList}>{items.map((item) => {
          const metric = metricByItem.get(item.id);
          const page = pages.find((candidate) => candidate.id === item.landing_page_id);
          return <article key={item.id} className={styles.analyticsRow}><div><span>{skuNames.get(item.sku_id) ?? tr("قطعة CliQo")}</span><h3>{item.internal_name || skuNames.get(item.sku_id) || tr("قطعة ذكية")}</h3><small>{page ? tr("صفحة: {value0}", {value0: page.display_name || "بدون اسم"}) : item.landing_page_id ? tr("صفحة غير منشورة") : tr("رابط مباشر")}</small></div><strong>{Number(metric?.opens ?? 0).toLocaleString(tr.numberLocale)}<small>{tr("فتحات")}</small></strong><strong>{Number(metric?.clicks ?? 0).toLocaleString(tr.numberLocale)}<small>{tr("نقرات")}</small></strong><Link href={`/dashboard/items/${item.public_id}`}>{tr("إدارة")}</Link></article>;
        })}</div>}
      </section>
      <section className={styles.analyticsSection}><div className={styles.analyticsHeading}><h2>{tr("حسب صفحة الهبوط")}</h2><Link href="/dashboard/pages">{tr("إدارة الصفحات")}</Link></div>
        {pages.length === 0 ? <p className={styles.emptyAnalytics}>{tr("لما تنشئ صفحة هبوط وتربطها بقطعة، هتظهر إحصائياتها هنا.")}</p> : <div className={styles.pageCards}>{pages.map((page) => {
          const linkedItems = items.filter((item) => item.landing_page_id === page.id);
          const pageTotals = pageMetricById.get(page.id) ?? { opens: 0, clicks: 0 };
          const pageEvents = pageClickMetrics.filter((metric) => metric.landing_page_id === page.id);
          const clicksByLink = new Map<string, number>();
          const clicksByItem = new Map<string, number>();
          for (const metric of pageEvents) {
            const linkKey = metric.page_link_id ?? "deleted";
            clicksByLink.set(linkKey, (clicksByLink.get(linkKey) ?? 0) + Number(metric.clicks));
            clicksByItem.set(metric.smart_item_id, (clicksByItem.get(metric.smart_item_id) ?? 0) + Number(metric.clicks));
          }
          const pageLinksList = pageLinks.filter((link) => link.page_id === page.id);
          return <article key={page.id} className={styles.pageCard}><div className={styles.pageCardTop}><span className={page.is_published ? styles.publishedBadge : styles.draftBadge}>{page.is_published ? tr("منشورة") : tr("مسودة")}</span><small>{linkedItems.length}  {tr("قطع مرتبطة حاليًا")}</small></div><h2>{page.display_name || tr("صفحة بدون اسم")}</h2><p>{pageTotals.opens.toLocaleString(tr.numberLocale)}  {tr("فتحات ·")} {pageTotals.clicks.toLocaleString(tr.numberLocale)}  {tr("نقرات")}</p><details className={styles.clickBreakdown}><summary>{tr("تفصيل النقرات حسب الزر والقطعة")}</summary><div className={styles.clickBreakdownGrid}><section><h3>{tr("حسب الزر")}</h3>{pageLinksList.length === 0 ? <p>{tr("لا توجد أزرار محفوظة.")}</p> : <ul>{pageLinksList.map((link) => <li key={link.id}><span>{link.label}</span><strong>{(clicksByLink.get(link.id) ?? 0).toLocaleString(tr.numberLocale)}</strong></li>)}{clicksByLink.has("deleted") && <li><span>{tr("زر محذوف")}</span><strong>{clicksByLink.get("deleted")?.toLocaleString(tr.numberLocale)}</strong></li>}</ul>}</section><section><h3>{tr("حسب القطعة")}</h3>{clicksByItem.size === 0 ? <p>{tr("لسه مفيش نقرات مسجلة في الفترة.")}</p> : <ul>{[...clicksByItem].map(([itemId, clicks]) => { const item = items.find((candidate) => candidate.id === itemId); return <li key={itemId}><span>{item?.internal_name || (item ? skuNames.get(item.sku_id) : null) || tr("قطعة CliQo")}</span><strong>{clicks.toLocaleString(tr.numberLocale)}</strong></li>; })}</ul>}</section></div></details><div className={styles.pageCardFooter}><span>{tr("الإجمالي من أحداث الصفحة المسجلة")}</span><Link href={`/dashboard/pages/${page.id}`}>{tr("إدارة الصفحة")}</Link></div></article>;
        })}</div>}
      </section>
    </section>
  </main>;
}
