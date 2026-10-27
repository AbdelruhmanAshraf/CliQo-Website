import { getCopy } from '@/i18n/server';
import { requireStaff } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { AdminShell } from "../admin-shell";
import styles from "./settings.module.css";

export async function generateMetadata() {
  const tr = await getCopy();
  return { title: tr("جاهزية البيع | CliQo Ops") };
}
export const dynamic = "force-dynamic";

function Status({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  return <span className={`${styles.status} ${ready ? styles.statusReady : styles.statusPending}`}>
    <i aria-hidden="true" />{children}
  </span>;
}

export default async function AdminSalesReadinessPage() {
  const tr = await getCopy();

  const { staff } = await requireStaff(["owner"]);
  const db = getDb();
  const [configResult, inventoryResult] = await Promise.all([
    db.query<{
      sales_enabled: boolean; cod_enabled: boolean; carrier_name: string | null; shipping_minor: number | null;
    }>("select sales_enabled,cod_enabled,carrier_name,shipping_minor from app_private.checkout_config where id=true"),
    db.query<{ approved_skus: number; available_skus: number; available_units: number }>(
      `select
        count(*) filter (where s.state='ready' and f.state='ready' and s.price_minor is not null
          and s.price_approved and s.sample_approved and s.fulfillment_approved)::int as approved_skus,
        count(*) filter (where s.state='ready' and f.state='ready' and s.price_minor is not null
          and s.price_approved and s.sample_approved and s.fulfillment_approved
          and coalesce(b.on_hand,0) > coalesce(b.reserved,0))::int as available_skus,
        coalesce(sum(greatest(0,coalesce(b.on_hand,0)-coalesce(b.reserved,0))) filter
          (where s.state='ready' and f.state='ready' and s.price_minor is not null
          and s.price_approved and s.sample_approved and s.fulfillment_approved),0)::int as available_units
       from public.product_skus s
       join public.product_families f on f.id=s.product_family_id
       left join public.inventory_balances b on b.sku_id=s.id`
    ),
  ]);
  const config = configResult.rows[0] ?? null;
  const inventory = inventoryResult.rows[0] ?? { approved_skus: 0, available_skus: 0, available_units: 0 };
  const shippingLabel = config?.shipping_minor === null || config?.shipping_minor === undefined
    ? "غير محددة"
    : `${(config.shipping_minor / 100).toLocaleString(tr.numberLocale, { minimumFractionDigits: 2 })} ج.م`;

  return <AdminShell staffName={staff.display_name} staffRole={staff.role}>
    <section className={`ops-content ${styles.content}`}>
      <div className="ops-heading"><div><p className="ops-eyebrow">{tr("إعداد المتجر")}</p><h1>{tr("جاهزية البيع")}</h1><p>{tr("ملخص للمتطلبات التقنية قبل استقبال أوردرات حقيقية.")}</p></div></div>
      <div className={styles.notice}><span aria-hidden="true">!</span><p><strong>{tr("الصفحة للمتابعة فقط")}</strong><small>{tr("لا تفتح البيع ولا تحفظ مفاتيح مزودي الخدمة. الربط الفعلي للشحن وبوابة الكارت لم يُنفّذ بعد.")}</small></p></div>

      <div className={styles.summary}>
        <article><span>{tr("أصناف معتمدة")}</span><strong>{inventory.approved_skus.toLocaleString(tr.numberLocale)}</strong><small>{tr("السعر والعينة والتجهيز معتمدون")}</small></article>
        <article><span>{tr("أصناف متاحة فعليًا")}</span><strong>{inventory.available_skus.toLocaleString(tr.numberLocale)}</strong><small>{inventory.available_units.toLocaleString(tr.numberLocale)}  {tr("وحدة غير محجوزة")}</small></article>
        <article><span>{tr("حالة المتجر")}</span><strong>{config?.sales_enabled ? tr("مفتوح") : tr("مغلق")}</strong><small>{tr("مفتاح البيع الحالي في قاعدة البيانات")}</small></article>
      </div>

      <section className={styles.panel} aria-labelledby="cod-readiness">
        <div className={styles.panelHeading}><div><p className="ops-eyebrow">{tr("طريقة الدفع")}</p><h2 id="cod-readiness">{tr("الدفع عند الاستلام")}</h2></div><Status ready={Boolean(config?.cod_enabled)}>{tr("إعداد COD")} {config?.cod_enabled ? tr("مفعّل") : tr("مغلق")}</Status></div>
        <div className={styles.checks}>
          <div><span>{tr("اسم شركة الشحن")}</span><Status ready={Boolean(config?.carrier_name)}>{config?.carrier_name ?? tr("لم تُحدد")}</Status></div>
          <div><span>{tr("رسوم الشحن")}</span><Status ready={config?.shipping_minor !== null && config?.shipping_minor !== undefined}>{tr(shippingLabel)}</Status></div>
          <div><span>{tr("واجهة ربط الشحن وإنشاء البوليصة")}</span><Status ready={false}>{tr("غير مربوطة")}</Status></div>
          <div><span>{tr("مخزون جاهز للبيع")}</span><Status ready={inventory.available_skus > 0}>{inventory.available_skus.toLocaleString(tr.numberLocale)} SKU</Status></div>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="card-readiness">
        <div className={styles.panelHeading}><div><p className="ops-eyebrow">{tr("طريقة الدفع")}</p><h2 id="card-readiness">{tr("بطاقات الدفع")}</h2></div><Status ready={false}>{tr("غير مربوطة")}</Status></div>
        <p className={styles.explanation}>{tr("واجهة الدفع المستضافة والتحقق من إشعارات الدفع والاسترداد لم تُنفّذ. لا تُدخل بيانات أو مفاتيح بوابة هنا.")}</p>
      </section>

      <div className={styles.nextStep}><strong>{tr("الخطوة المطلوبة للإكمال")}</strong><p>{tr("بعد اختيار شركة شحن تدعم COD وبوابة كارت، نربط واجهاتهما ونختبر سيناريوهات النجاح والفشل والتكرار. بعدها فقط نراجع فتح المتجر.")}</p></div>
    </section>
  </AdminShell>;
}
