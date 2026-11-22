"use client";
import { useCopy } from '@/i18n/client';


import { useState, useTransition } from "react";
import { issueReplacementActivationCode } from "./actions";

export function ActivationCodeReset({ publicId }: { publicId: string }) {
  const tr = useCopy();

  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [activationCode, setActivationCode] = useState("");

  function issueCode() {
    if (!window.confirm(tr("استعادة الكود تعرض نفس الرقم المحفور. ولو القطعة قديمة، إصدار كود جديد يلغي القديم ولازم تحفره قبل التسليم. تكمّل؟"))) return;
    setMessage("");
    setActivationCode("");
    startTransition(async () => {
      const result = await issueReplacementActivationCode(publicId);
      setMessage(result.message);
      setActivationCode(result.ok ? result.activationCode : "");
    });
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(activationCode);
      setMessage("تم نسخ كود التفعيل.");
    } catch {
      setMessage("تعذر النسخ التلقائي. انسخ الكود الظاهر يدويًا.");
    }
  }

  return <div className="activation-reset">
    {!activationCode && <button type="button" className="export-button" onClick={issueCode} disabled={pending}>{pending ? tr("جاري الإصدار…") : tr("اعرض كود التفعيل")}</button>}
    {activationCode && <div className="activation-reset-code"><code dir="ltr">{activationCode}</code><button type="button" className="export-button" onClick={copyCode}>{tr("انسخ الكود")}</button></div>}
    {message && <small role="status">{tr(message)}</small>}
  </div>;
}
