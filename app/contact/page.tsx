import { getCopy } from '@/i18n/server';
import Link from "next/link";
import { CliqoLogo } from "../cliqo-logo";
import { SiteNav } from "../site-nav";
import { MarketingFooter } from "../marketing-footer";
import { getDb } from "@/lib/db";
import styles from "./contact.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tr = await getCopy();
  return { title: tr("تواصل مع CliQo | CliQo"), description: tr("حالة الطلبات والدعم الرسمي لمنتجات CliQo.") };
}

export default async function ContactPage() {
  const tr = await getCopy();
  let support: { support_channel_ready: boolean; support_email: string | null; support_whatsapp: string | null } | null = null;
  try {
    const result = await getDb().query<{ support_channel_ready: boolean; support_email: string | null; support_whatsapp: string | null }>(
      `select support_channel_ready,support_email,support_whatsapp from app_private.checkout_config where id=true`,
    );
    support = result.rows[0] ?? null;
  } catch {
    support = null;
  }

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
        <h2>{support?.support_channel_ready ? tr("قناة الدعم الرسمية جاهزة") : tr("قناة الدعم قيد التجهيز")}</h2>
        <p>{support?.support_channel_ready ? tr("تواصل مع CliQo من إحدى القنوات المعتمدة أدناه.") : tr("لسه مفيش وسيلة تواصل رسمية معتمدة. الصفحة دي مش بتجمع بياناتك، ومش بتعرض سعرًا أو موعد تسليم قبل اعتمادهم.")}</p>
        <div className={styles.actions}>
          {support?.support_channel_ready && support.support_email && <a className={styles.primary} href={`mailto:${support.support_email}`}>{tr("راسلنا بالبريد")}</a>}
          {support?.support_channel_ready && support.support_whatsapp && <a className={styles.secondary} href={`https://wa.me/${support.support_whatsapp}`} target="_blank" rel="noreferrer">{tr("تواصل عبر واتساب")}</a>}
          {!support?.support_channel_ready && <><Link className={styles.primary} href="/products">{tr("تصفّح المنتجات")}</Link><Link className={styles.secondary} href="/faq">{tr("الأسئلة الشائعة")}</Link></>}
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
