import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pruve Verify",
  description: "Ask for one fact. Get one answer.",
  applicationName: "Pruve Verify",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  formatDetection: { telephone: false },
};

// Deliberately no manifest and no service worker here. The verifier's whole
// pitch is "no app install" — making it installable would muddy that, and the
// receipt log should never be served from a cache.
export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-white antialiased">{children}</body>
    </html>
  );
}
