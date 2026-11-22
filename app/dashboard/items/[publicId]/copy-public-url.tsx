"use client";
import { useCopy } from '@/i18n/client';


import { useState } from "react";

export function CopyPublicUrl({ publicId, url, isLocal }: { publicId: string; url: string; isLocal: boolean }) {
  const tr = useCopy();

  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }
  return <div className="public-item-url">
    <div><span>{tr("ID القطعة")}</span><code dir="ltr">{publicId}</code></div>
    <div><span>{tr("الرابط الثابت للـQR وNFC")}</span><code dir="ltr">{url}</code></div>
    <button type="button" onClick={copy}>{copied ? tr("اتنسخ") : tr("انسخ الرابط")}</button>
    {isLocal && <small>{tr("رابط تجربة محلية فقط. لا تكتبه على NFC ولا تطبع QR قبل ربط نطاق CliQo النهائي.")}</small>}
  </div>;
}
