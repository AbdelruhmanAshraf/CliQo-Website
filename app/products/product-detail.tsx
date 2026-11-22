import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getCopy} from '@/i18n/server';
import {getCatalogProduct,getCatalogProducts} from '@/lib/catalog';
import {designsForProduct} from '@/lib/catalog-designs';
import {getSaleSkus} from '@/lib/sale-skus';
import {SiteNav} from '../site-nav';
import {MarketingFooter} from '../marketing-footer';
import {ProductExperience} from './product-experience';
import {RelatedProducts} from './related-products';
import './shop-discovery.css';

export async function renderProductDetail(slug:string,initialDesign?:string){
  const tr=await getCopy();const pick=(ar:string,en:string)=>tr.locale==='ar'?ar:en;
  const product=await getCatalogProduct(slug);if(!product)notFound();
  const skus=await getSaleSkus(product.familyKey);
  const related=await getCatalogProducts();
  const name=tr.locale==='ar'?product.name:product.nameEn;
  return <><SiteNav/><main className="new-product-page"><nav className="store-breadcrumb"><Link href="/">{pick('الرئيسية','Home')}</Link><span>/</span><Link href="/products">{pick('المنتجات','Products')}</Link><span>/</span><strong>{name}</strong></nav><ProductExperience key={`${slug}-${initialDesign??'default'}`} product={product} designs={designsForProduct(product)} skus={skus} locale={tr.locale} initialDesign={initialDesign}/><RelatedProducts products={related} current={slug}/></main><MarketingFooter/></>;
}
