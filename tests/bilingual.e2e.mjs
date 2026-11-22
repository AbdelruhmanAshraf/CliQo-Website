import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base = process.env.CLIQO_TEST_URL || 'http://localhost:4173';
const output = new URL('../../output/cliqo-bilingual-review/', import.meta.url);
await mkdir(output, {recursive: true});
const browser = await chromium.launch({channel: process.env.CLIQO_BROWSER_CHANNEL || 'chrome', headless: true});
const failures = [], checks = [];
const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
const page = await context.newPage();page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(60000);
page.on('pageerror', (error) => failures.push(error.message));
async function visit(path) {await page.goto(base + path, {waitUntil: 'domcontentloaded'}); await page.locator('h1').first().waitFor();if(path==='/products/stand')await page.locator('.store-design-list button').first().waitFor();}
async function switchTo(locale) {
  if (await page.locator('html').getAttribute('lang') === locale) return;
  await page.getByRole('button', {name: locale === 'en' ? 'Switch to English' : 'التبديل للعربية'}).first().click();
  await page.waitForFunction((lang) => document.documentElement.lang === lang, locale);
  if (currentPath === '/products/stand') await page.locator('.store-design-list button').first().waitFor();
  assert.equal(new URL(page.url()).pathname, new URL(base + currentPath).pathname);
}
async function untranslated() {
  return page.evaluate(() => {
    const results = [], walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style, nextjs-portal') || !parent.getClientRects().length) continue;
      const text = node.textContent.trim().replaceAll('كليكو', '').replaceAll('العربية', '');
      // Arabic digits are intentional values rather than untranslated UI copy.
      if (/[\u0621-\u064a\u0671-\u06d3]/.test(text)) results.push(text);
    }
    return [...new Set(results)];
  });
}
let currentPath = '/';
try {
  await visit('/'); assert.equal(await page.locator('html').getAttribute('lang'), 'ar');
  await switchTo('en');
  const cookie = (await context.cookies()).find((cookie) => cookie.name === 'cliqo-locale');
  assert.equal(cookie.value, 'en'); assert.ok(cookie.expires * 1000 - Date.now() > 360 * 86400000);
  await page.reload(); assert.equal(await page.locator('html').getAttribute('dir'), 'ltr');
  assert.equal(await page.locator('.campaign-family-card').count(), 3);
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({width, height: width < 750 ? 844 : 1000});
    for (const locale of ['en', 'ar']) {
      currentPath = '/'; await switchTo(locale); await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${locale} horizontal overflow at ${width}`);
      assert.ok(await page.evaluate(() => Array.from(document.fonts).some((font) => font.status === 'loaded' && font.family.toLowerCase().includes(document.documentElement.lang === 'en' ? 'avant' : 'forma'))));
      if ([390, 1440].includes(width)) {
        await page.locator('img').evaluateAll((images) => images.forEach((image) => image.loading = 'eager'));
        await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0));
        await page.screenshot({path: fileURLToPath(new URL(`home-${locale}-${width === 390 ? 'mobile' : 'desktop'}.png`, output)), fullPage: true});
      }
      checks.push(`Home ${locale}, ${width}px: direction, font, overflow`);
    }
  }
  await page.setViewportSize({width: 1440, height: 1000});
  for (const path of ['/products', '/products/stand', '/products/card', '/products/coaster', '/how-it-works', '/faq', '/contact', '/cart', '/checkout', '/login', '/guides', '/orders/CQ-000000', '/missing-page']) {
    currentPath = path; await visit(path); await switchTo('en');
    assert.deepEqual(await untranslated(), [], `${path} has untranslated visible copy`);
    assert.ok(!/[\u0621-\u064a]/.test((await page.title()).replaceAll('كليكو', '')), `${path} metadata`);
    await page.setViewportSize({width: 360, height: 844});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} horizontal overflow at 360px`);
    await page.setViewportSize({width: 1440, height: 1000});
    checks.push(`${path}: English copy, metadata, 360px overflow`);
  }
  for (const path of ['/products/wallet', '/products/magnetic-wallet', '/products/keychain']) {
    const response = await context.request.get(base + path);
    assert.equal(response.status(), 404, `${path} must stay hidden from visitors`);
  }
  checks.push('Unreleased wallet and keychain pages remain hidden');
  currentPath = '/products/stand'; await visit(currentPath);
  await page.locator('.store-design-list button').filter({hasText:'Facebook'}).click();
  await page.locator('input[name="tier"]').nth(1).check();
  await page.locator('input[name="businessName"]').fill('اختبار CliQo');
  await page.locator('input[name="destinationUrl"]').fill('https://example.com/test');
  await page.locator('.store-custom-form button[type="submit"]').click();
  await page.locator('.store-custom-form [role="status"]').waitFor();
  await page.locator('input[name="destinationUrl"]').fill('https://example.com/updated');
  assert.equal(await page.locator('.store-custom-form [role="status"]').count(), 0, 'Editing confirmed details requires confirmation again');
  await page.locator('input[name="destinationUrl"]').fill('https://example.com/test');
  checks.push('Edited custom design details invalidate the previous confirmation');
  await switchTo('ar');
  assert.match(await page.locator('.store-product-info h1').innerText(), /Facebook/);
  assert.equal(await page.locator('input[name="businessName"]').inputValue(), 'اختبار CliQo');
  assert.equal(await page.locator('input[name="destinationUrl"]').inputValue(), 'https://example.com/test');
  await switchTo('en');
  assert.equal(await page.locator('input[name="businessName"]').inputValue(), 'اختبار CliQo');
  checks.push('Product design and custom form state survive both language changes');
  // Seed a historical v1 cart only in this isolated browser; no database order is made.
  await page.evaluate(() => localStorage.setItem('cliqo-cart-v1', JSON.stringify([{key: 'legacy-example', skuId: '00000000-0000-4000-8000-000000000000', slug: 'stand', name: 'ستاند NFC', unitPriceEgp: 150.5, quantity: 2, choices: ['تقييم Google', 'أسود', 'T0']}])));
  currentPath = '/cart'; await visit('/cart'); await page.reload();
  assert.match(await page.locator('.st-cart-line-details').innerText(), /NFC stand[\s\S]*Black/);
  const before = await page.evaluate(() => localStorage.getItem('cliqo-cart-v1'));
  await switchTo('ar'); assert.equal(await page.evaluate(() => localStorage.getItem('cliqo-cart-v1')), before);
  await switchTo('en'); assert.equal(await page.evaluate(() => localStorage.getItem('cliqo-cart-v1')), before);
  checks.push('Legacy v1 cart retains IDs, quantities, prices and choices across languages');
  currentPath = '/login'; await visit('/login');
  await page.locator('#login-email').fill('local-check@example.invalid'); await switchTo('ar');
  assert.equal(await page.locator('#login-email').inputValue(), 'local-check@example.invalid');
  await switchTo('en'); assert.equal(await page.locator('#login-email').inputValue(), 'local-check@example.invalid');
  checks.push('Unsubmitted login form state survives language changes');
  for (const locale of ['ar', 'en']) {
    await context.addCookies([{name: 'cliqo-locale', value: locale, url: base}]);
    const response = await context.request.post(base + '/api/checkout/quote', {data: {items: []}});
    assert.equal(response.status(), 400); const body = await response.json();
    assert.equal(Object.keys(body).join(','), 'error');
    assert.equal(/[\u0621-\u064a]/.test(body.error), locale === 'ar');
  }
  checks.push('API validation keeps response shape and uses request locale');
  await context.addCookies([{name: 'cliqo-locale', value: 'unsupported', url: base}]);
  currentPath = '/'; await visit('/'); assert.equal(await page.locator('html').getAttribute('lang'), 'ar');
  checks.push('Invalid locale cookie safely falls back to Arabic');
  assert.deepEqual(failures, [], 'Browser errors');
  await writeFile(new URL('browser-checks.json', output), JSON.stringify({checks, errors: failures}, null, 2));
  console.log(`${checks.length} browser scenarios passed; desktop/mobile screenshots saved.`);
} finally {await context.close(); await browser.close();}
