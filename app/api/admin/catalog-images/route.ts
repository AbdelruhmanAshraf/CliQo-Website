import {randomUUID} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {requireStaff} from '@/lib/admin';
import {getStorageAdmin} from '@/lib/supabase/storage-admin';

export const runtime='nodejs';
const maxBytes=5*1024*1024;
const types=[
  {mime:'image/png',ext:'png',valid:(b:Uint8Array)=>b.length>=8&&b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47},
  {mime:'image/jpeg',ext:'jpg',valid:(b:Uint8Array)=>b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff},
  {mime:'image/webp',ext:'webp',valid:(b:Uint8Array)=>b.length>=12&&String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP'},
];
export async function POST(request:NextRequest){
  await requireStaff(['owner']);
  if(Number(request.headers.get('content-length')??0)>maxBytes+128*1024)return NextResponse.json({error:'الصورة أكبر من ٥ ميجابايت.'},{status:413});
  try{
    const file=(await request.formData()).get('file');
    if(!(file instanceof File)||file.size<1||file.size>maxBytes)return NextResponse.json({error:'اختار صورة حتى ٥ ميجابايت.'},{status:400});
    const bytes=new Uint8Array(await file.arrayBuffer());
    const type=types.find(t=>t.valid(bytes));
    if(!type)return NextResponse.json({error:'الصور المقبولة: PNG أو JPG أو WebP.'},{status:415});
    const path=`${randomUUID()}.${type.ext}`;
    const bucket=getStorageAdmin().storage.from('catalog-images');
    const upload=await bucket.upload(path,bytes,{contentType:type.mime,upsert:false});
    if(upload.error)return NextResponse.json({error:'تعذر رفع الصورة.'},{status:502});
    const publicBase=process.env.NEXT_PUBLIC_SUPABASE_URL;
    if(!publicBase){await bucket.remove([path]);return NextResponse.json({error:'رابط الصور العام غير مضبوط.'},{status:500});}
    return NextResponse.json({src:`${publicBase.replace(/\/$/,'')}/storage/v1/object/public/catalog-images/${path}`},{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({error:'تعذر معالجة الصورة.'},{status:500});}
}
