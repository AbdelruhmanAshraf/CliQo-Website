import Link from "next/link";
import { redirect } from "next/navigation";
import { LuMail, LuUserRound } from "react-icons/lu";
import { signOut } from "@/app/auth/signout-actions";
import { getCopy } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";
import styles from "../workspace.module.css";

export default async function ProfilePage() {
  const tr = await getCopy();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) redirect("/dashboard");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fdashboard%2Fprofile");

  const metadata = user.user_metadata;
  const name = [metadata.cliqo_display_name, metadata.full_name, metadata.name].find((value): value is string => typeof value === "string") ?? "";
  const phone = typeof metadata.cliqo_contact_phone === "string" ? metadata.cliqo_contact_phone : "";

  return <main className={styles.workspace}>
    <header className={styles.heading}><div><h1>{tr("حسابي")}</h1><p>{tr("راجع بيانات حسابك وعدّل اسمك ورقم تليفونك.")}</p></div></header>
    <section className={styles.account} aria-label={tr("بيانات الحساب")}>
      <div className={styles.identity}><LuUserRound aria-hidden="true" /><div>
        <h2 dir="auto">{name || tr("بيانات الحساب")}</h2>
        {user.email && <p><LuMail aria-hidden="true" /><bdi>{user.email}</bdi></p>}
      </div></div>
      <ProfileForm name={name} phone={phone} />
    </section>
    <div className={styles.profileActions}>
      <Link className={styles.secondary} href="/products">{tr("العودة للمتجر ←")}</Link>
      <form action={signOut}><button type="submit" className={styles.secondary}>{tr("تسجيل الخروج")}</button></form>
    </div>
  </main>;
}
