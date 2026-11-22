import {getCatalogProducts} from '@/lib/catalog';
import {designsForProduct} from '@/lib/catalog-designs';
import {getDesignStock} from '@/lib/design-stock';
import {requireStaff} from '@/lib/admin';
import {getDb} from '@/lib/db';
import {getCopy} from '@/i18n/server';
import {AdminShell} from '../admin-shell';
import {CatalogManager} from './product-manager';
import Image from 'next/image';
import Link from 'next/link';
import './products.css';

export const dynamic='force-dynamic';

export default async function AdminProductsPage(){
  const tr=await getCopy();const pick=(ar:string,en:string)=>tr.locale==='ar'?ar:en;
  const {staff}=await requireStaff(['owner']);
  const products=await getCatalogProducts(true);
  const [physicalStock,{rows:stockRows}]=await Promise.all([
    getDesignStock(products.map(product=>product.familyKey)),
    getDb().query<{family_key:string;available:number;ready_skus:number}>(`select f.family_key,
      coalesce(sum(greatest(coalesce(b.on_hand,0)-coalesce(b.reserved,0),0)) filter(where s.state='ready' and s.price_approved and s.sample_approved and s.fulfillment_approved),0)::int as available,
      count(s.id) filter(where s.state='ready' and s.price_approved and s.sample_approved and s.fulfillment_approved)::int as ready_skus
      from public.product_families f left join public.product_skus s on s.product_family_id=f.id
      left join public.inventory_balances b on b.sku_id=s.id group by f.family_key`),
  ]);
  const stock=Object.fromEntries(stockRows.map(row=>[row.family_key,{available:row.available,readySkus:row.ready_skus}]));
  const activeProducts=products.filter(product=>!product.deleted);
  const designs=activeProducts.flatMap(product=>designsForProduct(product).map(design=>({product,design,
    available:physicalStock.filter(row=>row.familyKey===product.familyKey&&row.face===design.face&&row.variant===design.variant).reduce((sum,row)=>sum+row.available,0)})));
  return <AdminShell staffName={staff.display_name} staffRole={staff.role}><section className="ops-content">
    <div className="ops-heading"><div><p className="ops-eyebrow">{pick('المتجر','Store')}</p><h1>{pick('المنتجات والتصاميم','Products and designs')}</h1><p>{pick('افتح أي تصميم لتعديل صفحته وصوره وسعره ومخزونه. إدارة فئات المنتجات أسفل المكتبة.','Open a design to edit its page, photos, price and stock. Product family settings are below.')}</p></div></div>
    <section className="catalog-design-library" aria-labelledby="catalog-design-library-title">
      <div className="catalog-design-library-heading"><div><h2 id="catalog-design-library-title">{pick('مكتبة التصاميم','Design library')}</h2><p>{pick(`${designs.length} تصميم للستاند والكوستر والكروت.`,`${designs.length} stand, coaster and card designs.`)}</p></div><Link href="/admin/inventory">{pick('إدارة كل المخزون ↗','Manage all inventory ↗')}</Link></div>
      {activeProducts.filter(product=>designsForProduct(product).length>0).map(product=><div className="catalog-design-family" key={product.id??product.slug}><div className="catalog-design-family-heading"><h3>{pick(product.name,product.nameEn)}</h3><span>{designsForProduct(product).length} {pick('تصاميم','designs')}</span></div><div className="catalog-design-grid">{designs.filter(item=>item.product.id===product.id).map(({design,available})=><Link className="catalog-design-tile" href={`/admin/products/${product.slug}/${design.id}`} key={design.id}>
        <Image src={design.images[0]?.src??product.images[0]} alt="" width={210} height={172} unoptimized/>
        <span className="catalog-design-tile-body"><strong>{pick(design.nameAr,design.nameEn)}</strong><small>{pick(design.categoryAr,design.categoryEn)}</small><span>{pick(`المخزون: ${available}`,`Stock: ${available}`)} <b>{pick('تعديل الصفحة ←','Edit page →')}</b></span></span>
      </Link>)}</div></div>)}
    </section>
    <section className="catalog-family-settings" aria-labelledby="catalog-family-settings-title">
      <div className="catalog-family-settings-heading"><div><h2 id="catalog-family-settings-title">{pick('إدارة المنتجات وتصنيفاتها','Products and categories')}</h2><p>{pick('اختار المنتج لمراجعة فئته وفئته الفرعية وتعديلهما. المنتجات المخفية تظل قابلة للإدارة هنا.','Select a product to review and edit its category and subcategory. Hidden products remain manageable here.')}</p></div></div>
      <CatalogManager products={products} stock={stock}/>
    </section>
  </section></AdminShell>;
}
