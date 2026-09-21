import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterSW } from "./register-sw";

export const metadata: Metadata = {
  title: "Pruve — Wallet",
  description: "Your identity. Your control.",
  applicationName: "Pruve",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  // Makes iOS "Add to Home Screen" launch without Safari chrome.
  appleWebApp: {
    capable: true,
    title: "Pruve",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  // Lets the page paint under the notch and home indicator; the body then
  // pads itself back out with env(safe-area-inset-*).
  viewportFit: "cover",
  // Deliberately NOT disabling zoom. iOS auto-zoom on input focus is solved
  // by giving inputs a 16px font size instead, which keeps pinch-zoom
  // available for anyone who needs it.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-white antialiased">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
