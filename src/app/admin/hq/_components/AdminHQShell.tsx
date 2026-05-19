"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutGroup, motion } from "framer-motion";
import { MonitorSmartphone, LogOut } from "lucide-react";
import { DEFAULT_LOGO_PUBLIC_PATH } from "@/lib/brandingDisplay";

type NavEntry = {
  href: string;
  label: string;
  exact: boolean;
  /** Tab ist aktiv, wenn pathname dem href (ohne Query) entspricht und alle Query-Werte matchen */
  searchMatch?: Record<string, string>;
};

const nav: NavEntry[] = [
  { href: "/admin/hq/leadmaschine", label: "Leadmaschine", exact: true },
  {
    href: "/coming-soon?product=axoncoin",
    label: "AxonCoin",
    exact: true,
    searchMatch: { product: "axoncoin" },
  },
  { href: "/admin/hq/kpi", label: "KPI Zentrale", exact: false },
  { href: "/admin/hq/pilot-ops", label: "Pilot-Ops", exact: true },
  { href: "/admin/hq/locations", label: "Standorte", exact: true },
  { href: "/admin/hq/users", label: "Team", exact: true },
];

export function AdminHQShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isTabActive = (t: NavEntry) => {
    if (!mounted) return false;
    if (t.searchMatch) {
      const path = t.href.split("?")[0] ?? t.href;
      if (pathname !== path) return false;
      for (const [k, v] of Object.entries(t.searchMatch)) {
        if (searchParams.get(k) !== v) return false;
      }
      return true;
    }
    if (t.exact) return pathname === t.href;
    return pathname === t.href || pathname.startsWith(`${t.href}/`);
  };

  const onLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" });
    } finally {
      window.location.href = "/admin/hq/login";
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#050505] text-[#a8a8a8]">
      <header className="sticky top-0 z-30 w-full bg-gradient-to-b from-[#0f0f0f] to-[#070707] backdrop-blur-sm shadow-[inset_0_-1px_0_rgba(212,175,55,0.28)]">
        <div className="flex min-h-16 w-full flex-wrap items-center justify-between gap-2 border-b border-[#141414] px-3 py-3 sm:px-4 md:gap-3 md:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3 md:gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={DEFAULT_LOGO_PUBLIC_PATH}
              alt="AxonCore"
              className="h-8 w-auto max-w-[140px] shrink-0 object-contain object-left sm:h-10 sm:max-w-[200px]"
              referrerPolicy="no-referrer"
            />
            <div className="hidden h-6 w-px bg-[#1f1f1f] md:block" aria-hidden />
            <div className="hidden truncate font-mono text-[15px] font-bold uppercase tracking-[0.22em] text-[#e4e4e4] sm:block sm:text-[17px] sm:tracking-[0.28em]">
              ADMIN DASHBOARD
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center justify-end gap-2 md:gap-3">
            <Link
              href="/admin/hq/kunden-ansicht"
              scroll={false}
              aria-label="Kunden-Ansicht"
              className="group inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#c9a962]/25 bg-[#c9a962]/[0.06] px-3 py-2 transition hover:border-[#c9a962]/45 hover:bg-[#c9a962]/10"
            >
              <MonitorSmartphone
                className="size-4 shrink-0 text-[#c9a962]/90"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="hidden font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#d4d896] sm:inline">
                Kunden-Ansicht
              </span>
            </Link>

            <button
              type="button"
              onClick={() => void onLogout()}
              disabled={loggingOut}
              aria-label="Logout"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-[#c9a962]/25 bg-[#c9a962]/[0.06] px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#d4c896] transition hover:border-[#c9a962]/45 hover:bg-[#c9a962]/12 hover:shadow-[0_0_28px_rgba(212,175,55,0.12)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut className="size-4" strokeWidth={1.5} aria-hidden />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        <div className="w-full px-3 py-3 sm:px-4 md:px-8">
          <LayoutGroup id="hq-header-tabs">
            <nav className="flex w-full gap-2 overflow-x-auto [-webkit-overflow-scrolling:touch] pb-0.5">
              {nav.map((t) => {
                const active = isTabActive(t);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    scroll={false}
                    className={`relative z-0 inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-full px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] transition-colors sm:px-4 sm:tracking-[0.16em] ${
                      active
                        ? "text-[#e8dcb8]"
                        : "border border-[#1f1f1f] bg-[#0a0a0a] text-[#8a8a8a] hover:border-[#2a2a2a] hover:text-[#d4d4d4] hover:shadow-[0_0_22px_rgba(212,175,55,0.12)]"
                    }`}
                  >
                    {active ? (
                      <motion.span
                        layoutId="admin-hq-header-tab-pill"
                        className="absolute inset-0 rounded-full border border-[#c9a962]/55 bg-[#c9a962]/12 shadow-[0_0_0_1px_rgba(212,175,55,0.12),0_0_26px_rgba(212,175,55,0.14),0_0_42px_rgba(212,175,55,0.08)]"
                        transition={{ type: "spring", stiffness: 460, damping: 34 }}
                      />
                    ) : null}
                    <span className="relative z-10">{t.label}</span>
                  </Link>
                );
              })}
            </nav>
          </LayoutGroup>
        </div>
      </header>

      <main className="flex-1 w-full max-w-none px-3 py-6 sm:px-4 sm:py-8 md:px-8">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          className="w-full min-w-0"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
