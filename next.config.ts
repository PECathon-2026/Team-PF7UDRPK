import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'pg', 'ipaddr.js'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
