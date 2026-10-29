import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname),
  serverExternalPackages: ['@electric-sql/pglite', 'pg', 'ipaddr.js'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
