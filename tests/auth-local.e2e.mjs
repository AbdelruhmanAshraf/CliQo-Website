// Local-only integration proof. Creates disposable accounts/items and removes them in finally.
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {randomUUID, randomBytes, randomInt, createHash, createHmac} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import pg from 'pg';
import {chromium} from 'playwright';
const env = Object.fromEntries((await readFile(new URL('../.env.local', import.meta.url), 'utf8')).split('\n').filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).trim().replace(/^['"]|['"]$/g, '')];}));
const base = process.env.CLIQO_TEST_URL || 'http://localhost:4174';
for (const value of [base, env.NEXT_PUBLIC_SUPABASE_URL]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(value).hostname), 'These tests must only run locally');
const db = new pg.Client({connectionString: env.CLIQO_DATABASE_URL, connectionTimeoutMillis: 10000}); await db.connect();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {auth: {persistSession: false}});
const browser = await chromium.launch({channel: 'chrome', headless: true});
const users = [], items = [], skus = [], draftNames = [], assets = [], checks = [], browserErrors = [];
function totp(secret) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.replace(/=+$/,''))bits+=alphabet.indexOf(c.toUpperCase()).toString(2).padStart(5,'0');
  const key=Buffer.from((bits.match(/.{8}/g)||[]).map(b=>parseInt(b,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const hash=createHmac('sha1',key).update(counter).digest(),offset=hash[19]&15;
  return String((hash.readUInt32BE(offset)&0x7fffffff)%1_000_000).padStart(6,'0');
}
async function createAccount(role) {
  const email = `cliqo-local-${randomUUID()}@example.invalid`, password = randomBytes(24).toString('hex');
  const {data, error} = await admin.auth.admin.createUser({email, password, email_confirm: true});
  if (error) throw new Error(error.message); const id = data.user.id; users.push(id);
  if (role) await db.query('insert into public.staff_members(user_id,display_name,role) values($1,$2,$3)', [id, 'CliQo test owner', role]);
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}}); let authCookies = [];
  const auth = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {cookieOptions: {name: 'sb-cliqo-auth-token'}, cookies: {getAll: () => [], setAll: (values) => {authCookies = values;}}});
  const session = await auth.auth.signInWithPassword({email, password}); if (session.error) throw new Error(session.error.message);
  if (role) {
    const enrollment = await auth.auth.mfa.enroll({factorType: 'totp'}); if (enrollment.error) throw new Error(enrollment.error.message);
    const challenge = await auth.auth.mfa.challenge({factorId: enrollment.data.id}); if (challenge.error) throw new Error(challenge.error.message);
    const verified = await auth.auth.mfa.verify({factorId: enrollment.data.id, challengeId: challenge.data.id, code: totp(enrollment.data.totp.secret)});
    if (verified.error) throw new Error(verified.error.message);
  }
  await context.addCookies(authCookies.map((cookie) => ({name: cookie.name, value: cookie.value, url: base, httpOnly: cookie.options?.httpOnly ?? false, sameSite: 'Lax'})));
  await context.addCookies([{name: 'cliqo-locale', value: 'en', url: base}]);
  const page = await context.newPage();page.setDefaultTimeout(Number(process.env.CLIQO_TEST_TIMEOUT_MS ?? 20000));page.setDefaultNavigationTimeout(Number(process.env.CLIQO_TEST_NAV_TIMEOUT_MS ?? 60000));page.on('pageerror', (error) => browserErrors.push(error.message));
  return {id, context, page, auth};
}
async function assertEnglish(page, scope = 'main') {
  const strings = await page.locator(scope).first().evaluate((root) => {
    const values = [], walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let node;
    while ((node = walker.nextNode())) {if (!node.parentElement?.getClientRects().length || node.parentElement.closest('script,style')) continue; const value = node.textContent.trim(); if (/[\u0621-\u064a]/.test(value.replaceAll('كليكو', '').replaceAll('العربية', ''))) values.push(value);}
    return [...new Set(values)];
  });assert.deepEqual(strings, [], `${new URL(page.url()).pathname}: untranslated UI`);
}
async function go(page, path) {console.log('Checking', path.split('?')[0]);await page.goto(base + path, {waitUntil: 'domcontentloaded'});await page.locator('h1').first().waitFor();if(path.startsWith('/dashboard/pages/'))await page.locator('[data-testid="page-editor-controls"]:not([disabled])').waitFor();if(path==='/cliqo-control/inventory')await page.locator('.sku-management').waitFor();if(path.startsWith('/activate?item='))await page.locator('[data-testid="activation-form"][data-hydrated="true"] #activation:not([disabled])').waitFor();}
try {
  const customer = await createAccount(), other = await createAccount(), owner = await createAccount('owner');
  const {rows: families} = await db.query("select id from public.product_families where family_key='stand'"); assert.ok(families[0]);
  const sku = randomUUID();skus.push(sku);
  await db.query("insert into public.product_skus(id,product_family_id,sku_code,display_name,options) values($1,$2,$3,$4,$5::jsonb)", [sku, families[0].id, 'CQ-I18N-'+randomBytes(4).toString('hex').toUpperCase(), 'ستاند NFC', JSON.stringify({face: 'all-in-one', variant: 'All-in-One', design: 'T0'})]);
  const saved = await customer.auth.rpc('save_merchant_page', {p_page_id: null, p_display_name: 'CliQo test profile', p_short_description: 'Test profile', p_avatar_path: null, p_cover_path: null, p_is_published: true, p_links: [{id: null, label: 'Website', destination_url: 'https://example.com', is_enabled: true}]});
  assert.equal(saved.error, null); const pageId = saved.data;
  const {rows} = await db.query("insert into public.smart_items(sku_id,state,owner_user_id,landing_page_id) values($1,'claimed',$2,$3) returning id,public_id", [sku, customer.id, pageId]);const item = rows[0]; items.push(item.id);
  for (const path of ['/dashboard', '/dashboard/pages', '/dashboard/analytics', '/dashboard/items/'+item.public_id, '/dashboard/pages/'+pageId, '/dashboard/pages/new', '/dashboard/profile', '/activate', '/activate?item='+item.public_id]) {
    await go(customer.page, path);assert.equal(new URL(customer.page.url()).pathname, path.split('?')[0]);await assertEnglish(customer.page);
    if (path.startsWith('/dashboard/items/')) assert.equal(await customer.page.locator('.customer-item-editor').count(), 1, 'Owned item settings render instead of a not-found page');
    if (path === '/dashboard') assert.equal(await customer.page.getByTestId('customer-item').count(), 1, 'Overview only lists the owned item');
    checks.push(`Authenticated English ${path.split('?')[0]}`);
  }
  // Staff retain inventory visibility but the customer surfaces require ownership.
  assert.ok((await owner.auth.from('smart_items').select('id').eq('id', item.id)).data?.length, 'Owner can read the staff registry');
  await go(owner.page, '/dashboard');
  assert.equal(await owner.page.getByTestId('customer-item').count(), 0);
  await go(owner.page, '/dashboard/analytics');
  assert.equal(await owner.page.locator('a[href="/dashboard/items/'+item.public_id+'"]').count(), 0);
  assert.equal((await owner.context.request.get(base+'/dashboard/items/'+item.public_id)).status(), 404);
  assert.equal((await owner.context.request.get(base+'/dashboard/items/'+item.public_id+'/qr')).status(), 404);
  checks.push('Staff customer dashboard and QR download exclude registry items belonging to other users');

  await go(customer.page, '/dashboard/profile');
  await customer.page.locator('input[name=name]').fill('CliQo QA customer');
  await customer.page.locator('input[name=phone]').fill('+201012345678');
  await customer.page.getByRole('button', {name: 'Save the modifications', exact: true}).click();
  await customer.page.getByRole('status').filter({hasText: 'Account details saved.'}).waitFor();
  await customer.page.reload({waitUntil: 'domcontentloaded'});
  assert.equal(await customer.page.locator('input[name=name]').inputValue(), 'CliQo QA customer');
  assert.equal(await customer.page.locator('input[name=phone]').inputValue(), '+201012345678');
  checks.push('Customer name and phone persist after reload');

  await go(customer.page, '/dashboard/pages/'+pageId);
  await customer.page.locator('input[name=displayName]').fill('محتوى العميل كما هو');
  await customer.page.locator('textarea[name=shortDescription]').fill('نص عربي كتبه المالك');
  await customer.page.getByRole('button', {name: 'التبديل للعربية'}).first().click();await customer.page.waitForFunction(()=>document.documentElement.lang === 'ar');
  await customer.page.waitForFunction(()=>document.querySelector('input[name=displayName]')?.value === 'محتوى العميل كما هو');
  assert.equal(await customer.page.locator('input[name=displayName]').inputValue(), 'محتوى العميل كما هو');
  await customer.page.getByRole('button', {name: 'Switch to English'}).first().click();await customer.page.waitForFunction(()=>document.documentElement.lang === 'en');
  assert.equal(await customer.page.locator('textarea[name=shortDescription]').inputValue(), 'نص عربي كتبه المالك');
  checks.push('Page editor draft and author language survive switching');
  await customer.page.locator('input[name=displayName]').fill('CliQo test profile');
  await customer.page.locator('textarea[name=shortDescription]').fill('Test profile');
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=', 'base64');
  await customer.page.locator('input[name=avatar]').setInputFiles({name: 'avatar.png', mimeType: 'image/png', buffer: pixel});
  await customer.page.locator('input[name=cover]').setInputFiles({name: 'cover.png', mimeType: 'image/png', buffer: pixel});
  assert.equal(await customer.page.evaluate(async () => {
    const avatar = document.querySelector('img[class*=previewAvatar]');
    return (await fetch(avatar.src)).ok;
  }), true, 'Choosing a cover keeps the avatar blob available');
  await customer.page.evaluate(() => { const remove = Storage.prototype.removeItem; Storage.prototype.removeItem = function (key) { if (key.startsWith('cliqo-page-draft:')) throw new DOMException('Blocked', 'SecurityError'); return remove.call(this, key); }; });
  await customer.page.locator('form:has(input[name=avatar]) button[type=submit]').click();
  await customer.page.waitForURL('**/dashboard/pages');
  const firstImage = (await db.query('select avatar_path from public.merchant_pages where id=$1', [pageId])).rows[0].avatar_path;
  assert.ok(firstImage?.startsWith(customer.id+'/'+pageId+'/avatar-'));
  assets.push(firstImage);
  assets.push((await db.query('select cover_path from public.merchant_pages where id=$1', [pageId])).rows[0].cover_path);
  checks.push('Avatar preview survives cover selection and saving works with blocked tab storage');
  await go(customer.page, '/dashboard/pages/'+pageId);
  assert.ok(await customer.page.locator('img[class*=previewAvatar]').count(), 'Saved avatar renders in editor');
  await customer.page.locator('input[name=avatar]').setInputFiles({name: 'replacement.png', mimeType: 'image/png', buffer: pixel});
  await customer.page.locator('form:has(input[name=avatar]) button[type=submit]').click();
  await customer.page.waitForURL('**/dashboard/pages');
  const secondImage = (await db.query('select avatar_path from public.merchant_pages where id=$1', [pageId])).rows[0].avatar_path;
  assert.ok(secondImage?.startsWith(customer.id+'/'+pageId+'/avatar-'));
  assert.notEqual(secondImage, firstImage);
  assets.push(secondImage);
  const assetRows = (await db.query("select name from storage.objects where bucket_id='merchant-assets' and name=any($1::text[])", [[firstImage,secondImage]])).rows.map(row=>row.name);
  assert.deepEqual(assetRows, [secondImage], 'Replacement removes old avatar and retains new one');
  checks.push('Page avatar upload, save, render and replacement cleanup');
  const foreign = await other.auth.from('merchant_pages').select('id').eq('id', pageId);assert.equal(foreign.error, null);assert.deepEqual(foreign.data, []);
  const foreignItem = await other.auth.from('smart_items').select('id').eq('id', item.id);assert.equal(foreignItem.error, null);assert.deepEqual(foreignItem.data, []);
  checks.push('Second customer cannot read another owner’s page or item');
  for (const path of ['/cliqo-control/orders','/cliqo-control/customers','/cliqo-control/inventory','/cliqo-control/policies','/cliqo-control/settings']) {
    await go(owner.page, path);assert.equal(new URL(owner.page.url()).pathname, path);
    for (const scope of ['.ops-sidebar','.ops-topbar','.ops-heading']) await assertEnglish(owner.page, scope);
    await owner.page.setViewportSize({width: 390, height: 844});assert.ok(await owner.page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), path+' overflow');
    await owner.page.setViewportSize({width: 1440, height: 1000});checks.push(`Owner ${path}: English shell and mobile layout`);
  }
  await go(owner.page, '/cliqo-control/policies');
  assert.equal(await owner.page.locator('article[id]').count(), 4, 'Owner can manage all four policy pages');
  assert.equal(await owner.page.locator('textarea[name=arabic_body]').count(), 4);
  assert.equal(await owner.page.locator('textarea[name=english_body]').count(), 4);
  assert.equal(await owner.page.getByRole('button', {name: 'Publish both versions'}).count(), 4);
  checks.push('Owner policy editor exposes four bilingual draft and publish forms');
  await go(owner.page, '/cliqo-control/settings');
  assert.equal(await owner.page.locator('input[name=support_email][type=email]').count(), 1);
  assert.equal(await owner.page.locator('input[name=support_whatsapp]').count(), 1);
  checks.push('Owner can configure email and WhatsApp support channels');
  await go(owner.page, '/cliqo-control/inventory');
  await owner.page.locator('.sku-create-details > summary').click();
  const creation = owner.page.locator('.sku-create-form');
  await creation.locator('select').nth(0).selectOption(families[0].id);
  await creation.locator('select').nth(1).selectOption('review');
  await creation.locator('select').nth(2).selectOption('أبيض');
  assert.equal(await creation.locator('select').nth(2).inputValue(), 'أبيض');
  const draftName = 'CliQo local draft '+randomBytes(4).toString('hex');
  draftNames.push(draftName);
  await creation.locator('input[name=name]').fill(draftName);
  const draftForm = await creation.evaluate((form) => ({nameLength: String(new FormData(form).get('name') ?? '').length, familyValid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(form.querySelector('select').value)}));
  assert.ok(draftForm.nameLength > 1 && draftForm.familyValid, 'Valid test draft form');
  await creation.locator('button[type=submit]').click();
  await owner.page.locator('.sku-action-message').waitFor();
  const creationMessage = await owner.page.locator('.sku-action-message').innerText();
  assert.ok(creationMessage.includes('CQ-'), creationMessage);
  const draft = await db.query('select id,options,state from public.product_skus where display_name=$1', [draftName]);
  assert.equal(draft.rows.length,1);skus.push(draft.rows[0].id);
  assert.equal(draft.rows[0].options.variant,'أبيض');assert.equal(draft.rows[0].state,'preparing');checks.push('English SKU creation preserves the stored Arabic color and draft sale gate');
  const activationCode=String(randomInt(0,1_000_000)).padStart(6,'0');
  assert.match(activationCode,/^\d{6}$/);
  const readyItem=await db.query("insert into public.smart_items(sku_id,state) values($1,'ready') returning id,public_id",[sku]);
  const ready=readyItem.rows[0];items.push(ready.id);
  await db.query('insert into public.smart_item_activation_tokens(smart_item_id,token_hash) values($1,$2)',[ready.id,createHash('sha256').update(activationCode).digest('hex')]);
  const wrongCode=activationCode==='000000'?'000001':'000000';
  const wrongClaim=await other.auth.rpc('claim_stand_activation',{p_token_hash:createHash('sha256').update(wrongCode).digest('hex'),p_public_id:ready.public_id});
  assert.equal(wrongClaim.error,null);assert.equal(wrongClaim.data,false,'A second account cannot claim the scanned unit with a wrong code');
  assert.equal((await db.query('select owner_user_id from public.smart_items where id=$1',[ready.id])).rows[0].owner_user_id,null);
  await go(customer.page, '/activate');
  await customer.page.getByText('Already have the item link?').click();
  await customer.page.locator('#item-link').fill('https://example.com/s/'+ready.public_id);
  await customer.page.getByRole('button', {name: 'Open item link', exact: true}).click();
  await customer.page.getByRole('alert').filter({hasText: 'Paste the CliQo link for your item.'}).waitFor();
  await customer.page.locator('#item-link').fill(base+'/s/'+ready.public_id);
  await customer.page.getByRole('button', {name: 'Open item link', exact: true}).click();
  await customer.page.waitForURL('**/s/'+ready.public_id);
  await customer.page.locator('a[href^="/activate?item="]').click();
  await customer.page.locator('[data-testid="activation-form"][data-hydrated="true"] #activation').fill(activationCode);
  await customer.page.locator('button[type=submit]').click();await customer.page.waitForURL('**/dashboard/items/'+ready.public_id);
  assert.equal((await db.query('select owner_user_id from public.smart_items where id=$1',[ready.id])).rows[0].owner_user_id,customer.id);
  const replayClaim=await other.auth.rpc('claim_stand_activation',{p_token_hash:createHash('sha256').update(activationCode).digest('hex'),p_public_id:ready.public_id});
  assert.equal(replayClaim.error,null);assert.equal(replayClaim.data,false,'A consumed code cannot move the item to another account');
  assert.equal((await db.query('select owner_user_id from public.smart_items where id=$1',[ready.id])).rows[0].owner_user_id,customer.id);
  const attachPage=await customer.auth.from('smart_items').update({landing_page_id:pageId}).eq('id',ready.id).select('id');
  assert.equal(attachPage.error,null);assert.deepEqual(attachPage.data.map(row=>row.id),[ready.id]);
  checks.push('Six-digit code activates only the scanned item for one account; wrong-code and replay attempts fail');
  const lockCode=String(randomInt(0,1_000_000)).padStart(6,'0');
  const lockWrongCode=String((Number(lockCode)+1)%1_000_000).padStart(6,'0');
  const lockItemResult=await db.query("insert into public.smart_items(sku_id,state) values($1,'ready') returning id,public_id",[sku]);
  const lockItem=lockItemResult.rows[0];items.push(lockItem.id);
  await db.query('insert into public.smart_item_activation_tokens(smart_item_id,token_hash) values($1,$2)',[lockItem.id,createHash('sha256').update(lockCode).digest('hex')]);
  for(let attempt=0;attempt<5;attempt++){
    const failed=await other.auth.rpc('claim_stand_activation',{p_token_hash:createHash('sha256').update(lockWrongCode).digest('hex'),p_public_id:lockItem.public_id});
    assert.equal(failed.error,null);assert.equal(failed.data,false);
  }
  const lockedClaim=await customer.auth.rpc('claim_stand_activation',{p_token_hash:createHash('sha256').update(lockCode).digest('hex'),p_public_id:lockItem.public_id});
  assert.equal(lockedClaim.error,null);assert.equal(lockedClaim.data,false,'Five failed guesses lock the item temporarily');
  const lockState=await db.query('select locked_until>now() as active from app_private.activation_claim_attempts where smart_item_id=$1',[lockItem.id]);
  assert.equal(lockState.rows[0]?.active,true);
  checks.push('The item blocks activation for 15 minutes after five wrong codes');
  const paymentSku=randomUUID();skus.push(paymentSku);
  await db.query("insert into public.product_skus(id,product_family_id,sku_code,display_name,options) values($1,$2,$3,$4,$5::jsonb)",[paymentSku,families[0].id,'CQ-I18N-'+randomBytes(4).toString('hex').toUpperCase(),'ستاند NFC',JSON.stringify({face:'instapay',variant:'InstaPay',design:'T0'})]);
  const paymentResult=await db.query("insert into public.smart_items(sku_id,state,owner_user_id,payment_identifier,recipient_label) values($1,'claimed',$2,'test@instapay','CliQo test recipient') returning id,public_id",[paymentSku,customer.id]);
  const paymentItem=paymentResult.rows[0];items.push(paymentItem.id);
  await go(other.page,'/s/'+paymentItem.public_id);await assertEnglish(other.page);
  assert.equal(await other.page.locator('code').innerText(),'test@instapay');checks.push('Public payment shell translates while recipient details remain intact');
  await go(other.page, '/cliqo-control/orders');assert.equal(await other.page.locator('.ops-layout').count(), 0);assert.equal(await other.page.locator('main.unavailable').count(), 1);checks.push('Customer remains blocked from the owner dashboard');
  await go(other.page, '/s/'+ready.public_id);assert.ok(await other.page.getByText('CliQo test profile', {exact: true}).count());await assertEnglish(other.page);
  const link = await other.page.locator('a[href*="/go/"]').getAttribute('href');assert.ok(link.startsWith('/s/'+ready.public_id+'/go/'));
  const redirect = await other.context.request.get(base+link, {maxRedirects: 0});assert.equal(redirect.status(), 307);assert.equal(redirect.headers()['location'], 'https://example.com/');assert.match(redirect.headers()['cache-control'], /(?:^|,)\s*no-store(?:,|$)/);checks.push('Printed URL and click redirect remain stable and uncached');
  const savedLink=(await db.query('select id from public.merchant_page_links where page_id=$1 order by sort_order,id limit 1',[pageId])).rows[0];
  assert.ok(savedLink,'The customer page has a destination link to update');
  const destinationUpdate=await customer.auth.rpc('save_merchant_page',{p_page_id:pageId,p_display_name:'CliQo test profile',p_short_description:'Test profile',p_avatar_path:null,p_cover_path:null,p_is_published:true,p_links:[{id:savedLink.id,label:'Website',destination_url:'https://example.org/updated',is_enabled:true}]});
  assert.equal(destinationUpdate.error,null);
  await go(other.page,'/s/'+ready.public_id);
  assert.ok(await other.page.getByText('CliQo test profile',{exact:true}).count());
  const unchangedLink=await other.page.locator('a[href*="/go/"]').getAttribute('href');
  assert.equal(unchangedLink,link,'The printed item URL and link path stay stable after the destination edit');
  const changedRedirect=await other.context.request.get(base+unchangedLink,{maxRedirects:0});
  assert.equal(changedRedirect.status(),307);assert.equal(changedRedirect.headers()['location'],'https://example.org/updated');
  checks.push('The same activated item URL now redirects to its newly saved destination');
  const [itemMetrics,pageMetrics,breakdown,foreignMetrics,futureMetrics] = await Promise.all([
    customer.auth.rpc('get_my_item_analytics'),
    customer.auth.rpc('get_my_page_analytics'),
    customer.auth.rpc('get_my_page_click_breakdown'),
    other.auth.rpc('get_my_item_analytics'),
    customer.auth.rpc('get_my_item_analytics',{p_since:new Date(Date.now()+60000).toISOString()}),
  ]);
  for(const result of [itemMetrics,pageMetrics,breakdown,foreignMetrics,futureMetrics])assert.equal(result.error,null);
  const itemCount=itemMetrics.data.find(row=>row.smart_item_id===ready.id);
  const pageCount=pageMetrics.data.find(row=>row.landing_page_id===pageId);
  assert.ok(Number(itemCount?.opens)>=1 && Number(itemCount?.clicks)>=1);
  assert.ok(Number(pageCount?.opens)>=1 && Number(pageCount?.clicks)>=1);
  assert.ok(breakdown.data.some(row=>row.landing_page_id===pageId && row.smart_item_id===ready.id && Number(row.clicks)>=1));
  assert.ok(!foreignMetrics.data.some(row=>row.smart_item_id===ready.id));
  assert.equal(Number(futureMetrics.data.find(row=>row.smart_item_id===ready.id)?.opens),0);
  checks.push('Real opens and clicks reach item/page analytics, filter by time, and stay private to the owner');
  const [trend, foreignTrend] = await Promise.all([
    customer.auth.rpc('get_my_analytics_trend',{p_period:'7d'}),
    other.auth.rpc('get_my_analytics_trend',{p_period:'7d'}),
  ]);
  assert.equal(trend.error, null);
  assert.equal(foreignTrend.error, null);
  assert.ok(trend.data.some((row) => Number(row.opens) > 0 && Number(row.clicks) > 0));
  assert.ok(foreignTrend.data.every((row) => Number(row.opens) === 0 && Number(row.clicks) === 0));
  await go(customer.page, '/dashboard/analytics?period=7d');
  await customer.page.getByText('View chart data', {exact: true}).click();
  await customer.page.getByRole('table').waitFor();
  checks.push('Analytics timeline renders a data table and aggregates only the signed-in owner’s events');

  await go(customer.page, '/dashboard/items/'+ready.public_id);
  customer.page.once('dialog', dialog => dialog.accept());
  await customer.page.getByRole('button', {name: 'Archive item', exact: true}).click();
  await customer.page.waitForURL('**/dashboard?view=archive#items');
  await customer.page.getByTestId('customer-item').getByRole('link', {name: 'Restore item', exact: true}).waitFor();
  const archived = await db.query('select state, archived_at, landing_page_id from public.smart_items where id=$1',[ready.id]);
  assert.equal(archived.rows[0].state, 'disabled');
  assert.ok(archived.rows[0].archived_at);
  assert.equal(archived.rows[0].landing_page_id, pageId);
  await go(other.page, '/s/'+ready.public_id);
  assert.match(await other.page.locator('h1').innerText(), /temporarily down/i);
  assert.ok((await customer.auth.from('smart_items').update({state:'claimed'}).eq('id',ready.id)).error, 'Archived links cannot be resumed directly');
  assert.deepEqual((await other.auth.from('smart_items').update({archived_at:null}).eq('id',ready.id).select('id')).data, []);
  await customer.page.getByRole('link', {name: 'Restore item', exact: true}).click();
  await customer.page.getByRole('button', {name: 'Restore item', exact: true}).click();
  await customer.page.waitForURL('**/dashboard#items');
  const restored = await db.query('select state, archived_at from public.smart_items where id=$1',[ready.id]);
  assert.equal(restored.rows[0].archived_at, null);
  assert.equal(restored.rows[0].state, 'disabled');
  assert.equal((await customer.auth.from('smart_items').update({state:'claimed'}).eq('id',ready.id)).error, null);
  checks.push('Archive pauses the printed link, prevents foreign changes and restores the item with its settings intact');

  const closedQuote = await customer.context.request.post(base + '/api/checkout/quote', {data:{items:[{sku_id:sku,quantity:1}]}});
  assert.ok([409,503].includes(closedQuote.status()));checks.push('Unapproved fixture cannot be purchased; sale gates remain closed');
  const ordersBefore=(await db.query('select count(*)::int as count from public.orders')).rows[0].count;
  const closedOrder=await customer.context.request.post(base+'/api/orders',{data:{items:[{sku_id:sku,quantity:1}],payment_method:'cod',requestKey:randomBytes(32).toString('hex'),name:'Local checkout verification',phone:'+201012345678',email:'checkout@example.invalid',address:{governorate:'Cairo',city:'Cairo',street:'Local test street 1'}}});
  assert.equal(closedOrder.status(),503,'Checkout does not create a real order while sales gates are closed');
  assert.equal((await db.query('select count(*)::int as count from public.orders')).rows[0].count,ordersBefore);
  checks.push('Closed checkout rejects the order request and leaves order records unchanged');
  // Preserve an Arabic author name on the English public shell.
  await db.query('update public.merchant_pages set display_name=$1 where id=$2', ['اسم النشاط الأصلي', pageId]);
  await go(other.page, '/s/'+item.public_id);assert.equal(await other.page.locator('h1').innerText(), 'اسم النشاط الأصلي');assert.equal(await other.page.locator('h1').getAttribute('dir'), 'auto');checks.push('Public profile preserves merchant-authored Arabic with automatic direction');
  await db.query("update public.smart_items set state='disabled' where id=$1", [item.id]);await go(other.page, '/s/'+item.public_id);await assertEnglish(other.page);checks.push('Paused item uses translated safe state');
  await go(customer.page, '/dashboard/items/'+item.public_id);
  await customer.page.getByRole('button', {name: 'Resume', exact: true}).click();
  await customer.page.getByRole('button', {name: 'Pause', exact: true}).waitFor();
  customer.page.once('dialog', dialog => dialog.dismiss());
  await customer.page.getByRole('button', {name: 'Pause', exact: true}).click();
  assert.equal((await db.query('select state from public.smart_items where id=$1', [item.id])).rows[0].state, 'claimed');
  customer.page.once('dialog', dialog => dialog.accept());
  await customer.page.getByRole('button', {name: 'Pause', exact: true}).click();
  await customer.page.getByRole('button', {name: 'Resume', exact: true}).waitFor();
  assert.equal((await db.query('select state from public.smart_items where id=$1', [item.id])).rows[0].state, 'disabled');
  checks.push('Item resumes, pause cancellation preserves state, and confirmed pause updates ownership-scoped state');
  await go(customer.page, '/dashboard');
  const groupSelect = customer.page.getByLabel('Item type and use');
  const paymentGroup = await groupSelect.locator('option').filter({hasText: 'InstaPay'}).getAttribute('value');
  await groupSelect.selectOption(paymentGroup);
  await customer.page.getByRole('button', {name: 'Filter', exact: true}).click();
  await customer.page.waitForURL('**/dashboard?group=**#items');
  assert.equal(await customer.page.getByTestId('customer-item').count(), 1);
  checks.push('Inventory filters by product subtype');

  const screenshots = process.env.CLIQO_DASHBOARD_QA_SCREENSHOTS;
  if (screenshots) await mkdir(screenshots, {recursive:true});
  await customer.context.addCookies([{name: 'cliqo-locale', value: 'ar', url: base}]);
  for (const [path, name] of [['/dashboard','overview'], ['/dashboard/pages','pages'], ['/dashboard/pages/new','editor'], ['/dashboard/items/'+ready.public_id,'item'], ['/dashboard/analytics','analytics'], ['/dashboard/profile','profile'], ['/activate','activation']]) {
    await go(customer.page, path);
    assert.equal(await customer.page.locator('html').getAttribute('dir'), 'rtl');
    if (path.startsWith('/dashboard')) {
      const box = await customer.page.getByRole('navigation', {name: 'لوحة العميل'}).boundingBox();
      assert.ok(box.x > 720, path+' sidebar is on the right in Arabic');
    }
    if (screenshots) await customer.page.addStyleTag({content: 'nextjs-portal { display: none }'});
    if (screenshots && name === 'overview') await customer.page.screenshot({path: screenshots+'/overview-desktop.png', animations: 'disabled', caret: 'initial'});
    for (const width of [320,390]) {
      await customer.page.setViewportSize({width,height:844});
      assert.ok(await customer.page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), path+' overflow at '+width);
    }
    if (screenshots && ['overview','analytics','profile','activation'].includes(name)) {
      await customer.page.screenshot({path:screenshots+'/'+name+'-mobile.png',animations:'disabled',caret:'initial',fullPage:true});
    }
    await customer.page.setViewportSize({width:1440,height:1000});
  }
  await customer.context.addCookies([{name: 'cliqo-locale', value: 'en', url: base}]);
  checks.push('All customer routes fit Arabic mobile viewports at 320 and 390 px and share right-hand desktop navigation');

  await go(customer.page, '/dashboard/profile');await customer.page.getByRole('button', {name: 'Sign out', exact: true}).click();await customer.page.waitForURL('**/login');assert.equal(await customer.page.locator('html').getAttribute('lang'), 'en');checks.push('Sign out preserves locale');
  assert.deepEqual(browserErrors, []);
  await mkdir(new URL('../../output/cliqo-bilingual-review/', import.meta.url), {recursive:true});
  await writeFile(new URL('../../output/cliqo-bilingual-review/auth-checks.json', import.meta.url), JSON.stringify({checks, errors: browserErrors},null,2));console.log(`${checks.length} local authenticated scenarios passed.`);
} finally {
  await browser.close();
  if (assets.length) await admin.storage.from('merchant-assets').remove(assets);
  if (items.length) await db.query('delete from public.smart_items where id=any($1::uuid[])', [items]);
  if (skus.length) await db.query('delete from public.product_skus where id=any($1::uuid[])', [skus]);
  if (draftNames.length) await db.query('delete from public.product_skus where display_name=any($1::text[])', [draftNames]);
  for (const id of users) await admin.auth.admin.deleteUser(id);
  await db.end();
}
