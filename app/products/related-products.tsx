import Image from 'next/image';
import Link from 'next/link';
import {getCopy} from '@/i18n/server';
import type {CatalogProduct} from '@/lib/catalog';
import {designsForProduct} from '@/lib/catalog-designs';

export async function RelatedProducts({products,current}:{products:CatalogProduct[];current:string}){
  const tr=await getCopy();const ar=tr.locale==='ar';
  const picks=products.filter(product=>product.slug!==current&&!product.deleted).slice(0,3);
  if(!picks.length)return null;
  return <section className="store-related-products"><div><span className="store-eyebrow">CLIQO / MORE</span><h2>{ar?'ممكن يناسبك كمان':'You may also like'}</h2><p>{ar?'اختيارات إضافية لنشاطك، شوف الصور والتفاصيل.':'More ways to connect with your customers.'}</p></div><div className="store-related-grid">{picks.map(product=>{const design=designsForProduct(product)[0];const image=design?.images.find(item=>item.kind==='mockup')?.src??design?.images[0]?.src??product.images[0];return <Link key={product.slug} href={`/products/${product.slug}`}>{image&&<Image src={image} alt="" width={260} height={200} unoptimized={image.startsWith('http')}/>}<span><small>{ar?product.category:product.categoryEn}</small><strong>{ar?product.name:product.nameEn}</strong><b>{ar?'اعرف التفاصيل ←':'Explore →'}</b></span></Link>;})}</div></section>;
}
