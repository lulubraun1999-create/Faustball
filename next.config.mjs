/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // allowedDevOrigins is now a top-level property, not experimental
  },
  allowedDevOrigins: [
      "https://*.cluster-fbfjltn375c6wqxlhoehbz44sk.cloudworkstations.dev",
      "https://6000-firebase-studio-1761141556801.cluster-fbfjltn375c6wqxlhoehbz44sk.cloudworkstations.dev",
      "https://9000-firebase-studio-1761141556801.cluster-fbfjltn375c6wqxlhoehbz44sk.cloudworkstations.dev",
      "https://6000-firebase-studio-1761141556801.cluster-fbfjltn375c6wqxlhoehbz44sk.cloudworkstations.dev/",
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'www.tsvbayer04.de',
        port: '',
        pathname: '/**',
      }
    ],
  },
};

export default nextConfig;
