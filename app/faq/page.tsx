import { getCopy } from '@/i18n/server';
import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "../site-nav";
import { MarketingFooter } from "../marketing-footer";

export async function generateMetadata() {
  const tr = await getCopy();
  return { title: tr("الأسئلة الشائعة"), description: tr("إجابات عن منتجات CliQo وNFC وQR وصفحات العملاء والشراء.") };
}

const questions = [
  { q: "هل أقدر أشتري كل المنتجات دلوقتي؟", a: "المتجر هيعرض المجموعة كلها، لكن الشراء هيفتح للمنتج الجاهز فقط بعد اعتماد العينة والسعر والمخزون. الأسعار لسه ما اتحددتش." },
  { q: "إزاي أبرمج المنتج؟", a: "في القالب الجاهز: تفعّل القطعة برمز خاص، تضبط الوجهة، وتكتب رابط CliQo على NFC بنفسك باتباع PDF أو فيديو. في التصميم المخصص: تضيف الرابط وترفع التصميم مع الطلب، وCliQo تكتب NFC وتختبره قبل الشحن." },
  { q: "هل QR بيتغير لما أعدل الصفحة؟", a: "لأ. كل قطعة لها رابط CliQo ثابت وQR فريد. لما تعدل الوجهة أو الصفحة من الداشبورد، الرابط المطبوع يفضل نفسه." },
  { q: "هل أقدر أستخدم Landing Page لأكتر من قطعة؟", a: "أيوه. تقدر تربط الستاند والكوستر والكارت بنفس الصفحة أو تعمل صفحة مختلفة لكل قطعة، حسب اختيارك." },
  { q: "إيه اللي هيظهر في الإحصائيات؟", a: "إجمالي فتحات الرابط ونقرات الأزرار. الفتحات من QR وNFC بتتحسب مع بعض لأنهم بيستخدموا نفس الرابط، والرقم مش بالضرورة يمثل أشخاصًا مختلفين." },
  { q: "الدفع في المتجر بيخص إيه؟", a: "بوابة الدفع أو الدفع عند الاستلام لشراء منتجات CliQo فقط. ستاند الدفع يفتح وسيلة التاجر المطبوعة عليه، InstaPay أو Vodafone Cash؛ CliQo لا يستقبل التحويل." },
  { q: "إمتى هيبقى فيه سعر وشحن؟", a: "بعد اعتماد العينات وتكلفة كل منتج، هنثبت الأسعار ونختار بوابة الدفع وشركة الشحن وسياسات التوصيل والاسترجاع قبل فتح الطلبات." },
];

export default async function FAQPage() {
  const tr = await getCopy();

  return <><SiteNav /><main className="content-page faq-page"><section className="content-title-band"><p className="eyebrow">{tr("إجابات واضحة")}</p><h1>{tr("أسئلة")} <em>{tr("بتتكرر.")}</em></h1><p>{tr("تفاصيل منتجات CliQo وطريقة تجهيزها وإدارة الصفحات.")}</p></section><section className="faq-content"><div className="section-kicker"><span>01</span><i />  {tr("عن المنتجات والتجهيز")}</div>{questions.map((item, index) => <details key={item.q}><summary><span className="faq-index">{String(index + 1).padStart(2, "0")}</span>{tr(item.q)}<b aria-hidden="true">＋</b></summary><p>{tr(item.a)}</p></details>)}<div className="faq-next"><p>{tr("عايز تعرف طريقة التشغيل؟")}</p><span>{tr("شرح القوالب الجاهزة ومسار التصميم المخصص.")}</span><Link href="/how-it-works">{tr("شوف الخطوات")} <b>←</b></Link></div></section></main><MarketingFooter /></>;
}
