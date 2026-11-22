import Link from 'next/link';
import Image from 'next/image';
import {notFound} from 'next/navigation';
import {getCopy} from '@/i18n/server';
import {requireStaff} from '@/lib/admin';
import {getCatalogProduct} from '@/lib/catalog';
import {designsForProduct} from '@/lib/catalog-designs';
import {getDb} from '@/lib/db';
import {getSmartItemQrTarget} from '@/lib/smart-item-qr';
import {AdminShell} from '../../../admin-shell';
import {ReceiveStockForm} from '../../../inventory/receive-stock-form';
import {DesignEditor,DesignSkuEditor,type DesignSku} from './design-editor';
import '../../../products/products.css';

export const dynamic='force-dynamic';

export default async function AdminDesignPage({params}:{params:Promise<{slug:string;designId:string}>}){
  const [{slug,designId},tr,{staff}]=await Promise.all([params,getCopy(),requireStaff(['owner'])]);
  const product=await getCatalogProduct(slug,true);
  const design=product&&designsForProduct(product).find(item=>item.id===designId);
  if(!product?.id||product.deleted||!design)notFound();
  const pick=(ar:string,en:string)=>tr.locale==='ar'?ar:en;
  const {rows:skus}=await getDb().query<DesignSku>(`select s.id,s.sku_code,s.display_name,s.options,s.price_minor,s.price_approved,s.sample_approved,s.fulfillment_approved,s.state,
    coalesce(b.on_hand,0)::int as on_hand,coalesce(b.reserved,0)::int as reserved
    from public.product_skus s left join public.inventory_balances b on b.sku_id=s.id
    where not s.checkout_test and s.product_family_id=$1 and s.options->>'face'=$2 and s.options->>'variant'=$3
    order by s.sku_code`,[product.id,design.face,design.variant]);
  const skuIds=skus.map(sku=>sku.id);
  const {rows:pending}=skuIds.length?await getDb().query<{sku_id:string;batch_id:string;quantity:number;created_at:Date}>(
    `select sku_id,production_batch_id::text as batch_id,count(*)::int as quantity,min(created_at) as created_at
     from public.smart_items where sku_id=any($1::uuid[]) and production_batch_id is not null and state='unassigned'
       and production_planned_at is not null and owner_user_id is null and order_line_id is null and manual_handoff_reference is null
     group by sku_id,production_batch_id order by min(created_at) desc`,[skuIds]):{rows:[]};
  const {rows:legacy}=skuIds.length?await getDb().query<{sku_id:string;quantity:number}>(
    `select sku_id,count(*)::int as quantity from public.smart_items
     where sku_id=any($1::uuid[]) and production_batch_id is null and state='unassigned'
       and production_planned_at is not null and owner_user_id is null and order_line_id is null and manual_handoff_reference is null
     group by sku_id`,[skuIds]):{rows:[]};
  const stock=skus.reduce((sum,sku)=>sum+Math.max(0,sku.on_hand-sku.reserved),0);
  const image=design.images[0]?.src??product.images[0];
  return <AdminShell staffName={staff.display_name} staffRole={staff.role}><section className="ops-content catalog-design-page">
    <nav className="catalog-design-breadcrumb"><Link href="/admin/products">{pick('المنتجات والتصاميم','Products and designs')}</Link><span>/</span><span>{pick(product.name,product.nameEn)}</span></nav>
    <header className="catalog-design-page-hero">
      {image&&<Image src={image} alt="" width={168} height={168} unoptimized/>}
      <div><p className="ops-eyebrow">{pick('تعديل صفحة التصميم','Edit design page')}</p><h1>{pick(design.nameAr,design.nameEn)}</h1><p>{pick('عدّل ما يراه العميل لهذا التصميم، ثم أضف مخزونه من نفس الصفحة.','Edit what customers see for this design, then receive its stock here.')}</p><div className="catalog-design-hero-actions"><span>{pick(`المخزون الفعلي: ${stock}`,`Physical stock: ${stock}`)}</span><span>{skus.length} SKU</span><Link href={`/products/${slug}?design=${encodeURIComponent(design.id)}`} target="_blank">{pick('معاينة صفحة العميل ↗','Preview customer page ↗')}</Link></div></div>
    </header>
    <DesignEditor product={product} design={design}/>
    <section className="catalog-design-stock" aria-labelledby="catalog-design-stock-title"><div className="catalog-design-section-heading"><h2 id="catalog-design-stock-title">{pick('السعر والمخزون','Price and stock')}</h2><p>{pick('كل نسخة لها سعرها ورصيدها. إضافة المخزون لا تفتح البيع قبل اعتماد العينة والسعر والتجهيز.','Each variant has its own price and quantity. Receiving stock does not open sales before approvals.')}</p></div>
      {skus.length?<><DesignSkuEditor skus={skus}/><ReceiveStockForm skus={skus.map(sku=>({id:sku.id,name:`${sku.display_name} · ${sku.sku_code}`,image}))} pendingBatches={pending.map(row=>({skuId:row.sku_id,batchId:row.batch_id,quantity:row.quantity,createdAt:row.created_at.toISOString()}))} legacyPendingBySku={Object.fromEntries(legacy.map(row=>[row.sku_id,row.quantity]))} qrTarget={getSmartItemQrTarget()}/></>
        :<p className="catalog-design-empty">{pick('لسه مفيش صنف مربوط بالتصميم ده. أضفه من صفحة المخزون، وبعدها هتقدر تسجل الكمية هنا.','No SKU is linked to this design yet. Create one in inventory to receive stock here.')} <Link href="/admin/inventory">{pick('افتح المخزون','Open inventory')}</Link></p>}
    </section>
  </section></AdminShell>;
}
