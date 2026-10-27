import arabic from '@/messages/ar.json';
import english from '@/messages/en.json';
import {numberLocale, type Locale} from './config';

type Values = Record<string, string | number>;
type Translator = (key: string, values?: Values) => string;
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
const keys = new Map<string, string>();
for (const [key, source] of Object.entries(arabic.ui)) keys.set(normalize(source), key);
for (const [key, source] of Object.entries(english.ui)) keys.set(normalize(source), key);
const patterns = [...Object.entries(arabic.ui), ...Object.entries(english.ui)].filter(([, value]) => /\{value\d+\}/.test(value)).map(([key, source]) => {
  const names: string[] = [];
  const expression = source.split(/(\{value\d+\})/).map((part) => {
    if (/^\{value\d+\}$/.test(part)) { names.push(part.slice(1, -1)); return '(.+?)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return {key, names, pattern: new RegExp(`^${expression}$`)};
});

export function makeCopy(locale: Locale, translate: Translator) {
  const tr = (source: string, values?: Values): string => {
    const value = normalize(source);
    const key = keys.get(value);
    if (key) return translate(key, values);
    // API and action messages can arrive with their interpolations already applied.
    for (const entry of patterns) {
      const match = value.match(entry.pattern);
      if (match) return translate(entry.key, Object.fromEntries(entry.names.map((name, i) => [name, match[i + 1]])));
    }
    return source;
  };
  return Object.assign(tr, {
    locale, numberLocale: numberLocale(locale),
    number: (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(numberLocale(locale), options).format(value),
    money: (value: number) => new Intl.NumberFormat(numberLocale(locale), {style: 'currency', currency: 'EGP', maximumFractionDigits: 2}).format(value),
    date: (value: string | Date) => new Intl.DateTimeFormat(numberLocale(locale), {dateStyle: 'medium', timeZone: 'Africa/Cairo'}).format(new Date(value)),
  });
}
export type Copy = ReturnType<typeof makeCopy>;
