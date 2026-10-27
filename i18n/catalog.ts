import type {Copy} from './copy';
import {getProduct} from '@/lib/products';

const faces: Record<string, string> = {
  review: 'تقييم Google', instapay: 'الدفع · InstaPay', vodafone: 'الدفع · Vodafone Cash',
  instagram: 'سوشيال · Instagram', tiktok: 'سوشيال · TikTok', facebook: 'سوشيال · Facebook',
  'all-in-one': 'صفحة روابط All-in-One',
};
const designs: Record<string, string> = {T0: 'قالب جاهز T0', T1: 'ملف العميل T1', T2: 'تصميم CliQo T2'};
export function optionLabel(tr: Copy, value: string): string {
  return tr(faces[value] ?? designs[value] ?? value);
}
export function skuLabel(tr: Copy, family: string, options: Record<string, string> = {}, fallback = ''): string {
  const product = getProduct(family === 'pvc-card' ? 'card' : family);
  if (!product) return tr(fallback);
  return [tr(product.name), ...['face', 'variant', 'design'].map((key) => options[key] ? optionLabel(tr, options[key]) : '')].filter(Boolean).join(' · ');
}
// Historical order snapshots and old carts contain rendered labels, not option IDs.
export function snapshotLabel(tr: Copy, value: string): string {
  return value.split(/\s*[·|]\s*/).map((part) => optionLabel(tr, part)).join(' · ');
}
