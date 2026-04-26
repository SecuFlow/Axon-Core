"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEMO_EVENT } from "@/app/DemoModeBootstrap";
import { isDemoModeActive } from "@/lib/demoMode.client";
import { useBranding } from "@/components/branding/useBranding";

/**
 * Nur im Demo-Modus (`?demo=…` / Session) und nur wenn `show_cta` in der Demo-Firma true ist.
 */
export function DemoUpgradeCta() {
  const [, setTick] = useState(0);
  const branding = useBranding();

  useEffect(() => {
    const up = () => setTick((x) => x + 1);
    window.addEventListener(DEMO_EVENT, up);
    window.addEventListener("popstate", up);
    return () => {
      window.removeEventListener(DEMO_EVENT, up);
      window.removeEventListener("popstate", up);
    };
  }, []);

  if (!isDemoModeActive()) return null;
  if (branding.show_cta !== true) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 left-0 right-0 z-50 flex justify-center px-4">
      <Link
        href="/register"
        className="pointer-events-auto inline-flex items-center rounded-full px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-black/40 ring-1 ring-white/15 transition hover:opacity-95"
        style={{ backgroundColor: "var(--brand-primary, #6366f1)" }}
      >
        Jetzt Zugriff anfordern
      </Link>
    </div>
  );
}
