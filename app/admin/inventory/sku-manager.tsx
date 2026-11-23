"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useCopy } from "@/i18n/client";
import { snapshotLabel } from "@/i18n/catalog";
import Link from 'next/link';
import {catalogDesigns} from '@/lib/catalog-designs';
import { productPhotos } from "@/lib/product-photos";
import { PrintBatchForm } from "./print-batch-form";
import { createCoreProductSkus, createSkuDraft, deleteSku, setPlannedQuantity, updateSkuApprovals, updateSkuDetails } from "./actions";

const faceNames: Record<string, string> = {
  default: "Standard",
  review: "Google", instapay: "InstaPay", vodafone: "Vodafone Cash", instagram: "Instagram",
  tiktok: "TikTok", facebook: "Facebook", "all-in-one": "All-in-One",
};
const commonFaces: Record<string, string[]> = {
  "all-in-one": ["All-in-One"], review: ["أبيض", "شفاف"], facebook: ["Facebook"],
  instagram: ["Instagram"], instapay: ["InstaPay"], tiktok: ["TikTok"], vodafone: ["Vodafone Cash"],
};
const facesByFamily: Record<string, Record<string, string[]>> = {
  stand: commonFaces, coaster: commonFaces,
  "pvc-card": { facebook: ["Facebook"], review: ["Google Review"], instagram: ["Instagram"],
    instapay: ["InstaPay"], "all-in-one": ["أسود", "أبيض"] },
};
const familyImages: Record<string, string> = {
  stand: productPhotos.stand,
  coaster: productPhotos.coaster,
  "pvc-card": productPhotos.card,
};
type Family = { id: string; family_key: string; name_ar: string; name_en: string; has_nfc_qr: boolean; catalog_deleted_at: string | null };
type Sku = { id: string; product_family_id: string; sku_code: string; display_name: string;
  options: Record<string, string>; state: string; price_minor: number | null;
  price_approved: boolean; sample_approved: boolean; fulfillment_approved: boolean;
  hasNfcQr: boolean;
  inventoryImage?: string;
  printTemplateFile?: string; printTemplatePreview?: string; printTemplateLabel?: string; printPreviewHasQr?: boolean; printTemplateRetired?: boolean;
  printBatches?: { batchId: string; quantity: number; createdAt: string }[] };
type StockSku = Sku & {onHand?:number;reserved?:number};

type ActionResult = { ok: boolean; message: string };

