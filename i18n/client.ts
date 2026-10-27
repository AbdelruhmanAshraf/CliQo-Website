'use client';
import {useMemo} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {makeCopy} from './copy';
import type {Locale} from './config';

export function useCopy() {
  const locale = useLocale() as Locale;
  const translate = useTranslations('ui');
  return useMemo(() => makeCopy(locale, translate), [locale, translate]);
}
