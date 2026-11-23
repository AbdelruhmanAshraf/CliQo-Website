import 'server-only';
import {getDb} from './db';
import {products, type Product} from './products';
import {cardSide,coasterPreview,isOldPrintProductImage,productPhotos,standPreview} from './product-photos';

export type CatalogDesignContent = {
  nameAr:string; nameEn:string; categoryAr:string; categoryEn:string;
  descriptionAr:string; descriptionEn:string;
  specsAr:Record<string,string>; specsEn:Record<string,string>; images:string[];
};

export type CatalogProduct = Product & {
  id?:string;
  familyKey: string;
  hasNfcQr: boolean;
  nameEn: string;
  categoryEn: string;
  descriptionEn: string;
  images: string[];
  specs: Record<string, string>;
  specsEn: Record<string, string>;
  visible: boolean;
  deleted: boolean;
  supportsLandingPage: boolean;
  saleEndsAt: string | null;
  designImages: Record<string,string[]>;
  designContent: Record<string,CatalogDesignContent>;
  subcategory: string;
  subcategoryEn: string;
  badge: string;
  badgeEn: string;
  compareAtMinor: number | null;
};

type CatalogRow = {
  id:string; family_key:string; name_ar:string; name_en:string; supports_landing_page:boolean; has_nfc_qr:boolean;
  catalog_visible:boolean; catalog_deleted_at:string|null; catalog_category_ar:string;
  catalog_category_en:string; catalog_description_ar:string; catalog_description_en:string;
  catalog_images:string[]; catalog_specs:Record<string,string>;catalog_specs_en:Record<string,string>; catalog_sale_ends_at:string|null; state:Product['status'];
  catalog_design_images:Record<string,string[]>;catalog_subcategory_ar:string;catalog_subcategory_en:string;catalog_badge_ar:string;catalog_badge_en:string;catalog_compare_at_minor:number|null;
  catalog_design_content:Record<string,CatalogDesignContent>;
};

const fallback: CatalogProduct[] = products.map((product) => ({
  ...product, familyKey:product.slug==='card'?'pvc-card':product.slug, hasNfcQr:['stand','coaster','card'].includes(product.slug),
  nameEn:({stand:'NFC Acrylic Stand',coaster:'Smart Coaster',card:'PVC Smart Card',wallet:'Smart Wallet','magnetic-wallet':'Magnetic Wallet',keychain:'NFC Keychain'} as Record<string,string>)[product.slug],
  categoryEn:({stand:'Stands',coaster:'Coasters',card:'Cards'} as Record<string,string>)[product.slug]??'In development',
  descriptionEn:product.description, images:['stand','coaster','card'].includes(product.slug)?[productPhotos[product.slug]]:[],
  specs:(product.slug==='stand'?{material:'أكريليك شفاف',size:'100 × 150 مم',connection:'NFC + QR ديناميكي'}
    :product.slug==='coaster'?{size:'120 × 120 مم',connection:'NFC + QR ديناميكي'}
    :product.slug==='card'?{material:'PVC',connection:'NFC + QR ديناميكي'}:{}) as Record<string,string>,
  specsEn:(product.slug==='stand'?{material:'Clear acrylic',size:'100 × 150 mm',connection:'NFC + dynamic QR'}
    :product.slug==='coaster'?{size:'120 × 120 mm',connection:'NFC + dynamic QR'}
    :product.slug==='card'?{material:'PVC',connection:'NFC + dynamic QR'}:{}) as Record<string,string>,
  visible:['stand','coaster','card'].includes(product.slug),deleted:false,saleEndsAt:null,
  designImages:{},designContent:{},subcategory:'',subcategoryEn:'',badge:'',badgeEn:'',compareAtMinor:null,
}));

export async function getCatalogProducts(includeHidden=false):Promise<CatalogProduct[]> {
  if (!process.env.CLIQO_DATABASE_URL) {
    if(includeHidden)throw new Error('Catalog database is unavailable.');
    return [];
  }
  try {
    const {rows}=await getDb().query<CatalogRow>(`select id,family_key,name_ar,name_en,state,supports_landing_page,has_nfc_qr,
      catalog_visible,catalog_deleted_at,catalog_category_ar,catalog_category_en,
      catalog_description_ar,catalog_description_en,catalog_images,catalog_specs,catalog_specs_en,catalog_sale_ends_at,
      catalog_design_images,catalog_design_content,catalog_subcategory_ar,catalog_subcategory_en,catalog_badge_ar,catalog_badge_en,catalog_compare_at_minor
      from public.product_families order by sort_order,name_ar`);
    return rows.map(row=>{
      const slug=row.family_key==='pvc-card'?'card':row.family_key;
      const base=fallback.find(p=>p.slug===slug);
      const savedImages=row.catalog_images?.filter(Boolean)??[];
      const currentImages=savedImages.filter(src=>!isOldPrintProductImage(slug,src));
      const images=currentImages.length!==savedImages.length
        ? [...new Set([...currentImages,productPhotos[slug],
          slug==='card'?cardSide('main-black','front'):(slug==='stand'?standPreview:coasterPreview)('all-in-one')])]
        : savedImages;
      return {
        id:row.id,slug, familyKey:row.family_key,hasNfcQr:row.has_nfc_qr,name:row.name_ar,nameEn:row.name_en,
        shortName:base?.shortName??row.name_en,category:row.catalog_category_ar||base?.category||'',
        categoryEn:row.catalog_category_en||base?.categoryEn||'',
        statusLabel:base?.statusLabel??'قيد التجهيز',status:row.state==='ready'?'ready':'preparing',
        visual:base?.visual??'',description:row.catalog_description_ar||base?.description||'',
        descriptionEn:row.catalog_description_en||base?.descriptionEn||'',
        supportsLandingPage:row.supports_landing_page,priceEgp:null,
        images,specs:row.catalog_specs??{},specsEn:row.catalog_specs_en??{},
        visible:row.catalog_visible,deleted:Boolean(row.catalog_deleted_at),saleEndsAt:row.catalog_sale_ends_at?new Date(row.catalog_sale_ends_at).toISOString():null,
        designImages:row.catalog_design_images??{},designContent:row.catalog_design_content??{},subcategory:row.catalog_subcategory_ar??'',subcategoryEn:row.catalog_subcategory_en??'',
        badge:row.catalog_badge_ar??'',badgeEn:row.catalog_badge_en??'',compareAtMinor:row.catalog_compare_at_minor,
      } satisfies CatalogProduct;
    }).filter(p=>includeHidden||p.visible&&!p.deleted&&p.images.length>0);
  } catch(error) {
    if(includeHidden)throw error;
    return [];
  }
}

export async function getCatalogProduct(slug:string, includeHidden=false) {
  return (await getCatalogProducts(includeHidden)).find(p=>p.slug===slug);
}
