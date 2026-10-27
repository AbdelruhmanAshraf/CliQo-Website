"use client";
import { useCopy } from '@/i18n/client';


export function PrintGuideButton() {
  const tr = useCopy();

  return <button className="guide-print-button" type="button" onClick={() => window.print()}>{tr("اطبع الدليل أو احفظه PDF")}</button>;
}
