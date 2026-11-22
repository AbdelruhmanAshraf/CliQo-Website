import { getCopy } from '@/i18n/server';
import {LanguageSwitcher} from "@/app/language-switcher";
import Link from "next/link";
import { CliqoLogo } from "@/app/cliqo-logo";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/signout-actions";
import { PageEditor } from "../page-editor";
import styles from "../../dashboard.module.css";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditLandingPage({ params }: { params: Promise<{ pageId: string }> }) {
  const tr = await getCopy();

  const { pageId } = await params;
  if (!uuid.test(pageId)) notFound();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) redirect("/dashboard");
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect(`/login?next=${encodeURIComponent(`/dashboard/pages/${pageId}`)}`);
  const [{ data: page }, { data: links }] = await Promise.all([
    supabase.from("merchant_pages").select("id,display_name,short_description,avatar_path,cover_path,is_published,contact_name,contact_phone,contact_email,contact_website,show_save_contact,instapay_identifier,instapay_recipient,vodafone_identifier,vodafone_recipient").eq("id", pageId).maybeSingle(),
    supabase.from("merchant_page_links").select("id,label,destination_url,is_enabled,icon_key").eq("page_id", pageId).order("sort_order", { ascending: true }),
  ]);
  if (!page) notFound();
  const [avatar, cover] = await Promise.all([
    page.avatar_path ? supabase.storage.from("merchant-assets").createSignedUrl(page.avatar_path, 300) : Promise.resolve({ data: null }),
    page.cover_path ? supabase.storage.from("merchant-assets").createSignedUrl(page.cover_path, 300) : Promise.resolve({ data: null }),
  ]);
  return <main className={`${styles.page} dashboard-page`} >
    <header className={styles.header}><Link className="brand" href="/" aria-label={tr("CliQo الرئيسية")}><CliqoLogo width={124} /></Link><nav className={styles.nav}><Link href="/dashboard">{tr("قطعك")}</Link><Link href="/dashboard/pages">{tr("صفحات الهبوط")}</Link><Link href="/dashboard/analytics">{tr("الإحصائيات")}</Link><Link href="/guides">{tr("تعليمات NFC")}</Link></nav><form action={signOut}><button className="signout-button" type="submit">{tr("تسجيل الخروج")}</button></form><LanguageSwitcher/></header>
    <section className={styles.content}><PageEditor ownerId={String(claims.claims.sub)} page={{ ...page, links: links ?? [], avatar_url: avatar.data?.signedUrl ?? null, cover_url: cover.data?.signedUrl ?? null }} /></section>
  </main>;
}
