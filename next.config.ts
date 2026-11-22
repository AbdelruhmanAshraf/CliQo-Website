import type {NextConfig} from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
const nextConfig: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.CLIQO_DIST_DIR || '.next',
  output: process.env.CLIQO_STANDALONE === '1' ? 'standalone' : undefined,
  allowedDevOrigins: ['127.0.0.1'],
  async redirects() {
    return [
      { source: '/admin', destination: '/cliqo-control', permanent: false },
      { source: '/admin/:path*', destination: '/cliqo-control/:path*', permanent: false },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/cliqo-control', destination: '/admin' },
        { source: '/cliqo-control/:path*', destination: '/admin/:path*' },
      ],
    };
  },
};
export default createNextIntlPlugin()(nextConfig);
