"use client";

import { useEffect, useLayoutEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  applyBrandPrimaryToDom,
  BRANDING_UPDATED_EVENT,
  readBrandingFromSessionStorage,
  type BrandingUpdatedDetail,
  type ClientBranding,
  writeBrandingToSessionStorage,
} from "@/components/branding/useBranding";
import { DEMO_EVENT } from "@/app/DemoModeBootstrap";
import { readDemoSlug } from "@/lib/demoMode.client";
import { toClientBrandingPayload } from "@/lib/brandingDisplay";
import type { RealtimeChannel } from "@supabase/supabase-js";

function emitBranding(branding: ClientBranding) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ClientBranding>("axon:branding", { detail: branding }));
}

/** Roher `demo`-Query inkl. `true` — API löst `demo=true` serverseitig auf. */
function demoRawFromCurrentUrl(): string | null {
  if (typeof window === "undefined") return null;
  const d = new URLSearchParams(window.location.search).get("demo");
  const s = typeof d === "string" ? d.trim() : "";
  return s.length > 0 ? s : null;
}

function brandingEndpoint(demoHint?: string | null): string {
  const hint = typeof demoHint === "string" ? demoHint.trim() : "";
  if (hint.length > 0) {
    return `/api/branding?demo=${encodeURIComponent(hint)}&t=${Date.now()}`;
  }
  const fromUrl = demoRawFromCurrentUrl();
  if (fromUrl) {
    return `/api/branding?demo=${encodeURIComponent(fromUrl)}&t=${Date.now()}`;
  }
  const slug = readDemoSlug();
  if (slug && slug.trim()) {
    return `/api/branding?demo=${encodeURIComponent(slug.trim())}&t=${Date.now()}`;
  }
  return `/api/branding?t=${Date.now()}`;
}

/**
 * Gemeinsame Logik für Root-Dashboard und Worker-App:
 * Cache → Server-Fetch → Events (BRANDING_UPDATED, DEMO).
 */
export function BrandingBootstrapCore() {
  useLayoutEffect(() => {
    const cached = readBrandingFromSessionStorage();
    if (cached) {
      applyBrandPrimaryToDom(cached.primary_color);
      emitBranding(cached);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    const load = async (demoSlug?: string | null) => {
      const endpoint = brandingEndpoint(demoSlug ?? null);
      try {
        const resp = await fetch(endpoint, {
          credentials: "include",
          cache: "no-store",
        });
        const p = (await resp.json()) as {
          logo_url?: string | null;
          primary_color?: string | null;
          show_cta?: boolean | null;
        };
        if (cancelled) return;
        const branding = toClientBrandingPayload(p);
        applyBrandPrimaryToDom(branding.primary_color);
        writeBrandingToSessionStorage(branding);
        emitBranding(branding);
      } catch {
        // Offline/Fehler: Cache bleibt aktiv
      }
    };
    void load();

    // Realtime: Branding-Änderungen tenant-gebunden abonnieren (Dashboard + Worker).
    // Token kommt über /api/worker/bootstrap (server liest HttpOnly Cookie und reicht es durch).
    void (async () => {
      try {
        const ctxResp = await fetch(`/api/worker/bootstrap?t=${Date.now()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const ctxPayload = (await ctxResp.json()) as {
          error?: string;
          mandant_id?: string | null;
          accessToken?: string | null;
        };
        if (!ctxResp.ok) return;
        const tenantId =
          typeof ctxPayload.mandant_id === "string" && ctxPayload.mandant_id.trim()
            ? ctxPayload.mandant_id.trim()
            : "";
        const accessToken =
          typeof ctxPayload.accessToken === "string" && ctxPayload.accessToken.trim()
            ? ctxPayload.accessToken.trim()
            : "";
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
        const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
        if (!tenantId || !supabaseUrl || !anon || !accessToken || cancelled) return;

        const supabase = createClient(supabaseUrl, anon, {
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        channel = supabase
          .channel(`branding:${tenantId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "branding",
              filter: `tenant_id=eq.${tenantId}`,
            },
            () => {
              // sofort refreshen (CSS + cache + events)
              void load();
            },
          );
        void channel.subscribe();
      } catch {
        // ignore: realtime ist optional
      }
    })();

    const onUpdated = (ev: Event) => {
      const ce = ev as CustomEvent<BrandingUpdatedDetail>;
      if (ce.detail?.primary_color) {
        const next = toClientBrandingPayload({
          logo_url: ce.detail.logo_url ?? null,
          primary_color: ce.detail.primary_color,
        });
        applyBrandPrimaryToDom(next.primary_color);
        writeBrandingToSessionStorage({
          logo_url: next.logo_url,
          primary_color: next.primary_color,
        });
        emitBranding({
          logo_url: next.logo_url,
          primary_color: next.primary_color,
        });
      }
      window.setTimeout(() => {
        if (!cancelled) void load();
      }, 200);
    };
    window.addEventListener(BRANDING_UPDATED_EVENT, onUpdated as EventListener);
    const onDemo = (ev: Event) => {
      const ce = ev as CustomEvent<string | null>;
      if (!cancelled) void load(ce.detail ?? null);
    };
    window.addEventListener(DEMO_EVENT, onDemo as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener(BRANDING_UPDATED_EVENT, onUpdated as EventListener);
      window.removeEventListener(DEMO_EVENT, onDemo as EventListener);
      try {
        channel?.unsubscribe();
      } catch {
        // ignore
      }
    };
  }, []);

  return null;
}
