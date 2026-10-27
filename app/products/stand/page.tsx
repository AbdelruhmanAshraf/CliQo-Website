import { getCopy } from '@/i18n/server';
import Link from "next/link";
import type { Metadata } from "next";
import { SiteNav } from "../../site-nav";
import { MarketingFooter } from "../../marketing-footer";
import { StandOptions } from "./stand-options";
import { getSaleSkus } from "@/lib/sale-skus";

export async function generateMetadata() {
  const tr = await getCopy();
  return { title: tr("ستاند NFC"), description: tr("ستاند CliQo الذكي: خيارات الوجه، NFC وQR، وقوالب جاهزة وتصميم مخصص.") };
}

const uses = [
  ["01", "تقييم Google", "رابط تقييم نشاطك الرسمي."],
  ["02", "وسيلة دفع واحدة", "InstaPay أو Vodafone Cash للتاجر."],
  ["03", "حساب سوشيال", "Instagram أو TikTok أو Facebook."],
  ["04", "صفحة روابط", "صفحة تجمع روابط النشاط وأزراره."],
];

export const dynamic = "force-dynamic";

export default async function StandPage() {
  const tr = await getCopy();

  const saleSkus = await getSaleSkus("stand");
  return <><SiteNav /><main className="product-page">
    <section className="product-detail-hero"><div><p className="section-kicker"><span>01</span>  {tr("لواجهة نشاطك")}</p><h1>{tr("ستاند")} <bdi dir="ltr">NFC</bdi><br /><em>{tr("يقرّب التواصل.")}</em></h1><p>{tr("ستاند أكريليك 100 × 150 مم، مع")} <bdi dir="ltr">NFC</bdi>  {tr("و")}<bdi dir="ltr">QR</bdi>  {tr("فريد لكل قطعة. يفتح رابط CliQo ثابت، وتقدر تغيّر وجهته من لوحة العميل.")}</p><div className="product-detail-actions"><Link className="button button-primary" href="#stand-options">{tr("اختار الوجه والتصميم")} <span>↓</span></Link><Link className="text-under" href="/how-it-works">{tr("طريقة الاستخدام")} <b>←</b></Link></div><span className="product-status large">{saleSkus.length ? tr("القوالب المعتمدة متاحة للطلب") : tr("قيد تجهيز العينة والسعر")}</span></div><div className="stand-mock"><div className="stand-face"><div className="stand-brand">CliQo<span>↗</span></div><div className="stand-face-center"><i>)))</i><strong>{tr("لمسة")}<br />{tr("أو امسح")}</strong><span>{tr("افتح صفحتنا")}</span></div><div className="stand-qr"><i /><i /><i /><b /></div><small>ONE CLICK .. YOU’RE THERE</small></div><div className="stand-base" /><span className="stand-art-note">{tr("تصور للواجهة · مش عينة إنتاج")}</span></div></section>
    <section className="stand-uses"><div className="section-head"><div><p className="section-kicker"><span>02</span>  {tr("نفس الجسم · أوجه مختلفة")}</p><h2>{tr("اختار استخدامك.")}</h2></div><p>{tr("كل وجه له وظيفة واضحة. وجه الدفع يفتح وسيلة التاجر، وما بيحصّلش فلوس عبر متجر CliQo.")}</p></div><div className="uses-grid">{uses.map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{tr(title)}</h3><p>{tr(copy)}</p></article>)}</div></section>
    <section className="self-serve"><div><p className="section-kicker"><span>03</span>  {tr("برمجها بنفسك أو خلّيها علينا")}</p><h2>{tr("قالب جاهز؟")}<br /><em>{tr("اتبع الخطوات.")}</em></h2><p>{tr("بعد التفعيل، اكتب رابط CliQo الخاص بقطعتك على شريحة NFC بنفسك من خلال تعليمات PDF أو فيديو. QR المطبوع يفضل ثابت، وتقدر تغيّر وجهته من الداشبورد.")}</p></div><div className="self-serve-paths"><article><b>T0</b><h3>{tr("قالب جاهز")}</h3><p>{tr("تفعيل برمز خاص، تجهيز الوجهة، كتابة NFC واختبار اللمسة.")}</p></article><article><b>T1 / T2</b><h3>{tr("تصميم مخصص")}</h3><p>{tr("ترفع التصميم وتضيف الرابط في الطلب. CliQo تبرمج NFC وتختبره قبل الشحن.")}</p></article></div></section>
    <section className="landing-feature"><div className="landing-preview"><div className="preview-cover" /><div className="preview-avatar">C</div><strong>{tr("اسم النشاط")}</strong><small>{tr("كل روابطك في مكان واحد")}</small><div className="preview-links"><i>Instagram</i><i>{tr("اتصل بنا")}</i><i>{tr("الموقع")}</i></div></div><div><p className="section-kicker"><span>04</span>  {tr("صفحة تحت تحكمك")}</p><h2>{tr("صفحة واحدة.")}<br /><em>{tr("أو لكل قطعة صفحة.")}</em></h2><p>{tr("الستاند يدعم Landing Page متعددة الروابط. اربط قطعك بصفحة واحدة أو اعمل صفحة مختلفة لكل قطعة. عدّل الاسم والصورة والوصف والأزرار، واعرض إجمالي الفتحات ونقرات الأزرار من الداشبورد.")}</p><Link href="/how-it-works" className="dark-link">{tr("شوف تجربة العميل")} <span>←</span></Link></div></section>
    <StandOptions skus={saleSkus} />
    <section className="product-notice"><p>{saleSkus.length ? tr("اختار وجه الستاند والقالب المعتمد وأضفه للسلة.") : tr("الشراء يفتح بعد اعتماد العينة والسعر والتوافر.")}</p><Link href="/products">{tr("ارجع لكل المنتجات")} <b>←</b></Link></section>
  </main><MarketingFooter /></>;
}
