"use client";
import { useCopy } from '@/i18n/client';


import {LanguageSwitcher} from "@/app/language-switcher";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CliqoLogo } from "@/app/cliqo-logo";
import { signOut } from "@/app/auth/signout-actions";
import type { StaffRole } from "@/lib/admin";

const links = [
  { href: "/admin/orders", title: "الطلبات", icon: "▤" },
  { href: "/admin/customers", title: "العملاء", icon: "♙" },
  { href: "/admin/inventory", title: "المخزون", icon: "▦" },
  { href: "/admin/items", title: "قطع NFC/QR", icon: "⌗" },
  { href: "/admin/settings", title: "جاهزية البيع", icon: "◉" },
];
const roleLabels: Record<StaffRole, string> = {
  owner: "مالك المشروع", admin: "مدير", operations: "إدارة الطلبات",
  fulfillment: "التجهيز", support: "الدعم",
};

export function AdminShell({ children, staffName, staffRole }: { children: React.ReactNode; staffName: string; staffRole: StaffRole }) {
  const tr = useCopy();

  const path = usePathname();
  const visibleLinks = links.filter((link) => link.href === "/admin/orders" || (link.href === "/admin/customers" ? staffRole !== "fulfillment" : ["/admin/settings", "/admin/items"].includes(link.href) ? staffRole === "owner" : staffRole !== "support"));
  return <div className="ops-layout" >
    <aside className="ops-sidebar">
      <Link href="/" className="ops-brand" aria-label={tr("CliQo الرئيسية")}><span className="ops-brand-lockup"><CliqoLogo width={126} /><small>{tr("لوحة إدارة المشروع")}</small></span></Link>
      <div className="ops-store"><span className="store-dot" />  {tr("متجر CliQo")} <span className="store-caret">⌄</span></div>
      <p className="ops-nav-label">{tr("إدارة المتجر")}</p>
      <nav>{visibleLinks.map((link) => <Link key={link.href} href={link.href} className={path === link.href ? "active" : ""}><span className="nav-icon" aria-hidden="true">{link.icon}</span>{tr(link.title)}</Link>)}</nav>
      <div className="sidebar-bottom"><span className="ops-avatar">C</span><span>{staffName || tr("مالك CliQo")}<small>{tr(roleLabels[staffRole])}</small></span></div>
    </aside>
    <main className="ops-main"><header className="ops-topbar"><div><span className="breadcrumb">{tr("المتجر")}</span><span className="crumb-sep">/</span><strong>{tr(links.find((link) => link.href === path)?.title ?? "لوحة التشغيل")}</strong></div><div className="ops-top-actions"><LanguageSwitcher/><form action={signOut}><button className="export-button" type="submit">{tr("تسجيل الخروج")}</button></form><span className="avatar-small">C</span></div></header>
      {children}
    </main>
  </div>;
}
