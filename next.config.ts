import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The Docker image sets this to get a small self-contained server.
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
};

export default nextConfig;
