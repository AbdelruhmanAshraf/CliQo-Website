'use client';
import Image from 'next/image';
import {useState} from 'react';
import {useCopy} from '@/i18n/client';
import type {ProductArtwork} from '@/lib/product-artwork';
export function ProductGallery({images}:{images:ProductArtwork[]}) {
 const tr=useCopy();const [selected,setSelected]=useState(0);if(!images.length)return null;
 const label=(image:ProductArtwork)=>`${image.label}${image.side?' · '+tr(image.side==='front'?'الوجه الأمامي':'الوجه الخلفي'):''}`;
 return <section className="product-gallery" aria-label={tr('معرض التصميمات')}><div className="section-head"><div><p className="section-kicker">CliQo / ARTWORK</p><h2>{tr('اختار الشكل اللي يشبهك.')}</h2></div><p>{tr('تصميماتك الأصلية كما أرسلتها. أكواد QR الظاهرة للمعاينة؛ كل قطعة مباعة لها كود فريد.')}</p></div><figure><div className="gallery-stage"><Image src={images[selected].src} alt={label(images[selected])} fill sizes="(max-width: 700px) 90vw, 65vw" /></div><figcaption>{label(images[selected])} · {tr(images[selected].kind==='mockup'?'موكاب استرشادي':'تصميم مسطح')}</figcaption></figure><div className="gallery-thumbs">{images.map((image,index)=><button type="button" key={image.src} aria-pressed={selected===index} onClick={()=>setSelected(index)}><Image src={image.src} alt="" width={120} height={100} /><span>{label(image)}</span></button>)}</div></section>;
}
