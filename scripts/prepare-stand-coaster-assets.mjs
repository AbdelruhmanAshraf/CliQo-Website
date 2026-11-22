import {mkdir,readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
const printModule=await import('../lib/qr-print-layout.ts');const print=printModule.default??printModule;
const qrModule=await import('../lib/smart-item-qr.ts');const qr=qrModule.default??qrModule;
const templates=JSON.parse(await readFile('lib/qr-print-templates.json','utf8'));
await mkdir('public/products/demo',{recursive:true});
await mkdir('public/products/demo/stands',{recursive:true});
await mkdir('public/products/demo/coasters',{recursive:true});
for(const [key,entry] of Object.entries(templates)){
 const [family,face,variant]=key.split('/');
 if (entry.retired || !['stand','coaster'].includes(family)) continue;
 const suffix=face==='review'?(variant==='أبيض'?'google-white':'google-clear'):face;
 const filename=`${family}s/${suffix}`;
 const loaded=await print.loadPrintTemplate(entry);
 const svg=await print.createSmartItemPrintSvg('preview','https://cliqoeg.com',face,loaded,qr.createPreviewQrSvg(face,entry.qr.style));
 const png=await print.createSmartItemPrintPng(svg,loaded);
 await sharp(png).resize({width:family==='stand'?800:900}).webp({quality:92,effort:5}).toFile(`public/products/demo/${filename}.webp`);
 console.log(key);
}
