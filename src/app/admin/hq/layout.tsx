import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "AXON HQ",
  robots: { index: false, follow: false },
};

export default function AdminHqRootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
