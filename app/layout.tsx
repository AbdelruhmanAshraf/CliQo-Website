import type {Metadata} from 'next';
import localFont from 'next/font/local';
import {NextIntlClientProvider} from 'next-intl';
import {getLocale} from 'next-intl/server';
import {StandaloneLanguageSwitcher} from './language-switcher';
import {CartProvider} from './cart-provider';
import './globals.css';
import './stitch-theme.css';
import './cliqo-refresh.css';

const forma = localFont({src: '../Fonts/forma-djr-arabic-deck-medium.otf', variable: '--font-arabic', display: 'swap', weight: '500'});
const avantGarde = localFont({src: '../Fonts/itc-avant-garde-gothic-pro-bold.otf', variable: '--font-latin', display: 'swap', weight: '700'});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: {default: 'CliQo | كليكو — One Click .. You’re There', template: '%s | CliQo'},
    description: locale === 'ar' ? 'منتجات NFC وQR ذكية من CliQo. تواصل أسهل، وصفحات رقمية تقدر تديرها بنفسك.' : 'Smart NFC and QR products by CliQo. Easier connections and digital pages you control.',
    applicationName: 'CliQo', icons: {icon: '/favicon-32.png'},
  };
}

export default async function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  const locale = await getLocale();
  return <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} data-scroll-behavior="smooth" className={`${forma.variable} ${avantGarde.variable}`}>
    <body><NextIntlClientProvider><CartProvider><StandaloneLanguageSwitcher/>{children}</CartProvider></NextIntlClientProvider></body>
  </html>;
}
