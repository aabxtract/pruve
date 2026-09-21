import type { MetadataRoute } from "next";

/**
 * Served at /manifest.webmanifest. This plus HTTPS and a service worker is
 * what makes Chrome on Android offer "Install app", and what makes iOS
 * "Add to Home Screen" open without browser chrome.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pruve Wallet",
    short_name: "Pruve",
    description: "Prove one fact. Reveal nothing else.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#09090b",
    theme_color: "#09090b",
    categories: ["finance", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
