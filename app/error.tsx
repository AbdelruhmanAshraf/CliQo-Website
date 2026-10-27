'use client';
import Link from 'next/link';
import {useCopy} from '@/i18n/client';
import {LanguageSwitcher} from './language-switcher';
export default function ErrorPage({reset}: {error: Error & {digest?: string}; reset: () => void}) {
  const tr = useCopy();
  return <main className="utility-page"><LanguageSwitcher/><section role="alert"><h1>{tr('تعذر تحميل الصفحة.')}</h1><p className="utility-copy">{tr('حاول مرة تانية. لو المشكلة مستمرة، ارجع للموقع.')}</p><button type="button" className="cq-button cq-button-cream" onClick={reset}>{tr('حاول مرة تانية')}</button><Link className="utility-back" href="/">{tr('الرجوع للموقع')}</Link></section></main>;
}
