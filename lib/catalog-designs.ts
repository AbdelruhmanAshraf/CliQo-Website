import {productArtwork,type ProductArtwork} from './product-artwork';
import type {CatalogDesignContent} from './catalog';
import {cardMockup, coasterMockup, coasterPreview, isOldPrintProductImage, standMockup, standPreview} from './product-photos';

export type CatalogDesign = {
  id:string; group:string; nameAr:string; nameEn:string; categoryAr:string; categoryEn:string;
  colorAr?:string; colorEn?:string; images:ProductArtwork[]; face:string; variant:string;
  descriptionAr?:string; descriptionEn?:string; specsAr?:Record<string,string>; specsEn?:Record<string,string>;
};
const mock=(src:string,label:string):ProductArtwork=>({src,label,side:null,kind:'mockup'});
const art=(slug:string,label:string)=> {
  const images=(productArtwork[slug]??[]).filter(image=>image.label===label)
    .sort((a,b)=>a.side==='front'?-1:b.side==='front'?1:0);
  return images.length===1?[...images,{...images[0],src:images[0].src.replace('.webp','-detail.webp'),label:`${label} · Detail`}]:images;
};
const stand=(id:string,group:string,nameAr:string,nameEn:string,categoryAr:string,categoryEn:string,face:string,variant:string,images:ProductArtwork[],colorAr?:string,colorEn?:string):CatalogDesign=>({id,group,nameAr,nameEn,categoryAr,categoryEn,face,variant,images,colorAr,colorEn});
const standImages=(design:string,label:string):ProductArtwork[]=>[
  mock(standMockup(design),label),
  {src:standPreview(design),label:'QR توضيحي · غير مفعل',side:null,kind:'preview'},
];
const coasterImages=(design:string,label:string):ProductArtwork[]=>[
  mock(coasterMockup(design),label),
  {src:coasterPreview(design),label:'QR توضيحي · غير مفعل',side:null,kind:'preview'},
];
const cardImages=(design:string,label:string):ProductArtwork[]=>[mock(cardMockup(design),label),...art('card',label)];

export const catalogDesigns:Record<string,CatalogDesign[]>={
  stand:[
    stand('stand-google-white','google-white','تقييم Google · أبيض','Google Reviews · White','التقييمات','Reviews','review','أبيض',standImages('google-white','Google · White'),'أبيض','White'),
    stand('stand-all','all-in-one','كل روابطك','All your links','صفحة روابط','Link page','all-in-one','All-in-One',standImages('all-in-one','All-in-One')),
    stand('stand-instagram','instagram','Instagram','Instagram','التواصل الاجتماعي','Social','instagram','Instagram',standImages('instagram','Instagram')),
    stand('stand-facebook','facebook','Facebook','Facebook','التواصل الاجتماعي','Social','facebook','Facebook',standImages('facebook','Facebook')),
    stand('stand-tiktok','tiktok','TikTok','TikTok','التواصل الاجتماعي','Social','tiktok','TikTok',standImages('tiktok','TikTok')),
    stand('stand-instapay','instapay','InstaPay','InstaPay','الدفع للتاجر','Merchant payment','instapay','InstaPay',standImages('instapay','InstaPay')),
    stand('stand-vodafone','vodafone','Vodafone Cash','Vodafone Cash','الدفع للتاجر','Merchant payment','vodafone','Vodafone Cash',standImages('vodafone','Vodafone Cash')),
  ],
  coaster:[
    stand('coaster-google-white','google-white','تقييم Google · أبيض','Google Reviews · White','التقييمات','Reviews','review','أبيض',coasterImages('google-white','Google · White'),'أبيض','White'),
    stand('coaster-all','all-in-one','كل روابطك','All your links','صفحة روابط','Link page','all-in-one','All-in-One',coasterImages('all-in-one','All-in-One')),
    ...[['instagram','Instagram','التواصل الاجتماعي','Social'],['facebook','Facebook','التواصل الاجتماعي','Social'],['tiktok','TikTok','التواصل الاجتماعي','Social'],['instapay','InstaPay','الدفع للتاجر','Merchant payment'],['vodafone','Vodafone Cash','الدفع للتاجر','Merchant payment']].map(([id,label,catAr,catEn])=>stand('coaster-'+id,id,label,label,catAr,catEn,id,label,coasterImages(id,label))),
  ],
  card:[
    stand('card-main-black','main','كارت روابط CliQo','CliQo Links Card','صفحة روابط','Link page','all-in-one','أسود',cardImages('main-black','CliQo Black'),'أسود','Black'),
    stand('card-main-white','main','كارت روابط CliQo','CliQo Links Card','صفحة روابط','Link page','all-in-one','أبيض',cardImages('main-white','CliQo White'),'أبيض','White'),
    stand('card-google','google','كارت تقييم Google','Google Review Card','التقييمات','Reviews','review','Google Review',cardImages('google','Google Review')),
    stand('card-facebook','facebook','كارت Facebook','Facebook Card','التواصل الاجتماعي','Social','facebook','Facebook',cardImages('facebook','Facebook')),
    stand('card-instagram','instagram','كارت Instagram','Instagram Card','التواصل الاجتماعي','Social','instagram','Instagram',cardImages('instagram','Instagram')),
    stand('card-instapay','instapay','كارت InstaPay','InstaPay Card','الدفع للتاجر','Merchant payment','instapay','InstaPay',cardImages('instapay','InstaPay')),
  ],
};

export function designsForProduct(product:{slug:string;designImages:Record<string,string[]>;designContent?:Record<string,CatalogDesignContent>}):CatalogDesign[]{
  return (catalogDesigns[product.slug]??[]).map(design=>{
    const content=product.designContent?.[design.id];
    const currentImages=(images?:string[])=>images?.filter(src=>!isOldPrintProductImage(product.slug,src));
    const saved=currentImages(product.designImages?.[design.id]);
    const savedContentImages=currentImages(content?.images);
    const legacyImages=saved?.length?[...saved.map((src,index)=>mock(src,index===0?'الصورة الرئيسية':'صورة المنتج')),...design.images.filter(image=>image.kind!=='mockup')]:design.images;
    const images=savedContentImages?.length?savedContentImages.map((src,index)=>{
      const original=legacyImages.find(image=>image.src===src);
      return original??{src,label:index===0?'الصورة الرئيسية':'صورة المنتج',side:null,kind:'photo' as const};
    }):legacyImages;
    return {...design,images,
      ...(content?{nameAr:content.nameAr,nameEn:content.nameEn,categoryAr:content.categoryAr,categoryEn:content.categoryEn,
        descriptionAr:content.descriptionAr,descriptionEn:content.descriptionEn,specsAr:content.specsAr,specsEn:content.specsEn}:{})};
  });
}

