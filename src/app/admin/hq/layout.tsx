import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "AXON HQ",
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: "/axoncore-logo.png" }],
    apple: [{ url: "/axoncore-logo.png" }],
  },
};

export default function AdminHqRootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
