import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTranslator} from 'next-intl';
import ar from '../messages/ar.json';
import en from '../messages/en.json';
import {makeCopy} from '../i18n/copy';
import {skuLabel, optionLabel, snapshotLabel} from '../i18n/catalog';
import {isLocale} from '../i18n/config';
import {safeNextPath} from '../lib/safe-next-path';

const copy = (locale: 'ar' | 'en') => {
  const translate = createTranslator({locale, messages: locale === 'ar' ? ar : en, namespace: 'ui'});
  return makeCopy(locale, (key, values) => translate(key as keyof typeof ar.ui, values));
};
test('catalogs have matching keys and valid ICU messages in both languages', () => {
  assert.deepEqual(Object.keys(ar.ui).sort(), Object.keys(en.ui).sort());
  for (const locale of ['ar', 'en'] as const) {
    const errors: string[] = [];
    const t = createTranslator({locale, messages: locale === 'ar' ? ar : en, namespace: 'ui', onError: (error) => errors.push(error.message)});
    for (const key of Object.keys(ar.ui) as (keyof typeof ar.ui)[]) t(key, {value0: 'EXAMPLE', value1: 'EXAMPLE', value2: 'EXAMPLE'});
    assert.deepEqual(errors, []);
  }
});
test('English catalog contains no untranslated Arabic interface copy', () => {
  for (const source of Object.values(en.ui)) {
    assert.ok(!/[\u0600-\u06ff]/.test(source.replaceAll('كليكو', '').replaceAll('العربية', '')), source);
  }
});
test('SKU rendering translates labels without changing stored variant values', () => {
  const options = {face: 'review', variant: 'أسود', design: 'T0'};
  assert.match(skuLabel(copy('en'), 'stand', options), /NFC stand.*Google review.*Black.*T0/);
  assert.match(skuLabel(copy('ar'), 'stand', options), /ستاند NFC.*أسود/);
  assert.deepEqual(options, {face: 'review', variant: 'أسود', design: 'T0'});
  assert.equal(optionLabel(copy('en'), 'أبيض'), 'White');
  assert.equal(snapshotLabel(copy('en'), 'ستاند NFC · أسود · T0'), 'NFC stand · Black · T0 ready template');
});
test('interpolated action notices can switch languages after they arrive', () => {
  const message = 'تم إنشاء CQ-TEST كصنف قيد التجهيز.';
  const translated = copy('en')(message);
  assert.ok(!/[\u0600-\u06ff]/.test(translated));
  assert.equal(copy('ar')(translated), message);
});
test('unknown user-authored content remains unchanged', () => {
  for (const locale of ['ar', 'en'] as const) assert.equal(copy(locale)('اسم عميل خاص ٧'), 'اسم عميل خاص ٧');
});
test('currency retains EGP and locale selection accepts only the two supported languages', () => {
  assert.match(copy('en').money(150.5), /150\.50/);
  assert.match(copy('en').money(150.5), /EGP/);
  assert.equal(isLocale('fr'), false); assert.equal(isLocale('en'), true); assert.equal(isLocale('ar'), true);
});
test('auth return paths and printed QR destinations keep their existing contract', () => {
  assert.equal(safeNextPath('/activate?item=example'), '/activate?item=example');
  for (const input of ['//evil.example', '/\\evil.example', 'https://evil.example']) assert.equal(safeNextPath(input), '/dashboard');
  const qr = readFileSync(new URL('../lib/smart-item-qr.ts', import.meta.url), 'utf8');
  assert.ok(qr.includes('/s/')); assert.ok(!qr.includes('/en/s/'));
});
