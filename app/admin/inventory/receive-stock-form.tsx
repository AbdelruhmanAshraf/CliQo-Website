"use client";
import { useCopy } from '@/i18n/client';


import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { receiveStock } from "./actions";

export function ReceiveStockForm({ skus }: { skus: { id: string; name: string }[] }) {
  const tr = useCopy();

  const router = useRouter();
  const [skuId, setSkuId] = useState(skus[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [activationCodes, setActivationCodes] = useState<{ publicId: string; activationCode: string }[]>([]);
  const [pending, startTransition] = useTransition();
  if (!skus.length) return <p className="inventory-gate">{tr("إضافة المخزون هتظهر بعد اعتماد أول SKU وسعره وعينته.")}</p>;
  return <form className="stock-receipt-form" onSubmit={(event) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await receiveStock(skuId, quantity, reason);
      setMessage(result.message);
      setActivationCodes(result.ok ? result.activationCodes ?? [] : []);
      if (result.ok) { setReason(""); router.refresh(); }
    });
  }}>
    <h2>{tr("استلام مخزون")}</h2>
    <label>{tr("الصنف")}<select value={skuId} onChange={(event) => setSkuId(event.target.value)}>{skus.map((sku) => <option key={sku.id} value={sku.id}>{sku.name}</option>)}</select></label>
    <label>{tr("الكمية")}<input type="number" min={1} max={200} required value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
    <label>{tr("سبب الإضافة")}<input required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={tr("استلام دفعة من المصنع")} /></label>
    <button className="save-note" type="submit" disabled={pending}>{pending ? tr("جاري الحفظ…") : tr("سجّل الكمية")}</button>
    {message && <p role="status">{tr(message)}</p>}
    {activationCodes.length > 0 && <div className="activation-code-list">
      <div><strong>{tr("أكواد التفعيل الجديدة")}</strong><small>{tr("انسخها إلى كروت داخل العبوات. لا يمكن استرجاع الكود الخام بعد إغلاق الصفحة.")}</small></div>
      <button type="button" className="export-button" onClick={async () => {
        const value = activationCodes.map((item) => `/s/${item.publicId}\t${item.activationCode}`).join("\n");
        try { await navigator.clipboard.writeText(value); setMessage(tr("تم نسخ روابط القطع وأكواد تفعيلها.")); }
        catch { setMessage(tr("تعذر النسخ التلقائي. انسخ الأكواد يدويًا من القائمة.")); }
      }}>{tr("انسخ كل الأكواد")}</button>
      <ol>{activationCodes.map((item) => <li key={item.publicId}>
        <a href={`/s/${item.publicId}`} target="_blank" rel="noreferrer" dir="ltr">/s/{item.publicId}</a>
        <code dir="ltr">{item.activationCode}</code>
      </li>)}</ol>
      <p className="activation-code-warning">{tr("الرابط العام ليس سرًا. كود التفعيل وحده يربط القطعة بحساب العميل. لا تستخدم الروابط للطباعة قبل اعتماد نطاق CliQo النهائي.")}</p>
    </div>}
  </form>;
}
