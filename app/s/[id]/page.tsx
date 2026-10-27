import { getCopy } from '@/i18n/server';
import Link from "next/link";
import { CliqoLogo } from "@/app/cliqo-logo";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CopyPaymentIdentifier } from "./copy-payment-identifier";
import styles from "../public-page.module.css";

type PublicSmartItem = {
  kind: "review" | "payment" | "social" | "single" | "all_in_one" | "unclaimed" | "paused" | "setup";
  printed_variant?: string;
  destination_url?: string;
  payment_identifier?: string;
  recipient_label?: string;
  page?: {
    display_name?: string;
    short_description?: string;
    avatar_path?: string | null;
    cover_path?: string | null;
    links?: Array<{ id: string; label: string }>;
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
    return <Unavailable title={tr("القطعة لسه متفعّلتش.")} body={tr("لو دي قطعتك، سجّل دخولك وفعّلها بكود التفعيل الموجود داخل العبوة.")} action={<Link href={`/activate?item=${id}`}>{tr("تفعيل القطعة")}</Link>} />;
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
          <p className={styles.paymentIntro}>{tr("افتح تطبيق وسيلة الدفع المطبوعة على الستاند، ثم أدخل البيانات دي.")}</p>
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
    const destination = safeHttpsUrl(item.destination_url, item.kind, item.printed_variant);
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
      <div className={styles.merchantLinks}>{page.links?.map((link) => <a className={styles.merchantLink} key={link.id} href={`/s/${id}/go/${link.id}`}>
        <span dir="auto">{link.label}</span><span className={styles.linkArrow} aria-hidden="true">↗</span>
      </a>)}</div>
      <Link className={styles.merchantBack} href="/">CliQo · One Click .. You’re There</Link>
    </section>
  </main>;
}

async function getImageUrl(supabase: Awaited<ReturnType<typeof createClient>>, path?: string | null) {
  if (!path) return null;
  const { data } = await supabase.storage.from("merchant-assets").createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

function safeHttpsUrl(value?: string, kind?: PublicSmartItem["kind"], variant?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (kind === "review" && !(host === "google.com" || host.endsWith(".google.com") || host === "g.page" || host === "maps.app.goo.gl")) return null;
    if (kind === "social") {
      const printed = (variant ?? "").toLowerCase();
      const matches = printed.includes("instagram") ? host === "instagram.com" || host.endsWith(".instagram.com")
        : printed.includes("tiktok") ? host === "tiktok.com" || host.endsWith(".tiktok.com")
        : printed.includes("facebook") ? host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.me"
        : false;
      if (!matches) return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

async function Unavailable({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  const tr = await getCopy();

  return <main className={styles.unavailablePage} ><section className={styles.unavailableCard}><Link className={styles.brand} href="/" aria-label={tr("CliQo الرئيسية")}><CliqoLogo width={120} /></Link><h1>{tr(title)}</h1><p>{body}</p>{action ?? <Link className={styles.unavailableAction} href="/">{tr("الرجوع للموقع")}</Link>}</section></main>;
}
