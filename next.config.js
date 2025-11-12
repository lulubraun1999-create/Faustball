
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.tsvbayer04.de',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  experimental: {},
  // The turbopack-specific configuration is now a top-level property.
  turbopack: {
    // This option is used to silence the warning about multiple lockfiles.
    // It tells Turbopack the root of the project.
    root: __dirname,
  },
};

module.exports = nextConfig;
