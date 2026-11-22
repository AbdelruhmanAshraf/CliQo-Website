import sharp from 'sharp';
import path from 'node:path';
const dir=process.argv[2];
if(!dir)throw new Error('Pass the generated-image source directory as the first argument.');
const files={stand:'exec-c7a76932-3602-457d-b2fa-1a39edb96d34.png',coaster:'exec-e8849ccf-4843-41cf-b2e5-5d096ae2e059.png',card:'exec-25f7cda0-ef07-43cf-be62-43a56e06b6d4.png'};
for(const [slug,file] of Object.entries(files))await sharp(path.join(dir,file)).resize({width:1400,height:1600,fit:'inside'}).webp({quality:88}).toFile(`public/products/mockups/${slug}-studio-v1.webp`);
