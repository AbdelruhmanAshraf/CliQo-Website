import {optionLabel, skuLabel} from "@/i18n/catalog";
import { getCopy } from '@/i18n/server';
import {LanguageSwitcher} from "@/app/language-switcher";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/signout-actions";
import { CliqoLogo } from "@/app/cliqo-logo";

type SmartItem = {
  id: string; public_id: string; sku_id: string; internal_name: string; state: string;
  destination_url: string | null; payment_identifier: string | null; landing_page_id: string | null;
};
type ItemAnalytics = { smart_item_id: string; opens: number; clicks: number };
type PageSummary = { id: string; display_name: string | null; is_published: boolean };

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const tr = await getCopy();

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return <main className="utility-page" ><Link className="brand" href="/" aria-label={tr("CliQo الرئيسية")}><CliqoLogo width={145} variant="light" /></Link><section><p className="eyebrow">{tr("لوحة CliQo")}</p><h1>{tr("لوحة العميل")}<br /><em>{tr("قيد التجهيز.")}</em></h1><p className="utility-copy">{tr("فعّل Supabase المحلي لعرض القطع المرتبطة بحسابك.")}</p><Link className="utility-back" href="/">{tr("الرجوع للموقع")}</Link></section></main>;
  }
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login?next=%2Fdashboard");

  const [itemsResult, analyticsResult, pagesResult] = await Promise.all([
    supabase.from("smart_items").select("id,public_id,sku_id,internal_name,state,destination_url,payment_identifier,landing_page_id").order("created_at", { ascending: false }),
    supabase.rpc("get_my_item_analytics"),
    supabase.from("merchant_pages").select("id,display_name,is_published").order("updated_at", { ascending: false }),
  ]);
  const items = (itemsResult.data ?? []) as SmartItem[];
  const analytics = (analyticsResult.data ?? []) as ItemAnalytics[];
  const pages = (pagesResult.data ?? []) as PageSummary[];
  const skuIds = [...new Set(items.map((item) => item.sku_id))];
  const productNames = new Map<string, { family: string; title: string }>();
  const productFaces = new Map<string, string>();
  if (skuIds.length) {
    const [skuResult, familyResult] = await Promise.all([
      supabase.from("product_skus").select("id,display_name,options,product_family_id").in("id", skuIds),
      supabase.from("product_families").select("id,family_key"),
    ]);
    const familyKeys = new Map((familyResult.data ?? []).map((family) => [family.id, family.family_key]));
    for (const sku of skuResult.data ?? []) {
      const family = skuLabel(tr, familyKeys.get(sku.product_family_id) ?? "", {}, sku.display_name);
      const { face, variant } = (sku.options ?? {}) as Record<string, string>;
      const use = face ? optionLabel(tr, face) : "";
      const finish = variant && variant !== "Google Review" ? optionLabel(tr, variant) : "";
      const title = finish && !use.toLowerCase().includes(finish.toLowerCase())
        ? [use, finish].filter(Boolean).join(" · ") : use;
      productNames.set(sku.id, { family, title: title || family });
      if (typeof sku.options?.face === "string") productFaces.set(sku.id, sku.options.face);
    }
  }
  const analyticsByItem = new Map(analytics.map((row) => [row.smart_item_id, row]));
  const totalOpens = analytics.reduce((sum, row) => sum + Number(row.opens), 0);
  const totalClicks = analytics.reduce((sum, row) => sum + Number(row.clicks), 0);
  const pagesById = new Map(pages.map(page => [page.id, page]));
  const isConfigured = (item: SmartItem) => {
    const face = productFaces.get(item.sku_id);
    if (face === "all-in-one") return Boolean(item.landing_page_id && pagesById.get(item.landing_page_id)?.is_published);
    if (face === "instapay" || face === "vodafone") return Boolean(item.payment_identifier);
    return Boolean(item.destination_url);
  };
  const activeCount = items.filter(item => item.state === "claimed" && isConfigured(item)).length;

  return <main className="st-dashboard" ><aside className="st-dashboard-side"><Link className="st-dashboard-logo" href="/" aria-label={tr("CliQo الرئيسية")}><CliqoLogo width={148} /></Link><p>{tr("لوحة العميل")}</p><nav aria-label={tr("لوحة العميل")}><Link aria-current="page" href="/dashboard">▦ <span>{tr("نظرة عامة")}</span></Link><Link href="/dashboard/pages">◫ <span>{tr("صفحات الهبوط")}</span></Link><Link href="/dashboard/analytics">↗ <span>{tr("الإحصائيات")}</span></Link><Link href="/guides">⌁ <span>{tr("تعليمات NFC")}</span></Link></nav><div><Link href="/products">{tr("العودة للمتجر ←")}</Link><form action={signOut}><button type="submit">{tr("تسجيل الخروج")}</button></form></div></aside>
    <div className="st-dashboard-main"><header className="st-dashboard-top"><div><h1>{tr("قطعك الذكية")}</h1><p>{tr("تابع قطعك وصفحاتك وعدّل الوجهة في أي وقت.")}</p></div><Link href="/activate" className="st-button st-button-orange">{tr("فعّل قطعة جديدة")} <span aria-hidden="true">＋</span></Link><LanguageSwitcher/></header>
      {(itemsResult.error || analyticsResult.error || pagesResult.error) && <p className="st-dashboard-error" role="alert">{tr("تعذر تحميل بعض البيانات. جرّب تحديث الصفحة.")}</p>}
      <section className="st-dashboard-section"><div className="st-dashboard-heading"><div><h2>{tr("إدارة القطع")}</h2></div><Link href="/dashboard/analytics">{tr("تفاصيل الإحصائيات ←")}</Link></div>
        {!itemsResult.error && items.length === 0 && <div className="st-dashboard-empty"><h3>{tr("لسه مفيش قطع مرتبطة بحسابك.")}</h3><p>{tr("امسح QR على قطعتك، سجّل دخولك، ثم أدخل كود التفعيل المكوّن من ٦ أرقام الموجود على البطاقة داخل العبوة.")}</p><Link className="st-button st-button-dark" href="/activate">{tr("فعّل أول قطعة ←")}</Link></div>}
        <div className="st-dashboard-items">{items.map((item) => {
          const metric = analyticsByItem.get(item.id);
          const names = productNames.get(item.sku_id);
          const face = productFaces.get(item.sku_id);
          const configured = isConfigured(item);
          const stateLabel = item.state === "disabled" ? "متوقفة" : configured ? "نشطة" : "تحتاج تجهيز";
          const configureLabel = configured ? "إدارة الوجهة" : face === "all-in-one" ? "اربط صفحة الهبوط" : "اضبط الوجهة";
          return <article key={item.id} className="st-dashboard-item"><div className="st-dashboard-item-top"><small>{names?.family ?? tr("قطعة CliQo")}</small><span className={item.state === "claimed" && configured ? "st-status-active" : "st-status-muted"}>{tr(stateLabel)}</span></div><h3>{item.internal_name || names?.title || tr("قطعة ذكية")}</h3><p>{Number(metric?.opens ?? 0).toLocaleString(tr.numberLocale)}  {tr("فتحات ·")} {Number(metric?.clicks ?? 0).toLocaleString(tr.numberLocale)}  {tr("نقرات")}</p><div className="st-dashboard-item-actions"><Link href={`/dashboard/items/${item.public_id}`}>{tr(configureLabel)}</Link><a href={`/s/${item.public_id}`} target="_blank" rel="noopener noreferrer">{tr("فتح الرابط ↗")}</a></div></article>;
        })}</div>
      </section>
      <section className="st-dashboard-pages"><div><h2>{tr("صفحات الهبوط")}</h2><p>{pages.length ? tr("لديك {value0} صفحة. عدّل المحتوى، عاين، ثم انشر.", {value0: pages.length.toLocaleString(tr.numberLocale)}) : tr("أنشئ صفحة روابط للقطع التي تدعمها، ثم اربطها بقطعة أو أكثر.")}</p><Link className="st-button st-button-outline" href={pages.length ? "/dashboard/pages" : "/dashboard/pages/new"}>{tr(pages.length ? "إدارة صفحاتك ←" : "أنشئ صفحة هبوط")}</Link></div><div className="st-dashboard-page-list">{pages.length ? pages.slice(0, 3).map((page) => <Link key={page.id} href={`/dashboard/pages/${page.id}`}><span>{page.display_name || tr("صفحة بدون اسم")}</span><small>{page.is_published ? tr("منشورة") : tr("مسودة")}</small></Link>) : <span>{tr("الصفحات الجديدة تظهر هنا بعد حفظها.")}</span>}</div></section>
      <div className="st-dashboard-stats"><article><span>{tr("إجمالي فتحات الرابط")}</span><strong>{totalOpens.toLocaleString(tr.numberLocale)}</strong><small>{tr("QR وNFC معًا")}</small></article><article><span>{tr("نقرات الأزرار")}</span><strong>{totalClicks.toLocaleString(tr.numberLocale)}</strong><small>{tr("داخل صفحات CliQo")}</small></article><article><span>{tr("قطع نشطة")}</span><strong>{activeCount.toLocaleString(tr.numberLocale)}</strong><small>{tr("من")} {items.length.toLocaleString(tr.numberLocale)}  {tr("قطع مرتبطة")}</small></article><article><span>{tr("صفحاتك")}</span><strong>{pages.length.toLocaleString(tr.numberLocale)}</strong><small>{tr("منشورة أو مسودة")}</small></article></div>
      <p className="st-dashboard-disclaimer">{tr("الفتحات ليست عدد أشخاص فريدين. QR وNFC يستخدمان الرابط نفسه؛ النقر لا يؤكد إتمام إجراء خارج CliQo. الأرقام من سجل آخر 13 شهرًا.")}</p>
    </div>
  </main>;
}
