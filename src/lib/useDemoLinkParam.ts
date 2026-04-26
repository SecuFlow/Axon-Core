"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DEMO_EVENT } from "@/app/DemoModeBootstrap";
import { isDemoTrueParam, readDemoSlug } from "@/lib/demoMode.client";

/**
 * Aufgelöster `demo=`-Wert für Links und API-Aufrufe (ohne `demo=true`-Platzhalter).
 */
export function useDemoLinkParam(): string {
  const sp = useSearchParams();
  const demoFromUrl = (sp.get("demo") ?? "").trim();
  const [sessionDemo, setSessionDemo] = useState<string | null>(() => readDemoSlug());

  useEffect(() => {
    const sync = () => setSessionDemo(readDemoSlug());
    sync();
    window.addEventListener(DEMO_EVENT, sync as EventListener);
    return () => window.removeEventListener(DEMO_EVENT, sync as EventListener);
  }, []);

  return useMemo(() => {
    if (demoFromUrl && !isDemoTrueParam(demoFromUrl)) return demoFromUrl;
    if (sessionDemo && !isDemoTrueParam(sessionDemo)) return sessionDemo;
    return "";
  }, [demoFromUrl, sessionDemo]);
}
