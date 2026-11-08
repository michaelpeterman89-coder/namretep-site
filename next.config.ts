import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The casino moved under /casino; old links, bookmarks, and invites still work.
  async redirects() {
    const moved = ["blackjack", "poker", "craps", "baccarat", "tables", "leaderboard", "how-to-play"];
    return [
      { source: "/lobby", destination: "/casino/tables", permanent: true },
      { source: "/profile", destination: "/casino/profile", permanent: true },
      ...moved.flatMap((page) => [
        { source: `/${page}`, destination: `/casino/${page}`, permanent: true },
        { source: `/${page}/:path*`, destination: `/casino/${page}/:path*`, permanent: true },
      ]),
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
