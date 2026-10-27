import { getCopy } from '@/i18n/server';
import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/products";
import { productPhotos } from "@/lib/product-photos";

export async function ProductShowcaseCard({ product, available }: { product: Product; available: boolean }) {
  const tr = await getCopy();

  const href = product.slug === "stand" ? "/products/stand" : `/products/${product.slug}`;

  return <Link className="st-product-card" href={href}>
    <div className="st-product-image">
      <Image src={productPhotos[product.slug]} alt={tr("تصور بصري لمنتج {value0}", {value0: tr(product.name)})} fill sizes="(max-width: 700px) 45vw, (max-width: 1100px) 30vw, 22vw" />
      <span className={available ? "st-available" : "st-preparing"}>{available ? tr("متاح للطلب") : tr(product.statusLabel)}</span>
      <small className="st-concept-badge">{tr("تصور بصري")}</small>
    </div>
    <div className="st-product-copy"><span>{tr(product.category)}</span><h3>{tr(product.name)}</h3><p>{tr(product.description)}</p><b>{tr("اعرف التفاصيل")} <span aria-hidden="true">←</span></b></div>
  </Link>;
}
