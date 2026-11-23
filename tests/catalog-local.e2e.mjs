// Local integration proof. Creates disposable owner/customer and a disposable catalog family.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {strFromU8,unzipSync} from 'fflate';
import pg from 'pg';
import {chromium} from 'playwright';

const env=Object.fromEntries((await readFile(new URL('../.env.local',import.meta.url),'utf8')).split('\n').filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1).trim().replace(/^['"]|['"]$/g,'')];}));
const base=process.env.CLIQO_TEST_URL||'http://localhost:4174';
for(const url of [base,env.NEXT_PUBLIC_SUPABASE_URL])assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname));
const db=new pg.Client({connectionString:env.CLIQO_DATABASE_URL});await db.connect();
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const users=[],uploaded=[];const slug='catalog-test-'+randomBytes(4).toString('hex');let batchId=null;
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.replace(/=+$/,''))bits+=alphabet.indexOf(c.toUpperCase()).toString(2).padStart(5,'0');const key=Buffer.from((bits.match(/.{8}/g)||[]).map(bit=>parseInt(bit,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash[19]&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1_000_000).padStart(6,'0');}
async function account(role){const email=`${slug}-${role||'customer'}@example.invalid`,password=randomBytes(24).toString('hex');const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});if(error)throw error;users.push(data.user.id);if(role)await db.query('insert into public.staff_members(user_id,display_name,role) values($1,$2,$3)',[data.user.id,'Catalog test owner',role]);let cookies=[];const auth=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:'sb-cliqo-auth-token'},cookies:{getAll:()=>[],setAll:v=>{cookies=v;}}});const signIn=await auth.auth.signInWithPassword({email,password});if(signIn.error)throw signIn.error;if(role){const enrollment=await auth.auth.mfa.enroll({factorType:'totp'});if(enrollment.error)throw enrollment.error;const challenge=await auth.auth.mfa.challenge({factorId:enrollment.data.id});if(challenge.error)throw challenge.error;const verified=await auth.auth.mfa.verify({factorId:enrollment.data.id,challengeId:challenge.data.id,code:totp(enrollment.data.totp.secret)});if(verified.error)throw verified.error;}const context=await browser.newContext();await context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:base,httpOnly:cookie.options?.httpOnly??false,sameSite:'Lax'})));const page=await context.newPage();return {context,page};}
async function waitPublicStatus(page,expected){let actual=0;for(let attempt=0;attempt<30;attempt++){actual=(await page.request.get(base+'/products/'+slug)).status();if(actual===expected)return;await new Promise(resolve=>setTimeout(resolve,200));}assert.equal(actual,expected);}
try{
  const owner=await account('owner'),customer=await account(null);
  const customerAdminResponse=await customer.page.goto(base+'/admin/products');assert.equal(customerAdminResponse.status(),404,'Customer cannot enter catalog admin');
  await owner.page.goto(base+'/admin/products');assert.equal(await owner.page.locator('.catalog-manager-list button').count(),7,'All six families remain in owner dashboard');
  await owner.page.locator('.catalog-management-details summary').click();
  await owner.page.screenshot({path:'output/catalog-review-2026-11-01/admin-products.png',fullPage:true});
  const form=owner.page.locator('.catalog-manager-editor form');
  await form.locator('[name=slug]').fill(slug);await form.locator('[name=nameAr]').fill('منتج اختبار');await form.locator('[name=nameEn]').fill('Test product');await form.locator('[name=categoryAr]').fill('تجريبي');await form.locator('[name=categoryEn]').fill('Test');await form.locator('[name=descriptionAr]').fill('منتج اختبار محلي.');await form.locator('[name=descriptionEn]').fill('Local test product.');await form.locator('[name=specs]').fill('material: اختبار');await form.locator('[name=specsEn]').fill('material: Test');
  const bytes=await readFile(new URL('../public/products/mockups/stands/all-in-one.webp',import.meta.url));
  for(let i=0;i<2;i++){await form.locator('input[type=file]').setInputFiles({name:`photo-${i}.webp`,mimeType:'image/webp',buffer:bytes});await owner.page.waitForFunction(n=>document.querySelectorAll('.catalog-image-list>div').length===n,i+1);}
  uploaded.push(...await owner.page.locator('.catalog-image-list img').evaluateAll(images=>images.map(image=>new URL(image.src).pathname.split('/catalog-images/')[1]).filter(Boolean)));
  await form.locator('[name=visible]').check();await form.locator('button[type=submit]').click();await owner.page.getByRole('status').filter({hasText:'تم حفظ المنتج'}).waitFor();
  await waitPublicStatus(owner.page,200);
  const family=(await db.query('select id::text,has_nfc_qr from public.product_families where family_key=$1',[slug])).rows[0];assert.ok(family);assert.equal(family.has_nfc_qr,true,'new category defaults to NFC and QR');
  await owner.page.goto(base+'/products/'+slug);await owner.page.getByRole('heading',{level:1,name:'منتج اختبار',exact:true}).waitFor();
  const inventoryResponse=await owner.page.goto(base+'/cliqo-control/inventory');assert.equal(inventoryResponse.status(),200);
  const inventoryFamily=owner.page.locator('.inventory-family-list > details.inventory-family').filter({hasText:'منتج اختبار'}).first();
  await inventoryFamily.locator(':scope > summary').click();
  const createSku=owner.page.locator('#create-product');if(!(await createSku.evaluate(element=>element.open)))await createSku.locator('summary').click();
  const skuForm=owner.page.locator('.sku-create-form');await skuForm.locator('select').first().selectOption(family.id);await skuForm.locator('[name=name]').fill('نسخة اختبار عامة');
  await skuForm.locator('button[type=submit]').click();await owner.page.getByRole('status').filter({hasText:'تم إنشاء'}).waitFor();
  const sku=(await db.query('select id::text,sku_code from public.product_skus where product_family_id=$1 order by created_at desc limit 1',[family.id])).rows[0];assert.ok(sku);
  await owner.page.reload();const row=owner.page.locator('.bulk-production-row').filter({hasText:sku.sku_code});await row.waitFor();
  await row.locator('.bulk-production-template-warning').waitFor();await row.locator('input[type=number]').fill('1');
  await owner.page.locator('.bulk-production-panel button[type=submit]').click();const download=owner.page.locator('.bulk-production-download');await download.waitFor();batchId=new URL(await download.getAttribute('href'),base).searchParams.get('batch');
  const zipResponse=await owner.context.request.get(base+await download.getAttribute('href'));assert.equal(zipResponse.status(),200);const zip=unzipSync(await zipResponse.body());
  const piece=Object.keys(zip).find(name=>name.endsWith('/04-بيانات-القطعة.txt'));assert.ok(piece);assert.ok(piece.startsWith(`${slug}/${sku.sku_code}/`));
  assert.ok(zip[piece.slice(0,piece.lastIndexOf('/'))+'/03-qr.svg']);assert.equal(Object.keys(zip).filter(name=>name.startsWith(piece.slice(0,piece.lastIndexOf('/'))+'/')).length,2);
  assert.match(strFromU8(zip['README.txt']),/لا تملك قالب تصميم طباعة/);assert.doesNotMatch(strFromU8(zip[piece]),/كود التفعيل الخاص:/);
  console.log('Generic category, storefront page, SKU creation and QR-only factory ZIP: passed');
  await owner.page.goto(base+'/admin/products');await owner.page.locator('.catalog-management-details summary').click();
  await owner.page.locator('.catalog-manager-list button').filter({hasText:'منتج اختبار'}).click();
  await owner.page.locator('.catalog-manager-editor [name=visible]').uncheck();await owner.page.locator('.catalog-manager-editor button[type=submit]').click();await owner.page.getByRole('status').filter({hasText:'تم حفظ المنتج'}).waitFor();
  await waitPublicStatus(owner.page,404);
  await owner.page.locator('.catalog-manager-editor [name=visible]').check();await owner.page.locator('.catalog-manager-editor button[type=submit]').click();await owner.page.getByRole('status').filter({hasText:'تم حفظ المنتج'}).waitFor();
  await waitPublicStatus(owner.page,200);
  owner.page.once('dialog',dialog=>dialog.accept());await owner.page.locator('.catalog-editor-actions .danger').click();await owner.page.getByRole('status').filter({hasText:'أرشفته'}).waitFor();
  await waitPublicStatus(owner.page,404);
  console.log('Catalog owner CRUD, image upload, hide, restore and archive: passed');
}finally{
  await db.query('delete from public.smart_items where sku_id in(select id from public.product_skus where product_family_id in(select id from public.product_families where family_key=$1))',[slug]).catch(()=>{});
  await db.query('delete from public.inventory_movements where sku_id in(select id from public.product_skus where product_family_id in(select id from public.product_families where family_key=$1))',[slug]).catch(()=>{});
  await db.query('delete from public.inventory_balances where sku_id in(select id from public.product_skus where product_family_id in(select id from public.product_families where family_key=$1))',[slug]).catch(()=>{});
  await db.query('delete from public.product_skus where product_family_id in(select id from public.product_families where family_key=$1)',[slug]).catch(()=>{});
  await db.query('delete from public.product_families where family_key=$1',[slug]).catch(()=>{});
  if(uploaded.length)await admin.storage.from('catalog-images').remove(uploaded).catch(()=>{});
  for(const id of users)await admin.auth.admin.deleteUser(id).catch(()=>{});
  await browser.close();await db.end();
}
