import Image from 'next/image';
import Link from 'next/link';
import {getTranslations} from 'next-intl/server';

const banners = [
  {id: 'reviews', href: '/products/stand', art: '/products/mockups/stands/google-white.webp'},
  {id: 'links', href: '/products/card', art: '/products/mockups/cards/main-black.webp'},
  {id: 'custom', href: '/products/stand#stand-options', art: '/products/mockups/zip-source/counter-wide-all-in-one-zip-v1.webp'},
] as const;

export async function CampaignPosters() {
  const t = await getTranslations('Campaign');
  return <section className="cq-section cq-campaign-section" id="campaign-posters" aria-labelledby="campaign-title">
    <div className="cq-section-heading"><div><p className="cq-eyebrow">{t('eyebrow')}</p><h2 id="campaign-title">{t('title')}</h2></div><p>{t('intro')}</p></div>
    <div className="cq-editorial-banners">{banners.map((banner, index) => <article key={banner.id} className={`cq-editorial-banner cq-banner-${banner.id}`}>
      <div className="cq-banner-copy"><span className="cq-banner-index" dir="ltr">0{index + 1} / 03</span><p className="cq-banner-kicker">{t(`${banner.id}.kicker`)}</p>
        <h3>{t(`${banner.id}.line1`)}<br/><em>{t(`${banner.id}.line2`)}</em></h3>
        <p className="cq-banner-body">{t(`${banner.id}.body`)}</p>
        <Link href={banner.href} className="cq-banner-cta">{t(`${banner.id}.cta`)} <span aria-hidden="true">↗</span></Link>
      </div>
      <div className="cq-banner-product"><Image src={banner.art} alt={t(`${banner.id}.alt`)} fill sizes="(max-width: 700px) 90vw, (max-width: 1100px) 48vw, 55vw" /></div>
      <small className="cq-banner-concept">{t('concept')}</small>
    </article>)}</div>
  </section>;
}
