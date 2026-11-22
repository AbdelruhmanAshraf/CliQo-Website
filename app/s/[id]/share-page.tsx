"use client";

import { useState } from "react";
import { useCopy } from "@/i18n/client";
import { ServiceIcon } from "@/app/service-icon";

export function SharePage({ title, className }: { title: string; className?: string }) {
  const tr = useCopy();
  const [message, setMessage] = useState("");
  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; }
      catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); setMessage(tr("تم نسخ رابط الصفحة")); }
    catch { setMessage(tr("تعذر نسخ الرابط")); }
  }
  return <><button type="button" className={className} onClick={share}><ServiceIcon name="share" />{tr("شارك الصفحة")}</button>
    {message && <span role="status">{message}</span>}</>;
}
