import { matchesPrintedDestination } from "@/lib/smart-item-destination";
import { getCopy } from '@/i18n/server';
import Link from "next/link";
import { CliqoLogo } from "@/app/cliqo-logo";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CopyPaymentIdentifier } from "./copy-payment-identifier";
import { SharePage } from "./share-page";
import { ServiceIcon } from "@/app/service-icon";
import styles from "../public-page.module.css";

type PublicSmartItem = {
  kind: "review" | "payment" | "social" | "single" | "all_in_one" | "unclaimed" | "paused" | "setup";
  printed_face?: string;
  printed_variant?: string;
  destination_url?: string;
  payment_identifier?: string;
  recipient_label?: string;
  page?: {
    display_name?: string;
    short_description?: string;
    avatar_path?: string | null;
    cover_path?: string | null;
    contact_name?: string; contact_phone?: string; contact_email?: string; contact_website?: string;
    show_save_contact?: boolean;
    instapay_identifier?: string; instapay_recipient?: string;
    vodafone_identifier?: string; vodafone_recipient?: string;
    links?: Array<{ id: string; label: string; icon_key?: string }>;
  };
};

const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SmartItemEntry({ params }: { params: Promise<{ id: string }> }) {
  const tr = await getCopy();

  const { id } = await params;
  if (!publicIdPattern.test(id)) notFound();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return <Unavailable title={tr("الرابط لسه بيتجهز.")} body={tr("صفحة القطعة هتظهر بعد تفعيل الخدمة.")} />;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_stand", { p_public_id: id });
  if (error || !data) notFound();
  const item = data as PublicSmartItem;

  if (item.kind === "unclaimed") {
    return <Unavailable title={tr("القطعة لسه متفعّلتش.")} body={tr("لو دي قطعتك، سجّل دخولك واستخدم كود التفعيل المكوّن من ٦ أرقام الموجود على البطاقة داخل العبوة.")} action={<Link href={`/activate?item=${id}`}>{tr("تفعيل القطعة")}</Link>} />;
  }
  if (item.kind === "paused") {
    return <Unavailable title={tr("الرابط متوقف مؤقتًا.")} body={tr("مالك القطعة أوقف الرابط مؤقتًا. جرّب تاني لاحقًا.")} />;
  }
  if (item.kind === "setup") {
    return <Unavailable title={tr("الصفحة لسه بتتجهز.")} body={tr("صاحب القطعة لم ينشر محتواها بعد.")} />;
  }

  if (item.kind === "payment") {
    if (!item.payment_identifier || !item.recipient_label) notFound();
    return <main className={styles.paymentPage} >
      <article className={styles.paymentCard}>
        <div className={styles.accentBar} />
        <div className={styles.paymentContent}>
          <Link className={styles.brand} href="/" aria-label={tr("CliQo الرئيسية")}><CliqoLogo width={112} /></Link>
          <p className={styles.paymentEyebrow}>{item.printed_variant}</p>
          <h1>{tr("بيانات الدفع للتاجر")}</h1>
          <p className={styles.paymentIntro}>{tr("افتح تطبيق وسيلة الدفع المطبوعة على القطعة، ثم أدخل البيانات دي.")}</p>
          <section className={styles.paymentDetails} aria-label={tr("بيانات المستلم")}>
            <span className={styles.detailLabel}>{tr("اسم المستلم")}</span>
            <strong className={styles.recipientName} dir="auto">{item.recipient_label}</strong>
            <span className={styles.detailLabel}>{tr("رقم أو عنوان الدفع")}</span>
            <code className={styles.identifierValue} dir="ltr">{item.payment_identifier}</code>
            <CopyPaymentIdentifier value={item.payment_identifier} />
          </section>
          <p className={styles.paymentWarning}>{tr("راجع أن اسم المستلم داخل تطبيق الدفع يطابق الاسم أعلاه قبل تأكيد أي تحويل. CliQo لا ينفّذ التحويل ولا يستلم أموالك.")}</p>
          <p className={styles.paymentFooter}>CliQo · One Click .. You’re There</p>
        </div>
      </article>
    </main>;
  }

  if (item.kind === "review" || item.kind === "social" || item.kind === "single") {
    const destination = safeHttpsUrl(item.destination_url, item.kind, item.printed_face);
    if (!destination) notFound();
    redirect(destination);
  }

  const page = item.page;
  if (!page) notFound();
  const [avatarUrl, coverUrl] = await Promise.all([
    getImageUrl(supabase, page.avatar_path),
    getImageUrl(supabase, page.cover_path),
  ]);
  return <main className={styles.merchantPage} >
    <div className={styles.merchantCover} style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined} />
    <section className={styles.merchantProfile}>
      <div className={styles.avatarFrame}>
        {avatarUrl ? <img className={styles.merchantAvatar} src={avatarUrl} alt="" /> : <span className={styles.avatarPlaceholder}>C</span>}
      </div>
      <p className={styles.merchantEyebrow}>{tr("CliQo · صفحة النشاط")}</p>
      <h1 dir="auto">{page.display_name || tr("صفحة النشاط")}</h1>
      {page.short_description && <p className={styles.merchantDescription} dir="auto">{page.short_description}</p>}
      <div className={styles.merchantLinks}>
        {page.links?.map((link) => <a className={styles.merchantLink} key={link.id} href={`/s/${id}/go/${link.id}`}>
          <ServiceIcon name={link.icon_key ?? "link"} /><span dir="auto">{link.label}</span><span className={styles.linkArrow} aria-hidden="true">↗</span>
        </a>)}
        {page.contact_phone && <a className={styles.merchantLink} href={`tel:${page.contact_phone.replace(/[^+0-9]/g, "")}`}><ServiceIcon name="phone"/><span>{tr("اتصل بنا")}</span><span className={styles.linkArrow} aria-hidden="true">↗</span></a>}
        {page.contact_email && <a className={styles.merchantLink} href={`mailto:${page.contact_email}`}><ServiceIcon name="email"/><span>{tr("راسلنا")}</span><span className={styles.linkArrow} aria-hidden="true">↗</span></a>}
        {page.show_save_contact && (page.contact_phone || page.contact_email) && <a className={styles.merchantLink} href={`/s/${id}/contact`}><ServiceIcon name="save-contact"/><span>{tr("احفظ جهة الاتصال")}</span><span className={styles.linkArrow} aria-hidden="true">↓</span></a>}
        <SharePage title={page.display_name || tr("صفحة النشاط")} className={styles.merchantLink} />
      </div>
      {(page.instapay_identifier || page.vodafone_identifier) && <section className={styles.merchantPayments} aria-label={tr("وسائل الدفع")}>
        <h2>{tr("وسائل الدفع")}</h2>
        {page.instapay_identifier && page.instapay_recipient && <article><strong><ServiceIcon name="instapay" /> InstaPay</strong><span dir="auto">{page.instapay_recipient}</span><code dir="ltr">{page.instapay_identifier}</code><CopyPaymentIdentifier value={page.instapay_identifier}/></article>}
        {page.vodafone_identifier && page.vodafone_recipient && <article><strong><ServiceIcon name="vodafone" /> Vodafone Cash</strong><span dir="auto">{page.vodafone_recipient}</span><code dir="ltr">{page.vodafone_identifier}</code><CopyPaymentIdentifier value={page.vodafone_identifier}/></article>}
        <p>{tr("راجع اسم المستلم داخل تطبيق الدفع قبل تأكيد أي تحويل. CliQo لا ينفّذ التحويل.")}</p>
      </section>}
      <Link className={styles.merchantBack} href="/">CliQo · One Click .. You’re There</Link>
    </section>
  </main>;
}

async function getImageUrl(supabase: Awaited<ReturnType<typeof createClient>>, path?: string | null) {
  if (!path) return null;
  const { data } = await supabase.storage.from("merchant-assets").createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

function safeHttpsUrl(value?: string, kind?: PublicSmartItem["kind"], face?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (kind === "review" && !matchesPrintedDestination(host, "review")) return null;
    if (kind === "social" && !matchesPrintedDestination(host, face)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function Unavailable({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  const tr = await getCopy();

  return <main className={styles.unavailablePage} ><section className={styles.unavailableCard}><Link className={styles.brand} href="/" aria-label={tr("CliQo الرئيسية")}><CliqoLogo width={120} /></Link><h1>{tr(title)}</h1><p>{body}</p>{action ?? <Link className={styles.unavailableAction} href="/">{tr("الرجوع للموقع")}</Link>}</section></main>;
}
