import type { ReactNode } from "react";
import { Suspense } from "react";

export default function WartungLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-slate-500">Wartungs-Ansicht wird geladen…</p>
      }
    >
      {children}
    </Suspense>
  );
}
