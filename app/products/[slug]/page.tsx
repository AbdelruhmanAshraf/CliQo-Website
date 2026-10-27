import { getCopy } from '@/i18n/server';
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "../../site-nav";
import { MarketingFooter } from "../../marketing-footer";
import { getProduct } from "../../../lib/products";
import { CartAddButton } from "../../cart-add-button";
import { getSaleSkus } from "@/lib/sale-skus";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const tr = await getCopy();
  const { slug } = await params;
  const product = getProduct(slug);
  return product ? { title: tr(product.name), description: tr(product.description) } : { title: tr("المنتج غير متاح") };
}

export default async function ProductDetail({ params }: { params: Promise<{ slug: string }> }) {
  const tr = await getCopy();

  const { slug } = await params;
  const product = getProduct(slug);
  if (!product || product.slug === "stand") notFound();
  const saleSkus = await getSaleSkus(slug === "card" ? "pvc-card" : slug);
  return <><SiteNav /><main className="product-page"><section className="product-detail-hero"><div><p className="section-kicker"><span>CliQo</span> {tr(product.category)}</p><h1>{tr(product.name)}<br /><em>{tr("على طريقتك.")}</em></h1><p>{tr(product.description)}</p><div className="product-detail-actions"><span className="product-status large">{saleSkus.length ? tr("متاح للطلب") : tr(product.statusLabel) + " · " + tr("· السعر قيد الاعتماد")}</span><Link className="text-under" href="/products">{tr("كل المنتجات")} <b>←</b></Link></div>{saleSkus.map((sku) => <div className="sale-option" key={sku.id}><span>{sku.displayName} · {sku.priceEgp.toLocaleString(tr.numberLocale)}  {tr("ج.م")}</span><CartAddButton skuId={sku.id} slug={product.slug} name={sku.displayName} priceEgp={sku.priceEgp} choices={Object.values(sku.options).map(String)} optionValues={sku.options} /></div>)}</div><div className="detail-product-art"><div className={`product-illustration ${product.visual}`}><span className="illustration-mark">C<span>↗</span></span><span className="illustration-label">{product.shortName}</span></div><span className="detail-art-note">{tr("تصور واجهة المنتج · العينة قيد التجهيز")}</span></div></section><section className="product-detail-info"><p className="section-kicker"><span>01</span>  {tr("تجربة CliQo")}</p><h2>{tr("قطعتك تفتح")}<br />{tr("الخطوة اللي بعدها.")}</h2><div className="info-columns"><p>{tr("كل قطعة ذكية لها QR فريد يفتح رابط CliQo ثابت. تعدّل وجهة الرابط من حسابك من غير تغيير الكود المطبوع.")}</p><p>{product.supportsLandingPage ? tr("يدعم المنتج صفحة روابط قابلة للتحرير. استخدم نفس الصفحة مع قطعك الأخرى أو خصص صفحة لكل قطعة.") : tr("قالب المخزون يتفعل بكود خاص، وبعدها تقدر تضبط وجهته وتكتب رابط القطعة على NFC بنفسك من الإرشادات.")}</p></div><Link href="/how-it-works" className="dark-link">{tr("اعرف خطوات التفعيل")} <span>←</span></Link></section><section className="product-notice"><p>{saleSkus.length ? tr("اختار النسخة المناسبة وأضفها للسلة.") : tr("الشراء يفتح بعد اعتماد العينة والسعر والتوافر.")}</p><Link href="/products">{tr("ارجع لكل المنتجات")} <b>←</b></Link></section></main><MarketingFooter /></>;
}
