import { getCopy } from '@/i18n/server';
import Link from "next/link";
import { CliqoLogo } from "./cliqo-logo";

export async function MarketingFooter() {
  const tr = await getCopy();

  return <footer className="st-footer"><div className="st-footer-main"><div className="st-footer-brand"><Link href="/" aria-label={tr("CliQo الرئيسية")}><CliqoLogo width={150} /></Link><p>{tr("منتجات NFC وQR تفتح وجهتك الرقمية من لمسة أو مسح واحد.")}</p><strong lang="en" dir="ltr">One Click .. You’re There</strong></div><div><h2>{tr("المنتجات")}</h2><Link href="/products">{tr("كل المنتجات")}</Link><Link href="/products/stand">{tr("ستاند CliQo")}</Link><Link href="/how-it-works">{tr("كيف تعمل التقنية")}</Link></div><div><h2>{tr("حسابك والمساعدة")}</h2><Link href="/dashboard">{tr("لوحة العميل")}</Link><Link href="/activate">{tr("تفعيل قطعة")}</Link><Link href="/guides">{tr("دليل NFC")}</Link><Link href="/faq">{tr("الأسئلة الشائعة")}</Link></div><div><h2>{tr("تواصل")}</h2><Link href="/contact">{tr("اتصل بنا")}</Link><Link href="/cart">{tr("السلة")}</Link></div></div><div className="st-footer-bottom"><span>© {new Date().getFullYear()}  {tr("CliQo | كليكو")}</span><Link href="/#top">{tr("العودة للأعلى ↑")}</Link></div></footer>;
}
