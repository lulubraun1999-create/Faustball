/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Diese Konfiguration ist nur für den Fall, dass du serverseitig
    // mit Modulen arbeitest, die in einem anderen Format vorliegen.
    // Für 'date-fns-tz' ist dies in neueren Next.js Versionen oft nicht mehr nötig.
    // Wir lassen es aber zur Sicherheit drin, falls es doch gebraucht wird.
    if (!isServer) {
        // ... eventuelle clientseitige Webpack-Anpassungen
    }
    return config;
  },
};

export default nextConfig;
