"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useCopy } from "@/i18n/client";
import { removeInventoryStock } from "./actions";

export function StockAdjustmentForm({ skus }: { skus: Array<{ id: string; label: string }> }) {
  const tr = useCopy();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [skuId, setSkuId] = useState(skus[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm(tr("القطع المشطوبة ستُعطّل نهائيًا ولا يمكن بيعها. تأكد من الكمية."))) return;
    startTransition(async () => {
      const result = await removeInventoryStock(skuId, quantity, reason);
      setMessage(result.message);
      if (result.ok) { setReason(""); setQuantity(1); router.refresh(); }
    });
  }

  if (!skus.length) return <p className="inventory-gate">{tr("لا يوجد مخزون غير محجوز لتعديله.")}</p>;
  return <form className="inventory-edit-form stock-adjustment-form" onSubmit={submit}>
    <p>{tr("خصم القطع التالفة أو المفقودة. الكمية المحجوزة للطلبات لا يمكن خصمها، وقطع QR المشطوبة تُعطّل نهائيًا.")}</p>
    <label>{tr("الصنف")}<select value={skuId} onChange={(event) => setSkuId(event.target.value)}>{skus.map((sku) => <option value={sku.id} key={sku.id}>{sku.label}</option>)}</select></label>
    <label>{tr("الكمية")}<input type="number" min={1} max={200} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /></label>
    <label>{tr("سبب الخصم")}<input required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={tr("تالف، مفقود، أو تصحيح جرد")} /></label>
    <button className="inventory-delete-button" type="submit" disabled={pending || !skuId}>{pending ? tr("جاري الحفظ…") : tr("خصم وتوثيق")}</button>
    {message && <p role="status">{tr(message)}</p>}
  </form>;
}
