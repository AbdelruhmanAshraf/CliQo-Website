'use server';
import {revalidatePath} from 'next/cache';
import {requireStaff} from '@/lib/admin';
import {getDb} from '@/lib/db';
import {catalogDesigns} from '@/lib/catalog-designs';
import type {CatalogDesignContent} from '@/lib/catalog';

const slugPattern=/^[a-z0-9][a-z0-9-]{1,39}$/;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i;
type ProductInput={id?:string;slug:string;nameAr:string;nameEn:string;categoryAr:string;categoryEn:string;subcategoryAr:string;subcategoryEn:string;badgeAr:string;badgeEn:string;compareAtMinor:number|null;designImages:Record<string,string[]>;descriptionAr:string;descriptionEn:string;images:string[];specs:Record<string,string>;specsEn:Record<string,string>;visible:boolean;supportsLandingPage:boolean;hasNfcQr:boolean;saleEndsAt:string|null};
type Result={ok:boolean;message:string};
const allowedImage=(src:string)=>src.startsWith('/products/')&&/\.(webp|png|jpe?g)$/i.test(src)||
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&src.startsWith(process.env.NEXT_PUBLIC_SUPABASE_URL+'/storage/v1/object/public/catalog-images/')&&/\.(webp|png|jpe?g)$/i.test(src));
function validate(input:ProductInput):string|null {
  if(typeof input.hasNfcQr!=='boolean')return 'حدد إذا كان المنتج يدعم NFC وQR.';
  if(!slugPattern.test(input.slug))return 'اسم الرابط لازم يكون حروف إنجليزية صغيرة وأرقام وشرطات فقط.';
  if(!input.nameAr.trim()||!input.nameEn.trim()||input.nameAr.length>100||input.nameEn.length>100)return 'اكتب اسم المنتج بالعربي والإنجليزي.';
  if(input.descriptionAr.length>1000||input.descriptionEn.length>1000||input.categoryAr.length>80||input.categoryEn.length>80)return 'نص المنتج أطول من المسموح.';
  if(input.images.length>12||input.images.some(src=>!allowedImage(src)))return 'الصور يجب أن تكون من ملفات منتجات CliQo أو الصور المرفوعة من لوحة الإدارة.';
  if([input.subcategoryAr,input.subcategoryEn,input.badgeAr,input.badgeEn].some(value=>value.length>80))return 'التصنيف الفرعي أو البادج أطول من المسموح.';
  if(input.compareAtMinor!==null&&(!Number.isSafeInteger(input.compareAtMinor)||input.compareAtMinor<=0))return 'السعر السابق غير صالح.';
  const allowedIds=new Set((catalogDesigns[input.slug]??[]).map(design=>design.id));
  if(Object.entries(input.designImages).some(([id,images])=>!allowedIds.has(id)||!Array.isArray(images)||images.length>8||images.some(src=>typeof src!=='string'||!allowedImage(src))))return 'راجع صور التصميمات.';
  if(input.visible&&input.images.length<2)return 'المنتج المنشور يحتاج صورتين على الأقل.';
  if([input.specs,input.specsEn].some(spec=>Object.entries(spec).length>12||Object.entries(spec).some(([k,v])=>k.length>40||v.length>160)))return 'راجع المواصفات: ١٢ بندًا بحد أقصى.';
  if(input.saleEndsAt&&(!Number.isFinite(Date.parse(input.saleEndsAt))||Date.parse(input.saleEndsAt)<=Date.now()))return 'اختار موعد إتاحة مستقبلي أو اتركه فارغًا.';
  return null;
}
function refresh(){revalidatePath('/');revalidatePath('/products');revalidatePath('/products/[slug]','page');revalidatePath('/admin/products');}
export async function saveCatalogDesign(input:{familyId:string;slug:string;designId:string;content:CatalogDesignContent}):Promise<Result>{
  await requireStaff(['owner']);
  if(!input||typeof input.slug!=='string'||typeof input.designId!=='string'||typeof input.familyId!=='string')
    return {ok:false,message:'بيانات التصميم غير صالحة.'};
  const designs=catalogDesigns[input.slug]??[];
  const design=designs.find(item=>item.id===input.designId);
  const genericDesign=designs.length===0&&input.designId===`${input.slug}-default`&&slugPattern.test(input.slug);
  const content=input.content;
  if(!uuidPattern.test(input.familyId)||(!design&&!genericDesign))return {ok:false,message:'التصميم غير موجود.'};
  const textFields=[content?.nameAr,content?.nameEn,content?.categoryAr,content?.categoryEn,content?.descriptionAr,content?.descriptionEn];
  if(!content||textFields.some(value=>typeof value!=='string')
    ||[content.nameAr,content.nameEn,content.categoryAr,content.categoryEn].some(value=>!value.trim()||value.length>100)
    ||[content.descriptionAr,content.descriptionEn].some(value=>value.length>1000))
    return {ok:false,message:'راجع اسم التصميم وتصنيفه ووصفه بالعربي والإنجليزي.'};
  if(!Array.isArray(content.images)||content.images.length<1||content.images.length>12
    ||content.images.some(src=>typeof src!=='string'||!allowedImage(src)))
    return {ok:false,message:'احتفظ بصورة واحدة على الأقل، وبحد أقصى ١٢ صورة للتصميم.'};
  if([content.specsAr,content.specsEn].some(spec=>!spec||typeof spec!=='object'||Array.isArray(spec)
    ||Object.entries(spec).length>12||Object.entries(spec).some(([key,value])=>key.length>40||typeof value!=='string'||value.length>160)))
    return {ok:false,message:'راجع مواصفات التصميم: ١٢ بندًا بحد أقصى.'};
  const familyKey=input.slug==='card'?'pvc-card':input.slug;
  try{
    const result=await getDb().query(`update public.product_families
      set catalog_design_content=jsonb_set(catalog_design_content,array[$3]::text[],$4::jsonb,true)
      where id=$1 and family_key=$2 and catalog_deleted_at is null returning id`,
      [input.familyId,familyKey,input.designId,JSON.stringify({
        ...content,nameAr:content.nameAr.trim(),nameEn:content.nameEn.trim(),
        categoryAr:content.categoryAr.trim(),categoryEn:content.categoryEn.trim(),
        descriptionAr:content.descriptionAr.trim(),descriptionEn:content.descriptionEn.trim(),
      })]);
    if(!result.rowCount)return {ok:false,message:'المنتج غير موجود أو مؤرشف.'};
    refresh();revalidatePath(`/admin/products/${input.slug}/${input.designId}`);
    return {ok:true,message:'تم حفظ صفحة التصميم.'};
  }catch{return {ok:false,message:'تعذر حفظ صفحة التصميم.'};}
}
export async function saveCatalogProduct(input:ProductInput):Promise<Result>{
  await requireStaff(['owner']);
  const error=validate(input);if(error)return {ok:false,message:error};
  const db=getDb();
  try{
    if(input.id){
      if(!uuidPattern.test(input.id))return {ok:false,message:'معرّف المنتج غير صالح.'};
      const result=await db.query(`update public.product_families set name_ar=$2,name_en=$3,catalog_category_ar=$4,catalog_category_en=$5,
        catalog_description_ar=$6,catalog_description_en=$7,catalog_images=$8,catalog_specs=$9::jsonb,catalog_specs_en=$12::jsonb,
        catalog_visible=$10,supports_landing_page=$11,catalog_sale_ends_at=$13::timestamptz,
        catalog_design_images=$14::jsonb,catalog_subcategory_ar=$15,catalog_subcategory_en=$16,
        catalog_badge_ar=$17,catalog_badge_en=$18,catalog_compare_at_minor=$19,has_nfc_qr=$20,
        state=case when $10 then case when exists(select 1 from public.product_skus s where s.product_family_id=$1 and s.state='ready') then 'ready'::public.product_state else 'preparing'::public.product_state end else 'paused'::public.product_state end
        where id=$1 and catalog_deleted_at is null and (has_nfc_qr=$20 or not exists(select 1 from public.product_skus s where s.product_family_id=$1)) returning id`,
        [input.id,input.nameAr.trim(),input.nameEn.trim(),input.categoryAr.trim(),input.categoryEn.trim(),input.descriptionAr.trim(),input.descriptionEn.trim(),input.images,JSON.stringify(input.specs),input.visible,input.supportsLandingPage,JSON.stringify(input.specsEn),input.saleEndsAt,JSON.stringify(input.designImages),input.subcategoryAr.trim(),input.subcategoryEn.trim(),input.badgeAr.trim(),input.badgeEn.trim(),input.compareAtMinor,input.hasNfcQr]);
      if(!result.rowCount)return {ok:false,message:'المنتج غير موجود أو لا يمكن تغيير NFC بعد إنشاء أصناف له.'};
    }else{
      await db.query(`insert into public.product_families(family_key,name_ar,name_en,state,sort_order,catalog_category_ar,catalog_category_en,has_nfc_qr,
        catalog_description_ar,catalog_description_en,catalog_images,catalog_specs,catalog_specs_en,catalog_visible,supports_landing_page,catalog_sale_ends_at,
        catalog_design_images,catalog_subcategory_ar,catalog_subcategory_en,catalog_badge_ar,catalog_badge_en,catalog_compare_at_minor)
        values($1,$2,$3,'planned',(select coalesce(max(sort_order),0)+1 from public.product_families),$4,$5,$6,$7,$8,$9,$10::jsonb,$13::jsonb,$11,$12,$14::timestamptz,$15::jsonb,$16,$17,$18,$19,$20)`,
        [input.slug,input.nameAr.trim(),input.nameEn.trim(),input.categoryAr.trim(),input.categoryEn.trim(),input.hasNfcQr,input.descriptionAr.trim(),input.descriptionEn.trim(),input.images,JSON.stringify(input.specs),input.visible,input.supportsLandingPage,JSON.stringify(input.specsEn),input.saleEndsAt,JSON.stringify(input.designImages),input.subcategoryAr.trim(),input.subcategoryEn.trim(),input.badgeAr.trim(),input.badgeEn.trim(),input.compareAtMinor]);
    }
    refresh();return {ok:true,message:'تم حفظ المنتج.'};
  }catch(err){return {ok:false,message:(err as {code?:string}).code==='23505'?'اسم الرابط مستخدم بالفعل.':'تعذر حفظ المنتج.'};}
}
export async function archiveCatalogProduct(id:string):Promise<Result>{
  await requireStaff(['owner']);if(!uuidPattern.test(id))return {ok:false,message:'معرّف غير صالح.'};
  try{const result=await getDb().query(`update public.product_families set catalog_deleted_at=now(),catalog_visible=false,
    state='paused' where id=$1 and catalog_deleted_at is null returning id`,[id]);
    if(!result.rowCount)return {ok:false,message:'المنتج غير موجود.'};refresh();return {ok:true,message:'تم حذف المنتج من المتجر وأرشفته مع الحفاظ على الطلبات القديمة.'};
  }catch{return {ok:false,message:'تعذر أرشفة المنتج.'};}
}
export async function restoreCatalogProduct(id:string):Promise<Result>{
  await requireStaff(['owner']);if(!uuidPattern.test(id))return {ok:false,message:'معرّف غير صالح.'};
  try{const result=await getDb().query(`update public.product_families set catalog_deleted_at=null,state='planned'
    where id=$1 and catalog_deleted_at is not null returning id`,[id]);
    if(!result.rowCount)return {ok:false,message:'المنتج غير موجود.'};refresh();return {ok:true,message:'تم استرجاع المنتج كمسودة مخفية.'};
  }catch{return {ok:false,message:'تعذر استرجاع المنتج.'};}
}
