"use client";
import {snapshotLabel} from "@/i18n/catalog";

import { useCopy } from '@/i18n/client';


import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSkuDraft, updateSkuApprovals } from "./actions";

const faces = [
  { id: "review", label: "تقييم Google", variants: ["أسود", "أبيض"] },
  { id: "instapay", label: "الدفع · InstaPay", variants: ["InstaPay"] },
  { id: "vodafone", label: "الدفع · Vodafone Cash", variants: ["Vodafone Cash"] },
  { id: "instagram", label: "سوشيال · Instagram", variants: ["Instagram"] },
  { id: "tiktok", label: "سوشيال · TikTok", variants: ["TikTok"] },
  { id: "facebook", label: "سوشيال · Facebook", variants: ["Facebook"] },
  { id: "all-in-one", label: "صفحة روابط All-in-One", variants: ["All-in-One"] },
];

type Family = { id: string; family_key: string; name_ar: string; name_en: string };
type Sku = {
  id: string; sku_code: string; display_name: string; options: Record<string, string>;
  price_minor: number | null; price_approved: boolean; sample_approved: boolean; fulfillment_approved: boolean;
};

export function SkuManager({ families, skus }: { families: Family[]; skus: Sku[] }) {
  const tr = useCopy();

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [familyId, setFamilyId] = useState(families[0]?.id ?? "");
  const [faceId, setFaceId] = useState(faces[0].id);
  const [variant, setVariant] = useState(faces[0].variants[0]);
  const [design, setDesign] = useState("T0");
  const activeFamily = families.find((family) => family.id === familyId);
  const selectedFace = faces.find((face) => face.id === faceId) ?? faces[0];

  function submitNewSku(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    startTransition(async () => {
      const result = await createSkuDraft({
        familyId, displayName: String(form.get("displayName") ?? ""), face: faceId, variant, design,
      });
      setMessage(result.message);
      if (result.ok) { formElement.reset(); router.refresh(); }
    });
  }

  function saveApprovals(event: FormEvent<HTMLFormElement>, sku: Sku) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateSkuApprovals({
        skuId: sku.id,
        priceEgp: String(form.get("priceEgp") ?? ""),
        priceApproved: form.get("priceApproved") === "on",
        sampleApproved: form.get("sampleApproved") === "on",
        fulfillmentApproved: form.get("fulfillmentApproved") === "on",
      });
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  return <section className="sku-management" aria-labelledby="sku-management-title">
    <div className="sku-management-heading"><div><p className="ops-eyebrow">{tr("إدارة المالك")}</p><h2 id="sku-management-title">{tr("تجهيز أصناف البيع")}</h2><p>{tr("أضف SKU، ثم سجّل السعر واعتمادات العينة والتجهيز. البيع لا يفتح قبل استكمال إعدادات الشحن.")}</p></div></div>
    <form className="stock-receipt-form sku-create-form" onSubmit={submitNewSku}>
      <h3>{tr("إضافة SKU جديدة")}</h3>
      <label>{tr("عائلة المنتج")}<select required value={familyId} onChange={(event) => setFamilyId(event.target.value)}>{families.map((family) => <option key={family.id} value={family.id}>{tr.locale === "en" ? family.name_en : family.name_ar}</option>)}</select></label>
      <label>{tr("اسم النسخة")}<input name="displayName" required minLength={2} maxLength={120} placeholder={tr("مثال: ستاند تقييم Google · أسود")} /></label>
      {activeFamily?.family_key === "stand" && <>
        <label>{tr("الوجه")}<select value={faceId} onChange={(event) => { const nextFace = faces.find((face) => face.id === event.target.value) ?? faces[0]; setFaceId(nextFace.id); setVariant(nextFace.variants[0]); }}>{faces.map((face) => <option key={face.id} value={face.id}>{tr(face.label)}</option>)}</select></label>
        <label>{tr("اللون أو النسخة")}<select value={variant} onChange={(event) => setVariant(event.target.value)}>{selectedFace.variants.map((choice) => <option key={choice} value={choice}>{tr(choice)}</option>)}</select></label>
        <label>{tr("طريقة التصميم")}<select value={design} onChange={(event) => setDesign(event.target.value)}><option value="T0">{tr("T0 · قالب جاهز")}</option><option value="T1">{tr("T1 · تصميم العميل")}</option><option value="T2">{tr("T2 · تصميم من CliQo")}</option></select></label>
      </>}
      <button className="save-note" type="submit" disabled={pending || !familyId}>{pending ? tr("جاري الحفظ…") : tr("أنشئ SKU قيد التجهيز")}</button>
      {message && <p className="sku-action-message" role="status">{tr(message)}</p>}
    </form>
    <div className="sku-approval-list">
      {skus.map((sku) => <form className="sku-approval-card" key={sku.id} onSubmit={(event) => saveApprovals(event, sku)}>
        <div className="sku-approval-title"><div><span dir="ltr">{sku.sku_code}</span><h3>{snapshotLabel(tr, sku.display_name)}</h3></div><small>{{ T0: tr("قالب جاهز T0"), T1: tr("ملف العميل T1"), T2: tr("تصميم CliQo T2") }[sku.options?.design ?? ""] ?? tr("نسخة منتج")}</small></div>
        <div className="sku-approval-fields">
          <label className="option-field">{tr("سعر البيع المقترح · جنيه")}<input name="priceEgp" type="number" inputMode="decimal" min="0.01" max="9999999.99" step="0.01" required defaultValue={sku.price_minor ? (sku.price_minor / 100).toFixed(2) : ""} /></label>
          <label className="sku-check"><input name="priceApproved" type="checkbox" defaultChecked={sku.price_approved} />  {tr("السعر معتمد")}</label>
          <label className="sku-check"><input name="sampleApproved" type="checkbox" defaultChecked={sku.sample_approved} />  {tr("العينة معتمدة")}</label>
          <label className="sku-check"><input name="fulfillmentApproved" type="checkbox" defaultChecked={sku.fulfillment_approved} />  {tr("التجهيز والتغليف معتمدان")}</label>
        </div>
        <button className="save-note" type="submit" disabled={pending}>{pending ? tr("جاري الحفظ…") : tr("حفظ الاعتمادات")}</button>
      </form>)}
      {!skus.length && <p className="inventory-gate">{tr("ابدأ بإنشاء أول SKU. لن يظهر زر شراء قبل اعتمادها وتسجيل المخزون وفتح الشحن.")}</p>}
    </div>
  </section>;
}
