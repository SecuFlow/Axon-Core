"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { DEMO_EVENT } from "@/app/DemoModeBootstrap";
import { DEFAULT_LOGO_PUBLIC_PATH } from "@/lib/brandingDisplay";
import { useBranding } from "@/components/branding/useBranding";
import {
  isDemoModeActive,
  syncDemoSlugFromUrlToSessionStorage,
} from "@/lib/demoMode.client";

/**
 * Gemeinsamer Rahmen für Mitarbeiter-Routen.
 * Branding lädt global wie im Konzern über `BrandingBootstrapCore` (Root) bzw. dieselbe API.
 */
export function WorkerAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  useEffect(() => {
    void isDemoModeActive();
    const slug = syncDemoSlugFromUrlToSessionStorage();
    if (slug) {
      window.dispatchEvent(new CustomEvent<string | null>(DEMO_EVENT, { detail: slug }));
    }
  }, []);

  useEffect(() => {
    if (pathname.startsWith("/worker/login")) return;
    let cancelled = false;
    const bootstrap = async () => {
      try {
        const resp = await fetch("/api/worker/bootstrap", {
          credentials: "include",
          cache: "no-store",
        });
        if (cancelled) return;
        if (!resp.ok) {
          window.location.href = "/worker/login";
          return;
        }
        const payload = (await resp.json()) as {
          must_change_password?: boolean;
        };
        if (payload.must_change_password && !pathname.startsWith("/worker/passwort-aendern")) {
          window.location.href = "/worker/passwort-aendern";
        }
      } catch {
        if (!cancelled) window.location.href = "/worker/login";
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const branding = useBranding();

  const logoSrc =
    branding.logo_url && branding.logo_url.trim()
      ? branding.logo_url.trim()
      : DEFAULT_LOGO_PUBLIC_PATH;

  return (
    <div className="min-h-screen bg-[#030304] text-zinc-100">
      <header
        className="sticky top-0 z-40 border-b border-white/[0.08] backdrop-blur-sm"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--brand-primary, #6366f1) 14%, #030304)",
          borderBottomColor:
            "color-mix(in srgb, var(--brand-primary, #6366f1) 45%, transparent)",
          boxShadow:
            "0 1px 0 0 color-mix(in srgb, var(--brand-primary, #6366f1) 18%, transparent)",
        }}
      >
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-center gap-4 px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={logoSrc}
            src={logoSrc}
            alt=""
            className="h-9 w-auto max-w-[200px] object-contain"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const el = e.currentTarget;
              if (el.src.endsWith(DEFAULT_LOGO_PUBLIC_PATH)) return;
              el.onerror = null;
              el.src = DEFAULT_LOGO_PUBLIC_PATH;
            }}
          />
        </div>
      </header>
      {children}
    </div>
  );
}
