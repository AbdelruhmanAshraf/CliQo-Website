"use client";

import Image from "next/image";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useCopy } from "@/i18n/client";
import { prepareBulkPrintBatch } from "./actions";

type ProductionSku = { id: string; sku_code: string; name: string; category: string; options: Record<string, string>; image: string; hasTemplate: boolean };
function newBatchId() {
  return crypto.randomUUID();
}

export function BulkProductionOrder({ skus }: { skus: ProductionSku[] }) {
  const tr = useCopy();
  const pick = (ar: string, en: string) => tr.locale === "ar" ? ar : en;
  const router = useRouter();
  const [family, setFamily] = useState("all");
  const [query, setQuery] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const [pendingBatchId, setPendingBatchId] = useState<string | null>(null);
  const [latestBatch, setLatestBatch] = useState<{ id: string; count: number } | null>(null);
  const families = useMemo(() => [...new Set(skus.map((sku) => sku.category))], [skus]);
  const filtered = skus.filter((sku) => (family === "all" || sku.category === family)
    && (!query.trim() || (sku.name + " " + sku.sku_code + " " + Object.values(sku.options).join(" ")).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const total = Object.values(quantities).reduce((sum, value) => sum + Math.max(0, value || 0), 0);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (total < 1 || total > 50) {
      setNotice(pick("اختار كمية من ١ إلى ٥٠ قطعة.", "Choose between 1 and 50 units."));
      return;
    }
    const lines = Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([skuId, quantity]) => ({ skuId, quantity }));
    const batchId = pendingBatchId ?? newBatchId();
    setPendingBatchId(batchId);
    setNotice("");
    startTransition(async () => {
      const result = await prepareBulkPrintBatch(batchId, lines);
      setNotice(result.message);
      if (result.ok && result.batchId) {
        setLatestBatch({ id: result.batchId, count: result.quantity ?? total });
        setPendingBatchId(null);
        router.refresh();
      }
    });
  }

  return <section className="bulk-production-panel" aria-labelledby="bulk-production-title">
    <header><div><p className="ops-eyebrow">{pick("طلب تصنيع", "Production order")}</p><h2 id="bulk-production-title">{pick("جهّز طلبية متعددة الأصناف", "Build a mixed SKU order")}</h2><p>{pick("حدد كمية كل تصميم. ستحصل على ZIP مرتب حسب الفئة ثم SKU ثم كل قطعة. الطلبية لا تزيد المخزون قبل استلام المصنع.", "Set a quantity for each design. Download a ZIP organized by category, SKU and unit. Stock increases only after receipt.")}</p></div><strong>{total}<small> / 50</small></strong></header>
    {!skus.length ? <p className="bulk-production-empty">{pick("لا توجد أصناف لها قالب طباعة جاهز.", "No SKUs have an active print template.")}</p> : <form onSubmit={submit}>
      <div className="bulk-production-toolbar">
        <nav aria-label={pick("فئات الطلبية", "Production categories")}>
          <button type="button" className={family === "all" ? "active" : ""} aria-pressed={family === "all"} onClick={() => setFamily("all")}>{pick("الكل", "All")} <span>{skus.length}</span></button>
          {families.map((name) => <button key={name} type="button" className={family === name ? "active" : ""} aria-pressed={family === name} onClick={() => setFamily(name)}>{name}<span>{skus.filter((sku) => sku.category === name).length}</span></button>)}
        </nav>
        <label><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={pick("ابحث بالمنتج أو SKU", "Search product or SKU")} aria-label={pick("ابحث بالمنتج أو SKU", "Search product or SKU")} /></label>
      </div>
      <div className="bulk-production-list">
        {filtered.map((sku) => <label key={sku.id} className="bulk-production-row">
          <Image src={sku.image} alt="" width={50} height={44} unoptimized />
          <span><strong>{sku.name}</strong><small dir="ltr">{sku.sku_code} · {Object.values(sku.options).join(" · ")}</small>{!sku.hasTemplate && <small className="bulk-production-template-warning">{pick("قالب الطباعة غير مربوط · ZIP يحتوي QR فقط", "No print template · ZIP contains QR only")}</small>}</span>
          <span className="bulk-production-unit">{pick("قطعة", "units")}</span>
          <input aria-label={pick("كمية", "Quantity") + " " + sku.name} type="number" min={0} max={50} inputMode="numeric" value={quantities[sku.id] ?? 0} onChange={(event) => {
            const value = Math.max(0, Math.min(50, Number(event.target.value || 0)));
            setQuantities((current) => ({ ...current, [sku.id]: value }));
          }} />
        </label>)}
        {!filtered.length && <p className="bulk-production-empty">{pick("مفيش صنف مطابق للبحث.", "No SKUs match your search.")}</p>}
      </div>
      <footer><span>{pick("سيُحفظ QR لكل قطعة، ولن يظهر كود التفعيل في ملف المصنع.", "Each unit gets a unique QR. Private activation codes stay out of the factory ZIP.")}</span><button type="submit" disabled={pending || total < 1 || total > 50}>{pending ? pick("جاري تجهيز الطلبية…", "Preparing order…") : pick("احفظ الطلبية ونزّل ZIP", "Save order and download ZIP")}</button></footer>
      {notice && <p className="bulk-production-notice" role="status">{notice}</p>}
      {latestBatch && <a className="bulk-production-download" href={"/admin/items/qr-batch?batch=" + latestBatch.id} download>{pick("نزّل ZIP الطلبية", "Download production ZIP")} · {latestBatch.count} {pick("قطعة", "units")} ↓</a>}
    </form>}
  </section>;
}
