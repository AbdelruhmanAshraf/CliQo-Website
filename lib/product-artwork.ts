import {cardSide} from './product-photos';

export type ProductArtwork = {src:string;label:string;side:string|null;kind?:"mockup"|"preview"|"photo"};
export const productArtwork: Record<string, ProductArtwork[]> = {
  card: [
    ['main-black','CliQo Black'], ['main-white','CliQo White'], ['google','Google Review'],
    ['facebook','Facebook'], ['instagram','Instagram'], ['instapay','InstaPay'],
  ].flatMap(([design,label]):ProductArtwork[]=>[
    {src:cardSide(design,'front'),label,side:'front'},
    {src:cardSide(design,'back'),label,side:'back',kind:'preview'},
  ]),
};
