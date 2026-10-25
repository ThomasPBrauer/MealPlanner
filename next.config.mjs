/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // The recipe pages are rendered on the server. By default Next 14.2 keeps
    // a dynamic page's payload in the browser's router cache for 30 seconds,
    // so after saving or deleting a recipe, going back to the list could
    // show it as it was before. Always re-fetching keeps those pages current.
    staleTimes: { dynamic: 0 },
  },
};

export default nextConfig;
