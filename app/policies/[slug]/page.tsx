import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getCopy } from "@/i18n/server";
import type { Locale } from "@/i18n/config";
import { getDb } from "@/lib/db";
import { isStorePolicyKey, STORE_POLICIES } from "@/lib/store-policies";
import { SiteNav } from "@/app/site-nav";
import { MarketingFooter } from "@/app/marketing-footer";
import styles from "./policy.module.css";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };
type PublishedPolicy = { published_body: string; published_at: Date | string };

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const tr = await getCopy();
  const policy = STORE_POLICIES.find((item) => item.key === slug);
  return { title: policy ? `${tr(policy.title)} | CliQo` : tr("السياسات وشروط البيع") };
}

export default async function StorePolicyPage({ params }: PageProps) {
  const { slug } = await params;
  if (!isStorePolicyKey(slug)) notFound();
  const locale = await getLocale() as Locale;
  const tr = await getCopy();
  const result = await getDb().query<PublishedPolicy>(
    `select published_body,published_at
     from app_private.store_policies
     where policy_key=$1 and locale=$2 and published_body is not null`,
    [slug, locale],
  );
  const policy = result.rows[0];
  if (!policy) notFound();
  const title = STORE_POLICIES.find((item) => item.key === slug)?.title ?? "السياسات وشروط البيع";
  const date = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-EG", {
    dateStyle: "long", timeZone: "Africa/Cairo",
  }).format(new Date(policy.published_at));

  return <><SiteNav /><main className={styles.page}>
    <article className={styles.article}>
      <p className={styles.eyebrow}>CliQo · POLICIES</p>
      <h1>{tr(title)}</h1>
      <p className={styles.updated}>{tr("آخر تحديث")} · <time dateTime={new Date(policy.published_at).toISOString()}>{date}</time></p>
      <div className={styles.body} dir={locale === "ar" ? "rtl" : "ltr"} lang={locale}>{policy.published_body}</div>
      <Link className={styles.back} href="/products">{tr("العودة إلى المتجر")}</Link>
    </article>
  </main><MarketingFooter /></>;
}
