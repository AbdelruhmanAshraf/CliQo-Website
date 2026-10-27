'use client';
import {useTransition} from 'react';
import {useLocale} from 'next-intl';
import {usePathname} from 'next/navigation';
import {setLocale} from './locale-actions';

export function LanguageSwitcher({className = ''}: {className?: string}) {
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  return <button type="button" className={`language-switcher ${className}`} disabled={pending}
    aria-label={locale === 'ar' ? 'Switch to English' : 'التبديل للعربية'} aria-busy={pending}
    onClick={() => startTransition(async () => { await setLocale(locale === 'ar' ? 'en' : 'ar'); })}>
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>
    <span lang={locale === 'ar' ? 'en' : 'ar'}>{locale === 'ar' ? 'EN' : 'العربية'}</span>
  </button>;
}

export function StandaloneLanguageSwitcher() {
  const path = usePathname();
  if (!(['/login', '/activate'].includes(path) || path.startsWith('/s/'))) return null;
  return <div className="standalone-language"><LanguageSwitcher/></div>;
}
