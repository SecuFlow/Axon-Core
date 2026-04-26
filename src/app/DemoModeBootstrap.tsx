"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  isDemoTrueParam,
  readDemoSlug,
  syncDemoSlugFromUrlToSessionStorage,
  writeDemoSlug,
} from "@/lib/demoMode.client";

export const DEMO_EVENT = "axon:demo";

function emit(slug: string | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string | null>(DEMO_EVENT, { detail: slug }));
}

function DemoModeBootstrapInner() {
  const router = useRouter();
  const sp = useSearchParams();

  useEffect(() => {
    const slug = syncDemoSlugFromUrlToSessionStorage();
    emit(slug);
  }, [sp]);

  useEffect(() => {
    const demo = sp.get("demo");
    if (!isDemoTrueParam(demo)) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/demo/resolve", { cache: "no-store" });
        const j = (await r.json()) as { slug?: string | null };
        if (cancelled) return;
        const s =
          typeof j.slug === "string" && j.slug.trim() ? j.slug.trim().toLowerCase() : null;
        if (!s) return;
        writeDemoSlug(s);
        const u = new URL(window.location.href);
        u.searchParams.set("demo", s);
        router.replace(`${u.pathname}${u.search}${u.hash}`);
        emit(s);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sp, router]);

  useEffect(() => {
    const onPop = () => {
      const slug = syncDemoSlugFromUrlToSessionStorage();
      emit(slug);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => {
      emit(readDemoSlug());
    }, 2000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    (window as unknown as { axonDemo?: unknown }).axonDemo = {
      get: () => readDemoSlug(),
      clear: () => {
        writeDemoSlug(null);
        emit(null);
      },
    };
  }, []);

  return null;
}

export function DemoModeBootstrap() {
  return (
    <Suspense fallback={null}>
      <DemoModeBootstrapInner />
    </Suspense>
  );
}
