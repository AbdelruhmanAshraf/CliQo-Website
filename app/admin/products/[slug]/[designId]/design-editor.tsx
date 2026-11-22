'use client';
import Image from 'next/image';
import {useRouter} from 'next/navigation';
import {useState,useTransition,type FormEvent} from 'react';
import {useCopy} from '@/i18n/client';
import type {CatalogProduct} from '@/lib/catalog';
import type {CatalogDesign} from '@/lib/catalog-designs';
import {saveCatalogDesign} from '../../actions';
import {updateSkuApprovals} from '../../../inventory/actions';

export type DesignSku={id:string;sku_code:string;display_name:string;options:Record<string,string>;price_minor:number|null;
  price_approved:boolean;sample_approved:boolean;fulfillment_approved:boolean;state:string;on_hand:number;reserved:number};

function parseSpecs(value:string){
  const specs:Record<string,string>={};
  for(const line of value.split('\n')){const at=line.indexOf(':');if(at>0)specs[line.slice(0,at).trim()]=line.slice(at+1).trim();}
  return specs;
}
const specsText=(value:Record<string,string>)=>Object.entries(value).map(([key,item])=>`${key}: ${item}`).join('\n');

export function DesignEditor({product,design}:{product:CatalogProduct;design:CatalogDesign}){
  const copy=useCopy();const t=(ar:string,en:string)=>copy.locale==='ar'?ar:en;
  const router=useRouter();const [images,setImages]=useState(design.images.map(item=>item.src));
  const [uploading,setUploading]=useState(false);const [pending,startTransition]=useTransition();const [message,setMessage]=useState('');
  async function upload(file:File){
    setUploading(true);setMessage('');
    try{const data=new FormData();data.append('file',file);const response=await fetch('/api/admin/catalog-images',{method:'POST',body:data});
      const result=await response.json();if(!response.ok)throw new Error(result.error);setImages(previous=>[...previous,result.src]);
    }catch(error){setMessage(error instanceof Error?error.message:t('تعذر رفع الصورة.','Could not upload image.'));}
    finally{setUploading(false);}
  }
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const data=new FormData(event.currentTarget);
    startTransition(async()=>{
      const result=await saveCatalogDesign({familyId:product.id!,slug:product.slug,designId:design.id,content:{
        nameAr:String(data.get('nameAr')??''),nameEn:String(data.get('nameEn')??''),
        categoryAr:String(data.get('categoryAr')??''),categoryEn:String(data.get('categoryEn')??''),
        descriptionAr:String(data.get('descriptionAr')??''),descriptionEn:String(data.get('descriptionEn')??''),
        specsAr:parseSpecs(String(data.get('specsAr')??'')),specsEn:parseSpecs(String(data.get('specsEn')??'')),images,
      }});
      setMessage(result.message);if(result.ok)router.refresh();
    });
  }
  return <form className="catalog-design-editor" onSubmit={submit}>
    <div className="catalog-design-section-heading"><h2>{t('تفاصيل صفحة المنتج','Product page details')}</h2><p>{t('التعديل يخص التصميم ده فقط؛ باقي التصاميم تفضل مستقلة.','Changes here affect only this design.')}</p></div>
    <div className="catalog-design-fields"><label>{t('اسم التصميم بالعربي','Arabic design name')}<input name="nameAr" required maxLength={100} defaultValue={design.nameAr}/></label><label>{t('اسم التصميم بالإنجليزي','English design name')}<input name="nameEn" required maxLength={100} defaultValue={design.nameEn}/></label><label>{t('القسم بالعربي','Arabic category')}<input name="categoryAr" required maxLength={100} defaultValue={design.categoryAr}/></label><label>{t('القسم بالإنجليزي','English category')}<input name="categoryEn" required maxLength={100} defaultValue={design.categoryEn}/></label></div>
    <div className="catalog-design-fields"><label>{t('الوصف بالعربي','Arabic description')}<textarea name="descriptionAr" maxLength={1000} rows={4} defaultValue={design.descriptionAr??''} placeholder={t('لو فاضي، يظهر وصف الاستخدام الافتراضي.','If empty, the default use description appears.')}/></label><label>{t('الوصف بالإنجليزي','English description')}<textarea name="descriptionEn" maxLength={1000} rows={4} defaultValue={design.descriptionEn??''} placeholder={t('لو فاضي، يظهر وصف الاستخدام الافتراضي.','If empty, the default use description appears.')}/></label><label>{t('المواصفات بالعربي','Arabic specifications')}<small>{t('بند: قيمة، سطر لكل بند','Key: value, one per line')}</small><textarea name="specsAr" rows={5} defaultValue={specsText(design.specsAr??product.specs)}/></label><label>{t('المواصفات بالإنجليزي','English specifications')}<small>{t('بند: قيمة، سطر لكل بند','Key: value, one per line')}</small><textarea name="specsEn" rows={5} defaultValue={specsText(design.specsEn??product.specsEn)}/></label></div>
    <div className="catalog-design-gallery"><div className="catalog-design-section-heading"><h3>{t('صور التصميم','Design photos')}</h3><p>{t('أول صورة هي الرئيسية. تقدر ترتب الصور أو تحذفها أو ترفع صور جديدة. لازم تفضل صورة واحدة على الأقل.','The first photo is primary. Reorder, remove or upload photos; keep at least one.')}</p></div><div className="catalog-design-gallery-grid">{images.map((src,index)=><article key={`${src}-${index}`}><Image src={src} alt="" width={170} height={145} unoptimized/><span>{index===0?t('الصورة الرئيسية','Primary photo'):`${t('صورة','Photo')} ${index+1}`}</span><div><button type="button" disabled={index===0} onClick={()=>setImages(previous=>{const next=[...previous];[next[index-1],next[index]]=[next[index],next[index-1]];return next;})}>{t('للأول ↑','Move up ↑')}</button><button type="button" disabled={images.length===1} onClick={()=>setImages(previous=>previous.filter((_,at)=>at!==index))}>{t('حذف','Remove')}</button></div></article>)}</div><label className="catalog-design-upload">＋ {t('إضافة صورة','Add photo')}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading||images.length>=12} onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);event.target.value='';}}/></label>{uploading&&<small>{t('جارٍ الرفع…','Uploading…')}</small>}</div>
    <div className="catalog-design-save"><button type="submit" disabled={pending||uploading}>{pending?t('جارٍ الحفظ…','Saving…'):t('حفظ صفحة التصميم','Save design page')}</button>{message&&<p role="status">{message}</p>}</div>
  </form>;
}

