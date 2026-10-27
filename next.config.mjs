/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // pdf.js (used to read dropped PDFs in the browser) has an optional
    // Node-only dependency on "canvas"; the browser build never uses it, but
    // webpack still tries to resolve it
    config.resolve.alias.canvas = false;
    return config;
  },
  experimental: {
    // The recipe pages are rendered on the server. By default Next 14.2 keeps
    // a dynamic page's payload in the browser's router cache for 30 seconds,
    // so after saving or deleting a recipe, going back to the list could
    // show it as it was before. Always re-fetching keeps those pages current.
    staleTimes: { dynamic: 0 },
  },
};

export default nextConfig;
