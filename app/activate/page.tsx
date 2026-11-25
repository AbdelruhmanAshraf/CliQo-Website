import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LuKeyRound, LuNfc, LuQrCode, LuScanLine } from "react-icons/lu";
import { getCopy } from "@/i18n/server";
import { CliqoLogo } from "@/app/cliqo-logo";
import { createClient } from "@/lib/supabase/server";
import { ActivationForm } from "./activation-form";
import { ScannedLinkForm } from "./scanned-link-form";
import styles from "./activate.module.css";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ item?: string | string[] }> }) {
  const [tr, params] = await Promise.all([getCopy(), searchParams]);
  const requestedItem = Array.isArray(params.item) ? params.item[0] : params.item;
  if (requestedItem && !uuid.test(requestedItem)) notFound();
  const publicId = requestedItem?.toLowerCase();
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  if (configured && publicId) {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    if (!claims?.claims?.sub) redirect(`/login?next=${encodeURIComponent(`/activate?item=${publicId}`)}`);
  }

  return <main className={styles.activate}>
    <div className={styles.frame}>
      <Link href="/" className={styles.brand} aria-label={tr("CliQo الرئيسية")}><CliqoLogo width={92} variant="light" /></Link>
      <section className={styles.panel}>
        <header>
          <div className={styles.mark}>{publicId ? <LuKeyRound aria-hidden="true" /> : <LuScanLine aria-hidden="true" />}</div>
          <h1>{tr(publicId ? "اربط القطعة بحسابك" : "خلّي قطعتك تشتغل")}</h1>
          <p>{tr(!configured ? "التفعيل هيتاح بعد ربط قاعدة البيانات." : publicId
            ? "هتلاقي كود التفعيل على البطاقة جوه العبوة. اكتبه هنا عشان تضيف القطعة لحسابك."
            : "معاك قطعة CliQo؟ افتح رابطها من الـQR أو الـNFC، وبعدها فعّلها بالكود اللي جوه العبوة.")}</p>
        </header>
        {configured && (publicId ? <ActivationForm publicId={publicId} /> : <>
          <div className={styles.methods}>
            <section><LuQrCode aria-hidden="true" /><div><h2>{tr("امسح الـQR بالكاميرا")}</h2><p>{tr("افتح كاميرا الموبايل، وجّهها للـQR المطبوع على القطعة، واضغط على الرابط اللي يظهر.")}</p></div></section>
            <section><LuNfc aria-hidden="true" /><div><h2>{tr("قرّب الموبايل من القطعة")}</h2><p>{tr("لو الـNFC مكتوب عليه رابط القطعة، قرّب الموبايل واضغط على الإشعار. لو مفيش إشعار، استخدم الـQR.")}</p></div></section>
          </div>
          <ScannedLinkForm />
        </>)}
        <Link className={styles.back} href="/dashboard">{tr("الرجوع للوحة العميل")}</Link>
      </section>
    </div>
  </main>;
}