export function DesignSkuEditor({skus}:{skus:DesignSku[]}){
  const copy=useCopy();const t=(ar:string,en:string)=>copy.locale==='ar'?ar:en;const router=useRouter();
  const [pending,startTransition]=useTransition();const [message,setMessage]=useState('');
  return <div className="catalog-design-skus">{skus.map(sku=><form key={sku.id} onSubmit={event=>{
    event.preventDefault();const data=new FormData(event.currentTarget);
    startTransition(async()=>{const result=await updateSkuApprovals({skuId:sku.id,priceEgp:String(data.get('price')??''),
      priceApproved:data.get('priceApproved')==='on',sampleApproved:data.get('sampleApproved')==='on',fulfillmentApproved:data.get('fulfillmentApproved')==='on'});
      setMessage(result.message);if(result.ok)router.refresh();});
  }}><div className="catalog-design-sku-head"><strong>{sku.display_name}</strong><small dir="ltr">{sku.sku_code} · {sku.options.design??'T0'}</small><span>{t(`المخزون ${Math.max(0,sku.on_hand-sku.reserved)} · محجوز ${sku.reserved}`,`Stock ${Math.max(0,sku.on_hand-sku.reserved)} · Reserved ${sku.reserved}`)}</span></div><label>{t('السعر بالجنيه','Price EGP')}<input name="price" type="number" min="0.01" step="0.01" defaultValue={sku.price_minor?(sku.price_minor/100).toFixed(2):''}/></label><div className="catalog-design-approvals"><label><input name="priceApproved" type="checkbox" defaultChecked={sku.price_approved}/>{t('اعتماد السعر','Price approved')}</label><label><input name="sampleApproved" type="checkbox" defaultChecked={sku.sample_approved}/>{t('اعتماد العينة','Sample approved')}</label><label><input name="fulfillmentApproved" type="checkbox" defaultChecked={sku.fulfillment_approved}/>{t('اعتماد التجهيز','Fulfillment approved')}</label></div><button type="submit" disabled={pending}>{t('حفظ السعر والاعتمادات','Save price and approvals')}</button></form>)}{message&&<p role="status">{message}</p>}</div>;
}
