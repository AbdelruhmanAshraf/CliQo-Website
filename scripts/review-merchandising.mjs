import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
const font=(await readFile(new URL('../Fonts/forma-djr-arabic-deck-medium.otf',import.meta.url))).toString('base64');
const base='http://localhost:4173';const out='output/merchandising-2026-11-01';
const browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext();const page=await context.newPage();page.setDefaultNavigationTimeout(60000);page.setDefaultTimeout(20000);const errors=[];const checks=[];page.on('pageerror',e=>errors.push(e.message));
try{
 for(const locale of ['ar','en']){
  await context.addCookies([{name:'cliqo-locale',value:locale,url:base}]);
  for(const slug of ['stand','coaster','card','wallet','magnetic-wallet','keychain']){
   await page.setViewportSize({width:390,height:844});const response=await page.goto(base+'/products/'+slug,{waitUntil:'networkidle'});assert.equal(response.status(),200);
   assert.equal(await page.locator('.initial-price').count(),1);assert.equal(await page.locator('.offer-poster').count(),3);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),slug+' mobile overflow');
   if(['stand','coaster','card'].includes(slug)){
    const thumbs=page.locator('.gallery-thumbs button');assert.ok(await thumbs.count()>=6);await thumbs.last().click();assert.equal(await thumbs.last().getAttribute('aria-pressed'),'true');
   }
   if(locale==='en')assert.ok(!/[\u0621-\u064a]/.test(await page.locator('.launch-offers').innerText()),slug+' English offers');
   checks.push(locale+' '+slug+': price, offers, responsive layout, gallery');
  }
 }
 await context.addCookies([{name:'cliqo-locale',value:'ar',url:base}]);await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/products/stand',{waitUntil:'networkidle'});await page.screenshot({path:out+'/stand-desktop.png',fullPage:true});
 for(const id of ['counter','network','branches']){
  const exportData=await page.evaluate(id=>{const node=document.querySelector(`[data-poster="${id}"]`);const style=getComputedStyle(node);return {html:node.outerHTML,htmlClass:document.documentElement.className,background:style.backgroundColor,color:style.color,styles:Array.from(document.querySelectorAll('link[rel=stylesheet]')).map(link=>link.href)};},id);
  const posterPage=await context.newPage();await posterPage.setViewportSize({width:1080,height:1350});
  await posterPage.setContent('<!doctype html><html lang="ar" dir="rtl" class="'+exportData.htmlClass+'"><head><base href="'+base+'">'+exportData.styles.map(href=>'<link rel="stylesheet" href="'+href+'">').join('')+'</head><body style="margin:0">'+exportData.html+'</body></html>',{waitUntil:'networkidle'});
  await posterPage.evaluate(({background,color})=>{const poster=document.querySelector('.offer-poster');poster.classList.add('export-poster');poster.style.background=background;poster.style.color=color;for(const img of document.images){const url=new URL(img.src);const original=url.searchParams.get('url');img.removeAttribute('srcset');if(original)img.src=original;img.loading='eager';}},exportData);
  if(id==='counter')await posterPage.evaluate(()=>{document.querySelector('.offer-art').innerHTML='<img src="/products/mockups/zip-source/counter-wide-all-in-one-zip-v1.webp" alt="موكاب استرشادي" />';});
  await posterPage.addStyleTag({content:'.offer-poster.export-poster{width:1080px;height:1350px;padding:70px;box-sizing:border-box;border-radius:0}.export-poster>p{font-size:26px}.export-poster h3{font-size:74px}.export-poster>span{font-size:34px}.export-poster .offer-art{height:570px;flex-shrink:0;margin:32px 0}.export-poster .offer-art img{height:540px;width:100%;min-width:0;flex:1;max-width:100%;object-fit:contain}.export-poster>strong{font-size:76px}.export-poster>small{font-size:26px}.export-poster>a{font-size:30px;padding-top:26px}.export-poster .offer-terms{font-size:20px;line-height:1.8}'});
  await posterPage.addStyleTag({content:'@font-face{font-family:CliQoExport;src:url(data:font/otf;base64,'+font+')} .export-poster,.export-poster *{font-family:CliQoExport,sans-serif!important} .export-poster .offer-art img:only-child{object-fit:cover}'});
  await posterPage.evaluate(()=>document.fonts.ready);await posterPage.waitForFunction(()=>Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0));await posterPage.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));await posterPage.screenshot({path:out+'/poster-'+id+'-ar.png'});await posterPage.close();
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/stand-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);await writeFile(out+'/checks.json',JSON.stringify({checks,errors},null,2));console.log(checks.length+' merchandising scenarios passed; 3 posters exported.');
}finally{await browser.close();}
