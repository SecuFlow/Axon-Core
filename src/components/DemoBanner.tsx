"use client";

import { useEffect, useState } from "react";
import { DEMO_EVENT } from "@/app/DemoModeBootstrap";
import { readDemoSlug } from "@/lib/demoMode.client";

type BannerState = {
  slug: string | null;
  label: string | null;
};

export function DemoBanner() {
  const [state, setState] = useState<BannerState>(() => ({
    slug: readDemoSlug(),
    label: null,
  }));

  useEffect(() => {
    const onDemo = (e: Event) => {
      const ce = e as CustomEvent<string | null>;
      setState((prev) => ({ ...prev, slug: ce.detail ?? null }));
    };
    window.addEventListener(DEMO_EVENT, onDemo as EventListener);
    return () => window.removeEventListener(DEMO_EVENT, onDemo as EventListener);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!state.slug) {
        setState((p) => ({ ...p, label: null }));
        return;
      }
      try {
        const resp = await fetch(`/api/branding?demo=${encodeURIComponent(state.slug)}&t=${Date.now()}`, {
          cache: "no-store",
        });
        const p = (await resp.json()) as { brand_name?: string | null; name?: string | null };
        if (cancelled) return;
        const label =
          (typeof p.brand_name === "string" && p.brand_name.trim()
            ? p.brand_name.trim()
            : typeof p.name === "string" && p.name.trim()
              ? p.name.trim()
              : null) ?? state.slug;
        setState((s) => ({ ...s, label }));
      } catch {
        if (!cancelled) setState((s) => ({ ...s, label: state.slug }));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [state.slug]);

  if (!state.slug) return null;

  return (
    <div className="sticky top-0 z-[60] w-full border-b border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs text-zinc-200 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
        <span className="truncate">
          Demo-Modus:{" "}
          <span className="font-semibold text-white">{state.label ?? state.slug}</span>{" "}
          <span className="text-zinc-400">(Vorschau)</span>
        </span>
        <span className="hidden text-zinc-400 sm:inline">
          Keine echten Daten werden gespeichert
        </span>
      </div>
    </div>
  );
}

