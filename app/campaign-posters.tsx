import Image from 'next/image';
import Link from 'next/link';
import {getTranslations} from 'next-intl/server';

export const campaignPosters = [
  {id: 'reviews', theme: 'dark', href: '/products/stand'},
  {id: 'links', theme: 'cream', href: '/products/card'},
  {id: 'custom', theme: 'dark', href: '/products/stand#stand-options'},
] as const;

export async function CampaignPosters() {
  const t = await getTranslations('Campaign');
  return <section className="cq-section cq-campaign-section" id="campaign-posters" aria-labelledby="campaign-title">
    <div className="cq-section-heading"><div><p className="cq-eyebrow">{t('eyebrow')}</p><h2 id="campaign-title">{t('title')}</h2></div><p>{t('intro')}</p></div>
    <div className="cq-campaign-grid">{campaignPosters.map((poster) => <article key={poster.id} className={`cq-campaign-poster cq-poster-${poster.theme} cq-poster-id-${poster.id}`}>
      <Image className="cq-poster-art" src={`/campaigns/launch-posters/${poster.id}-art.png`} alt={t(`${poster.id}.alt`)} fill sizes="(max-width: 600px) 90vw, (max-width: 1050px) 44vw, 29vw"/>
      <div className="cq-poster-shade"/>
      <div className="cq-poster-top"><span className="cq-poster-logo"><Image src="/brand/cliqo-wordmark.png" alt="CliQo" width={150} height={50}/></span><span className="cq-poster-series" lang="en" dir="ltr">0{campaignPosters.indexOf(poster) + 1} / CliQo</span></div>
      <div className="cq-poster-copy"><p className="cq-poster-kicker">{t(`${poster.id}.kicker`)}</p><h3>{t(`${poster.id}.line1`)}<br/><em>{t(`${poster.id}.line2`)}</em></h3><p className="cq-poster-description">{t(`${poster.id}.body`)}</p></div>
      <div className="cq-poster-bottom"><Link href={poster.href} className="cq-poster-cta">{t(`${poster.id}.cta`)} <span aria-hidden="true">↗</span></Link><span className="cq-poster-disclaimer">{t('concept')}</span></div>
    </article>)}</div>
  </section>;
}
