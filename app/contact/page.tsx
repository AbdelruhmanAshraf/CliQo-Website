import { getCopy } from '@/i18n/server';
import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "../site-nav";
import { MarketingFooter } from "../marketing-footer";

export async function generateMetadata() {
  const tr = await getCopy();
  return { title: tr("استفسر عن CliQo | CliQo"), description: tr("تفاصيل فتح الطلبات والتواصل الرسمي مع CliQo.") };
}

export default async function ContactPage() {
  const tr = await getCopy();

  return <><SiteNav /><main className="content-page contact-page">
    <section className="content-title-band"><p className="eyebrow">CliQo · STAND INQUIRY</p><h1>{tr("مهتم بالستاند؟")}<br /><em>{tr("إحنا بنجهز.")}</em></h1><p>{tr("لسه بنراجع العينات ونثبت السعر والتسليم وقناة الدعم. مش هنطلب منك بيانات تواصل قبل اعتماد وسيلة آمنة وواضحة.")}</p></section>
    <section className="contact-status"><div className="contact-status-icon">R<span>1</span></div><div><span className="status-pill"><i />  {tr("الطلبات لم تُفتح بعد")}</span><h2>{tr("قناة الاستفسار قيد الاعتماد")}</h2><p>{tr("هنضيف وسيلة التواصل الرسمية هنا بعد تأكيدها. لحد وقتها، مفيش نموذج بيجمع بياناتك ومفيش تفاصيل طلب أو سعر مؤكدة.")}</p><div className="contact-actions"><Link className="button button-gold" href="/products/stand">{tr("تفاصيل الستاند")} <span>←</span></Link><Link className="contact-secondary" href="/faq">{tr("الأسئلة الشائعة")} <span>↙</span></Link></div></div></section>
    <section className="contact-steps"><article><b>01</b><h3>{tr("اعتماد العينة")}</h3><p>{tr("مراجعة الشكل والخامة والطباعة وقراءة NFC وQR.")}</p></article><article><b>02</b><h3>{tr("تثبيت التفاصيل")}</h3><p>{tr("تأكيد السعر والتغليف وموعد التسليم وقناة الدعم.")}</p></article><article><b>03</b><h3>{tr("فتح الطلبات")}</h3><p>{tr("إضافة مسار طلب واضح بعد جاهزية التفاصيل.")}</p></article></section>
  </main><MarketingFooter /></>;
}
