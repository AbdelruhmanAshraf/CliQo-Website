// Local-only integration proof. Creates disposable accounts/items and removes them in finally.
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {randomUUID, randomBytes, createHash} from 'node:crypto';
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
const users = [], items = [], skus = [], draftNames = [], checks = [], browserErrors = [];
async function createAccount(role) {
  const email = `cliqo-local-${randomUUID()}@example.invalid`, password = randomBytes(24).toString('hex');
  const {data, error} = await admin.auth.admin.createUser({email, password, email_confirm: true});
  if (error) throw new Error(error.message); const id = data.user.id; users.push(id);
  if (role) await db.query('insert into public.staff_members(user_id,display_name,role) values($1,$2,$3)', [id, 'CliQo test owner', role]);
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}}); let authCookies = [];
  const auth = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {cookies: {getAll: () => [], setAll: (values) => {authCookies = values;}}});
  const session = await auth.auth.signInWithPassword({email, password}); if (session.error) throw new Error(session.error.message);
  await context.addCookies(authCookies.map((cookie) => ({name: cookie.name, value: cookie.value, url: base, httpOnly: cookie.options?.httpOnly ?? false, sameSite: 'Lax'})));
  await context.addCookies([{name: 'cliqo-locale', value: 'en', url: base}]);
  const page = await context.newPage();page.on('pageerror', (error) => browserErrors.push(error.message));
  return {id, context, page, auth};
}
async function assertEnglish(page, scope = 'main') {
  const strings = await page.locator(scope).first().evaluate((root) => {
    const values = [], walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let node;
    while ((node = walker.nextNode())) {if (!node.parentElement?.getClientRects().length || node.parentElement.closest('script,style')) continue; const value = node.textContent.trim(); if (/[\u0621-\u064a]/.test(value.replaceAll('كليكو', '').replaceAll('العربية', ''))) values.push(value);}
    return [...new Set(values)];
  });assert.deepEqual(strings, [], `${new URL(page.url()).pathname}: untranslated UI`);
}
async function go(page, path) {console.log('Checking', path.split('?')[0]);await page.goto(base + path, {waitUntil: 'domcontentloaded'});await page.locator('h1').first().waitFor();}
try {
  const customer = await createAccount(), other = await createAccount(), owner = await createAccount('owner');
  const {rows: families} = await db.query("select id from public.product_families where family_key='stand'"); assert.ok(families[0]);
  const sku = randomUUID();skus.push(sku);
  await db.query("insert into public.product_skus(id,product_family_id,sku_code,display_name,options) values($1,$2,$3,$4,$5::jsonb)", [sku, families[0].id, 'CQ-I18N-'+randomBytes(4).toString('hex').toUpperCase(), 'ستاند NFC', JSON.stringify({face: 'all-in-one', variant: 'All-in-One', design: 'T0'})]);
  const saved = await customer.auth.rpc('save_merchant_page', {p_page_id: null, p_display_name: 'CliQo test profile', p_short_description: 'Test profile', p_avatar_path: null, p_cover_path: null, p_is_published: true, p_links: [{id: null, label: 'Website', destination_url: 'https://example.com', is_enabled: true}]});
  assert.equal(saved.error, null); const pageId = saved.data;
  const {rows} = await db.query("insert into public.smart_items(sku_id,state,owner_user_id,landing_page_id) values($1,'claimed',$2,$3) returning id,public_id", [sku, customer.id, pageId]);const item = rows[0]; items.push(item.id);
  for (const path of ['/dashboard', '/dashboard/pages', '/dashboard/analytics', '/dashboard/items/'+item.public_id, '/dashboard/pages/'+pageId, '/dashboard/pages/new', '/activate?item='+item.public_id]) {
    await go(customer.page, path);assert.equal(new URL(customer.page.url()).pathname, path.split('?')[0]);await assertEnglish(customer.page);checks.push(`Authenticated English ${path.split('?')[0]}`);
  }
  await go(customer.page, '/dashboard/pages/'+pageId);
  await customer.page.locator('input[name=displayName]').fill('محتوى العميل كما هو');
  await customer.page.locator('textarea[name=shortDescription]').fill('نص عربي كتبه المالك');
  await customer.page.getByRole('button', {name: 'التبديل للعربية'}).first().click();await customer.page.waitForFunction(()=>document.documentElement.lang === 'ar');
  assert.equal(await customer.page.locator('input[name=displayName]').inputValue(), 'محتوى العميل كما هو');
  await customer.page.getByRole('button', {name: 'Switch to English'}).first().click();await customer.page.waitForFunction(()=>document.documentElement.lang === 'en');
  assert.equal(await customer.page.locator('textarea[name=shortDescription]').inputValue(), 'نص عربي كتبه المالك');
  checks.push('Page editor draft and author language survive switching');
  const foreign = await other.auth.from('merchant_pages').select('id').eq('id', pageId);assert.equal(foreign.error, null);assert.deepEqual(foreign.data, []);
  const foreignItem = await other.auth.from('smart_items').select('id').eq('id', item.id);assert.equal(foreignItem.error, null);assert.deepEqual(foreignItem.data, []);
  checks.push('Second customer cannot read another owner’s page or item');
  for (const path of ['/admin/orders','/admin/customers','/admin/inventory','/admin/items','/admin/settings']) {
    await go(owner.page, path);assert.equal(new URL(owner.page.url()).pathname, path);
    for (const scope of ['.ops-sidebar','.ops-topbar','.ops-heading']) await assertEnglish(owner.page, scope);
    await owner.page.setViewportSize({width: 390, height: 844});assert.ok(await owner.page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), path+' overflow');
    await owner.page.setViewportSize({width: 1440, height: 1000});checks.push(`Owner ${path}: English shell and mobile layout`);
  }
  await go(owner.page, '/admin/inventory');
  const creation = owner.page.locator('.sku-create-form');
  await creation.locator('select').nth(0).selectOption(families[0].id);
  await creation.locator('select').nth(1).selectOption('review');
  await creation.locator('select').nth(2).selectOption('أبيض');
  assert.equal(await creation.locator('select').nth(2).inputValue(), 'أبيض');
  const draftName = 'CliQo local draft '+randomBytes(4).toString('hex');
  draftNames.push(draftName);
  await creation.locator('input[name=displayName]').fill(draftName);
  const draftForm = await creation.evaluate((form) => ({nameLength: String(new FormData(form).get('displayName') ?? '').length, familyValid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(form.querySelector('select').value)}));
  assert.ok(draftForm.nameLength > 1 && draftForm.familyValid, 'Valid test draft form');
  await creation.locator('button[type=submit]').click();
  await owner.page.locator('.sku-action-message').waitFor();
  const creationMessage = await owner.page.locator('.sku-action-message').innerText();
  assert.ok(creationMessage.includes('CQ-'), creationMessage);
  const draft = await db.query('select id,options,state from public.product_skus where display_name=$1', [draftName]);
  assert.equal(draft.rows.length,1);skus.push(draft.rows[0].id);
  assert.equal(draft.rows[0].options.variant,'أبيض');assert.equal(draft.rows[0].state,'preparing');checks.push('English SKU creation preserves the stored Arabic color and draft sale gate');
  const activationCode=randomBytes(16).toString('hex');
  const readyItem=await db.query("insert into public.smart_items(sku_id,state) values($1,'ready') returning id,public_id",[sku]);
  const ready=readyItem.rows[0];items.push(ready.id);
  await db.query('insert into public.smart_item_activation_tokens(smart_item_id,token_hash) values($1,$2)',[ready.id,createHash('sha256').update(activationCode).digest('hex')]);
  await go(customer.page,'/activate?item='+ready.public_id);await customer.page.locator('#activation').fill(activationCode);
  await customer.page.locator('button[type=submit]').click();await customer.page.waitForURL('**/dashboard/items/'+ready.public_id);
  assert.equal((await db.query('select owner_user_id from public.smart_items where id=$1',[ready.id])).rows[0].owner_user_id,customer.id);
  checks.push('Private activation claim succeeds through the translated UI');
  const paymentSku=randomUUID();skus.push(paymentSku);
  await db.query("insert into public.product_skus(id,product_family_id,sku_code,display_name,options) values($1,$2,$3,$4,$5::jsonb)",[paymentSku,families[0].id,'CQ-I18N-'+randomBytes(4).toString('hex').toUpperCase(),'ستاند NFC',JSON.stringify({face:'instapay',variant:'InstaPay',design:'T0'})]);
  const paymentResult=await db.query("insert into public.smart_items(sku_id,state,owner_user_id,payment_identifier,recipient_label) values($1,'claimed',$2,'test@instapay','CliQo test recipient') returning id,public_id",[paymentSku,customer.id]);
  const paymentItem=paymentResult.rows[0];items.push(paymentItem.id);
  await go(other.page,'/s/'+paymentItem.public_id);await assertEnglish(other.page);
  assert.equal(await other.page.locator('code').innerText(),'test@instapay');checks.push('Public payment shell translates while recipient details remain intact');
  await go(other.page, '/admin/orders');assert.equal(await other.page.locator('.ops-layout').count(), 0);assert.equal(await other.page.locator('main.unavailable').count(), 1);checks.push('Customer remains blocked from the owner dashboard');
  await go(other.page, '/s/'+item.public_id);assert.ok(await other.page.getByText('CliQo test profile', {exact: true}).count());await assertEnglish(other.page);
  const link = await other.page.locator('a[href*="/go/"]').getAttribute('href');assert.ok(link.startsWith('/s/'+item.public_id+'/go/'));
  const redirect = await other.context.request.get(base+link, {maxRedirects: 0});assert.equal(redirect.status(), 307);assert.equal(redirect.headers()['location'], 'https://example.com/');assert.match(redirect.headers()['cache-control'], /(?:^|,)\s*no-store(?:,|$)/);checks.push('Printed URL and click redirect remain stable and uncached');
  const closedQuote = await customer.context.request.post(base + '/api/checkout/quote', {data:{items:[{sku_id:sku,quantity:1}]}});
  assert.ok([409,503].includes(closedQuote.status()));checks.push('Unapproved fixture cannot be purchased; sale gates remain closed');
  // Preserve an Arabic author name on the English public shell.
  await db.query('update public.merchant_pages set display_name=$1 where id=$2', ['اسم النشاط الأصلي', pageId]);
  await go(other.page, '/s/'+item.public_id);assert.equal(await other.page.locator('h1').innerText(), 'اسم النشاط الأصلي');assert.equal(await other.page.locator('h1').getAttribute('dir'), 'auto');checks.push('Public profile preserves merchant-authored Arabic with automatic direction');
  await db.query("update public.smart_items set state='disabled' where id=$1", [item.id]);await go(other.page, '/s/'+item.public_id);await assertEnglish(other.page);checks.push('Paused item uses translated safe state');
  await go(customer.page, '/dashboard');await customer.page.getByRole('button', {name: 'Sign out', exact: true}).click();await customer.page.waitForURL('**/login');assert.equal(await customer.page.locator('html').getAttribute('lang'), 'en');checks.push('Sign out preserves locale');
  assert.deepEqual(browserErrors, []);
  await mkdir(new URL('../../output/cliqo-bilingual-review/', import.meta.url), {recursive:true});
  await writeFile(new URL('../../output/cliqo-bilingual-review/auth-checks.json', import.meta.url), JSON.stringify({checks, errors: browserErrors},null,2));console.log(`${checks.length} local authenticated scenarios passed.`);
} finally {
  await browser.close();
  if (items.length) await db.query('delete from public.smart_items where id=any($1::uuid[])', [items]);
  if (skus.length) await db.query('delete from public.product_skus where id=any($1::uuid[])', [skus]);
  if (draftNames.length) await db.query('delete from public.product_skus where display_name=any($1::text[])', [draftNames]);
  for (const id of users) await admin.auth.admin.deleteUser(id);
  await db.end();
}
