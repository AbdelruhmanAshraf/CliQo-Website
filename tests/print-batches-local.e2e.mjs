// Local proof: real owner MFA, exact batch export, safe retries and unchanged stock.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { chromium } from 'playwright';
import { unzipSync, strFromU8 } from 'fflate';
const env = Object.fromEntries((await readFile('.env.local','utf8')).split('\n').filter(x=>/^[A-Z_]+=/.test(x)).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
Object.assign(process.env,env);
const base=process.env.CLIQO_TEST_URL || 'http://localhost:4173';
for(const url of [base,env.NEXT_PUBLIC_SUPABASE_URL]) assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname));
assert.ok(['localhost','127.0.0.1'].includes(new URL(env.CLIQO_DATABASE_URL).hostname));
const {getDb}=await import('../lib/db.ts');
const {reservePrintBatch}=await import('../lib/print-production-batch.ts');
const db=getDb();
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const browser=await chromium.launch({channel:'chrome',headless:true});
const accounts=[], cleanupBatches=[];
let exampleBatch=null, succeeded=false;
const output='output/coaster-all-in-one-example';await mkdir(output,{recursive:true});await rm(output+'/batch',{recursive:true,force:true});
function totp(secret){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.replace(/=+$/,''))bits+=alphabet.indexOf(c.toUpperCase()).toString(2).padStart(5,'0');
 const key=Buffer.from((bits.match(/.{8}/g)||[]).map(b=>parseInt(b,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
 const hash=createHmac('sha1',key).update(counter).digest();const offset=hash[19]&15;
 return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
async function account(owner){
 const email=`cliqo-print-${randomUUID()}@example.invalid`,password=randomBytes(24).toString('hex');
 const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(error,null);accounts.push(data.user.id);
 if(owner) await db.query("insert into public.staff_members(user_id,display_name,role) values($1,'تجربة دفعة الكوستر','owner')",[data.user.id]);
 let cookies=[];
 const auth=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:'sb-cliqo-auth-token'},cookies:{getAll:()=>cookies,setAll:values=>{for(const v of values){cookies=cookies.filter(c=>c.name!==v.name);cookies.push(v)}}}});
 assert.equal((await auth.auth.signInWithPassword({email,password})).error,null);
 if(owner){const enrollment=await auth.auth.mfa.enroll({factorType:'totp'});assert.equal(enrollment.error,null);const challenge=await auth.auth.mfa.challenge({factorId:enrollment.data.id});assert.equal(challenge.error,null);assert.equal((await auth.auth.mfa.verify({factorId:enrollment.data.id,challengeId:challenge.data.id,code:totp(enrollment.data.totp.secret)})).error,null);}
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:base,httpOnly:c.options?.httpOnly??false,sameSite:'Lax'})));
 await context.addCookies([{name:'cliqo-locale',value:'ar',url:base}]);return context;
}
try{
 const {rows:[sku]}=await db.query("select s.id,s.sku_code from public.product_skus s join public.product_families f on f.id=s.product_family_id where f.family_key='coaster' and s.options @> '{\"face\":\"all-in-one\",\"variant\":\"All-in-One\",\"design\":\"T0\"}'::jsonb limit 1");assert.ok(sku);
 const stockBefore=(await db.query('select on_hand,reserved from public.inventory_balances where sku_id=$1',[sku.id])).rows;
 const retryBatch=randomUUID();cleanupBatches.push(retryBatch);
 const [first,second]=await Promise.all([reservePrintBatch(sku.id,2,retryBatch),reservePrintBatch(sku.id,2,retryBatch)]);assert.deepEqual(first,second);assert.equal(first.length,2);
 await assert.rejects(()=>reservePrintBatch(sku.id,3,retryBatch));await assert.rejects(()=>reservePrintBatch(sku.id,0,randomUUID()));
 console.log('PASS concurrent retries preserve the same 2 IDs; mismatched quantity rejected');
 const context=await account(true), page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
 await page.goto(base+'/admin/inventory');await page.locator('.sku-management').waitFor();
 const familySummary=page.locator('.inventory-family-list > details.inventory-family > summary').filter({hasText:'كوستر'});await familySummary.click();const family=familySummary.locator('xpath=..');assert.equal(await family.evaluate(element=>element.open),true);
 const card=family.locator('.inventory-sku-card').filter({hasText:sku.sku_code});await card.locator('summary').first().click();
 const form=card.locator('.inventory-print-batch');await form.getByLabel('عدد القطع الجديدة').fill('10');
 await form.getByRole('button',{name:'جهّز التصاميم والمعرّفات',exact:true}).click();
 const download=form.getByRole('link',{name:'نزّل تصاميم الدفعة (10)'});await download.waitFor();exampleBatch=new URL(await download.getAttribute('href'),base).searchParams.get('batch');assert.ok(exampleBatch);
 const rows=(await db.query('select public_id::text,state,owner_user_id from public.smart_items where production_batch_id=$1 order by public_id',[exampleBatch])).rows;
 assert.equal(rows.length,10);assert.equal(new Set(rows.map(r=>r.public_id)).size,10);assert.ok(rows.every(r=>r.state==='unassigned'&&r.owner_user_id===null));
 assert.deepEqual((await db.query('select on_hand,reserved from public.inventory_balances where sku_id=$1',[sku.id])).rows,stockBefore);
 await form.locator('.print-batch-identifiers summary').click();await form.locator('img').evaluate(img=>img.decode());await form.scrollIntoViewIfNeeded();await form.screenshot({path:output+'/admin-batch-desktop.png'});
 const response=await context.request.get(base+await download.getAttribute('href'),{timeout:180000});assert.equal(response.status(),200);assert.match(response.headers()['content-type'],/application\/zip/);
 const zip=await response.body();await writeFile(output+'/TEST-CLIQO-10-coasters.zip',zip);const files=unzipSync(zip);
 const folders=[...new Set(Object.keys(files).filter(name=>name.includes('/')).map(name=>name.split('/')[0]))];assert.equal(folders.length,10);
 for(const folder of folders){const names=Object.keys(files).filter(name=>name.startsWith(folder+'/'));assert.equal(names.length,4);assert.ok(names.some(name=>name.endsWith('الوجه.svg')));assert.ok(names.some(name=>name.endsWith('الوجه.png')));const backName=folder+'/الظهر-حفر-ID.svg';assert.ok(files[backName]);assert.ok(strFromU8(files[backName]).includes(folder.slice(3)));const info=strFromU8(files[folder+'/بيانات-القطعة.txt']);assert.match(info,/كود التفعيل الخاص لا يظهر هنا/);assert.match(info,/رقم القطعة:/);assert.doesNotMatch(info,/كود التفعيل الخاص:/);}
 const manifest=strFromU8(files['manifest.csv']);for(const row of rows)assert.ok(manifest.includes(row.public_id));assert.ok(!manifest.includes('activationCode'));
 for(const [name,bytes]of Object.entries(files)){const path=output+'/batch/'+name;await mkdir(path.slice(0,path.lastIndexOf('/')),{recursive:true});await writeFile(path,bytes);}
 const preview=await context.request.get(base+'/admin/items/'+rows[0].public_id+'/print?preview=1');assert.equal(preview.status(),200);assert.match(preview.headers()['content-disposition'],/^inline/);assert.match(await preview.text(),/width="120mm"/);
 const repeated=await reservePrintBatch(sku.id,10,exampleBatch);assert.deepEqual(repeated,rows.map(r=>r.public_id));
 await page.reload();const reloadedSummary=page.locator('.inventory-family-list > details.inventory-family > summary').filter({hasText:'كوستر'});await reloadedSummary.click();const reloadedFamily=reloadedSummary.locator('xpath=..');assert.equal(await reloadedFamily.evaluate(element=>element.open),true);const reloaded=reloadedFamily.locator('.inventory-sku-card').filter({hasText:sku.sku_code});await reloaded.locator('summary').first().click();assert.ok(await reloaded.locator(`a[href*="batch=${exampleBatch}"]`).count());
 await page.setViewportSize({width:390,height:844});await reloaded.locator('.inventory-print-batch').scrollIntoViewIfNeeded();await reloaded.locator('.inventory-print-batch').screenshot({path:output+'/admin-batch-mobile.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await db.query("update public.smart_items set state='disabled' where production_batch_id=$1",[retryBatch]);const disabled=await context.request.get(base+'/admin/items/qr-batch?batch='+retryBatch);assert.equal(disabled.status(),409);
 const customer=await account(false);const denied=await customer.request.get(base+'/admin/items/qr-batch?batch='+exampleBatch);assert.equal(denied.status(),404);
 const anonymous=await browser.newContext();const anonymousResponse=await anonymous.request.get(base+'/admin/items/qr-batch?batch='+exampleBatch);assert.ok(!anonymousResponse.headers()['content-type']?.includes('zip'));
 assert.deepEqual(errors,[]);
 await writeFile(output+'/example.json',JSON.stringify({batchId:exampleBatch,skuId:sku.id,origin:env.CLIQO_QR_PREVIEW_ORIGIN,publicIds:rows.map(r=>r.public_id)},null,2));
 console.log('PASS owner UI creates exactly 10 planned units, exports 10 folders with print fronts and short IDs; private activation codes stay out of factory files; stock unchanged; retry, history, access control and mobile layout pass');
 succeeded=true;
}finally{
 if(exampleBatch&&(!succeeded||process.env.CLIQO_KEEP_PRINT_EXAMPLE!=='1'))cleanupBatches.push(exampleBatch);
 if(cleanupBatches.length)await db.query('delete from public.smart_items where production_batch_id=any($1::uuid[])',[cleanupBatches]);
 for(const id of accounts.reverse())await admin.auth.admin.deleteUser(id);
 await browser.close();await db.end();
}
