import { getCopy } from '@/i18n/server';
import Link from "next/link";
import type { Metadata } from "next";
import { SiteNav } from "../site-nav";
import { MarketingFooter } from "../marketing-footer";
import { getCheckoutConfig } from "@/lib/checkout";
import { CheckoutForm } from "./checkout-form";
import "./checkout.css";

export async function generateMetadata() {
  const tr = await getCopy();
  return { title: tr("استكمال الطلب | CliQo"), robots: { index: false } };
}
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const tr = await getCopy();

  const config = await getCheckoutConfig();
  return <><SiteNav /><main className="checkout-page st-checkout" >
    <header><p className="st-kicker">{tr("استكمال الطلب")}</p><h1>{tr("وصلنا لآخر خطوة.")}</h1><p>{tr("راجع الإجمالي الحقيقي، ثم اكتب بيانات التوصيل.")}</p></header>
    {config ? <CheckoutForm carrierName={config.carrierName} /> :
      <section className="checkout-closed"><h2>{tr("استقبال الطلبات لسه ما اتفتحش.")}</h2><p>{tr("هنفتح الطلب لما نعتمد أول منتج، سعر الشحن وشركة تدعم الدفع عند الاستلام.")}</p><Link className="button button-primary" href="/products">{tr("شوف المنتجات")} <span>←</span></Link></section>}
  </main><MarketingFooter /></>;
}
