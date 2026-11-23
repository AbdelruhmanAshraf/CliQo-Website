import Image from 'next/image';
import Link from 'next/link';
import { LuArrowUpRight, LuX } from 'react-icons/lu';
import { getCopy } from '@/i18n/server';
import { getCatalogProducts, type CatalogProduct } from '@/lib/catalog';
import { designsForProduct, type CatalogDesign } from '@/lib/catalog-designs';
import { getSaleSkus, type SaleSku } from '@/lib/sale-skus';
import { SiteNav } from '../site-nav';
import { MarketingFooter } from '../marketing-footer';
import { CatalogFilters } from './catalog-filters';
import { catalogFaces, catalogHref, catalogUses, matchesCatalog, type CatalogFacet } from './catalog-options';
import './shop-discovery.css';

type DesignCard = {
  product: CatalogProduct;
  designs: CatalogDesign[];
  facet: CatalogFacet;
};

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const { locale } = await getCopy();
  return {
    title: locale === 'ar' ? 'المنتجات' : 'Products',
    description: locale === 'ar' ? 'منتجات CliQo الذكية وتصميماتها.' : 'CliQo smart products and designs.',
  };
}

function expandProducts(products: CatalogProduct[], ar: boolean): DesignCard[] {
  return products.flatMap(product => {
    const groups = new Map<string, CatalogDesign[]>();
    for (const design of designsForProduct(product)) {
      groups.set(design.group, [...(groups.get(design.group) ?? []), design]);
    }
    if (!groups.size) groups.set('', []);
    return Array.from(groups.values(), designs => {
      const design = designs[0];
      return {
        product,
        designs,
        facet: {
          family: product.slug,
          use: design?.categoryAr ?? product.category,
          useLabel: ar ? design?.categoryAr ?? product.category : design?.categoryEn ?? product.categoryEn,
          face: design?.group ?? '',
          faceLabel: ar ? design?.nameAr : design?.nameEn,
        },
      };
    });
  });
}

