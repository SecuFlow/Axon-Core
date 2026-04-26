"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion } from "framer-motion";
import { MonitorSmartphone, LogOut } from "lucide-react";
import { DEFAULT_LOGO_PUBLIC_PATH } from "@/lib/brandingDisplay";

const nav = [
  { href: "/admin/hq/leadmaschine", label: "Leadmaschine", exact: true },
  { href: "/admin/hq/sicherheit", label: "Sicherheit", exact: true },
  { href: "/admin/hq", label: "AxonCoin", exact: true },
  { href: "/admin/hq/kpi", label: "KPI Zentrale", exact: false },
  { href: "/admin/hq/demo", label: "Demo-Center", exact: true },
  { href: "/admin/hq/system", label: "System-Einspeisung", exact: false },
  { href: "/admin/hq/sekretaer", label: "Axon‑Sekretär", exact: true },
  { href: "/admin/hq/locations", label: "Standorte", exact: true },
  { href: "/admin/hq/users", label: "Team", exact: true },
] as const;

export function AdminHQShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isActive = (href: string, exact?: boolean) => {
    if (!mounted) return false;
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const tabs = nav.filter((n) => {
    if (!n.href.startsWith("/admin/hq")) return false;
    return true;
  });

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
        <div className="flex min-h-16 w-full flex-wrap items-center justify-between gap-3 border-b border-[#141414] px-4 py-3 md:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={DEFAULT_LOGO_PUBLIC_PATH}
              alt="AxonCore"
              className="h-10 w-auto max-w-[200px] shrink-0 object-contain object-left"
              referrerPolicy="no-referrer"
            />
            <div className="hidden h-6 w-px bg-[#1f1f1f] md:block" aria-hidden />
            <div className="truncate font-mono text-[15px] font-bold uppercase tracking-[0.28em] text-[#e4e4e4] sm:text-[17px]">
              ADMIN DASHBOARD
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 md:gap-3">
            <Link
              href="/admin/hq/kunden-ansicht"
              scroll={false}
              className="group flex items-center gap-2 rounded-lg border border-[#c9a962]/25 bg-[#c9a962]/[0.06] px-3 py-2 transition hover:border-[#c9a962]/45 hover:bg-[#c9a962]/10"
            >
              <MonitorSmartphone
                className="size-4 shrink-0 text-[#c9a962]/90"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#d4d896]">
                Kunden-Ansicht
              </span>
            </Link>

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
        </div>

        <div className="w-full px-4 py-3 md:px-8">
          <LayoutGroup id="hq-header-tabs">
            <nav className="flex w-full gap-2 overflow-x-auto [-webkit-overflow-scrolling:touch] pb-0.5">
              {tabs.map((t) => {
                const active = isActive(t.href, t.exact);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    scroll={false}
                    className={`relative z-0 inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em] transition-colors ${
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

      <main className="flex-1 w-full max-w-none px-4 py-8 md:px-8">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          className="w-full"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
