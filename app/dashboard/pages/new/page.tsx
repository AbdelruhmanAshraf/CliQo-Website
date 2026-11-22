import { getCopy } from '@/i18n/server';
import {LanguageSwitcher} from "@/app/language-switcher";
import Link from "next/link";
import { CliqoLogo } from "@/app/cliqo-logo";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/signout-actions";
import { PageEditor } from "../page-editor";
import styles from "../../dashboard.module.css";

export const dynamic = "force-dynamic";

export default async function NewLandingPage() {
  const tr = await getCopy();

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) redirect("/dashboard");
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login?next=%2Fdashboard%2Fpages%2Fnew");
  return <main className={`${styles.page} dashboard-page`} >
    <header className={styles.header}><Link className="brand" href="/" aria-label={tr("CliQo الرئيسية")}><CliqoLogo width={124} /></Link><nav className={styles.nav}><Link href="/dashboard">{tr("قطعك")}</Link><Link href="/dashboard/pages">{tr("صفحات الهبوط")}</Link><Link href="/dashboard/analytics">{tr("الإحصائيات")}</Link><Link href="/guides">{tr("تعليمات NFC")}</Link></nav><form action={signOut}><button className="signout-button" type="submit">{tr("تسجيل الخروج")}</button></form><LanguageSwitcher/></header>
    <section className={styles.content}><PageEditor ownerId={String(claims.claims.sub)} page={null} /></section>
  </main>;
}
