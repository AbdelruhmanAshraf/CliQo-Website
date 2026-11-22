import { getCopy } from '@/i18n/server';
import Link from "next/link";
import type { Metadata } from "next";
import { SiteNav } from "../site-nav";
import { MarketingFooter } from "../marketing-footer";
import { getCheckoutConfig } from "@/lib/checkout";
import { CheckoutForm } from "./checkout-form";
import {getCatalogProducts} from '@/lib/catalog';
import {designsForProduct} from '@/lib/catalog-designs';
import {getSaleSkus} from '@/lib/sale-skus';
import "./checkout.css";

export async function generateMetadata() {
  const tr = await getCopy();
  return { title: tr("استكمال الطلب | CliQo"), robots: { index: false } };
}
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const tr = await getCopy();
  const products=await getCatalogProducts();
  const suggestions=(await Promise.all(products.filter(product=>['stand','coaster'].includes(product.slug)).map(async product=>{
    const sku=(await getSaleSkus(product.familyKey)).find(item=>item.options.design==='T0'&&item.available>0);
    if(!sku)return null;
    return {skuId:sku.id,slug:product.slug,name:tr.locale==='ar'?product.name:product.nameEn,priceEgp:sku.priceEgp,available:sku.available,image:designsForProduct(product)[0]?.images[0]?.src??product.images[0],choices:[sku.displayName],optionValues:sku.options};
  }))).filter((item):item is NonNullable<typeof item>=>item!==null);

  const config = await getCheckoutConfig();
  return <><SiteNav /><main className="checkout-page st-checkout" >
    <header><p className="st-kicker">{tr("استكمال الطلب")}</p><h1>{tr("وصلنا لآخر خطوة.")}</h1><p>{tr("راجع الإجمالي الحقيقي، ثم اكتب بيانات التوصيل.")}</p></header>
    {config ? <CheckoutForm carrierName={config.carrierName} suggestions={suggestions} testMode={config.testMode} /> :
      <section className="checkout-closed"><h2>{tr("استقبال الطلبات لسه ما اتفتحش.")}</h2><p>{tr("هنفتح الطلب بعد اعتماد المنتج والسعر والشحن وطريقة الدفع.")}</p><Link className="button button-primary" href="/products">{tr("شوف المنتجات")} <span>←</span></Link></section>}
  </main><MarketingFooter /></>;
}