function CatalogCard({ card, skus, ar }: { card: DesignCard; skus: SaleSku[]; ar: boolean }) {
  const t = (arabic: string, english: string) => ar ? arabic : english;
  const { product, designs } = card;
  const design = designs[0];
  const family = ar ? product.name : product.nameEn;
  const designName = ar ? design?.nameAr : design?.nameEn;
  const title = design?.face === 'default' || designName === family
    ? family
    : designName?.startsWith('كارت') || designName?.endsWith('Card')
    ? designName
    : [family, designName].filter(Boolean).join(' · ');
  const image = design?.images[0]?.src ?? product.images[0];
  const minimumPrice = skus.reduce<number | undefined>((price, sku) => {
    const ready = !sku.options.design || sku.options.design === 'T0';
    const validDesign = !design || !sku.options.face || (design.face === 'default'
      ? sku.options.face === 'default'
      : designs.some(item => sku.options.face === item.face
        && (!sku.options.variant || sku.options.variant === item.variant)));
    return ready && validDesign ? Math.min(price ?? sku.priceEgp, sku.priceEgp) : price;
  }, undefined);
  const format = (amount: number) => `${new Intl.NumberFormat(ar ? 'ar-EG' : 'en-EG').format(amount)} ${t('ج.م', 'EGP')}`;
  const href = `/products/${product.slug}${design ? `?design=${encodeURIComponent(design.id)}` : ''}`;
  const saleEnded = Boolean(product.saleEndsAt && Date.parse(product.saleEndsAt) <= Date.now());
  const badge = ar ? product.badge : product.badgeEn || product.badge;

  return (
    <Link className={`shop-card shop-card--${product.slug}`} href={href}>
      <div className="shop-card-photo">
        {image ? (
          <Image src={image} alt="" fill sizes="(max-width: 700px) 48vw, (max-width: 1020px) 32vw, 25vw" unoptimized={image.startsWith('http')} />
        ) : <span>CliQo</span>}
        {badge && <span className="shop-card-badge">{badge}</span>}
      </div>
      <div className="shop-card-body">
        <h2>{title}</h2>
        {designs.length > 1 && <span className="shop-card-finishes">{designs.length} {t('نسخ', 'finishes')}</span>}
        <div className="shop-card-bottom">
          <span>
            {minimumPrice !== undefined ? (
              <>
                {product.compareAtMinor && product.compareAtMinor > minimumPrice * 100
                  ? <del>{format(product.compareAtMinor / 100)}</del>
                  : null}
                <strong>{format(minimumPrice)}</strong>
              </>
            ) : saleEnded ? t('انتهت فترة الإتاحة', 'Sale window ended') : t('قيد الاعتماد', 'Approval pending')}
          </span>
          <LuArrowUpRight aria-hidden="true" />
        </div>
      </div>
    </Link>
  );
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ locale }, products, params] = await Promise.all([getCopy(), getCatalogProducts(), searchParams]);
  const ar = locale === 'ar';
  const t = (arabic: string, english: string) => ar ? arabic : english;
  const cards = expandProducts(products, ar);
  const facets = cards.map(card => card.facet);
  const families = products.map(product => ({ value: product.slug, label: ar ? product.name : product.nameEn }));
  const selectedFamily = families.find(option => option.value === params.family);
  const family = selectedFamily?.value ?? '';
  const selectedUse = catalogUses(facets, family).find(option => option.value === params.use);
  const use = selectedUse?.value ?? '';
  const selectedFace = catalogFaces(facets, family, use).find(option => option.value === params.face);
  const selection = { family, use, face: selectedFace?.value ?? '' };
  const filtered = cards.filter(card => matchesCatalog(selection, card.facet));
  const filteredProducts = Array.from(new Set(filtered.map(card => card.product.familyKey)));
  const saleSkus = new Map(await Promise.all(filteredProducts.map(async key => [key, await getSaleSkus(key)] as const)));
  const title = [selectedFamily?.label, selectedUse?.label].filter(Boolean).join(' · ') || t('تصميمات CliQo', 'CliQo designs');
  const quickFamilies = [{ value: '', label: t('كل القطع', 'All products') }, ...families];
  const showCollections = products.length > 1 && !family && !use && !selectedFace;

  return (
    <>
      <SiteNav />
      <main className="new-catalog shop-catalog">
        <nav className="store-breadcrumb" aria-label={t('مسار الصفحة', 'Breadcrumb')}>
          <Link href="/">{t('الرئيسية', 'Home')}</Link><span>/</span><strong>{t('المنتجات', 'Products')}</strong>
        </nav>
        <header className="shop-catalog-heading">
          <h1>{title}</h1>
          {!family && !use && <p>{t('اختار القطعة والتصميم المناسبين لاستخدامك.', 'Find the right product and design for what you do.')}</p>}
        </header>
        {showCollections ? (
          <nav className="shop-collection-links" aria-label={t('تصفّح حسب نوع القطعة', 'Browse by product type')}>
            {products.map(product => {
              const groupCards = cards.filter(card => card.product.slug === product.slug);
              const cover = groupCards.find(card => card.designs[0]?.face === 'all-in-one')?.designs[0]?.images[0]?.src ?? product.images[0];
              return (
                <Link key={product.slug} href={catalogHref({ family: product.slug })}>
                  <span className="shop-collection-thumbnail">
                    {cover && <Image src={cover} alt="" fill sizes="(max-width: 700px) 28vw, 120px" unoptimized={cover.startsWith('http')} />}
                  </span>
                  <span className="shop-collection-caption">
                    <strong>{ar ? product.name : product.nameEn}</strong>
                    <small>{groupCards.length} {t('تصميم', groupCards.length === 1 ? 'design' : 'designs')}</small>
                  </span>
                  <LuArrowUpRight aria-hidden="true" />
                </Link>
              );
            })}
          </nav>
        ) : (
          <nav className="shop-family-tabs" aria-label={t('تصفّح حسب نوع القطعة', 'Browse by product type')}>
            {quickFamilies.map(option => {
              const keepUse = catalogUses(facets, option.value).some(item => item.value === use);
              const href = catalogHref({ family: option.value, use: keepUse ? use : '' });
              return (
                <Link key={option.value} href={href} scroll={false} aria-current={family === option.value ? 'true' : undefined}>
                  {option.label}
                </Link>
              );
            })}
          </nav>
        )}
        <div className="shop-filter-bar">
          <span role="status">{filtered.length} {t('تصميم', filtered.length === 1 ? 'design' : 'designs')}</span>
          <CatalogFilters selection={selection} families={families} facets={facets} arabic={ar} />
        </div>
        {(selectedUse || selectedFace) && (
          <div className="shop-filter-chips" aria-label={t('الفلاتر المختارة', 'Active filters')}>
            {selectedUse && (
              <Link href={catalogHref({ family })} scroll={false} aria-label={t(`مسح فلتر ${selectedUse.label}`, `Remove ${selectedUse.label} filter`)}>
                {selectedUse.label}<LuX aria-hidden="true" />
              </Link>
            )}
            {selectedFace && (
              <Link href={catalogHref({ family, use })} scroll={false} aria-label={t(`مسح فلتر ${selectedFace.label}`, `Remove ${selectedFace.label} filter`)}>
                {selectedFace.label}<LuX aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
        {filtered.length ? (
          <div className="shop-card-grid">
            {filtered.map(card => <CatalogCard key={`${card.product.slug}-${card.facet.face}`} card={card} skus={saleSkus.get(card.product.familyKey) ?? []} ar={ar} />)}
          </div>
        ) : (
          <section className="shop-catalog-empty">
            <h2>{t('مفيش تصميمات في الاختيار ده', 'No designs in this selection')}</h2>
            <Link href="/products">{t('شوف كل المنتجات', 'Browse all products')}</Link>
          </section>
        )}
        {filtered.length > 0 && (
          <p className="shop-catalog-note">
            {t('الصور استرشادية. أكواد QR المصوّرة للمعاينة.', 'Images are illustrative. Pictured QR graphics are for preview.')}
          </p>
        )}
      </main>
      <MarketingFooter />
    </>
  );
}
