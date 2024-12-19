/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.NODE_ENV === 'production' ? {
    output: 'export',
    images: {
      unoptimized: true
    }
  } : {}),
  typescript: {
    ignoreBuildErrors: true
  }
};

module.exports = nextConfig; 