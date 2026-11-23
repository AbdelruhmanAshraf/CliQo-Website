"use client";
import { useCopy } from '@/i18n/client';


import {LanguageSwitcher} from "@/app/language-switcher";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CliqoLogo, CliqoSymbol } from "@/app/cliqo-logo";
import { signOut } from "@/app/auth/signout-actions";
import type { StaffRole } from "@/lib/admin";

const links = [
  { href: "/cliqo-control", title: "نظرة عامة", icon: "◈" },
  { href: "/cliqo-control/orders", title: "الطلبات", icon: "▤" },
  { href: "/cliqo-control/products", title: "المنتجات", icon: "◫" },
  { href: "/cliqo-control/inventory", title: "المخزون", icon: "▦" },
  { href: "/cliqo-control/customers", title: "العملاء", icon: "♙" },
  { href: "/cliqo-control/email", title: "Email", icon: "✉" },
  { href: "/cliqo-control/policies", title: "السياسات وشروط البيع", icon: "§" },
  { href: "/cliqo-control/settings", title: "جاهزية البيع", icon: "◉" },
];
const roleLabels: Record<StaffRole, string> = {
  owner: "مالك المشروع", admin: "مدير", operations: "إدارة الطلبات",
  fulfillment: "التجهيز", support: "الدعم",
};

export function AdminShell({ children, staffName, staffRole }: { children: React.ReactNode; staffName: string; staffRole: StaffRole }) {
  const tr = useCopy();

  const path = usePathname();
  const ownerOnlyLinks = ["/cliqo-control/settings", "/cliqo-control/policies", "/cliqo-control/products", "/cliqo-control/email"];
  const ownerAdminLinks = ["/cliqo-control/inventory"];
  const visibleLinks = links.filter((link) => link.href === "/cliqo-control" || link.href === "/cliqo-control/orders" || (link.href === "/cliqo-control/customers" ? staffRole !== "fulfillment" : ownerOnlyLinks.includes(link.href) ? staffRole === "owner" : ownerAdminLinks.includes(link.href) ? staffRole === "owner" || staffRole === "admin" : staffRole !== "support"));
  return <div className="ops-layout" >
    <aside className="ops-sidebar">
      <Link href="/" className="ops-brand" aria-label={tr("CliQo الرئيسية")}><span className="ops-brand-lockup"><CliqoLogo width={126} /><small>{tr("لوحة إدارة المشروع")}</small></span></Link>
      <nav aria-label={tr("إدارة المتجر")}>{visibleLinks.map((link) => <Link key={link.href} href={link.href} aria-current={path === link.href ? "page" : undefined} className={path === link.href ? "active" : ""}><span className="nav-icon" aria-hidden="true">{link.icon}</span>{tr(link.title)}</Link>)}</nav>
      <div className="sidebar-bottom"><span className="ops-avatar"><CliqoSymbol size={34} decorative className="cliqo-symbol" /></span><span>{staffName || tr("مالك CliQo")}<small>{tr(roleLabels[staffRole])}</small></span></div>
    </aside>
    <main className="ops-main"><header className="ops-topbar"><div><strong>{tr(links.find((link) => link.href === path)?.title ?? "لوحة التشغيل")}</strong></div><div className="ops-top-actions"><LanguageSwitcher/><form action={signOut}><button className="export-button" type="submit">{tr("تسجيل الخروج")}</button></form></div></header>
      {children}
    </main>
  </div>;
}
