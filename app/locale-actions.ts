'use server';
import {cookies} from 'next/headers';
import {isLocale, LOCALE_COOKIE} from '@/i18n/config';

export async function setLocale(value: string) {
  if (!isLocale(value)) throw new Error('Unsupported locale');
  (await cookies()).set(LOCALE_COOKIE, value, {
    path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax',
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
  });
}
