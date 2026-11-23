"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useCopy } from "@/i18n/client";

type DesignItem = {
  familyKey: string;
  familyNameAr: string;
  familyNameEn: string;
  designId: string;
  designNameAr: string;
  designNameEn: string;
  categoryAr: string;
  categoryEn: string;
  available: number;
  image: string;
  href: string;
};

export function DesignLibrary({ items }: { items: DesignItem[] }) {
  const tr = useCopy();
  const pick = (ar: string, en: string) => tr.locale === "ar" ? ar : en;
  const [family, setFamily] = useState("all");
  const [query, setQuery] = useState("");
  const categories = useMemo(() => [...new Map(items.map((item) => [item.familyKey, tr.locale === "ar" ? item.familyNameAr : item.familyNameEn])).entries()], [items, tr.locale]);
  const filtered = items.filter((item) => {
    const text = (item.familyNameAr + " " + item.familyNameEn + " " + item.designNameAr + " " + item.designNameEn + " " + item.categoryAr + " " + item.categoryEn).toLocaleLowerCase();
    return (family === "all" || item.familyKey === family) && (!query.trim() || text.includes(query.trim().toLocaleLowerCase()));
  });
  return <section className="catalog-design-library" aria-labelledby="catalog-design-library-title">
    <header className="catalog-design-library-heading">
      <div><p className="ops-eyebrow">{pick("إدارة صفحات البيع", "Storefront management")}</p><h2 id="catalog-design-library-title">{pick("المنتجات والتصاميم", "Products and designs")}</h2><p>{pick("اختار التصميم لتعديل صفحته أو سعره ومواصفاته.", "Open a design to edit its storefront page, price and specifications.")}</p></div>
      <Link href="/cliqo-control/inventory">{pick("المخزون", "Inventory")} ↗</Link>
    </header>
    <div className="catalog-design-toolbar">
      <nav aria-label={pick("فئات المنتجات", "Product categories")}>
        <button type="button" aria-pressed={family === "all"} className={family === "all" ? "active" : ""} onClick={() => setFamily("all")}>{pick("الكل", "All")} <span>{items.length}</span></button>
        {categories.map(([key, name]) => <button type="button" key={key} aria-pressed={family === key} className={family === key ? "active" : ""} onClick={() => setFamily(key)}>{name} <span>{items.filter((item) => item.familyKey === key).length}</span></button>)}
      </nav>
      <label><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={pick("ابحث عن منتج أو تصميم", "Search product or design")} aria-label={pick("ابحث عن منتج أو تصميم", "Search product or design")} /></label>
      <strong className="catalog-design-result-count">{filtered.length} / {items.length}</strong>
    </div>
    <div className="catalog-design-list">{filtered.map((item) => <Link className="catalog-compact-design" href={item.href} key={item.href}>
      <Image src={item.image} alt="" width={88} height={68} unoptimized />
      <span className="catalog-compact-copy"><small>{tr.locale === "ar" ? item.familyNameAr : item.familyNameEn}</small><strong>{tr.locale === "ar" ? item.designNameAr : item.designNameEn}</strong><em>{tr.locale === "ar" ? item.categoryAr : item.categoryEn}</em></span>
      <span className="catalog-compact-stock"><b>{item.available}</b><small>{pick("متاح", "available")}</small></span>
      <span className="catalog-compact-edit">{pick("تعديل", "Edit")} ↗</span>
    </Link>)}
    {!filtered.length && <p className="catalog-design-no-results">{pick("مفيش تصميم مطابق للبحث.", "No designs match your search.")}</p>}</div>
  </section>;
}
