import {getCatalogProduct} from '@/lib/catalog';
import {getCopy} from '@/i18n/server';
import {renderProductDetail} from '../product-detail';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const [product,tr]=await Promise.all([getCatalogProduct((await params).slug),getCopy()]);return {title:product?(tr.locale==='ar'?product.name:product.nameEn):(tr.locale==='ar'?'المنتج غير متاح':'Product unavailable'),description:product?(tr.locale==='ar'?product.description:product.descriptionEn):''};}
export default async function ProductPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{design?:string}>}){return renderProductDetail((await params).slug,(await searchParams).design);}
