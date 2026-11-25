"use client";
import { useCopy } from '@/i18n/client';


import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type PageChoice = { id: string; display_name: string; is_published: boolean };
type Item = {
  id: string; publicId: string; internalName: string; state: string; destinationUrl: string | null;
  paymentIdentifier: string | null; recipientLabel: string | null; landingPageId: string | null;
};

export function SmartItemEditor({
  item, configured, payment, supportsPage, requiresPage = false, pages, analytics,
}: {
  item: Item; configured: boolean; payment: boolean; supportsPage: boolean; requiresPage?: boolean;
  pages: PageChoice[]; analytics: { opens: number; clicks: number };
}) {
  const tr = useCopy();

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState(item.landingPageId ? "page" : "single");
  const [state, setState] = useState(item.state);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const internalName = String(form.get("internalName") ?? "").trim();
    const destinationUrl = String(form.get("destinationUrl") ?? "").trim();
    const pageId = String(form.get("pageId") ?? "").trim();
    const paymentIdentifier = String(form.get("paymentIdentifier") ?? "").trim();
    const recipientLabel = String(form.get("recipientLabel") ?? "").trim();

    if (payment && (!paymentIdentifier || !recipientLabel)) {
      setMessage("اكتب اسم المستلم وبيانات وسيلة الدفع."); return;
    }
    if (!payment && !requiresPage && mode === "single") {
      try { if (new URL(destinationUrl).protocol !== "https:") throw new Error(); }
      catch { setMessage("اكتب رابطًا كاملًا يبدأ بـ https://"); return; }
    }
    if ((requiresPage || (supportsPage && mode === "page")) && !pageId) {
      setMessage("اختار صفحة هبوط أو أنشئ صفحة جديدة."); return;
    }

    startTransition(async () => {
      const { error } = await createClient().from("smart_items").update({
        internal_name: internalName,
        destination_url: payment || requiresPage || (supportsPage && mode === "page") ? null : destinationUrl,
        payment_identifier: payment ? paymentIdentifier : null,
        recipient_label: payment ? recipientLabel : null,
        landing_page_id: supportsPage && (requiresPage || mode === "page") ? pageId : null,
      }).eq("id", item.id).select("id").single();
      setMessage(error ? "تعذر حفظ التعديلات. راجع الوجه المطبوعة ورابطها." : "تم حفظ التعديلات.");
      if (!error) router.refresh();
    });
  }

  function togglePause() {
    const nextState = state === "disabled" ? "claimed" : "disabled";
    if (nextState === "disabled" && !window.confirm(tr("إيقاف القطعة سيمنع الزوار من فتح وجهتها مؤقتًا. هل تريد الإيقاف؟"))) return;
    startTransition(async () => {
      const { error } = await createClient().from("smart_items").update({ state: nextState }).eq("id", item.id).select("id").single();
      if (error) setMessage("تعذر تحديث حالة الرابط.");
      else { setState(nextState); setMessage(nextState === "disabled" ? "تم إيقاف الرابط." : "تم إعادة تشغيل الرابط."); router.refresh(); }
    });
  }

  return <div className="customer-item-editor">
    <div className="customer-item-analytics"><article><span>{tr("إجمالي مرات الفتح")}</span><strong>{analytics.opens.toLocaleString(tr.numberLocale)}</strong></article><article><span>{tr("نقرات الأزرار")}</span><strong>{analytics.clicks.toLocaleString(tr.numberLocale)}</strong></article></div>
    <form className="customer-item-form" onSubmit={save}>
      <fieldset className="customer-item-controls" disabled={!ready || pending}>
      <label>{tr("اسم اختياري للقطعة")}<input name="internalName" maxLength={80} defaultValue={item.internalName} placeholder={tr("مثال: ستاند الفرع الرئيسي")} /></label>
      {payment ? <>
        <label>{tr("اسم المستلم")}<input name="recipientLabel" maxLength={100} required defaultValue={item.recipientLabel ?? ""} /></label>
        <label>{tr("رقم أو عنوان الدفع")}<input name="paymentIdentifier" maxLength={64} required dir="ltr" defaultValue={item.paymentIdentifier ?? ""} /></label>
        <p className="customer-item-help">{tr("تأكد من أن البيانات تخص وسيلة الدفع المطبوعة على القطعة.")}</p>
      </> : <>
        {supportsPage && !requiresPage && <fieldset className="customer-mode-choice"><legend>{tr("تجربة القطعة")}</legend>
          <label><input type="radio" name="experience" checked={mode === "single"} onChange={() => setMode("single")} />  {tr("رابط واحد")}</label>
          <label><input type="radio" name="experience" checked={mode === "page"} onChange={() => setMode("page")} />  {tr("صفحة روابط")}</label>
        </fieldset>}
        {supportsPage && (requiresPage || mode === "page") ? <>
          <label>{tr("صفحة الهبوط")}<select name="pageId" defaultValue={item.landingPageId ?? ""} required>
            <option value="">{tr("اختار صفحة")}</option>
            {pages.map((page) => <option key={page.id} value={page.id}>{page.display_name || tr("صفحة بدون اسم")}{page.is_published ? tr("· منشورة") : tr("· مسودة")}</option>)}
          </select></label>
          {!pages.length && <p className="customer-item-help">{tr("لسه معندكش صفحات.")} <Link href="/dashboard/pages/new">{tr("أنشئ صفحة هبوط")}</Link>.</p>}
          {pages.length > 0 && <p className="customer-item-help">{tr("تقدر تربط نفس صفحة الهبوط بأكثر من قطعة أو تختار صفحة مختلفة لكل قطعة.")}</p>}
        </> : <label>{tr("الرابط الذي تفتحه القطعة")}<input name="destinationUrl" type="url" dir="ltr" required defaultValue={item.destinationUrl ?? ""} placeholder="https://example.com" /></label>}
      </>}
      <button type="submit" className="save-note" disabled={pending}>{pending ? tr("جاري الحفظ…") : tr("احفظ التعديلات")}</button>
      {message && <p className="customer-item-message" role="status">{tr(message)}</p>}
      </fieldset>
    </form>
    <div className="customer-item-pause"><div><strong>{state === "disabled" ? tr("الرابط متوقف") : configured ? tr("الرابط نشط") : tr("تحتاج تجهيز")}</strong><small>{tr("الإيقاف مؤقت ويمكنك إعادة تشغيله في أي وقت.")}</small></div><button type="button" className="signout-button" disabled={!ready || pending} onClick={togglePause}>{state === "disabled" ? tr("إعادة التشغيل") : tr("إيقاف مؤقت")}</button></div>
  </div>;
}
