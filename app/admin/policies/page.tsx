import { getCopy } from "@/i18n/server";
import { requireStaff } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { STORE_POLICIES, type StorePolicyKey } from "@/lib/store-policies";
import { AdminShell } from "../admin-shell";
import { updateStorePolicy } from "./actions";
import styles from "./policies.module.css";

export const dynamic = "force-dynamic";

type PolicyRow = {
  policy_key: StorePolicyKey;
  locale: "ar" | "en";
  draft_body: string;
  published_body: string | null;
  draft_updated_at: Date | string;
  published_at: Date | string | null;
};
type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

const policyNames: Record<StorePolicyKey, string> = {
  privacy: "سياسة الخصوصية",
  terms: "شروط البيع والاستخدام",
  shipping: "سياسة الشحن والتوصيل",
  returns: "سياسة الاستبدال والاسترجاع",
};
const errorMessages: Record<string, string> = {
  key: "السياسة المختارة غير صحيحة.",
  reason: "اكتب سبب التغيير من ٣ إلى ٥٠٠ حرف.",
  length: "حد النص ٢٠٬٠٠٠ حرف لكل لغة.",
  incomplete: "أكمل النصين إلى ٣٠٠ حرف على الأقل واحذف علامات النص المؤقت.",
  review: "أكد مراجعة النصين قبل النشر.",
  unpublish: "أكد إيقاف نشر السياسة.",
  save: "تعذر حفظ السياسة. راجع النص وحاول مرة أخرى.",
};

export async function generateMetadata() {
  const tr = await getCopy();
  return { title: tr("صفحات السياسات | CliQo Ops") };
}

export default async function AdminPoliciesPage({ searchParams }: PageProps) {
  const tr = await getCopy();
  const params = searchParams ? await searchParams : {};
  const { staff } = await requireStaff(["owner"]);
  const db = getDb();
  const [policiesResult, readinessResult] = await Promise.all([
    db.query<PolicyRow>(
      `select policy_key,locale,draft_body,published_body,draft_updated_at,published_at
       from app_private.store_policies order by policy_key,locale`,
    ),
    db.query<{ policies_approved: boolean; sales_enabled: boolean }>(
      `select policies_approved,sales_enabled from app_private.checkout_config where id=true`,
    ),
  ]);
  const records = new Map(policiesResult.rows.map((row) => [`${row.policy_key}:${row.locale}`, row]));
  const config = readinessResult.rows[0];
  const errorCode = typeof params.error === "string" ? params.error : null;
  const saved = typeof params.saved === "string" ? params.saved : null;

  return <AdminShell staffName={staff.display_name} staffRole={staff.role}>
    <section className={`ops-content ${styles.content}`}>
      <div className="ops-heading">
        <div><p className="ops-eyebrow">{tr("إعداد المتجر")}</p><h1>{tr("السياسات وشروط البيع")}</h1><p>{tr("إدارة ونشر صفحات المتجر قبل فتح البيع.")}</p></div>
      </div>

      <div className={styles.banner}>
        <strong>{tr(config?.policies_approved ? "السياسات منشورة ومراجعة" : "البيع يظل مقفولًا حتى نشر كل الصفحات ومراجعتها.")}</strong>
        <p>{tr("اكتب الشروط الفعلية بعد مراجعتها. لا تُدخل رسومًا أو مواعيد أو وعودًا قبل اعتمادها.")}</p>
        <small>{tr("أربع سياسات، بالعربية والإنجليزية.")}{config?.sales_enabled ? ` ${tr("المتجر مفتوح حاليًا")}` : ""}</small>
      </div>

      {(saved || errorCode) && <p className={errorCode ? styles.error : styles.success} role="status" aria-live="polite">
        {errorCode ? tr(errorMessages[errorCode] ?? errorMessages.save) : saved === "published" ? tr("تم نشر نسختي السياسة.") : saved === "unpublished" ? tr("تم إيقاف نشر السياسة.") : tr("تم حفظ المسودة. النسخة المنشورة لم تتغير.")}
      </p>}

      <div className={styles.policyList}>
        {STORE_POLICIES.map(({ key }) => {
          const arabic = records.get(`${key}:ar`);
          const english = records.get(`${key}:en`);
          const published = Boolean(arabic?.published_body && english?.published_body);
          return <article className={styles.card} key={key} id={key}>
            <div className={styles.cardHeader}>
              <div><p className="ops-eyebrow">{tr("حالة النشر")}</p><h2>{tr(policyNames[key])}</h2></div>
              <span className={`${styles.status} ${published ? styles.statusReady : styles.statusPending}`}>
                <i aria-hidden="true" />{tr(published ? "منشورة باللغتين" : "غير مكتملة")}
              </span>
            </div>
            <form action={updateStorePolicy} className={styles.form}>
              <input type="hidden" name="policy_key" value={key} />
              <div className={styles.languages}>
                <label><span>{tr("النص العربي")}</span><textarea name="arabic_body" dir="rtl" lang="ar" maxLength={20000} rows={11} defaultValue={arabic?.draft_body ?? ""} /></label>
                <label><span>{tr("النص الإنجليزي")}</span><textarea name="english_body" dir="ltr" lang="en" maxLength={20000} rows={11} defaultValue={english?.draft_body ?? ""} /></label>
              </div>
              <small className={styles.hint}>{tr("كل نسخة تحتاج ٣٠٠ حرف على الأقل، ومن دون نصوص مؤقتة أو علامات TODO.")}</small>
              {(arabic?.published_body || english?.published_body) && <details className={styles.preview}>
                <summary>{tr("النسخة المنشورة حاليًا")}</summary>
                <div><strong>{tr("النص العربي")}</strong><p dir="rtl" lang="ar">{arabic?.published_body ?? "—"}</p></div>
                <div><strong>{tr("النص الإنجليزي")}</strong><p dir="ltr" lang="en">{english?.published_body ?? "—"}</p></div>
              </details>}
              <div className={styles.confirmations}>
                <label><input type="checkbox" name="confirm_review" /><span>{tr("أؤكد أنني راجعت النصين واعتمدت دقتهما قبل النشر.")}</span></label>
                <label><input type="checkbox" name="confirm_unpublish" /><span>{tr("أؤكد إيقاف نشر هذه السياسة.")}</span></label>
              </div>
              <label className={styles.reason}>{tr("سبب التغيير")}<input name="change_reason" minLength={3} maxLength={500} required placeholder={tr("سجّل سبب التعديل في سجل المالك.")} /></label>
              <div className={styles.buttons}>
                <button type="submit" name="intent" value="save" className={styles.secondary}>{tr("حفظ المسودة")}</button>
                <button type="submit" name="intent" value="publish" className={styles.primary}>{tr("نشر النسختين")}</button>
                {published && <button type="submit" name="intent" value="unpublish" className={styles.danger}>{tr("إيقاف نشر السياسة")}</button>}
              </div>
            </form>
          </article>;
        })}
      </div>
      <p className={styles.footnote}>{tr("السياسات المنشورة تظهر للزوار باللغة المختارة. إيقاف أي سياسة يغلق استقبال الطلبات تلقائيًا إلى أن تكتمل السياسات الأربع باللغتين.")}</p>
    </section>
  </AdminShell>;
}
