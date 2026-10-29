import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Restrict server-only modules from leaking to the client bundle
  serverExternalPackages: ['ipaddr.js'],
};

export default nextConfig;

