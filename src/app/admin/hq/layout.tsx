import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "AXON HQ",
  applicationName: "AXON HQ",
  robots: { index: false, follow: false },
  // Eigenes PWA-Manifest, damit das Admin-Dashboard sich auf dem iPhone als
  // separate App neben „AXON Worker" auf den Home-Bildschirm legen lässt.
  manifest: "/manifest-admin.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    title: "AXON HQ",
    capable: true,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function AdminHqRootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
