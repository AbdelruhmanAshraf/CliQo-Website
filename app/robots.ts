import type {MetadataRoute} from 'next';

const siteUrl = 'https://cliqoeg.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/dashboard/', '/cart/', '/checkout/', '/orders/', '/auth/', '/activate/', '/payments/'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
