import { getCopy } from '@/i18n/server';
import Link from "next/link";
import { CliqoLogo } from "../cliqo-logo";
import { SiteNav } from "../site-nav";
import { MarketingFooter } from "../marketing-footer";
import styles from "./contact.module.css";

export async function generateMetadata() {
  const tr = await getCopy();
  return { title: tr("تواصل مع CliQo | CliQo"), description: tr("حالة الطلبات والدعم الرسمي لمنتجات CliQo.") };
}

export default async function ContactPage() {
  const tr = await getCopy();

  return <><SiteNav /><main className={styles.page}>
    <section className={styles.hero}>
      <p className={styles.eyebrow}>CliQo · CONTACT</p>
      <h1>{tr("تواصل مع CliQo")}</h1>
      <p>{tr("بنجهّز المنتجات وقناة دعم رسمية قبل فتح البيع. هتلاقي حالة كل منتج بوضوح في المتجر.")}</p>
    </section>
    <section className={styles.status}>
      <div className={styles.brand}><CliqoLogo width={150} /></div>
      <div>
        <span className={styles.pill}>{tr("الطلبات لم تُفتح بعد")}</span>
        <h2>{tr("قناة الدعم قيد التجهيز")}</h2>
        <p>{tr("لسه مفيش وسيلة تواصل رسمية معتمدة. الصفحة دي مش بتجمع بياناتك، ومش بتعرض سعرًا أو موعد تسليم قبل اعتمادهم.")}</p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/products">{tr("تصفّح المنتجات")}</Link>
          <Link className={styles.secondary} href="/faq">{tr("الأسئلة الشائعة")}</Link>
        </div>
      </div>
    </section>
    <section className={styles.steps} aria-label={tr("خطوات فتح البيع")}>
      <article><b>01</b><h3>{tr("اعتماد العينات")}</h3><p>{tr("مراجعة الشكل والخامة والطباعة وقراءة NFC وQR لكل منتج جاهز.")}</p></article>
      <article><b>02</b><h3>{tr("تثبيت الأسعار والتوصيل")}</h3><p>{tr("اعتماد السعر والتغليف والشحن والسياسات وقناة الدعم.")}</p></article>
      <article><b>03</b><h3>{tr("فتح شراء الجاهز")}</h3><p>{tr("الشراء هيظهر للمنتجات المعتمدة فقط؛ الباقي هيفضل واضح إنه قيد التجهيز.")}</p></article>
    </section>
  </main><MarketingFooter /></>;
}
