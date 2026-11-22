import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const base = new URL(process.env.CLIQO_GUIDE_URL || 'http://127.0.0.1:4173');
if (!['127.0.0.1', 'localhost'].includes(base.hostname)) {
  throw new Error('This draft exporter only accepts a local preview. Review the guide on real hardware before production.');
}

const output = new URL('../output/pdf/cliqo-nfc-template-guide-draft-ar.pdf', import.meta.url);
await mkdir(new URL('../output/pdf/', import.meta.url), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ locale: 'ar-EG' });
  await context.addCookies([{ name: 'cliqo-locale', value: 'ar', url: base.href }]);
  const page = await context.newPage();
  const response = await page.goto(new URL('/guides', base).href, { waitUntil: 'networkidle' });
  if (!response?.ok()) throw new Error(`Guide preview returned ${response?.status() ?? 'no response'}`);
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => {
    const notice = document.createElement('p');
    notice.textContent = 'نسخة مراجعة محلية - تُختبر خطوات NFC على الشريحة والهاتف الفعليين قبل تسليمها مع المنتج.';
    notice.style.cssText = 'font: 15px sans-serif; color:#00241c; background:#ffffff; border:1px solid #ff6a00; padding:12px; margin:0 0 18px; direction:rtl;';
    document.querySelector('main section')?.before(notice);
  });
  await page.pdf({ path: fileURLToPath(output), format: 'A4', printBackground: true,
    margin: { top: '16mm', right: '16mm', bottom: '16mm', left: '16mm' } });
  console.log(`Created ${fileURLToPath(output)}`);
} finally {
  await browser.close();
}
