import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "AXON HQ — Anmeldung",
};

export default function AdminHqLoginLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
