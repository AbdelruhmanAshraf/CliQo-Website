"use client";

import { useState, useTransition } from "react";
import { prepareManualHandoff } from "../actions";
import { useCopy } from "@/i18n/client";

export function ManualHandoffForm({ publicId, face, canHandoff }: { publicId: string; face: string; canHandoff: boolean }) {
  const tr = useCopy();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const [reference, setReference] = useState("");
  const payment = face === "instapay" || face === "vodafone";
  const singleLink = ["review", "instagram", "facebook", "tiktok"].includes(face);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm(tr("سيتم تسجيل تسليم هذه القطعة وخصمها من المخزون. تكمّل؟"))) return;
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await prepareManualHandoff(publicId, {
        destinationUrl: String(form.get("destinationUrl") ?? ""),
        paymentIdentifier: String(form.get("paymentIdentifier") ?? ""),
        recipientLabel: String(form.get("recipientLabel") ?? ""),
        note: String(form.get("note") ?? ""),
      });
      setMessage(tr(result.message));
      if (result.ok) { setActivationCode(result.activationCode); setReference(result.reference); }
    });
  }

  if (activationCode) return <section className="stock-receipt-form" aria-label={tr("تسليم القطعة")}>
    <h2>{tr("تم تجهيز القطعة للتسليم")}</h2>
    <p>{tr("مرجع التسليم")}: <strong dir="ltr">{reference}</strong></p>
    <p>{tr("اطبع كود التفعيل المكوّن من ٦ أرقام على بطاقة وضعها داخل العبوة. لا تحفره على القطعة ولا تضعه في QR أو NFC.")}</p>
    <code dir="ltr">{activationCode}</code>
    <button type="button" className="save-note" onClick={async () => {
      try { await navigator.clipboard.writeText(activationCode); setMessage(tr("تم نسخ كود التفعيل.")); }
      catch { setMessage(tr("انسخ الكود يدويًا.")); }
    }}>{tr("انسخ كود التفعيل")}</button>
    <a href={`/activate?item=${publicId}`} target="_blank" rel="noreferrer">{tr("افتح صفحة تفعيل العميل")} ←</a>
    {message && <p role="status">{message}</p>}
  </section>;

  if (!canHandoff) return null;

  return <form className="stock-receipt-form" onSubmit={submit}>
    <h2>{tr("تجهيز وتسليم مباشر")}</h2>
    <p>{tr("سجّل فحص QR وحالة NFC أعلاه أولًا. العميل يثبت ملكيته عبر QR وكود خاص، وفي All-in-One ينشئ صفحته بنفسه بعد التفعيل.")}</p>
    {singleLink && <label>{tr("الرابط الأول للعميل (اختياري)")}<input name="destinationUrl" type="url" pattern="https://.*" dir="ltr" placeholder="https://" /></label>}
    {payment && <><label>{tr("اسم المستلم (اختياري)")}<input name="recipientLabel" maxLength={100} /></label>
      <label>{tr("رقم أو عنوان الدفع")}<input name="paymentIdentifier" maxLength={64} dir="ltr" /></label></>}
    <label>{tr("ملاحظة داخلية (اختياري)")}<textarea name="note" maxLength={300} rows={2} /></label>
    <button type="submit" className="save-note" disabled={pending}>{pending ? tr("جاري التجهيز…") : tr("سجّل التسليم وأصدر كود التفعيل")}</button>
    {message && <p role="status">{message}</p>}
  </form>;
}
