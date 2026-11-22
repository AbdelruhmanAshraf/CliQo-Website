import type {Metadata,Viewport} from 'next';
import localFont from 'next/font/local';
import {NextIntlClientProvider} from 'next-intl';
import {getLocale} from 'next-intl/server';
import {StandaloneLanguageSwitcher} from './language-switcher';
import {CartProvider} from './cart-provider';
import { hasTestCheckoutSession } from '@/lib/test-checkout-session';
import './brand-tokens.css';
import './globals.css';
import './product-merchandising.css';
import './stitch-theme.css';
import './cliqo-refresh.css';
import './storefront.css';
import './brand-unification.css';
import './home-campaign.css';
import './catalog-updates.css';

const forma = localFont({src: '../Fonts/forma-djr-arabic-deck-medium.otf', variable: '--font-arabic', display: 'swap', weight: '500'});
const avantGarde = localFont({src: '../Fonts/itc-avant-garde-gothic-pro-bold.otf', variable: '--font-latin', display: 'swap', weight: '700'});

export const viewport: Viewport = {themeColor: '#1e1e1e'};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: {default: 'CliQo | كليكو — One Click .. You’re There', template: '%s | CliQo'},
    description: locale === 'ar' ? 'منتجات NFC وQR ذكية من CliQo. تواصل أسهل، وصفحات رقمية تقدر تديرها بنفسك.' : 'Smart NFC and QR products by CliQo. Easier connections and digital pages you control.',
    applicationName: 'CliQo',
    icons: {
      icon: '/brand/2026-11-identity/icon-orange.png',
      shortcut: '/brand/2026-11-identity/icon-orange.png',
      apple: '/brand/2026-11-identity/icon-orange.png',
    },
  };
}

export default async function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  const [locale, testMode] = await Promise.all([getLocale(), hasTestCheckoutSession()]);
  return <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} data-scroll-behavior="smooth" className={`${forma.variable} ${avantGarde.variable}`}>
    <body><NextIntlClientProvider><CartProvider key={testMode ? 'test' : 'live'} testMode={testMode}>
      {testMode && <aside className="cliqo-test-banner" aria-label={locale === 'ar' ? 'وضع الاختبار' : 'Test mode'}>
        <span>{locale === 'ar' ? 'متجر الاختبار الخاص · الأسعار رمزية ومفيش تحصيل أو شحن فعلي.' : 'Private test store · sample prices, no charges or actual shipping.'}</span>
        <form action="/cliqo-control/orders/test-store" method="post"><input type="hidden" name="mode" value="exit" /><button type="submit">{locale === 'ar' ? 'اخرج من الاختبار' : 'Exit test store'}</button></form>
      </aside>}
      <StandaloneLanguageSwitcher/>{children}
    </CartProvider></NextIntlClientProvider></body>
  </html>;
}
