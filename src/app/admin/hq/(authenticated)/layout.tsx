import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminHQShell } from "../_components/AdminHQShell";
import { assertAdminHqAccess } from "../_lib/assertAdminHqAccess";

export const metadata: Metadata = {
  title: "AXON HQ — Admin",
};

export default async function AdminHqAuthenticatedLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  await assertAdminHqAccess();

  return <AdminHQShell>{children}</AdminHQShell>;
}
