import { getCopy } from '@/i18n/server';
import {LanguageSwitcher} from "@/app/language-switcher";
import Link from "next/link";
import { CliqoLogo } from "@/app/cliqo-logo";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/signout-actions";
import styles from "../dashboard.module.css";

export const dynamic = "force-dynamic";

export default async function LandingPagesDashboard() {
  const tr = await getCopy();

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return <main className="utility-page" ><Link className="brand" href="/" aria-label={tr("CliQo الرئيسية")}><CliqoLogo width={145} /></Link><section><p className="eyebrow">{tr("لوحة CliQo")}</p><h1>{tr("صفحات الهبوط")}</h1><p className="utility-copy">{tr("فعّل Supabase المحلي لإدارة صفحاتك.")}</p><Link className="utility-back" href="/dashboard">{tr("الرجوع للوحة العميل")}</Link></section></main>;
  }
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login?next=%2Fdashboard%2Fpages");

  const [pagesResult, itemsResult, pageAnalyticsResult] = await Promise.all([
    supabase.from("merchant_pages").select("id,display_name,is_published,updated_at" ).order("updated_at", { ascending: false }),
    supabase.from("smart_items").select("id,landing_page_id,internal_name,state"),
    supabase.rpc("get_my_page_analytics"),
  ]);
  const pages = pagesResult.data ?? [];
  const items = itemsResult.data ?? [];
  const pageAnalytics = new Map<string, { opens: number; clicks: number }>(
    (pageAnalyticsResult.data ?? []).map((row: { landing_page_id: string; opens: number; clicks: number }) => [row.landing_page_id, row]),
  );
  const linksByPage = new Map<string, number>();
  if (pages.length) {
    const { data: pageLinks } = await supabase.from("merchant_page_links").select("page_id").in("page_id", pages.map((page) => page.id));
    for (const link of pageLinks ?? []) linksByPage.set(link.page_id, (linksByPage.get(link.page_id) ?? 0) + 1);
  }

  return <main className={`${styles.page} dashboard-page`} >
    <header className={styles.header}><Link className="brand" href="/" aria-label={tr("CliQo الرئيسية")}><CliqoLogo width={124} /></Link><nav className={styles.nav}><Link href="/dashboard">{tr("قطعك")}</Link><Link href="/dashboard/pages">{tr("صفحات الهبوط")}</Link><Link href="/dashboard/analytics">{tr("الإحصائيات")}</Link><Link href="/guides">{tr("تعليمات NFC")}</Link></nav><form action={signOut}><button className="signout-button" type="submit">{tr("تسجيل الخروج")}</button></form><LanguageSwitcher/></header>
    <section className={styles.content}>
      <div className={styles.pageListHeading}><div><p className={styles.eyebrow}>{tr("مساحة العميل")}</p><h1>{tr("صفحات الهبوط")}</h1><p className={styles.intro}>{tr("أنشئ صفحة، عدّل الروابط، ثم اربطها بقطعة واحدة أو أكثر.")}</p></div><Link className={styles.createPageButton} href="/dashboard/pages/new">{tr("+ صفحة جديدة")}</Link></div>
      {(pagesResult.error || itemsResult.error || pageAnalyticsResult.error) && <p className={styles.note}>{tr("تعذر تحميل بعض البيانات. تأكد من تحديث قاعدة البيانات المحلية.")}</p>}
      {pages.length === 0 ? <div className={styles.emptyPages}><h2>{tr("ابدأ بصفحتك الأولى")}</h2><p>{tr("أضف اسم نشاطك وروابطك، وبعدها اربط الصفحة بقطعة تدعم Landing Page.")}</p><Link href="/dashboard/pages/new">{tr("إنشاء صفحة هبوط")}</Link></div> : <div className={styles.pageCards}>{pages.map((page) => {
        const linkedItems = items.filter((item) => item.landing_page_id === page.id);
        const totals = pageAnalytics.get(page.id) ?? { opens: 0, clicks: 0 };
        return <article className={styles.pageCard} key={page.id}>
          <div className={styles.pageCardTop}><span className={page.is_published ? styles.publishedBadge : styles.draftBadge}>{page.is_published ? tr("منشورة") : tr("مسودة")}</span><small>{linksByPage.get(page.id) ?? 0}  {tr("روابط")}</small></div>
          <h2>{page.display_name || tr("صفحة بدون اسم")}</h2>
          <p>{linkedItems.length}  {tr("قطعة مرتبطة ·")} {totals.opens.toLocaleString(tr.numberLocale)}  {tr("فتحات ·")} {totals.clicks.toLocaleString(tr.numberLocale)}  {tr("نقرات")}</p>
          <div className={styles.pageCardFooter}><span>{tr("آخر تعديل")} {tr.date(page.updated_at)}</span><Link href={`/dashboard/pages/${page.id}`}>{tr("إدارة الصفحة")}</Link></div>
        </article>;
      })}</div>}
    </section>
  </main>;
}
