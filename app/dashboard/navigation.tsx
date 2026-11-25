"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LuChartNoAxesColumnIncreasing, LuLayoutGrid, LuNfc, LuPanelsTopLeft, LuUserRound } from "react-icons/lu";
import { CliqoLogo } from "@/app/cliqo-logo";
import { LanguageSwitcher } from "@/app/language-switcher";
import { useCopy } from "@/i18n/client";
import styles from "./workspace.module.css";

const routes = [
  { href: "/dashboard", label: "نظرة عامة", icon: LuLayoutGrid },
  { href: "/dashboard/pages", label: "صفحات الهبوط", icon: LuPanelsTopLeft },
  { href: "/dashboard/analytics", label: "الإحصائيات", icon: LuChartNoAxesColumnIncreasing },
  { href: "/dashboard/profile", label: "حسابي", icon: LuUserRound },
  { href: "/guides", label: "تعليمات NFC", icon: LuNfc },
];

export function DashboardNav() {
  const tr = useCopy();
  const path = usePathname();
  return <aside className={styles.sidebar}>
    <div className={styles.brandRow}>
      <Link href="/dashboard" aria-label={tr("لوحة العميل")}><CliqoLogo width={92} /></Link>
      <LanguageSwitcher />
    </div>
    <nav className={styles.nav} aria-label={tr("لوحة العميل")}>
      {routes.map(({ href, label, icon: Icon }) => {
        const active = href === "/dashboard"
          ? path === href || path.startsWith("/dashboard/items/")
          : path === href || path.startsWith(href + "/");
        return <Link href={href} key={href} aria-current={active ? (path === href ? "page" : "location") : undefined}>
          <Icon aria-hidden="true" /><span>{tr(label)}</span>
        </Link>;
      })}
    </nav>
    <Link className={styles.store} href="/products">{tr("العودة للمتجر ←")}</Link>
  </aside>;
}
