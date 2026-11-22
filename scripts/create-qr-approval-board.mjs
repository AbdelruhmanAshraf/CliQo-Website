import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';

const products={
  stand:['google-white','google-clear','all-in-one','instagram','facebook','tiktok','instapay','vodafone'],
  coaster:['google-white','google-clear','all-in-one','instagram','facebook','tiktok','instapay','vodafone'],
};

await mkdir('output/stand-coaster-update',{recursive:true});
for(const [family,names] of Object.entries(products)){
  const rowW=1500,rowH=490,gap=20,fullW=300,cropW=1100;
  const rows=[];
  for(const [index,name] of names.entries()){
    const file=`public/products/demo/${family}-${name}.webp`;
    const meta=await sharp(file).metadata();
    const width=meta.width??900,height=meta.height??900;
    const full=await sharp(file).resize({width:fullW,height:390,fit:'contain',background:'#ffffff'}).toBuffer();
    const cropTop=Math.max(0,Math.round(height*(family==='stand'?0.39:name==='all-in-one'?0.43:0.34)));
    const cropHeight=Math.min(height-cropTop,Math.round(height*(family==='stand'?0.39:0.45)));
    const crop=await sharp(file).extract({left:0,top:cropTop,width,height:cropHeight}).resize({width:cropW,height:390,fit:'contain',background:'#ffffff'}).toBuffer();
    const label=Buffer.from(`<svg width="${rowW}" height="70"><rect width="100%" height="100%" fill="#002f27"/><text x="24" y="45" fill="#fff" font-family="Arial,sans-serif" font-size="28" font-weight="700">${family.toUpperCase()} · ${name.replaceAll('-',' ')}</text><text x="650" y="45" fill="#ff8a2a" font-family="Arial,sans-serif" font-size="22" font-weight="700">QR / TAP ALIGNMENT</text></svg>`);
    const row=await sharp({create:{width:rowW,height:rowH,channels:3,background:'#edf2ef'}}).composite([
      {input:label,left:0,top:0},{input:full,left:0,top:85},{input:crop,left:fullW+gap,top:85},
    ]).jpeg({quality:90}).toBuffer();
    rows.push({input:row,left:0,top:index*(rowH+gap)});
  }
  const boardFile=`output/stand-coaster-update/${family}-qr-approval.jpg`;
  await sharp({create:{width:1500,height:names.length*rowH+(names.length-1)*gap,channels:3,background:'#dfe8e3'}})
    .composite(rows).jpeg({quality:90}).toFile(boardFile);
  for(let part=0;part<2;part++){
    await sharp(boardFile).extract({left:0,top:part*4*(rowH+gap),width:rowW,height:4*rowH+3*gap})
      .jpeg({quality:92}).toFile(`output/stand-coaster-update/${family}-qr-approval-${part+1}.jpg`);
  }
}
