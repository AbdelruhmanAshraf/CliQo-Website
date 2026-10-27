export type Locale = 'ar' | 'en';
export const DEFAULT_LOCALE: Locale = 'ar';
export const LOCALE_COOKIE = 'cliqo-locale';
export const isLocale = (value: unknown): value is Locale => value === 'ar' || value === 'en';
export const numberLocale = (locale: Locale) => locale === 'ar' ? 'ar-EG' : 'en-EG';
