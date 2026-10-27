import type {NextConfig} from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
const nextConfig: NextConfig = {poweredByHeader: false, distDir: process.env.CLIQO_DIST_DIR || '.next', allowedDevOrigins: ['127.0.0.1']};
export default createNextIntlPlugin()(nextConfig);