export function SkuManager({ families, skus, plannedBySku }: {
  families: Family[]; skus: StockSku[]; plannedBySku: Record<string, number>;
}) {
  const tr = useCopy();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hydrated, setHydrated] = useState(false);
  const supported = families.filter((family) => !family.catalog_deleted_at);
  const [familyId, setFamilyId] = useState(supported[0]?.id ?? "");
  const [newFace, setNewFace] = useState("all-in-one");
  const [newVariant, setNewVariant] = useState("All-in-One");
  const [newDesign, setNewDesign] = useState("T0");
  const [message, setMessage] = useState("");
  useEffect(() => setHydrated(true), []);
  const family = supported.find((item) => item.id === familyId) ?? supported[0];
  const faces = facesByFamily[family?.family_key ?? ""] ?? {};
  const missingCore = supported.some((item) => Object.entries(facesByFamily[item.family_key] ?? {})
    .some(([purpose, variants]) => variants.some((variant) => !((item.family_key === "stand" || item.family_key === "coaster") && purpose === "review" && variant === "شفاف") && !skus.some((sku) =>
      sku.product_family_id === item.id && sku.options?.face === purpose
      && sku.options?.variant === variant && sku.options?.design === "T0"))));
  const run = (work: () => Promise<ActionResult>) => startTransition(async () => {
    const result = await work();
    setMessage(result.message);
    if (result.ok) router.refresh();
  });
  function selectFamily(nextId: string) {
    setFamilyId(nextId);
    const nextFamily = supported.find((item) => item.id === nextId);
    const firstFace = Object.keys(facesByFamily[nextFamily?.family_key ?? ""] ?? {})[0] ?? "default";
    setNewFace(firstFace);
    setNewVariant(facesByFamily[nextFamily?.family_key ?? ""]?.[firstFace]?.[0] ?? "Standard");
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    run(async () => {
      const result = await createSkuDraft({ familyId, displayName: String(data.get("name") ?? ""),
        face: newFace, variant: newVariant, design: newDesign });
      if (result.ok) form.reset();
      return result;
    });
  }
  return <section className="sku-management" aria-labelledby="sku-management-title">
    <div className="sku-management-heading"><div><h2 id="sku-management-title">{tr("الأصناف حسب نوع القطعة")}</h2>
      <p>{tr("افتح النوع، ثم اختار الصنف لتعديل سعره أو بياناته أو تجهيز QR.")}</p></div></div>
    <div className="inventory-list-header"><strong>{tr("الأصناف")}: {skus.length}</strong>
      {missingCore && <button type="button" className="export-button" disabled={pending} onClick={() => run(createCoreProductSkus)}>
        {tr("أضف نسخ الستاند والكوستر والكروت الأساسية")}</button>}</div>
    {message && <p className="sku-action-message" role="status">{tr(message)}</p>}
    <div className="inventory-family-list">
      {supported.map((item,index)=>{const familySkus=skus.filter(sku=>sku.product_family_id===item.id);
        const total=familySkus.reduce((sum,sku)=>sum+Math.max(0,(sku.onHand??0)-(sku.reserved??0)),0);
        return <details className="inventory-family" name="inventory-family" key={item.id} onToggle={event=>{if(event.currentTarget.open)selectFamily(item.id);}}><summary><img src={familyImages[item.family_key] ?? familyImages.stand} alt=""/><span><strong>{tr.locale==='en'?item.name_en:item.name_ar}</strong><small>{familySkus.length} {tr("أصناف")} · {total} {tr("قطعة بالمخزون")}</small></span><b aria-hidden="true">⌄</b></summary><div className="inventory-family-body">
          {familySkus.map(sku=><SkuCard key={sku.id} sku={sku} family={item} families={supported} planned={plannedBySku[sku.id]??0} pending={pending} run={run}/>) }
          {!familySkus.length&&<p className="inventory-empty-category">{tr("مفيش صنف في النوع ده. أضفه من النموذج أدناه.")}</p>}
        </div></details>;})}
    </div>
    <details id="create-product" className="sku-create-details" open={!skus.length}><summary><span className="inventory-create-icon">＋</span><span><strong>{tr("إضافة نسخة منتج")}</strong><small>{tr("أضف صنفًا جديدًا من غير سعر؛ تقدر تحدده بعدين.")}</small></span><span className="inventory-create-action">{tr("ابدأ")}</span></summary>
      <form className="stock-receipt-form sku-create-form" onSubmit={create}>
        <div className="sku-create-visual"><img src={familyImages[family?.family_key ?? ""] ?? familyImages.stand} alt=""/><span>{tr("معاينة فئة المنتج")}</span></div>
        <fieldset className="sku-create-controls" disabled={!hydrated || pending}>
          <label>{tr("فئة المنتج")}<select value={familyId} onChange={(event) => selectFamily(event.target.value)}>
            {supported.map((item) => <option key={item.id} value={item.id}>{tr.locale === "en" ? item.name_en : item.name_ar}</option>)}</select></label>
          <label>{tr("اسم النسخة")}<input name="name" required minLength={2} maxLength={120} placeholder={tr("مثال: ستاند Google أبيض")} /></label>
          {Object.keys(faces).length ? <>
            <label>{tr("الفئة الفرعية / الوجه")}<select value={newFace} onChange={(event) => { const next = event.target.value; setNewFace(next); setNewVariant(faces[next]?.[0] ?? ""); }}>
              {Object.keys(faces).map((key) => <option key={key} value={key}>{faceNames[key]}</option>)}</select></label>
            <label>{tr("اللون أو النسخة")}<select value={newVariant} onChange={(event) => setNewVariant(event.target.value)}>
              {(faces[newFace] ?? []).filter((choice) => choice !== "شفاف").map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select></label>
            <label>{tr("طريقة التصميم")}<select value={newDesign} onChange={(event) => setNewDesign(event.target.value)}>
              <option value="T0">T0 · {tr("قالب جاهز")}</option><option value="T1">T1 · {tr("تصميم العميل")}</option><option value="T2">T2 · {tr("تصميم من CliQo")}</option></select></label>
          </> : <>
            <label>{tr("النسخة أو المقاس")}<input required minLength={1} maxLength={80} value={newVariant} onChange={(event) => setNewVariant(event.target.value)} placeholder={tr("مثال: أسود · مقاس متوسط")} /></label>
            {family?.has_nfc_qr && <label>{tr("طريقة التصميم")}<select value={newDesign} onChange={(event) => setNewDesign(event.target.value)}><option value="T0">T0 · {tr("قالب جاهز")}</option><option value="T1">T1 · {tr("تصميم العميل")}</option><option value="T2">T2 · {tr("تصميم من CliQo")}</option></select></label>}
          </>}
          <button className="save-note" type="submit">{tr("أضف الصنف بدون سعر")}</button>
        </fieldset>
      </form>
    </details>
  </section>;
}

