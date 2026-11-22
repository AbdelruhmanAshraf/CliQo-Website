"use client";
import { useCopy } from '@/i18n/client';


import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { receiveStock } from "./actions";

type PendingBatch = { skuId: string; batchId: string; quantity: number; createdAt: string };

export function ReceiveStockForm({ skus, pendingBatches, legacyPendingBySku, qrTarget }: {
  skus: { id: string; name: string; image?: string }[];
  pendingBatches: PendingBatch[];
  legacyPendingBySku: Record<string, number>;
  qrTarget: { origin: string; preview: boolean } | null;
}) {
  const tr = useCopy();

  const router = useRouter();
  const [skuId, setSkuId] = useState(skus[0]?.id ?? "");
  const [source, setSource] = useState(() => defaultSource(skus[0]?.id ?? "", pendingBatches, legacyPendingBySku));
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [activationCodes, setActivationCodes] = useState<{ publicId: string; activationCode: string }[]>([]);
  const [pending, startTransition] = useTransition();
  const selectedSku = skus.find((sku) => sku.id === skuId) ?? skus[0];
  const sourceOptions = [
    ...pendingBatches.filter((batch) => batch.skuId === skuId).map((batch) => ({
      value: batch.batchId,
      remaining: batch.quantity,
      label: tr("دفعة تصنيع · {value0} متبقية · {value1}", {
        value0: batch.quantity,
        value1: new Date(batch.createdAt).toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo" }),
      }),
    })),
    ...(legacyPendingBySku[skuId] ? [{ value: "legacy", remaining: legacyPendingBySku[skuId], label: tr("خطة قديمة بلا دفعة · {value0} متبقية", { value0: legacyPendingBySku[skuId] }) }] : []),
    { value: "new", remaining: 200, label: tr("قطع جديدة · إصدار ID عند الاستلام") },
  ];
  const selectedSource = sourceOptions.find((option) => option.value === source) ?? sourceOptions[0];
  useEffect(() => {
    const matchingSource = sourceOptions.find((option) => option.value === source);
    if (!matchingSource) {
      setSource(defaultSource(skuId, pendingBatches, legacyPendingBySku));
      setQuantity(1);
    } else if (quantity > matchingSource.remaining) setQuantity(matchingSource.remaining);
  }, [skuId, pendingBatches, legacyPendingBySku, source, sourceOptions, quantity]);
  async function copyValue(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage(tr("تم النسخ.")); }
    catch { setMessage(tr("تعذر النسخ التلقائي. انسخ القيمة يدويًا.")); }
  }
  if (!skus.length) return <p className="inventory-gate">{tr("أضف صنفًا أولًا، ثم سجّل القطع التي وصلت من المصنع.")}</p>;
  return <form className="stock-receipt-form inventory-receive-form" onSubmit={(event) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await receiveStock(skuId, quantity, reason, source);
      setMessage(result.message);
      setActivationCodes(result.ok ? result.activationCodes ?? [] : []);
      if (result.ok) { setReason(""); router.refresh(); }
    });
  }}>
    <div className="inventory-receive-visual">{selectedSku?.image && <img src={selectedSku.image} alt=""/>}<span><strong>{tr("سجّل القطع التي وصلت")}</strong><small>{tr("الكمية هنا تزيد رصيد المخزون الفعلي.")}</small></span></div>
    <label>{tr("الصنف")}<select value={skuId} onChange={(event) => {
      const nextSkuId = event.target.value;
      setSkuId(nextSkuId);
      setSource(defaultSource(nextSkuId, pendingBatches, legacyPendingBySku));
      setQuantity(1);
    }}>{skus.map((sku) => <option key={sku.id} value={sku.id}>{sku.name}</option>)}</select></label>
    <label>{tr("مصدر القطع")}<select value={selectedSource.value} onChange={(event) => { setSource(event.target.value); setQuantity(1); }}>{sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>{selectedSource.value === "new" ? tr("ينشئ ID وQR لكل قطعة بعد تأكيد وصولها.") : tr("الاستلام يربط القطع بهذه الدفعة فقط.")}</small></label>
    <label>{tr("الكمية")}<input type="number" min={1} max={selectedSource.remaining} required value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
    <label>{tr("سبب الإضافة")}<input required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={tr("استلام دفعة من المصنع")} /></label>
    <button className="save-note" type="submit" disabled={pending}>{pending ? tr("جاري الحفظ…") : tr("سجّل الكمية")}</button>
    {message && <p role="status">{tr(message)}</p>}
    {activationCodes.length > 0 && <div className="activation-code-list">
      <div><strong>{tr("أكواد التفعيل الجديدة")}</strong><small>{tr("كود التفعيل الخاص يكون داخل العبوة؛ لا تحفره على القطعة ولا تضفه لملفات المصنع أو QR أو NFC.")}</small></div>
      <button type="button" className="export-button" onClick={async () => {
        const value = activationCodes.map((item) => `${item.publicId}\t${qrTarget ? new URL(`/s/${item.publicId}`, qrTarget.origin).toString() : ""}\t${item.activationCode}`).join("\n");
        try { await navigator.clipboard.writeText(value); setMessage(tr("تم نسخ روابط القطع وأكواد تفعيلها.")); }
        catch { setMessage(tr("تعذر النسخ التلقائي. انسخ الأكواد يدويًا من القائمة.")); }
      }}>{tr("انسخ كل الأكواد")}</button>
      <ol>{activationCodes.map((item) => {
        const publicUrl = qrTarget ? new URL(`/s/${item.publicId}`, qrTarget.origin).toString() : null;
        return <li key={item.publicId} className="activation-item-record">
          <div className="activation-item-field"><span>{tr("ID القطعة")}</span><code dir="ltr">{item.publicId}</code><button type="button" onClick={() => copyValue(item.publicId)}>{tr("انسخ ID")}</button></div>
          <div className="activation-item-field"><span>{tr("الرابط العام")}</span><code dir="ltr">{publicUrl ?? tr("عنوان الموقع غير مضبوط")}</code>{publicUrl && <button type="button" onClick={() => copyValue(publicUrl)}>{tr("انسخ الرابط")}</button>}</div>
          <div className="activation-item-field"><span>{tr("كود التفعيل الخاص")}</span><code dir="ltr">{item.activationCode}</code></div>
          {qrTarget && <img className="smart-item-qr-preview" src={`/admin/items/${item.publicId}/qr?preview=1`} alt={tr("QR الخاص بهذه القطعة")} width={180} height={180} />}
          {qrTarget && <a className="export-button" href={`/admin/items/${item.publicId}/qr`} download>{tr(qrTarget.preview ? "نزّل QR للتجربة · SVG" : "نزّل QR للطباعة · SVG")}</a>}
        </li>;
      })}</ol>
      <p className="activation-code-warning">{qrTarget?.preview ? tr("QR التجربة يفتح الموقع المحلي فقط. لا تطبعه على منتج للبيع.") : tr("QR وNFC يفتحان رابط CliQo الثابت. كود التفعيل الخاص يوضع داخل العبوة ولا يدخل ملفات المصنع أو QR أو NFC.")}</p>
    </div>}
  </form>;
}

function defaultSource(skuId: string, pendingBatches: PendingBatch[], legacyPendingBySku: Record<string, number>) {
  return pendingBatches.find((batch) => batch.skuId === skuId)?.batchId
    ?? (legacyPendingBySku[skuId] ? "legacy" : "new");
}
