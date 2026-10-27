import {skuLabel} from "@/i18n/catalog";
import { getCopy } from '@/i18n/server';
import {LanguageSwitcher} from "@/app/language-switcher";
import Link from "next/link";
import { CliqoLogo } from "@/app/cliqo-logo";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/signout-actions";
import { CopyPublicUrl } from "./copy-public-url";
import { DownloadQr } from "./download-qr";
import { SmartItemEditor } from "./smart-item-editor";
import styles from "../../dashboard.module.css";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SmartItemSettingsPage({ params }: { params: Promise<{ publicId: string }> }) {
  const tr = await getCopy();

  const { publicId } = await params;
  if (!uuid.test(publicId)) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login?next=%2Fdashboard");

  const { data: item, error } = await supabase.from("smart_items")
    .select("id,public_id,sku_id,internal_name,state,destination_url,payment_identifier,recipient_label,landing_page_id")
    .eq("public_id", publicId).maybeSingle();
  if (error || !item) notFound();
  const { data: sku } = await supabase.from("product_skus")
    .select("display_name,options,product_family_id").eq("id", item.sku_id).maybeSingle();
  if (!sku) notFound();
  const { data: family } = await supabase.from("product_families")
    .select("family_key,supports_landing_page").eq("id", sku.product_family_id).maybeSingle();
  const { data: pages } = await supabase.from("merchant_pages")
    .select("id,display_name,is_published").order("updated_at", { ascending: false });
  const { data: analytics } = await supabase.rpc("get_my_item_analytics");
  const metric = (analytics ?? []).find((row: { smart_item_id: string }) => row.smart_item_id === item.id);
  const options = (sku.options ?? {}) as Record<string, string>;
  const productName = skuLabel(tr, family?.family_key ?? "", options, sku.display_name);
  const publicUrl = createPublicItemUrl(item.public_id);
  const isLocalUrl = new URL(publicUrl).hostname === "localhost" || new URL(publicUrl).hostname === "127.0.0.1";
  const supportsPage = Boolean(family?.supports_landing_page)
    && (family?.family_key !== "stand" || options.face === "all-in-one");
  const payment = family?.family_key === "stand" && ["instapay", "vodafone"].includes(options.face ?? "");
  const status = item.state === "disabled" ? "متوقفة" : item.state === "claimed" ? "نشطة" : "قيد التفعيل";

  return <main className={`${styles.page} dashboard-page`} >
    <header className={styles.header}><Link className="brand" href="/" aria-label={tr("CliQo الرئيسية")}><CliqoLogo width={124} /></Link><nav className={styles.nav}><Link href="/dashboard">{tr("قطعك")}</Link><Link href="/dashboard/pages">{tr("صفحات الهبوط")}</Link><Link href="/dashboard/analytics">{tr("الإحصائيات")}</Link><Link href="/guides">{tr("تعليمات NFC")}</Link></nav><form action={signOut}><button className="signout-button" type="submit">{tr("تسجيل الخروج")}</button></form><LanguageSwitcher/></header>
    <section className={styles.content}><p className={styles.eyebrow}>{tr("إعدادات القطعة")}</p><h1>{item.internal_name || productName}</h1><p className={styles.intro}>{productName} · {tr(status)}  {tr("· QR وNFC يظلان على الرابط الثابت.")}</p>
      <CopyPublicUrl url={publicUrl} isLocal={isLocalUrl} />
      <DownloadQr isLocal={isLocalUrl} />
      <div className={styles.note}>{tr("في تصميم Template اكتب الرابط الثابت أعلاه على شريحة NFC. لا تكتب رابط الوجهة مباشرة؛ تغييره من الداشبورد لا يتطلب إعادة البرمجة.")} <Link href="/guides">{tr("افتح دليل الإعداد")}</Link>.</div>
      <SmartItemEditor item={{
        id: item.id, publicId: item.public_id, internalName: item.internal_name,
        state: item.state, destinationUrl: item.destination_url, paymentIdentifier: item.payment_identifier,
        recipientLabel: item.recipient_label, landingPageId: item.landing_page_id,
      }} payment={payment} supportsPage={supportsPage} pages={pages ?? []} analytics={{ opens: Number(metric?.opens ?? 0), clicks: Number(metric?.clicks ?? 0) }} />
    </section>
  </main>;
}

function createPublicItemUrl(publicId: string) {
  let origin = "http://localhost:4173";
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    try { origin = new URL(configured).origin; } catch { /* keep local preview origin */ }
  }
  return new URL(`/s/${publicId}`, origin).toString();
}
