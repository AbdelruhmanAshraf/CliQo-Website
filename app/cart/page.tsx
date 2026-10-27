import { getCopy } from '@/i18n/server';
import type { Metadata } from "next";
import { SiteNav } from "../site-nav";
import { MarketingFooter } from "../marketing-footer";
import { CartView } from "../cart-view";

export async function generateMetadata() {
  const tr = await getCopy();
  return { title: tr("السلة"), description: tr("راجع منتجات CliQo المختارة.") };
}

export default async function CartPage() {
  const tr = await getCopy();

  return <><SiteNav /><main className="st-cart-page"><header className="st-cart-heading"><p className="st-kicker">{tr("طلبك")}</p><h1>{tr("سلة CliQo")}</h1><p>{tr("راجع اختياراتك. السعر النهائي والشحن يتأكدان من قاعدة البيانات قبل تسجيل الطلب.")}</p></header><CartView /></main><MarketingFooter /></>;
}
