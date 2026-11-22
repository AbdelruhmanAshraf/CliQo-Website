import {type ProductArtwork} from './product-artwork';
import {catalogDesigns} from './catalog-designs';

export function getProductGallery(slug:string):ProductArtwork[]{
 return (catalogDesigns[slug]??[]).flatMap(design=>design.images);
}
