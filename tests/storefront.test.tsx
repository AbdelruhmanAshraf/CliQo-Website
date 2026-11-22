import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {validLines, type CartLine} from '../app/cart-provider';
import {ProductExperience} from '../app/products/product-experience';
import type {CatalogProduct} from '../lib/catalog';
import type {CatalogDesign} from '../lib/catalog-designs';

const line: CartLine = {
  key: 'legacy-example', skuId: '00000000-0000-4000-8000-000000000000',
  slug: 'stand', name: 'ستاند NFC', unitPriceEgp: 150.5, quantity: 2,
  choices: ['تقييم Google', 'أبيض', 'T0'],
};

test('restored carts retain valid historical lines and reject invalid prices and quantities', () => {
  assert.deepEqual(validLines([
    line,
    {...line, key: 'negative-price', unitPriceEgp: -20},
    {...line, key: 'free-price', unitPriceEgp: 0},
    {...line, key: 'too-many', quantity: 21},
    {...line, key: 'fractional', quantity: 1.5},
    {...line, key: 'missing', choices: null},
  ]), [line]);
  assert.deepEqual(validLines(null), []);
  assert.deepEqual(validLines({items: [line]}), []);
});

test('product galleries render owner-uploaded external images including design thumbnails', () => {
  const src = 'https://api.example.invalid/storage/v1/object/public/catalog-images/stand.webp';
  const product = {
    slug: 'stand', familyKey: 'stand', name: 'ستاند', nameEn: 'Stand',
    category: 'ستاندات', categoryEn: 'Stands', description: '', descriptionEn: '',
    images: [src], specs: {}, specsEn: {}, saleEndsAt: null,
    badge: '', badgeEn: '', compareAtMinor: null,
  } as CatalogProduct;
  const design: CatalogDesign = {
    id: 'stand-review', group: 'reviews', nameAr: 'تقييمات', nameEn: 'Reviews',
    categoryAr: 'تقييمات', categoryEn: 'Reviews', face: 'review', variant: 'أبيض',
    images: [{src, label: 'Owner photo', side: null, kind: 'mockup'}],
  };
  const markup = renderToStaticMarkup(<ProductExperience product={product} designs={[design]} skus={[]} locale="en"/>);
  assert.ok(markup.includes(`src="${src}"`));
  assert.ok(!markup.includes('/_next/image?'), 'External image URLs bypass the unconfigured optimizer');
});
