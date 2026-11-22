"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCopy } from "@/i18n/client";
import { resetAndRebuildStandCoasterStock } from "./actions";

export function ResetStockButton({ plannedStandCount, standOnHand, coasterOnHand }: {
  plannedStandCount: number; standOnHand: number; coasterOnHand: number;
}) {
  const tr = useCopy();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);

  function reset() {
    startTransition(async () => {
      const result = await resetAndRebuildStandCoasterStock();
      setMessage(result.message);
      setReady(result.ok);
      if (result.ok) router.refresh();
    });
  }

  return <div className="inventory-reset-body">
    <p>{tr("المخزون الحالي:")} {standOnHand.toLocaleString(tr.numberLocale)} {tr("استان،")} {coasterOnHand.toLocaleString(tr.numberLocale)} {tr("كوستر. العملية توقف IDs وأكواد التفعيل القديمة وتلغي")} {plannedStandCount.toLocaleString(tr.numberLocale)} {tr("خطة قديمة للستاند، مع حفظ سجل الحركات. بعدها تصدر ٨ استاند و٨ كوستر جديدة.")}</p>
    <button className="inventory-delete-button" type="button" disabled={pending} onClick={reset}>
      {pending ? tr("جاري تجديد المخزون…") : tr("امسح القديم وجهّز ٨+٨")}
    </button>
    {message && <p className={ready ? "inventory-reset-success" : "inventory-reset-error"} role="status">{tr(message)}</p>}
    <div className="inventory-reset-downloads">
      <a className="export-button" href="/admin/inventory/factory-zip">{tr("نزّل ZIP المصنع مع PDF والأكواد")}</a>
      <a className="export-button" href="/admin/inventory/factory-pdf">{tr("نزّل PDF الطباعة")}</a>
    </div>
  </div>;
}
