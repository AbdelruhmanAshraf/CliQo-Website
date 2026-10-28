import type {NextConfig} from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
const nextConfig: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.CLIQO_DIST_DIR || '.next',
  output: process.env.CLIQO_STANDALONE === '1' ? 'standalone' : undefined,
  allowedDevOrigins: ['127.0.0.1'],
};
export default createNextIntlPlugin()(nextConfig);
