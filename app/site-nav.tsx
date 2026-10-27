"use client";
import { useCopy } from '@/i18n/client';

import { LanguageSwitcher } from "./language-switcher";
import { useState } from "react";
import Link from "next/link";
import { useCart } from "./cart-provider";
import { CliqoLogo } from "./cliqo-logo";

function NavIcon({ name }: { name: "home" | "products" | "help" | "dashboard" | "cart" }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7v10H3z" /><path d="M9 20v-6h6v6" /></>,
    products: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v5" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4.4 1.6c-1.1 1.3-1.9 1.5-1.9 3" /><path d="M12 17h.01" /></>,
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    cart: <><path d="M4 7h16l-1.2 13H5.2z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function SiteNav() {
  const tr = useCopy();

  const [open, setOpen] = useState(false);
  const cart = useCart();
  const close = () => setOpen(false);

  return <>
    <div className="st-top-strip"><span>{tr("منتجات ذكية تربط نشاطك بعالمك الرقمي")}</span><span lang="en" dir="ltr">One Click .. You’re There</span></div>
    <header className="st-site-nav"><Link className="st-nav-brand" href="/" aria-label={tr("CliQo — الرئيسية")} onClick={close}><CliqoLogo width={146} priority /></Link>
      <nav className={open ? "st-nav-links open" : "st-nav-links"} id="site-main-links" aria-label={tr("التنقل الرئيسي")}><Link href="/" onClick={close}>{tr("الرئيسية")}</Link><Link href="/products" onClick={close}>{tr("المنتجات")}</Link><Link href="/how-it-works" onClick={close}>{tr("كيف تعمل")}</Link><Link href="/faq" onClick={close}>{tr("الأسئلة الشائعة")}</Link><Link href="/contact" onClick={close}>{tr("تواصل معنا")}</Link></nav>
      <div className="st-nav-actions"><LanguageSwitcher/><Link className="st-nav-account" href="/dashboard">{tr("لوحة العميل")}</Link><Link className="st-nav-cart" href="/cart" aria-label={cart.count ? tr("السلة، {value0} منتجات", {value0: cart.count}) : tr("السلة")}><NavIcon name="cart" />{cart.count > 0 && <span>{cart.count}</span>}</Link><button className="st-nav-toggle" type="button" aria-label={open ? tr("إغلاق القائمة") : tr("فتح القائمة")} aria-controls="site-main-links" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "×" : "☰"}</button></div>
    </header>
    <nav className="st-mobile-bar" aria-label={tr("التنقل السريع")}><Link href="/"><NavIcon name="home" /><span>{tr("الرئيسية")}</span></Link><Link href="/products"><NavIcon name="products" /><span>{tr("المنتجات")}</span></Link><Link href="/how-it-works"><NavIcon name="help" /><span>{tr("كيف تعمل")}</span></Link><Link href="/dashboard"><NavIcon name="dashboard" /><span>{tr("لوحتي")}</span></Link><Link href="/cart"><NavIcon name="cart" /><span>{tr("السلة")}{cart.count ? ` (${cart.count})` : ""}</span></Link></nav>
  </>;
}
