import { getCopy } from '@/i18n/server';
import Link from "next/link";
import { requireStaff } from "@/lib/admin";
import { getDb } from "@/lib/db";
import {emailTransportFingerprint} from "@/lib/email";
import {getPaymobConfig, paymobConfigFingerprint, paymobSandboxTestingAllowed} from "@/lib/paymob";
import { AdminShell } from "../admin-shell";
import {recordPaymobGatewayReadiness, retryFailedOrderEmails, testTransactionalEmail, updateCheckoutSettings} from "./actions";
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

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminSalesReadinessPage({ searchParams }: PageProps) {
  const tr = await getCopy();
  const params = searchParams ? await searchParams : {};

  const { staff } = await requireStaff(["owner"]);
  const db = getDb();
  const [configResult, inventoryResult, emailOutboxResult] = await Promise.all([
    db.query<{
      sales_enabled: boolean; cod_enabled: boolean; card_enabled: boolean;
      carrier_name: string | null; shipping_minor: number | null; card_gateway_name: string | null;
      card_gateway_ready: boolean; card_gateway_fingerprint: string | null; carrier_integration_ready: boolean;
      policies_approved: boolean; support_channel_ready: boolean;
      support_email: string | null; support_whatsapp: string | null;
      transactional_email_ready: boolean; transactional_email_fingerprint: string | null;
    }>(`select sales_enabled,cod_enabled,card_enabled,carrier_name,shipping_minor,card_gateway_name,
              card_gateway_ready,card_gateway_fingerprint,carrier_integration_ready,policies_approved,support_channel_ready,
              support_email,support_whatsapp,transactional_email_ready,transactional_email_fingerprint
       from app_private.checkout_config where id=true`),
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
    db.query<{pending_count: number; failed_count: number}>(
      "select count(*) filter (where status in ('queued','processing'))::int as pending_count," +
      "count(*) filter (where status='failed')::int as failed_count from app_private.email_outbox",
    ),
  ]);
  const config = configResult.rows[0] ?? null;
  const inventory = inventoryResult.rows[0] ?? { approved_skus: 0, available_skus: 0, available_units: 0 };
  const emailOutbox = emailOutboxResult.rows[0] ?? {pending_count: 0, failed_count: 0};
  const activeEmailFingerprint = emailTransportFingerprint();
  const activePaymobConfig = getPaymobConfig();
  const activePaymobFingerprint = activePaymobConfig ? paymobConfigFingerprint(activePaymobConfig) : null;
  const cardGatewayReady = Boolean(config?.card_gateway_ready && config.card_gateway_name === "Paymob"
    && config.card_gateway_fingerprint && config.card_gateway_fingerprint === activePaymobFingerprint
    && activePaymobConfig && (activePaymobConfig.mode === "live" || paymobSandboxTestingAllowed(activePaymobConfig)));
  const paymobReadinessInSandbox = Boolean(activePaymobConfig && paymobSandboxTestingAllowed(activePaymobConfig));
  const cardGatewayStatus = cardGatewayReady && paymobReadinessInSandbox
    ? tr("اختبار Sandbox محلي فقط")
    : cardGatewayReady ? tr("مربوطة ومختبرة")
      : config?.card_gateway_ready ? tr("إعداد Paymob تغيّر؛ أعد الاختبار") : tr("غير مربوطة");
  const emailReady = Boolean(config?.transactional_email_ready && activeEmailFingerprint
    && config.transactional_email_fingerprint === activeEmailFingerprint);
  const paymentReady = Boolean((config?.cod_enabled && config.carrier_integration_ready)
    || (config?.card_enabled && cardGatewayReady));
  const canOpenSales = Boolean(config?.carrier_integration_ready && paymentReady
    && config.policies_approved && config.support_channel_ready && emailReady && inventory.available_skus > 0);
  const shippingLabel = config?.shipping_minor === null || config?.shipping_minor === undefined
    ? "غير محددة"
    : `${(config.shipping_minor / 100).toLocaleString(tr.numberLocale, { minimumFractionDigits: 2 })} ج.م`;
  const errors: Record<string, string> = {
    reason: "اكتب سبب التغيير من ٣ إلى ٥٠٠ حرف.",
    invalid: "راجع اسم المزود ورسوم الشحن المدخلة.",
    carrier: "لا يمكن تفعيل COD قبل ربط شركة الشحن واختبارها.",
    "carrier-details": "اكتب شركة الشحن ورسومها قبل تفعيل COD.",
    gateway: "لا يمكن تفعيل الدفع بالبطاقة قبل ربط البوابة واختبارها.",
    "gateway-name": "اكتب اسم بوابة الدفع قبل تفعيلها.",
    "support-details": "أدخل بريدًا صالحًا أو رقم واتساب دوليًا صحيحًا.",
    "email-address": "اكتب بريدًا صالحًا لاستقبال رسالة الاختبار.",
    "email-config": "أكمل إعدادات SMTP في بيئة التطبيق ثم أعد الاختبار.",
    "email-delivery": "لم تصل رسالة الاختبار. راجع إعداد SMTP وحاول مرة أخرى.",
    "email-save": "وصلت رسالة الاختبار لكن تعذر حفظ الجاهزية؛ أعد المحاولة.",
    "email-retry": "تعذر إعادة الرسائل المتعثرة إلى الطابور.",
    email: "اختبر البريد التشغيلي واعتمده قبل فتح استقبال الطلبات.",
    "paymob-config": "أكمل إعداد Paymob بوضع الإنتاج ونطاق HTTPS أولًا، مع إبقاء المفاتيح في بيئة الخادم.",
    "paymob-confirmations": "أكد اختبارات Sandbox والإنتاج والإشعارات الموقعة والاسترداد قبل تسجيل الجاهزية.",
    gate: "لا يمكن فتح المتجر قبل اكتمال الشحن والدفع والسياسات والدعم والبريد.",
    inventory: "لا يمكن فتح المتجر من غير SKU معتمد ومتاح في المخزون.",
    save: "تعذر حفظ الإعدادات. راجع القيم وحاول مرة أخرى.",
  };
  const errorCode = typeof params.error === "string" ? params.error : null;
  const saved = typeof params.saved === "string" ? params.saved : null;

  return <AdminShell staffName={staff.display_name} staffRole={staff.role}>
    <section className={`ops-content ${styles.content}`}>
      <div className="ops-heading"><div><p className="ops-eyebrow">{tr("إعداد المتجر")}</p><h1>{tr("جاهزية البيع")}</h1><p>{tr("ملخص للمتطلبات التقنية قبل استقبال أوردرات حقيقية.")}</p></div></div>
      <div className={styles.notice}><span aria-hidden="true">!</span><p><strong>{tr("البيع يظل مقفولًا حتى اجتياز شروط الإطلاق")}</strong><small>{tr("احفظ الإعدادات التشغيلية هنا. لا تحفظ أسرارًا أو مفاتيح مزوّدين؛ حالة الربط لا تتغير إلا بعد نجاح التكامل والاختبار.")}</small></p></div>
      {(saved || errorCode) && <p className={saved ? styles.success : styles.error} role="status" aria-live="polite">
        {saved === "support-reset" ? tr("تم حفظ بيانات التواصل؛ اختبر القناة من جديد قبل اعتمادها.")
          : saved === "card-ready" ? tr("تم تسجيل اختبار بوابة Paymob الحالية. تغيير أي مفتاح أو النطاق يلغي الجاهزية تلقائيًا.")
            : saved === "card-revoked" ? tr("تم إيقاف جاهزية Paymob وإغلاق الدفع بالبطاقة.")
          : saved === "email-tested" ? tr("وصلت رسالة الاختبار وتم اعتماد إعداد البريد الحالي.")
            : saved === "email-retried" ? tr("أُعيدت الرسائل المتعثرة للطابور.") + " (" + String(params.count ?? "0") + ")"
              : saved === "email-required" ? tr("اختبر البريد التشغيلي واعتمده قبل فتح استقبال الطلبات.")
                : saved ? tr("تم حفظ إعدادات المتجر وتسجيل التغيير.")
                : tr(errors[errorCode ?? ""] ?? errors.save)}
      </p>}

      <div className={styles.summary}>
        <article><span>{tr("أصناف معتمدة")}</span><strong>{inventory.approved_skus.toLocaleString(tr.numberLocale)}</strong><small>{tr("السعر والعينة والتجهيز معتمدون")}</small></article>
        <article><span>{tr("أصناف متاحة فعليًا")}</span><strong>{inventory.available_skus.toLocaleString(tr.numberLocale)}</strong><small>{inventory.available_units.toLocaleString(tr.numberLocale)}  {tr("وحدة غير محجوزة")}</small></article>
        <article><span>{tr("حالة المتجر")}</span><strong>{config?.sales_enabled && emailReady ? tr("مفتوح") : tr("مغلق")}</strong><small>{tr("مفتاح البيع الحالي في قاعدة البيانات")}</small></article>
      </div>

      <section className={styles.panel} aria-labelledby="cod-readiness">
        <div className={styles.panelHeading}><div><p className="ops-eyebrow">{tr("طريقة الدفع")}</p><h2 id="cod-readiness">{tr("الدفع عند الاستلام")}</h2></div><Status ready={Boolean(config?.cod_enabled)}>{tr("إعداد COD")} {config?.cod_enabled ? tr("مفعّل") : tr("مغلق")}</Status></div>
        <div className={styles.checks}>
          <div><span>{tr("اسم شركة الشحن")}</span><Status ready={Boolean(config?.carrier_name)}>{config?.carrier_name ?? tr("لم تُحدد")}</Status></div>
          <div><span>{tr("رسوم الشحن")}</span><Status ready={config?.shipping_minor !== null && config?.shipping_minor !== undefined}>{tr(shippingLabel)}</Status></div>
          <div><span>{tr("ربط شركة الشحن واختباره")}</span><Status ready={Boolean(config?.carrier_integration_ready)}>{config?.carrier_integration_ready ? tr("مربوطة ومختبرة") : tr("غير مربوطة")}</Status></div>
          <div><span>{tr("مخزون جاهز للبيع")}</span><Status ready={inventory.available_skus > 0}>{inventory.available_skus.toLocaleString(tr.numberLocale)} SKU</Status></div>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="card-readiness">
        <div className={styles.panelHeading}><div><p className="ops-eyebrow">{tr("طريقة الدفع")}</p><h2 id="card-readiness">{tr("بطاقات الدفع")}</h2></div><Status ready={cardGatewayReady}>{cardGatewayStatus}</Status></div>
        <div className={styles.checks}>
          <div><span>{tr("بوابة الدفع المختارة")}</span><Status ready={Boolean(config?.card_gateway_name)}>{config?.card_gateway_name ?? tr("لم تُحدد")}</Status></div>
          <div><span>{tr("الدفع المستضاف والتحقق والاسترداد")}</span><Status ready={cardGatewayReady}>{cardGatewayStatus}</Status></div>
        </div>
        <p className={styles.explanation}>{tr("لا تُدخل بيانات أو مفاتيح بوابة هنا. إشارة الجاهزية لا تُفعّل إلا بعد اكتمال التكامل واختبار الإشعارات والاسترداد.")}</p>
        <form action={recordPaymobGatewayReadiness} className={`${styles.mailTest} ${styles.paymobReadiness}`}>
          <input type="hidden" name="gateway_ready" value="true" />
          <strong>{tr("تسجيل اختبار بوابة Paymob")}</strong>
          <p>{paymobReadinessInSandbox ? tr("وضع Sandbox محلي فقط. الطلبات هنا تجريبية ولا تقبل مدفوعات حقيقية.") : tr("بعد اختبارات Sandbox، شغّل الإعداد الحي واختبره. الجاهزية مرتبطة ببصمة المفاتيح والنطاق الحالي.")}</p>
          <label><input type="checkbox" name="confirm_sandbox" required /> {tr("اختبرت النجاح والرفض في Sandbox.")}</label>
          <label><input type="checkbox" name="confirm_webhooks" required /> {tr("تحققت من الإشعار الموقّع ورفض غير الموقّع ومنع التكرار.")}</label>
          {!paymobReadinessInSandbox && <>
            <label><input type="checkbox" name="confirm_live" required /> {tr("اختبرت الدفع الحي والاسترداد بموافقة التاجر.")}</label>
            <label><input type="checkbox" name="confirm_refunds" required /> {tr("تحققت من الاسترداد وانتهاء الحجز وحالة المراجعة المتأخرة.")}</label>
          </>}
          <label>{tr("سبب اعتماد بوابة الدفع")}<input name="gateway_reason" minLength={3} maxLength={500} required /></label>
          <button type="submit" disabled={!activePaymobConfig || (activePaymobConfig.mode !== "live" && !paymobReadinessInSandbox)}>{tr(paymobReadinessInSandbox ? "اعتماد اختبار Sandbox المحلي" : "اعتماد اختبار بوابة Paymob")}</button>
        </form>
        <form action={recordPaymobGatewayReadiness} className={styles.mailRetry}>
          <input type="hidden" name="gateway_ready" value="false" />
          <label>{tr("سبب إيقاف بوابة الدفع")}<input name="gateway_reason" minLength={3} maxLength={500} required /></label>
          <button type="submit" disabled={!config?.card_gateway_ready}>{tr("إيقاف جاهزية Paymob")}</button>
        </form>
      </section>

      <section className={styles.panel} aria-labelledby="email-readiness">
        <div className={styles.panelHeading}><div><p className="ops-eyebrow">{tr("رسائل الطلبات")}</p><h2 id="email-readiness">{tr("البريد التشغيلي")}</h2></div><Status ready={emailReady}>{emailReady ? tr("اختُبر الإرسال") : tr("يحتاج اختبارًا")}</Status></div>
        <div className={styles.checks}>
          <div><span>{tr("طابور الإرسال")}</span><strong>{emailOutbox.pending_count.toLocaleString(tr.numberLocale)} {tr("قيد الإرسال")}</strong></div>
          <div><span>{tr("رسائل متعثرة")}</span><strong>{emailOutbox.failed_count.toLocaleString(tr.numberLocale)}</strong></div>
        </div>
        {config?.transactional_email_ready && !emailReady && <p className={styles.error}>{tr("إعداد SMTP أو النطاق تغيّر؛ أعد الاختبار قبل استقبال الطلبات.")}</p>}
        <form action={testTransactionalEmail} className={styles.mailTest}>
          <label>{tr("أرسل رسالة اختبار إلى")}<input name="test_recipient" type="email" required maxLength={254} dir="ltr" defaultValue={config?.support_email ?? ""} autoComplete="email" /></label>
          <button type="submit">{tr("إرسال الاختبار واعتماد البريد")}</button>
        </form>
        {emailOutbox.failed_count > 0 && emailReady && <form action={retryFailedOrderEmails} className={styles.mailRetry}>
          <button type="submit">{tr("إعادة المحاولة للرسائل المتعثرة")}</button>
        </form>}
        <p className={styles.explanation}>{tr("بيانات SMTP تُضبط في بيئة الخادم ولا تظهر في لوحة التحكم. يُرسل البريد بعد حفظ الطلب وتغيّر حالته، ويُعاد تلقائيًا عند تعطل المزوّد.")}</p>
      </section>

      <form action={updateCheckoutSettings} className={`${styles.panel} ${styles.form}`}>
        <div className={styles.panelHeading}><div><p className="ops-eyebrow">{tr("تحكم المالك")}</p><h2>{tr("إعدادات البيع")}</h2></div><Status ready={Boolean(config?.sales_enabled && emailReady)}>{config?.sales_enabled && emailReady ? tr("مفتوح") : tr("مغلق")}</Status></div>
        <div className={styles.fields}>
          <label>{tr("اسم شركة الشحن")}<input name="carrier_name" maxLength={120} defaultValue={config?.carrier_name ?? ""} autoComplete="off" /></label>
          <label>{tr("رسوم الشحن بالجنيه")}<input name="shipping_egp" inputMode="decimal" dir="ltr" placeholder="0.00" defaultValue={config?.shipping_minor == null ? "" : (config.shipping_minor / 100).toFixed(2)} /></label>
          <label>{tr("مزود بوابة الدفع")}<input name="card_gateway_name" maxLength={120} defaultValue={config?.card_gateway_name ?? ""} autoComplete="off" /></label>
          <label>{tr("بريد الدعم")}<input name="support_email" type="email" maxLength={254} dir="ltr" autoComplete="email" defaultValue={config?.support_email ?? ""} /></label>
          <label>{tr("رقم واتساب دولي (أرقام فقط)")}<input name="support_whatsapp" inputMode="tel" maxLength={15} dir="ltr" placeholder="2010XXXXXXXX" autoComplete="tel" defaultValue={config?.support_whatsapp ?? ""} /></label>
        </div>
        <div className={styles.toggles}>
          <label><input type="checkbox" name="cod_enabled" defaultChecked={Boolean(config?.cod_enabled)} disabled={!config?.carrier_integration_ready && !config?.cod_enabled} /><span><strong>{tr("إتاحة الدفع عند الاستلام")}</strong><small>{tr("يتطلب ربط شركة الشحن واختبار التحصيل.")}</small></span></label>
          <label><input type="checkbox" name="card_enabled" defaultChecked={Boolean(config?.card_enabled)} disabled={!config?.card_gateway_ready && !config?.card_enabled} /><span><strong>{tr("إتاحة الدفع بالبطاقة")}</strong><small>{tr("يتطلب بوابة دفع مختبرة وإشعارات موثقة.")}</small></span></label>
          <div className={styles.gateStatus}>
            <span className={config?.policies_approved ? styles.gateReady : styles.gatePending} aria-hidden="true">{config?.policies_approved ? "✓" : "!"}</span>
            <div><strong>{tr("السياسات منشورة ومراجعة")}</strong><small>{tr("لا تتغير هذه الحالة يدويًا؛ تُفتح بعد نشر السياسات الأربع بالعربية والإنجليزية.")} <Link href="/admin/policies">{tr("إدارة صفحات السياسات")}</Link></small></div>
          </div>
          <label><input type="checkbox" name="support_channel_ready" defaultChecked={Boolean(config?.support_channel_ready)} disabled={!config?.support_email && !config?.support_whatsapp && !config?.support_channel_ready} /><span><strong>{tr("قناة الدعم مختبرة وجاهزة")}</strong><small>{tr("احفظ بريدًا أو رقم واتساب أولًا، اختبر استقباله، ثم فعّل الجاهزية. تغيير بيانات التواصل يلغيها ويقفل البيع.")}</small></span></label>
          <label className={styles.salesToggle}><input type="checkbox" name="sales_enabled" defaultChecked={Boolean(config?.sales_enabled && emailReady)} disabled={!canOpenSales && !(config?.sales_enabled && emailReady)} /><span><strong>{tr("فتح استقبال الطلبات")}</strong><small>{tr("لا يفتح المتجر قبل جاهزية الشحن والدفع والسياسات والدعم والبريد والمخزون.")}</small></span></label>
        </div>
        <label className={styles.reason}>{tr("سبب التغيير")}<input name="change_reason" minLength={3} maxLength={500} required placeholder={tr("اكتب سبب التعديل ليتسجل في سجل الإدارة.")} /></label>
        <div className={styles.formFooter}><p>{tr("إعدادات قابلة للتعديل من حساب المالك فقط. لا تحفظ مفاتيح أو بيانات دخول هنا.")}</p><button type="submit">{tr("حفظ إعدادات البيع")}</button></div>
      </form>

      <div className={styles.nextStep}><strong>{tr("الخطوة المطلوبة للإكمال")}</strong><p>{tr("إعدادات البيع تسجل تغييرات المالك. تظل خيارات الدفع وفتح الطلبات مقفولة تلقائيًا حتى يثبت التكامل جاهزيته ويكتمل اعتماد المنتج والسياسات والدعم.")}</p></div>
    </section>
  </AdminShell>;
}
