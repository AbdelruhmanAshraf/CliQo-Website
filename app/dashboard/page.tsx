import Link from "next/link";
import { redirect } from "next/navigation";
import { LuArchive, LuArrowUpRight, LuPackage, LuPlus } from "react-icons/lu";
import { createClient } from "@/lib/supabase/server";
import { optionLabel, skuLabel } from "@/i18n/catalog";
import { getCopy } from "@/i18n/server";
import { CliqoLogo } from "@/app/cliqo-logo";
import { isCustomerItemConfigured } from "./item-status";
import styles from "./workspace.module.css";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<{ view?: string; group?: string }>;
}) {
  const [tr, filters] = await Promise.all([getCopy(), searchParams]);
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return <main className="utility-page"><CliqoLogo width={92} variant="light" /><section>
      <h1>{tr("لوحة العميل")}</h1><p>{tr("فعّل Supabase المحلي لعرض القطع المرتبطة بحسابك.")}</p>
    </section></main>;
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const ownerId = claims?.claims?.sub;
  if (!ownerId) redirect("/login?next=%2Fdashboard");

  const [itemsResult, analyticsResult, pagesResult] = await Promise.all([
    supabase.from("smart_items").select("id,public_id,sku_id,internal_name,state,destination_url,payment_identifier,recipient_label,landing_page_id,archived_at")
      .eq("owner_user_id", ownerId).order("created_at", { ascending: false }),
    supabase.rpc("get_my_item_analytics"),
    supabase.from("merchant_pages").select("id,is_published").eq("owner_user_id", ownerId),
  ]);
  const items = itemsResult.data ?? [];
  const pages = pagesResult.data ?? [];
  const skuIds = [...new Set(items.map((item) => item.sku_id))];
  const [skuResult, familyResult] = skuIds.length ? await Promise.all([
    supabase.from("product_skus").select("id,display_name,options,product_family_id").in("id", skuIds),
    supabase.from("product_families").select("id,family_key"),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  const skus = new Map((skuResult.data ?? []).map((sku) => [sku.id, sku]));
  const familyKeys = new Map((familyResult.data ?? []).map((family) => [family.id, family.family_key]));
  const pageIds = new Set(pages.filter((page) => page.is_published).map((page) => page.id));
  const metrics = new Map<string, { opens: number; clicks: number }>(
    (analyticsResult.data ?? []).map((row: { smart_item_id: string; opens: number; clicks: number }) => [row.smart_item_id, row]),
  );
  const archive = filters.view === "archive";
  const activeItems = items.filter((item) => !item.archived_at);
  const archiveCount = items.length - activeItems.length;
  const totals = items.reduce((result, item) => {
    const metric = metrics.get(item.id);
    return { opens: result.opens + Number(metric?.opens ?? 0), clicks: result.clicks + Number(metric?.clicks ?? 0) };
  }, { opens: 0, clicks: 0 });
  const cards = items.filter((item) => Boolean(item.archived_at) === archive).map((item) => {
    const sku = skus.get(item.sku_id);
    const familyKey = familyKeys.get(sku?.product_family_id) ?? "";
    const family = skuLabel(tr, familyKey, {}, sku?.display_name) || tr("قطعة CliQo");
    const face = sku?.options?.face ?? "";
    const use = face ? optionLabel(tr, face) : tr("استخدام عام");
    const configured = isCustomerItemConfigured(item, face, pageIds);
    const status = archive ? "مؤرشفة" : item.state === "disabled" ? "متوقفة" : configured ? "نشطة" : "تحتاج تجهيز";
    return { item, family, use, group: `${sku?.product_family_id ?? "other"}/${face}`, status, configured };
  });
  const groups = Map.groupBy(cards, (card) => card.group);
  const families = Map.groupBy([...groups.values()], (group) => group[0].family);
  const selected = filters.group && groups.has(filters.group) ? filters.group : "";
  const visibleGroups = selected ? [groups.get(selected)!] : [...groups.values()];
  const failed = itemsResult.error || analyticsResult.error || pagesResult.error || skuResult.error || familyResult.error;

  return <main className={styles.workspace}>
    <header className={styles.heading}>
      <div><h1>{tr("نظرة عامة")}</h1><p>{tr("تحكّم في قطعك وصفحاتك، وتابع أداء روابطك من مكان واحد.")}</p></div>
      <Link className={styles.primary} href="/activate"><LuPlus aria-hidden="true" />{tr("فعّل قطعة جديدة")}</Link>
    </header>
    {failed && <p role="alert" className={styles.notice}>{tr("تعذر تحميل بعض البيانات. جرّب تحديث الصفحة.")}</p>}
    <section className={styles.overview} aria-label={tr("نظرة عامة")}>
      {[
        ["قطعك الذكية", itemsResult.error ? null : activeItems.length, "#items"],
        ["صفحات الهبوط", pagesResult.error ? null : pages.length, "/dashboard/pages"],
        ["إجمالي مرات الفتح", itemsResult.error || analyticsResult.error ? null : totals.opens, "/dashboard/analytics"],
        ["نقرات الأزرار", itemsResult.error || analyticsResult.error ? null : totals.clicks, "/dashboard/analytics"],
      ].map(([label, value, href]) => <Link className={styles.stat} href={String(href)} key={label}>
        <span>{tr(String(label))}<LuArrowUpRight aria-hidden="true" /></span><strong>{typeof value === "number" ? tr.number(value) : "–"}</strong>
      </Link>)}
    </section>
    <section id="items" className={styles.inventory}>
      <div className={styles.inventoryHeading}>
        <h2>{tr("قطعك الذكية")}</h2>
        <div className={styles.tabs}>
          <Link href="/dashboard#items" aria-current={!archive ? "page" : undefined}><LuPackage aria-hidden="true" />{tr("قطعك")} ({tr.number(activeItems.length)})</Link>
          <Link href="/dashboard?view=archive#items" aria-current={archive ? "page" : undefined}><LuArchive aria-hidden="true" />{tr("الأرشيف")} ({tr.number(archiveCount)})</Link>
        </div>
      </div>
      {groups.size > 1 && <form action="/dashboard#items" className={styles.filters}>
        {archive && <input type="hidden" name="view" value="archive" />}
        <label htmlFor="item-group">{tr("نوع القطعة واستخدامها")}</label>
        <select id="item-group" name="group" key={selected} defaultValue={selected}>
          <option value="">{tr("كل الأنواع")}</option>
          {[...families].map(([family, familyGroups]) => <optgroup key={family} label={family}>
            {familyGroups.map(([head]) => <option key={head.group} value={head.group}>{head.use} ({tr.number(groups.get(head.group)!.length)})</option>)}
          </optgroup>)}
        </select>
        <button className={styles.secondary}>{tr("فلترة")}</button>
      </form>}
      {!itemsResult.error && cards.length === 0 && <div className={styles.empty}>
        {archive ? <LuArchive aria-hidden="true" /> : <LuPackage aria-hidden="true" />}
        <h3>{tr(archive ? "لسه مفيش قطع في الأرشيف." : "لسه مفيش قطع مرتبطة بحسابك.")}</h3>
        <p>{tr(archive ? "القطع اللي بتأرشفها هتظهر هنا وتقدر ترجعها." : "امسح QR على القطعة، وبعدها اكتب كود التفعيل اللي جوه العبوة.")}</p>
      </div>}
      {visibleGroups.map((group) => <section key={group[0].group} className={styles.group}>
        <h3>{group[0].family} <span> / {group[0].use} · {tr.number(group.length)}</span></h3>
        <div className={styles.cards}>{group.map(({ item, use, status, configured }) => {
          const metric = metrics.get(item.id);
          return <article key={item.id} className={styles.item} data-testid="customer-item">
            <div className={styles.itemTop}><LuPackage aria-hidden="true" /><span className={status === "نشطة" ? styles.ready : styles.badge}>{tr(status)}</span></div>
            <h4 dir="auto">{item.internal_name || use}</h4>
            <p dir="ltr" title={tr("معرّف القطعة")}>{item.public_id.slice(0, 8).toUpperCase()}</p>
            <div className={styles.itemActions}>
              <Link href={`/dashboard/items/${item.public_id}`}>{tr(archive ? "استرجاع القطعة" : "إدارة القطعة")}</Link>
              {!archive && configured && item.state === "claimed" && <a href={`/s/${item.public_id}`} target="_blank" rel="noopener noreferrer">{tr("فتح الرابط ↗")}</a>}
            </div>
            {!analyticsResult.error && <small>{tr.number(Number(metric?.opens ?? 0))} {tr("فتحات ·")} {tr.number(Number(metric?.clicks ?? 0))} {tr("نقرات")}</small>}
          </article>;
        })}</div>
      </section>)}
    </section>
  </main>;
}
