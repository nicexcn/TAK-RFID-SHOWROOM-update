import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest. Makes the app installable (Add to Home Screen) on
// iOS/Android/desktop, so staff can run it standalone and receive notification alerts.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NimitrLog — TAK RFID Showroom",
    short_name: "NimitrLog",
    description: "LAMITAK RFID Showroom",
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    background_color: "#e6e5d8",
    theme_color: "#6f5f48",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
