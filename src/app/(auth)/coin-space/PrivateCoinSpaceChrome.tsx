"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Coins, Home } from "lucide-react";

const purchaseHref =
  typeof process.env.NEXT_PUBLIC_AXN_COIN_PURCHASE_URL === "string" &&
  process.env.NEXT_PUBLIC_AXN_COIN_PURCHASE_URL.length > 0
    ? process.env.NEXT_PUBLIC_AXN_COIN_PURCHASE_URL
    : "/checkout?coins=1";

export function PrivateCoinSpaceChrome({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#030304] text-zinc-100">
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#030304]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#00D1FF]">
              AXON Privat
            </p>
            <p className="font-[family-name:var(--font-syne)] text-lg font-semibold text-white">
              Coin-Space
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.04] px-4 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08]"
            >
              <Home className="size-4" />
              Startseite
            </Link>
            <a
              href={purchaseHref}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-amber-400/50 bg-gradient-to-r from-amber-500/25 to-yellow-500/20 px-6 text-sm font-bold text-amber-100 shadow-[0_0_28px_rgba(251,191,36,0.25)] transition hover:from-amber-500/35 hover:to-yellow-500/30"
            >
              <Coins className="size-5 text-amber-300" />
              Coins kaufen
            </a>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