function SkuCard({ sku, family, families, planned, pending, run }: {
  sku: StockSku; family: Family | undefined; families: Family[]; planned: number; pending: boolean;
  run: (work: () => Promise<ActionResult>) => void;
}) {
  const tr = useCopy();
  const [familyId, setFamilyId] = useState(sku.product_family_id);
  const [face, setFace] = useState(sku.options?.face ?? "all-in-one");
  const [variant, setVariant] = useState(sku.options?.variant ?? "");
  const [design, setDesign] = useState(sku.options?.design ?? "T0");
  const selectedFamily = families.find((item) => item.id === familyId) ?? family;
  const faces = facesByFamily[selectedFamily?.family_key ?? ""] ?? {};
  const knownFaceFamily = Object.keys(faces).length > 0;
  const approved = sku.state === "ready" && sku.price_approved && sku.sample_approved && sku.fulfillment_approved;
  const designFamily=family?.family_key==='pvc-card'?'card':family?.family_key??'';
  const catalogDesign=catalogDesigns[designFamily]?.find(item=>item.face===sku.options?.face&&item.variant===sku.options?.variant);
  const designHref=catalogDesign?`/admin/products/${designFamily}/${catalogDesign.id}`:(!catalogDesigns[designFamily]?.length?`/admin/products/${designFamily}/${designFamily}-default`:null);
  function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    run(() => updateSkuDetails({ skuId: sku.id, familyId, displayName: String(data.get("displayName") ?? ""), face, variant, design }));
  }
  function saveApproval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    run(() => updateSkuApprovals({ skuId: sku.id, priceEgp: String(data.get("priceEgp") ?? "").trim(),
      priceApproved: data.get("priceApproved") === "on", sampleApproved: data.get("sampleApproved") === "on",
      fulfillmentApproved: data.get("fulfillmentApproved") === "on" }));
  }
  function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const target = Number(data.get("target"));
    if (target < planned && !window.confirm(tr("تقليل الكمية المخططة يوقف IDs الملغاة نهائيًا. تكمّل؟"))) return;
    run(() => setPlannedQuantity(sku.id, target));
  }
  return <details className="inventory-sku-card">
    <summary><img className="inventory-sku-thumb" src={sku.inventoryImage ?? familyImages[family?.family_key ?? ""] ?? familyImages.stand} alt=""/><span className="inventory-sku-title"><strong>{snapshotLabel(tr, sku.display_name)}</strong><small>{sku.sku_code} · {faceNames[sku.options?.face] ?? sku.options?.face} · {sku.options?.variant}</small></span>
      <span className="inventory-sku-stats"><b>{Math.max(0,(sku.onHand??0)-(sku.reserved??0))} {tr("بالمخزون")}</b><b>{approved ? tr("معتمد") : tr("قيد التجهيز")}</b></span></summary>
    <div className="inventory-sku-body">
      {designHref&&<Link className="export-button inventory-design-link" href={designHref}>{tr("تعديل صفحة التصميم والصور")}</Link>}
      {sku.printTemplateFile && <PrintBatchForm skuId={sku.id} templateFile={sku.printTemplatePreview ?? sku.printTemplateFile} templateLabel={sku.printTemplateLabel ?? sku.display_name} previewHasQr={sku.printPreviewHasQr ?? true} retired={sku.printTemplateRetired} recent={sku.printBatches ?? []} />}
      <form className="inventory-edit-form" onSubmit={saveDetails}>
        <h3>{tr("بيانات الصنف")}</h3>
        <label>{tr("اسم النسخة")}<input name="displayName" required minLength={2} maxLength={120} defaultValue={sku.display_name} /></label>
        <label>{tr("فئة المنتج")}<select value={familyId} onChange={(event) => { const next = event.target.value; setFamilyId(next); const f = families.find((item) => item.id === next); const key = Object.keys(facesByFamily[f?.family_key ?? ""] ?? {})[0]; setFace(key ?? "default"); setVariant(facesByFamily[f?.family_key ?? ""]?.[key]?.[0] ?? "Standard"); }}>
          {families.map((item) => <option key={item.id} value={item.id}>{tr.locale === "en" ? item.name_en : item.name_ar}</option>)}</select></label>
        {knownFaceFamily ? <>
          <label>{tr("الفئة الفرعية / الوجه")}<select value={face} onChange={(event) => { const next = event.target.value; setFace(next); setVariant(faces[next]?.[0] ?? ""); }}>
            {Object.keys(faces).map((key) => <option key={key} value={key}>{faceNames[key]}</option>)}</select></label>
          <label>{tr("اللون أو النسخة")}<select value={variant} onChange={(event) => setVariant(event.target.value)}>
            {(faces[face] ?? []).map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select></label>
          <label>{tr("طريقة التصميم")}<select value={design} onChange={(event) => setDesign(event.target.value)}>
            <option value="T0">T0</option><option value="T1">T1</option><option value="T2">T2</option></select></label>
        </> : <>
          <label>{tr("النسخة أو المقاس")}<input required minLength={1} maxLength={80} value={variant} onChange={(event) => setVariant(event.target.value)} /></label>
          {selectedFamily?.has_nfc_qr && <label>{tr("طريقة التصميم")}<select value={design} onChange={(event) => setDesign(event.target.value)}><option value="T0">T0</option><option value="T1">T1</option><option value="T2">T2</option></select></label>}
        </>}
        <button className="export-button" type="submit" disabled={pending}>{tr("حفظ بيانات الصنف")}</button>
      </form>
      <form className="inventory-edit-form" onSubmit={saveApproval}>
        <h3>{tr("السعر والاعتمادات")}</h3>
        <label>{tr("سعر البيع بالجنيه · اختياري")}<input name="priceEgp" type="number" inputMode="decimal" min="0.01" step="0.01" defaultValue={sku.price_minor ? (sku.price_minor / 100).toFixed(2) : ""} placeholder={tr("اتركه فارغًا الآن")} /></label>
        <label className="sku-check"><input name="priceApproved" type="checkbox" defaultChecked={sku.price_approved} />{tr("السعر معتمد")}</label>
        <label className="sku-check"><input name="sampleApproved" type="checkbox" defaultChecked={sku.sample_approved} />{tr("العينة معتمدة")}</label>
        <label className="sku-check"><input name="fulfillmentApproved" type="checkbox" defaultChecked={sku.fulfillment_approved} />{tr("التجهيز والتغليف معتمدان")}</label>
        <button className="export-button" type="submit" disabled={pending}>{tr("حفظ السعر والاعتمادات")}</button>
      </form>
      {sku.hasNfcQr && !sku.printTemplateFile && <form className="inventory-edit-form inventory-plan-form" onSubmit={savePlan}>
        <h3>{tr("دفعة التصنيع وQR")}</h3>
        <p>{tr("العدد هنا خطة تصنيع. كل قطعة تأخذ ID وQR مختلفين، ولا تزيد الكمية المتاحة للبيع حتى الاستلام.")}</p>
        <p className="inventory-print-pending">{tr("قالب الوجه والظهر غير مربوط لهذا التصميم بعد؛ يمكن تنزيل QR والمعرّفات، والطباعة المركبة تنتظر ملفين نهائيين بمقاس البطاقة.")}</p>
        <label>{tr("القطع المخططة ولم تُستلم")}<input name="target" type="number" min={0} max={200} step={1} defaultValue={planned} key={planned} /></label>
        <button className="save-note" type="submit" disabled={pending}>{tr("حفظ الخطة وتجهيز QR")}</button>
        <a className="export-button" href={`/admin/items/qr-batch?sku=${sku.id}`}>{tr("نزّل QR لكل قطع الصنف")}</a>
        <a className="export-button" href={`/admin/items/print-manifest?sku=${sku.id}`}>{tr("نزّل كشف ID والروابط")}</a>
      </form>}
      {!sku.hasNfcQr && <div className="inventory-edit-form inventory-plan-form"><h3>{tr("صنف مادي بدون QR")}</h3><p>{tr("تقدر تسجل الاستلام والخصم من المخزون. تجهيز QR والتفعيل غير مطبق على هذه الفئة.")}</p></div>}
      {sku.printTemplateFile && planned > 0 && <div className="inventory-edit-form inventory-plan-form">
        <p>{tr("قطع مخططة ولم تُستلم")}: {planned}</p>
        <a className="export-button" href={`/admin/items/qr-batch?sku=${sku.id}`}>{tr("نزّل QR لكل قطع الصنف")}</a>
        <a className="export-button" href={`/admin/items/print-manifest?sku=${sku.id}`}>{tr("نزّل كشف ID والروابط")}</a>
      </div>}
      <button className="inventory-delete-button" type="button" disabled={pending} onClick={() => {
        if (window.confirm(tr("تأكيد حذف SKU؟ لا يمكن حذف صنف عليه مخزون أو طلبات أو قطع مسجلة."))) run(() => deleteSku(sku.id));
      }}>{tr("حذف SKU")}</button>
    </div>
  </details>;
}
