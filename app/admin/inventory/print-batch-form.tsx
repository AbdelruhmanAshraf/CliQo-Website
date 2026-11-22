"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { preparePrintBatch } from "./actions";

export function PrintBatchForm({ skuId, templateFile, templateLabel, previewHasQr = true, retired = false, recent }: {
  skuId: string; templateFile: string; templateLabel: string; previewHasQr?: boolean; retired?: boolean; recent: { batchId: string; quantity: number; createdAt: string }[];
}) {
  const request = useRef<{ id: string; quantity: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof preparePrintBatch>> | null>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = Number(new FormData(event.currentTarget).get("quantity"));
    if (!request.current || request.current.quantity !== quantity) request.current = { id: crypto.randomUUID(), quantity };
    const batchId = request.current.id;
    startTransition(async () => {
      try { setResult(await preparePrintBatch(skuId, quantity, batchId)); }
      catch { setResult({ ok: false, message: "الاتصال انقطع. أعد المحاولة لاسترجاع نفس الدفعة." }); }
    });
  }
  return <section className="inventory-print-batch">
    {retired ? <p>التصميم القديم متاح للدفعات السابقة فقط.</p> : <><div className="inventory-print-preview"><img src={result?.ok && result.publicIds?.[0] ? `/admin/items/${result.publicIds[0]}/print?preview=1` : templateFile} alt={result?.ok ? "معاينة أول قطعة وQR الخاص بها" : previewHasQr ? "معاينة التصميم وكود QR توضيحي" : "معاينة شكل المنتج"} width={210} height={210} />
      <p>{result?.ok ? "معاينة أول قطعة من الدفعة" : previewHasQr ? "تصميم مربوط بالصنف" : "معاينة شكل المنتج"}<br />{templateLabel}</p></div>
    <form className="inventory-edit-form" onSubmit={submit}>
      <h3>جهّز دفعة طباعة جديدة</h3>
      <p>كل قطعة لها QR ورابط NFC مستقلان. التنزيل يشمل التصميم كاملًا وكشف الروابط، ولا يضيف رصيدًا للبيع.</p>
      <label>عدد القطع الجديدة<input name="quantity" type="number" min={1} max={50} required defaultValue={10} disabled={pending || result?.ok} /></label>
      <button className="save-note" disabled={pending || result?.ok}>{pending ? "جارٍ تجهيز المعرّفات…" : "جهّز التصاميم والمعرّفات"}</button>
      {result && <p role="status">{result.message}</p>}
      {result?.ok && result.batchId && <>
        <a className="save-note" href={`/admin/items/qr-batch?batch=${result.batchId}`}>نزّل تصاميم الدفعة ({result.publicIds?.length})</a>
        <button type="button" className="export-button" onClick={() => { request.current = null; setResult(null); }}>ابدأ دفعة إضافية</button>
        <details className="print-batch-identifiers"><summary>معرّفات القطع ومعاينة التصميم</summary><ul>
          {result.publicIds?.map((id, index) => <li key={id}><span>{index + 1}. رقم الحفر <bdi>{id.replaceAll('-','').slice(0,12).toUpperCase()}</bdi></span><a href={`/admin/items/${id}/print?preview=1`} target="_blank" rel="noreferrer">معاينة</a><a href={`/admin/items/${id}`}>القطعة ورابط NFC</a></li>)}
        </ul></details>
      </>}
    </form></>}
    {!!recent.length && <details><summary>دفعات سابقة للصنف</summary><ul>{recent.map((batch) => <li key={batch.batchId}>
      <a href={`/admin/items/qr-batch?batch=${batch.batchId}`}>{batch.quantity} قطعة · {new Date(batch.createdAt).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</a>
    </li>)}</ul></details>}
  </section>;
}
