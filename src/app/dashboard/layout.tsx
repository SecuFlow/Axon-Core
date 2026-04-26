import type { ReactNode } from "react";
import { DashboardShell } from "./_components/DashboardShell";
import { getCompanyBrandingForUser } from "@/lib/companyBranding.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const initialBranding = await getCompanyBrandingForUser();

  return (
    <DashboardShell initialBranding={initialBranding}>
      {children}
    </DashboardShell>
  );
}
