import type {MetadataRoute} from 'next';

const siteUrl = 'https://cliqoeg.com';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    '',
    '/products',
    '/products/stand',
    '/how-it-works',
    '/guides',
    '/faq',
    '/contact',
  ].map((path) => ({url: `${siteUrl}${path}`}));
}
