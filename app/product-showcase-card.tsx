import {InitialPrice} from '@/app/product-pricing';
import { getCopy } from '@/i18n/server';
import Image from "next/image";
import Link from "next/link";
import type { CatalogProduct } from "@/lib/catalog";
import {initialPrices} from '@/lib/launch-pricing';

export async function ProductShowcaseCard({ product, available }: { product: CatalogProduct; available: boolean }) {
  const tr = await getCopy();

  const href = `/products/${product.slug}`;
  const name=tr.locale==='ar'?product.name:product.nameEn;
  const category=tr.locale==='ar'?product.category:product.categoryEn;

  return <Link className={`st-product-card st-product-card-${product.slug}`} href={href}>
    <div className="st-product-image">
      <Image src={product.images[0]} alt={name} fill unoptimized={product.images[0].startsWith('http')} sizes="(max-width: 700px) 45vw, (max-width: 1100px) 30vw, 22vw" />
    </div>
    <div className="st-product-copy"><div className="st-product-meta"><span>{category}</span><span className={available ? "st-available" : "st-preparing"}>{available ? tr("متاح للطلب") : tr("قيد التجهيز")}</span></div><h3>{name}</h3><p>{tr.locale==='ar'?product.description:product.descriptionEn}</p>{!available && initialPrices[product.slug] && <InitialPrice slug={product.slug}/>}<small className="st-concept-badge">{tr("تصور بصري")}</small><b>{tr("اعرف التفاصيل")} <span aria-hidden="true">←</span></b></div>
  </Link>;
}
