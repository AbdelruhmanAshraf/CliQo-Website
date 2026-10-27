"use client";
import { useCopy } from '@/i18n/client';


import { useState } from "react";
import styles from "../public-page.module.css";

export function CopyPaymentIdentifier({ value }: { value: string }) {
  const tr = useCopy();

  const [status, setStatus] = useState("");

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setStatus("تم نسخ البيانات.");
    } catch {
      setStatus("تعذر النسخ تلقائيًا. اضغط مطولًا على البيانات لنسخها.");
    }
  }

  return <>
    <button className={styles.copyButton} type="button" onClick={copy}>{tr("نسخ بيانات الدفع")}</button>
    <p className={styles.copyStatus} role="status" aria-live="polite">{tr(status)}</p>
  </>;
}
