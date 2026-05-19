import type { Metadata } from "next";
import { Geist, Geist_Mono, Syne } from "next/font/google";
import { Toaster } from "sonner";
import { BrandingBootstrap } from "./BrandingBootstrap";
import { DemoModeBootstrap } from "./DemoModeBootstrap";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "AXON CORE — Das digitale Gedächtnis der Industrie",
  description:
    "KI-gestützte Dokumentation für globale Konzerne. Wir retten Fachwissen vor der Rente.",
  applicationName: "AXON CORE",
  manifest: "/manifest.webmanifest",
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
    title: "AXON CORE",
    statusBarStyle: "black-translucent",
    capable: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} ${syne.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#030304] font-sans text-zinc-100">
        <DemoModeBootstrap />
        <BrandingBootstrap />
        {children}
        <Toaster richColors position="top-center" theme="dark" />
      </body>
    </html>
  );
}
