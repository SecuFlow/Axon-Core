import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { WorkerAppShell } from "./WorkerAppShell";
// Branding lädt über Root-`<BrandingBootstrap />` dieselbe `BrandingBootstrapCore`-Logik (Demo-URL inkl. `demo=true`).

export const metadata: Metadata = {
  title: "AXON Worker",
  applicationName: "AXON Worker",
  // Eigenes PWA-Manifest, damit Worker und Admin sich auf dem iPhone als separate
  // Apps mit eigenem Icon und Namen auf den Home-Bildschirm legen lassen.
  manifest: "/manifest-worker.webmanifest",
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
    title: "AXON Worker",
    capable: true,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#030304",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function WorkerLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#030304]" aria-hidden />
      }
    >
      <WorkerAppShell>{children}</WorkerAppShell>
    </Suspense>
  );
}
