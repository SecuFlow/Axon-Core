import type { ReactNode } from "react";
import { Suspense } from "react";
import { WorkerAppShell } from "./WorkerAppShell";
// Branding lädt über Root-`<BrandingBootstrap />` dieselbe `BrandingBootstrapCore`-Logik (Demo-URL inkl. `demo=true`).

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
