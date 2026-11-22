// Research proposals dated 2026-11-01. Never used by checkout or approved sale SKUs.
export const initialPrices: Record<string,number>={stand:299,coaster:199,card:249,wallet:499,'magnetic-wallet':499,keychain:199};
export const launchBundles=[
 {id:'counter',name:'باكدج الكاونتر',description:'ستاند + كوستر',items:[['stand',1],['coaster',1]] as const,price:449,href:'/products/stand'},
 {id:'network',name:'باكدج التواصل',description:'كارت PVC + ميدالية',items:[['card',1],['keychain',1]] as const,price:399,href:'/products/card'},
 {id:'branches',name:'باكدج الفروع',description:'٣ ستاندات',items:[['stand',3]] as const,price:799,href:'/products/stand'},
];
export const bundleSubtotal=(items:readonly (readonly [string,number])[])=>items.reduce((sum,[slug,qty])=>sum+initialPrices[slug]*qty,0);
