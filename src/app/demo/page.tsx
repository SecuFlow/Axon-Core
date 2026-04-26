"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DEMO_EVENT } from "@/app/DemoModeBootstrap";
import { isDemoTrueParam, writeDemoSlug } from "@/lib/demoMode.client";

/**
 * Einstiegspunkt für Demo-Links: Firma sicherstellen (Auto-Create) und sofort
 * ins echte Konzern-Dashboard mit Sidebar weiterleiten.
 */
function DemoPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const raw = (sp.get("demo") ?? sp.get("company") ?? "").trim();

  const [error, setError] = useState<string | null>(null);

  const label = useMemo(() => raw || "—", [raw]);

  useEffect(() => {
    if (!raw) return;

    let cancelled = false;

    const run = async () => {
      setError(null);
      try {
        if (isDemoTrueParam(raw)) {
          const r = await fetch("/api/demo/resolve", { cache: "no-store" });
          const j = (await r.json()) as { slug?: string | null; error?: string };
          if (cancelled) return;
          const s =
            typeof j.slug === "string" && j.slug.trim() ? j.slug.trim().toLowerCase() : null;
          if (!s) {
            setError(j.error ?? "Kein Standard-Demo-Slug.");
            return;
          }
          const e = await fetch(`/api/demo/ensure?slug=${encodeURIComponent(s)}`, {
            cache: "no-store",
          });
          const ej = (await e.json()) as { ok?: boolean; slug?: string; error?: string };
          if (cancelled) return;
          if (!e.ok) {
            setError(ej.error ?? "Demo konnte nicht vorbereitet werden.");
            return;
          }
          const slug = typeof ej.slug === "string" && ej.slug.trim() ? ej.slug.trim() : s;
          writeDemoSlug(slug);
          window.dispatchEvent(new CustomEvent<string | null>(DEMO_EVENT, { detail: slug }));
          router.replace(`/dashboard/konzern?demo=${encodeURIComponent(slug)}`);
          return;
        }

        const resp = await fetch(`/api/demo/ensure?slug=${encodeURIComponent(raw)}`, {
          cache: "no-store",
        });
        const payload = (await resp.json()) as {
          ok?: boolean;
          slug?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!resp.ok) {
          setError(payload.error ?? "Demo konnte nicht vorbereitet werden.");
          return;
        }
        const slug =
          typeof payload.slug === "string" && payload.slug.trim()
            ? payload.slug.trim().toLowerCase()
            : raw.toLowerCase();
        writeDemoSlug(slug);
        window.dispatchEvent(new CustomEvent<string | null>(DEMO_EVENT, { detail: slug }));
        router.replace(`/dashboard/konzern?demo=${encodeURIComponent(slug)}`);
      } catch {
        if (!cancelled) setError("Netzwerkfehler.");
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [raw, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#030304] px-6 py-12 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 text-center">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Zugriff</p>
        <h1 className="mt-2 text-xl font-semibold">Weiterleitung …</h1>
        <p className="mt-2 text-sm text-zinc-400">{label}</p>
        {!raw ? (
          <p className="mt-6 text-sm text-amber-200/90">
            Bitte einen gültigen Zugangs‑Link verwenden.
          </p>
        ) : null}
        {error && raw ? (
          <div className="mt-6 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-left text-sm text-red-200">
            {error}
          </div>
        ) : raw ? (
          <p className="mt-6 text-sm text-zinc-500">
            Dashboard wird geladen (Sidebar &amp; Kacheln).
          </p>
        ) : null}
      </div>
    </main>
  );
}

export default function DemoPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#030304] text-sm text-zinc-400">
          Laden …
        </main>
      }
    >
      <DemoPageInner />
    </Suspense>
  );
}
