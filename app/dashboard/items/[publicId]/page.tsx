import {skuLabel} from "@/i18n/catalog";
import { getCopy } from '@/i18n/server';
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CopyPublicUrl } from "./copy-public-url";
import { DownloadQr } from "./download-qr";
import { SmartItemEditor } from "./smart-item-editor";
import { getSmartItemQrTarget } from "@/lib/smart-item-qr";
import { getDb } from "@/lib/db";
import { ArchiveControls } from "../archive-controls";
import { isCustomerItemConfigured } from "../../item-status";
import styles from "../../dashboard.module.css";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SmartItemSettingsPage({ params }: { params: Promise<{ publicId: string }> }) {
  const tr = await getCopy();

  const { publicId } = await params;
  if (!uuid.test(publicId)) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const ownerId = claims?.claims?.sub;
  if (!ownerId) redirect(`/login?next=${encodeURIComponent(`/dashboard/items/${publicId}`)}`);

  const { data: item, error } = await supabase.from("smart_items")
    .select("id,public_id,sku_id,internal_name,state,destination_url,payment_identifier,recipient_label,landing_page_id,archived_at")
    .eq("owner_user_id", ownerId).eq("public_id", publicId).maybeSingle();
  if (error || !item) notFound();
  const { data: sku } = await supabase.from("product_skus")
    .select("display_name,options,product_family_id").eq("id", item.sku_id).maybeSingle();
  if (!sku) notFound();
  const { data: family } = await supabase.from("product_families")
    .select("family_key,supports_landing_page").eq("id", sku.product_family_id).maybeSingle();
  const { data: pages } = await supabase.from("merchant_pages")
    .select("id,display_name,is_published").eq("owner_user_id", ownerId).order("updated_at", { ascending: false });
  const { data: analytics } = await supabase.rpc("get_my_item_analytics");
  const { rows: physicalRows } = await getDb().query<{ nfc_mode: string }>(
    "select nfc_mode from app_private.smart_item_physical_checks where smart_item_id = $1", [item.id],
  );
  const nfcMode = physicalRows[0]?.nfc_mode ?? "unwritten";
  const metric = (analytics ?? []).find((row: { smart_item_id: string }) => row.smart_item_id === item.id);
  const options = (sku.options ?? {}) as Record<string, string>;
  const productName = skuLabel(tr, family?.family_key ?? "", options, sku.display_name);
  const publicUrl = createPublicItemUrl(item.public_id);
  const qrTarget = getSmartItemQrTarget();
  const isLocalUrl = new URL(publicUrl).hostname === "localhost" || new URL(publicUrl).hostname === "127.0.0.1";
  const supportsPage = Boolean(family?.supports_landing_page) && options.face === "all-in-one";
  const payment = ["stand", "coaster", "pvc-card"].includes(family?.family_key ?? "")
    && ["instapay", "vodafone"].includes(options.face ?? "");
  const publishedPages = new Set<string>((pages ?? []).filter((page) => page.is_published).map((page) => page.id));
  const configured = isCustomerItemConfigured(item, options.face ?? "", publishedPages);
  const status = item.archived_at ? "مؤرشفة" : item.state === "disabled" ? "متوقفة" : configured ? "نشطة" : "تحتاج تجهيز";

  return <main className={styles.page}>
    <section className={styles.content}><Link className={styles.sectionBack} href={item.archived_at ? "/dashboard?view=archive#items" : "/dashboard#items"}>{tr("الرجوع للقطع")}</Link><p className={styles.eyebrow}>{tr("إعدادات القطعة")}</p><h1>{item.internal_name || productName}</h1><p className={styles.intro}>{productName} · {tr(status)}  {tr("· QR وNFC يظلان على الرابط الثابت.")}</p>
      {!item.archived_at && <>
      <CopyPublicUrl publicId={item.public_id} url={publicUrl} isLocal={isLocalUrl} />
      <DownloadQr downloadReady={Boolean(qrTarget)} preview={Boolean(qrTarget?.preview)} />
      <div className={styles.note}>{tr("QR مطبوع على قطعتك؛ برمجته تعني تغيير الوجهة أو الصفحة هنا، من غير طباعة كود جديد.")}</div>
      <div className={styles.note}>{nfcMode === "prewritten"
        ? tr("NFC مكتوبة مسبقًا بالرابط الثابت. جرّب لمس القطعة بهاتفك؛ أي تعديل للوجهة يتم هنا.")
        : tr("NFC تُكتب مرة واحدة برابط القطعة الثابت أعلاه باستخدام تطبيق كتابة NFC. اختبرها بهاتف آخر قبل أي قفل دائم.")}
        {" "}<Link href="/guides">{tr("افتح دليل الإعداد")}</Link>.</div>
      <SmartItemEditor item={{
        id: item.id, publicId: item.public_id, internalName: item.internal_name,
        state: item.state, destinationUrl: item.destination_url, paymentIdentifier: item.payment_identifier,
        recipientLabel: item.recipient_label, landingPageId: item.landing_page_id,
      }} configured={configured} payment={payment} supportsPage={supportsPage} requiresPage={supportsPage} pages={pages ?? []} analytics={{ opens: Number(metric?.opens ?? 0), clicks: Number(metric?.clicks ?? 0) }} />
      </>}
      <ArchiveControls id={item.id} archived={Boolean(item.archived_at)} />
    </section>
  </main>;
}

function createPublicItemUrl(publicId: string) {
  let origin = "http://localhost:4173";
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    try { origin = new URL(configured).origin; } catch { /* keep local preview origin */ }
  }
  return new URL(`/s/${publicId}`, origin).toString();
}
