import 'server-only';
import {getLocale, getTranslations} from 'next-intl/server';
import {makeCopy} from './copy';
import type {Locale} from './config';

export async function getCopy() {
  const [locale, translate] = await Promise.all([getLocale(), getTranslations('ui')]);
  return makeCopy(locale as Locale, translate);
}
