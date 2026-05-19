"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { LayoutGroup, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useDemoLinkParam } from "@/lib/useDemoLinkParam";
import { DEFAULT_LOGO_PUBLIC_PATH } from "@/lib/brandingDisplay";
import {
  DEFAULT_BRAND_PRIMARY,
  normalizePrimaryColor,
  type CompanyBranding,
} from "@/lib/brandTheme";
import { useBranding } from "@/components/branding/useBranding";
import { DemoBanner } from "@/components/DemoBanner";
import { DemoUpgradeCta } from "@/components/DemoUpgradeCta";

const navItems = [
  { href: "/dashboard", label: "Dashboard", exact: true },
  { href: "/dashboard/konzern", label: "Maschinen", exact: true },
  { href: "/dashboard/wartung", label: "Wartung", exact: true },
  { href: "/dashboard/branding", label: "Branding", exact: true },
  { href: "/dashboard/mitarbeiter-manager", label: "Mitarbeiter & Manager", exact: true },
  { href: "/dashboard/api", label: "API", exact: true },
] as const;

type Props = {
  children: ReactNode;
  initialBranding: CompanyBranding;
};

export function DashboardShell({
  children,
  initialBranding,
}: Props) {
  const pathname = usePathname();
  const demoForLinks = useDemoLinkParam();

  const withDemo = useMemo(() => {
    return (path: string) => {
      if (!demoForLinks) return path;
      // SSR-safe: keine Verwendung von window.location. Wir hängen den `demo`-Param
      // per String-Manipulation an, weil im Demo-Modus die Middleware
      // /dashboard/* OHNE Auth durchlässt und SSR die Seite tatsächlich rendert.
      const [pathOnly, ...rest] = path.split("?");
      const existing = new URLSearchParams(rest.join("?"));
      existing.set("demo", demoForLinks);
      const qs = existing.toString();
      return qs ? `${pathOnly}?${qs}` : pathOnly;
    };
  }, [demoForLinks]);

  // Einzige Branding-Wahrheits-Quelle: globaler `BrandingBootstrapCore` schreibt
  // ins sessionStorage und feuert `axon:branding`. `useBranding()` liest sofort
  // den Cache + reagiert auf Updates → kein zweiter `/api/branding`-Fetch hier
  // und damit kein konkurrierender Logo-Wechsel.
  const branding = useBranding();
  const logoUrl =
    branding.logo_url && branding.logo_url.trim()
      ? branding.logo_url.trim()
      : initialBranding.logo_url || DEFAULT_LOGO_PUBLIC_PATH;
  const primaryHex = useMemo(() => {
    const fromLive = normalizePrimaryColor(branding.primary_color ?? null);
    if (fromLive) return fromLive;
    return (
      normalizePrimaryColor(initialBranding.primary_color ?? null) ??
      DEFAULT_BRAND_PRIMARY
    );
  }, [branding.primary_color, initialBranding.primary_color]);
  const brandName = initialBranding.brand_name;

  const brandCss = useMemo(
    () =>
      ({
        "--brand-primary": primaryHex,
        "--brand-color": primaryHex,
      }) as CSSProperties,
    [primaryHex],
  );

  useEffect(() => {
    document.documentElement.style.setProperty("--brand-primary", primaryHex);
    return () => {
      document.documentElement.style.removeProperty("--brand-primary");
    };
  }, [primaryHex]);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const [loggingOut, setLoggingOut] = useState(false);
  const onLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" });
    } finally {
      window.location.href = "/login";
    }
  };

  return (
    <div
      className="min-h-screen w-full bg-[#050505] text-[#a8a8a8]"
      style={brandCss}
    >
      <div className="fixed left-0 right-0 top-0">
        <DemoBanner />
      </div>
      <DemoUpgradeCta />
      <div className="flex min-h-screen w-full flex-col">
        <header className="sticky top-0 z-30 w-full bg-gradient-to-b from-[#0f0f0f] to-[#070707] pt-12 backdrop-blur-sm shadow-[inset_0_-1px_0_rgba(212,175,55,0.28)]">
          <div className="flex min-h-16 w-full items-center justify-between gap-4 border-b border-[#141414] px-4 py-3 md:px-8">
            <div className="flex min-w-0 items-center gap-4">
              {/* Kein `key={logoUrl}` — Source-Wechsel reicht. Mit `key` würde der
                  Browser den DOM-Knoten zerstören und neu mounten → sichtbares
                  weißes Flackern. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl || DEFAULT_LOGO_PUBLIC_PATH}
                alt={brandName ?? "Logo"}
                className="h-10 w-auto max-w-[200px] shrink-0 object-contain object-left"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const el = e.currentTarget;
                  if (el.src.endsWith(DEFAULT_LOGO_PUBLIC_PATH)) return;
                  el.onerror = null;
                  el.src = DEFAULT_LOGO_PUBLIC_PATH;
                }}
              />
              <div className="hidden h-6 w-px bg-[#1f1f1f] md:block" aria-hidden />
              <div className="truncate font-mono text-[15px] font-bold uppercase tracking-[0.28em] text-[#e4e4e4] sm:text-[17px]">
                KONZERN DASHBOARD
              </div>
            </div>
            <button
              type="button"
              onClick={() => void onLogout()}
              disabled={loggingOut}
              className="inline-flex items-center gap-2 rounded-md border border-[#c9a962]/25 bg-[#c9a962]/[0.06] px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#d4c896] transition hover:border-[#c9a962]/45 hover:bg-[#c9a962]/12 hover:shadow-[0_0_28px_rgba(212,175,55,0.12)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut className="size-4" strokeWidth={1.5} aria-hidden />
              Logout
            </button>
          </div>

          <div className="w-full px-4 py-3 md:px-8">
            <LayoutGroup id="konzern-dashboard-nav">
              <nav className="flex w-full gap-2 overflow-x-auto [-webkit-overflow-scrolling:touch] pb-0.5">
                {navItems.map(({ href, label, exact }) => {
                  const active = isActive(href, exact);
                  return (
                    <Link
                      key={label}
                      href={withDemo(href)}
                      scroll={false}
                      className={`relative z-0 inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em] transition-colors ${
                        active
                          ? "text-[#e8dcb8]"
                          : "border border-[#1f1f1f] bg-[#0a0a0a] text-[#8a8a8a] hover:border-[#2a2a2a] hover:text-[#d4d4d4] hover:shadow-[0_0_22px_rgba(212,175,55,0.12)]"
                      }`}
                    >
                      {active ? (
                        <motion.span
                          layoutId="konzern-dashboard-nav-pill"
                          className="absolute inset-0 rounded-full border border-[#c9a962]/55 bg-[#c9a962]/12 shadow-[0_0_0_1px_rgba(212,175,55,0.12),0_0_26px_rgba(212,175,55,0.10)]"
                          transition={{
                            type: "spring",
                            stiffness: 460,
                            damping: 34,
                          }}
                        />
                      ) : null}
                      <span className="relative z-10">{label}</span>
                    </Link>
                  );
                })}
              </nav>
            </LayoutGroup>
          </div>
        </header>

        <main className="flex-1 w-full max-w-none px-4 py-8 md:px-8">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.22,
              ease: [0.25, 0.1, 0.25, 1],
            }}
            className="w-full"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
