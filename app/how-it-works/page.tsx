import { getCopy } from '@/i18n/server';
import Image from "next/image";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "../site-nav";
import { MarketingFooter } from "../marketing-footer";

export async function generateMetadata() {
  const tr = await getCopy();
  return { title: tr("طريقة الاستخدام"), description: tr("خطوات شراء وتفعيل منتجات CliQo وإعداد صفحة الروابط.") };
}

const steps = [
  { id: "01", title: "اختار المنتج", body: "شوف المجموعة. الشراء يتاح للمنتجات الجاهزة فقط بعد اعتماد العينة والسعر والمخزون." },
  { id: "02", title: "فعّل قطعتك", body: "سجّل دخولك وأدخل كود التفعيل المكوّن من ٦ أرقام الموجود على البطاقة داخل العبوة. مسح QR وحده لا ينقل ملكيتها." },
  { id: "03", title: "اضبط الوجهة", body: "أضف رابطًا مناسبًا لوجه القطعة، أو أنشئ صفحة روابط للمنتجات التي تدعمها." },
  { id: "04", title: "المس أو امسح", body: "نفس رابط CliQo يفتح عبر NFC وQR. عدّل الوجهة من حسابك بدون تغيير الطباعة." },
];

export default async function HowItWorksPage() {
  const tr = await getCopy();

  return <><SiteNav /><main className="st-how">
    <section className="st-how-hero"><div><p className="st-kicker st-kicker-light">{tr("من القطعة إلى وجهتك")}</p><h1>{tr("تجربة واضحة")}<br /><em>{tr("من أول لمسة.")}</em></h1><p>{tr("كل قطعة ذكية لها رابط CliQo ثابت. الزائر يفتحه بلمسة NFC أو مسح QR، وأنت تتحكم في وجهته من حسابك.")}</p><Link className="st-button st-button-orange" href="/products">{tr("اكتشف المنتجات ←")}</Link></div><div className="st-how-photo"><Image src="/stitch/hero.webp" alt={tr("تصور بصري لستاند CliQo على كاونتر")} fill sizes="(max-width: 750px) 100vw, 44vw" /></div></section>
    <section className="st-section st-how-process"><div className="st-section-head"><div><p className="st-kicker">{tr("طريقة الاستخدام")}</p><h2>{tr("أربع خطوات بسيطة.")}</h2></div><p>{tr("تفعيل الملكية منفصل عن QR العام. الرابط المطبوع يظل ثابتًا بعد تعديل وجهتك.")}</p></div><div className="st-how-step-grid">{steps.map((step) => <article key={step.id}><b>{step.id}</b><h3>{tr(step.title)}</h3><p>{tr(step.body)}</p></article>)}</div></section>
    <section className="st-section st-how-paths"><div className="st-section-head"><div><p className="st-kicker">{tr("طريقتان للتجهيز")}</p><h2>{tr("جاهز أو بتصميمك.")}</h2></div></div><div className="st-how-path-grid"><article><span>{tr("T0 · قالب جاهز")}</span><h3>{tr("قالب جاهز")}</h3><p>{tr("فعّل القطعة بكود خاص، اضبط الوجهة، ثم اكتب رابط CliQo الثابت على NFC بنفسك باتباع الدليل. اختبر القراءة قبل قفل الشريحة.")}</p><Link href="/guides">{tr("افتح دليل NFC ←")}</Link></article><article><span>{tr("T1 / T2 · تصميم مخصص")}</span><h3>{tr("تصميم مخصص")}</h3><p>{tr("أرسل رابطك وملف التصميم مع الطلب. CliQo تجهز الوجهة الأولى وتكتب الرابط الثابت على NFC وتختبره قبل الشحن.")}</p><Link href="/products/stand">{tr("شوف خيارات الستاند ←")}</Link></article></div></section>
    <section className="st-section st-how-manage"><div><p className="st-kicker st-kicker-light">{tr("بعد التفعيل")}</p><h2>{tr("رابط ثابت، إدارة مرنة.")}</h2><p>{tr("عدّل الرابط أو محتوى الصفحة، اربط صفحة واحدة بأكثر من قطعة مؤهلة، أوقف القطعة مؤقتًا، وتابع الفتحات والنقرات من لوحة العميل.")}</p><Link className="st-button st-button-outline" href="/dashboard">{tr("لوحة العميل ←")}</Link></div><div className="st-how-manage-card"><strong>NFC <span>+</span> QR</strong><p>{tr("رابط CliQo نفسه على الشريحة والكود المطبوع")}</p><small>{tr("الفتحات تُحسب معًا، وليست عدد أشخاص فريدين.")}</small></div></section>
  </main><MarketingFooter /></>;
}
