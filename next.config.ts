import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle (.next/standalone) so the app can run on a bare host
  // with just Node + the built output — no `npm install` on the target. Harmless on Vercel.
  output: "standalone",
  images: {
    // Allow next/image to render Supabase Storage public URLs (used when
    // SUPABASE_URL/SUPABASE_SERVICE_KEY are set; harmless otherwise).
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
  async headers() {
    // The authenticated admin API is same-origin (the web app fetches its own
    // routes), so it needs NO CORS — a blanket Access-Control-Allow-Origin:* over
    // a cookie-authed API is a misconfiguration. Only the PUBLIC, read-only TV/
    // display endpoints get a scoped, GET-only CORS so a cross-origin display
    // (e.g. a local-LAN TV reading the cloud API) can still load product data.
    const publicRead = [
      { key: "Access-Control-Allow-Origin", value: "*" },
      { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
      { key: "Access-Control-Allow-Headers", value: "Content-Type" },
    ];
    return [
      { source: "/api/display/:path*", headers: publicRead },
      { source: "/api/sessions/display", headers: publicRead },
    ];
  },
};

export default nextConfig;
