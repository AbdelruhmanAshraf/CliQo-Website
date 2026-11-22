"use client";
import { useCopy } from '@/i18n/client';


import { useEffect, useState, type FormEvent } from "react";
import type { SaleSku } from "@/lib/sale-skus";
import { CartAddButton } from "../../cart-add-button";

const faces = [
  { id: "review", label: "تقييم Google", variants: ["أبيض"] },
  { id: "instapay", label: "الدفع · InstaPay", variants: ["InstaPay"] },
  { id: "vodafone", label: "الدفع · Vodafone Cash", variants: ["Vodafone Cash"] },
  { id: "instagram", label: "سوشيال · Instagram", variants: ["Instagram"] },
  { id: "tiktok", label: "سوشيال · TikTok", variants: ["TikTok"] },
  { id: "facebook", label: "سوشيال · Facebook", variants: ["Facebook"] },
  { id: "all-in-one", label: "صفحة روابط All-in-One", variants: ["All-in-One"] },
];

export function StandOptions({ skus }: { skus: SaleSku[] }) {
  const tr = useCopy();

  const [hydrated, setHydrated] = useState(false);
  const [face, setFace] = useState(faces[0].id);
  const [variant, setVariant] = useState(faces[0].variants[0]);
  const [design, setDesign] = useState("T0");
  const [preview, setPreview] = useState<{ businessName: string; destinationUrl: string; fileName: string } | null>(null);
  useEffect(() => setHydrated(true), []);
  const selected = faces.find((item) => item.id === face) ?? faces[0];
  const saleSku = skus.find((sku) =>
    sku.options.face === face && sku.options.variant === variant && sku.options.design === design
  );

  function showPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("designFile");
    setPreview({
      businessName: String(form.get("businessName") ?? ""),
      destinationUrl: String(form.get("destinationUrl") ?? ""),
      fileName: file instanceof File ? file.name : "",
    });
  }

  return <section className="stand-options" id="stand-options">
    <div className="section-kicker"><span>05</span>  {tr("اختار تفاصيل الستاند")}</div>
    <div className="options-panel">
      <fieldset className="stand-option-controls" data-testid="stand-option-controls" disabled={!hydrated}>
      <div className="option-field"><label htmlFor="stand-face">{tr("الوجه المطبوع")}</label><select id="stand-face" value={face} onChange={(event) => { const nextFace = faces.find((item) => item.id === event.target.value) ?? faces[0]; setFace(nextFace.id); setVariant(nextFace.variants[0]); setPreview(null); }}>{faces.map((item) => <option value={item.id} key={item.id}>{tr(item.label)}</option>)}</select><small>{tr("الوجه يحدد الوظيفة؛ رابط QR وNFC يفضل تابعًا للوظيفة المطبوعة.")}</small></div>
      {selected.variants.length > 1 && <div className="option-field"><label htmlFor="stand-variant">{tr("لون الوجه")}</label><select id="stand-variant" value={variant} onChange={(event) => setVariant(event.target.value)}>{selected.variants.map((choice) => <option key={choice} value={choice}>{tr(choice)}</option>)}</select></div>}
      <fieldset className="design-choice"><legend>{tr("طريقة التصميم والتجهيز")}</legend><label><input type="radio" name="stand-design" checked={design === "T0"} onChange={() => { setDesign("T0"); setPreview(null); }} /><span><b>{tr("T0 · قالب جاهز")}</b><small>{tr("تفعّل القطعة وتضبط وجهتها وتكتب رابط CliQo على NFC بنفسك.")}</small></span></label><label><input type="radio" name="stand-design" checked={design === "T1"} onChange={() => { setDesign("T1"); setPreview(null); }} /><span><b>{tr("T1 · ملفك الجاهز")}</b><small>{tr("ترفع تصميمك ورابط وجهتك؛ CliQo تكتب NFC وتختبره قبل الشحن.")}</small></span></label><label><input type="radio" name="stand-design" checked={design === "T2"} onChange={() => { setDesign("T2"); setPreview(null); }} /><span><b>{tr("T2 · تصميم من CliQo")}</b><small>{tr("تشاركنا الفكرة والرابط، ونجهز التصميم للاعتماد قبل الطباعة.")}</small></span></label></fieldset>
      {design !== "T0" && <form className="custom-design-form" onSubmit={showPreview}>
        <div className="option-field"><label htmlFor="business-name">{tr("اسم النشاط")}</label><input id="business-name" name="businessName" required placeholder={tr("مثال: كافيه النيل")} /></div>
        <div className="option-field"><label htmlFor="destination-url">{tr("الرابط اللي تحب يفتح أول مرة")}</label><input id="destination-url" name="destinationUrl" type="url" required placeholder="https://example.com" dir="ltr" /></div>
        <div className="option-field"><label htmlFor="design-file">{design === "T1" ? tr("ملف التصميم الجاهز") : tr("الشعار أو مرجع التصميم")}{design === "T2" && <span>{tr("اختياري")}</span>}</label><input id="design-file" name="designFile" type="file" required={design === "T1"} accept="image/png,image/jpeg,image/webp,application/pdf" /><small>{design === "T1" ? tr("ارفع ملف الطباعة النهائي: PDF أو PNG أو JPG أو WebP.") : tr("ارفع شعارك أو مرجعًا بصريًا لو متاح.")}  {tr("الملف يُرفع بعد تسجيل الطلب من صفحة المتابعة.")}</small></div>
        <button className="button button-primary preview-button" type="submit">{tr("معاينة تفاصيل التصميم")} <span>←</span></button>
        {preview && <div className="draft-notice" role="status"><strong>{tr("تفاصيل التصميم جاهزة للسلة")}</strong><span>{tr("النشاط:")} {preview.businessName}</span><span>{tr("الرابط:")} <bdi dir="ltr">{preview.destinationUrl}</bdi></span>{preview.fileName && <span>{tr("الملف المختار:")} {preview.fileName}</span>}<small>{tr("الاسم والرابط ينضافان للأوردر؛ الملف نفسه يُرفع بأمان بعد تسجيله من صفحة المتابعة. لا يُرسل شيء قبل فتح الشراء.")}</small></div>}
      </form>}
      {design === "T0" && <p className="template-note"><b>{tr("بعد استلام القالب:")}</b>  {tr("تمسح QR لتحديد القطعة، تثبت ملكيتك بكود خاص، ثم تتبع PDF أو الفيديو لكتابة رابط القطعة على NFC واختباره.")}</p>}
      {saleSku && <div className="sale-option"><strong>{saleSku.priceEgp.toLocaleString(tr.numberLocale)}  {tr("ج.م")}</strong>{design === "T0" ? <CartAddButton skuId={saleSku.id} slug="stand" name={saleSku.displayName} priceEgp={saleSku.priceEgp} choices={[selected.label, variant, design]} optionValues={{face, variant, design}} /> : preview ? <CartAddButton skuId={saleSku.id} slug="stand" name={saleSku.displayName} priceEgp={saleSku.priceEgp} choices={[selected.label, variant, design]} optionValues={{face, variant, design}} customDesign={{ businessName: preview.businessName, destinationUrl: preview.destinationUrl }} /> : <small>{tr("اكتب اسم النشاط والرابط واعمل معاينة لإضافة التصميم المخصص للسلة.")}</small>}</div>}
      </fieldset>
    </div>
  </section>;
}
