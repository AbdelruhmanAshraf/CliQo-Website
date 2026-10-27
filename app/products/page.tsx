import { getCopy } from '@/i18n/server';
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { SiteNav } from "../site-nav";
import { MarketingFooter } from "../marketing-footer";
import { ProductShowcaseCard } from "../product-showcase-card";
import { products } from "@/lib/products";
import { getSaleFamilyKeys } from "@/lib/sale-skus";

export async function generateMetadata() {
  const tr = await getCopy();
  return { title: tr("المنتجات"), description: tr("اكتشف عائلة CliQo من منتجات NFC وQR الذكية.") };
}
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const tr = await getCopy();

  const saleFamilies = await getSaleFamilyKeys();
  const available = (slug: string) => saleFamilies.has(slug === "card" ? "pvc-card" : slug);
  const stand = products.find((product) => product.slug === "stand")!;

  return <><SiteNav /><main className="st-catalog">
    <section className="st-catalog-hero"><div><p className="st-kicker">{tr("مجموعة CliQo")}</p><h1>{tr("منتج ذكي لكل طريقة تواصل.")}</h1><p>{tr("من الستاند على الكاونتر إلى الكارت والميدالية: كل قطعة تفتح رابط CliQo ثابتًا عبر NFC أو QR.")}</p><a href="#catalog" className="st-button st-button-dark">{tr("استكشف المنتجات ←")}</a></div><div className="st-catalog-hero-art"><Image src="/stitch/stand-lifestyle.webp" alt={tr("تصور بصري لستاند CliQo")} fill sizes="(max-width: 800px) 100vw, 42vw" /></div></section>

    <section className="st-section st-catalog-feature"><div className="st-feature-image"><Image src="/stitch/stand.webp" alt={tr("تصور بصري لستاند الأكريليك الذكي")} fill sizes="(max-width: 800px) 100vw, 48vw" /><span>{tr("تصور بصري")}</span></div><div className="st-feature-copy"><p className="st-kicker">{tr("أول منتج قيد التجهيز")}</p><h2>{tr(stand.name)}</h2><p>{tr(stand.description)}</p><ul><li>{tr("مقاس 100 × 150 مم")}</li><li>{tr("QR فريد لكل وحدة")}</li><li>{tr("رابط الوجهة قابل للتعديل بعد التفعيل")}</li><li>{tr("قالب جاهز أو تصميم مخصص")}</li></ul><div className="st-feature-actions"><Link href="/products/stand" className="st-button st-button-orange">{tr("شوف الخيارات ←")}</Link><span>{available("stand") ? tr("متاح للطلب") : tr("الشراء يفتح بعد اعتماد العينة والتجهيز")}</span></div></div></section>

    <section className="st-section st-catalog-list" id="catalog"><div className="st-section-head"><div><p className="st-kicker">{tr("العائلة الكاملة")}</p><h2>{tr("كل منتجات CliQo")}</h2></div><p>{tr("ستة أشكال، وكل واحد له استخدام مختلف. حالة التوافر تظهر على بطاقة المنتج.")}</p></div><div className="st-product-grid">{products.map((product) => <ProductShowcaseCard key={product.slug} product={product} available={available(product.slug)} />)}</div><p className="st-concept-note">{tr("الصور تصورات بصرية لحين تصوير العينات الفعلية. لا يظهر سعر أو زر شراء حتى يتأكد توافر المنتج وشحنه.")}</p></section>

    <section className="st-catalog-custom"><div><p className="st-kicker st-kicker-light">{tr("تصميم يناسب نشاطك")}</p><h2>{tr("عايز وجه مخصص لقطعتك؟")}</h2><p>{tr("مسار التصميم المخصص يسمح لك بإرسال الرابط والتصميم وقت الطلب. CliQo تكتب رابط القطعة الثابت على NFC وتختبره قبل الشحن.")}</p></div><Link href="/how-it-works" className="st-button st-button-outline">{tr("اعرف خطوات التجهيز ←")}</Link></section>
  </main><MarketingFooter /></>;
}
