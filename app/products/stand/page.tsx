import {renderProductDetail} from '../product-detail';
import {getCopy} from '@/i18n/server';
export const dynamic='force-dynamic';
export async function generateMetadata(){const tr=await getCopy();return tr.locale==='ar'?{title:'ستاند NFC',description:'تصميمات ستاند CliQo، الصور والمواصفات وطريقة التجهيز.'}:{title:'NFC Stand',description:'CliQo stand designs, photos, specifications and setup options.'};}
export default async function StandPage({searchParams}:{searchParams:Promise<{design?:string}>}){return renderProductDetail('stand',(await searchParams).design);}
