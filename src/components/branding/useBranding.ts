import { useEffect, useState } from "react";

export type ClientBranding = {
  logo_url: string | null;
  primary_color: string | null;
  /** Nur relevant im Gast-Demo-Modus. */
  show_cta?: boolean | null;
};

const STORAGE_KEY = "axon_branding_v1";
const LOCAL_STORAGE_KEY = "axon_branding_v1";
let memoryBranding: ClientBranding | null = null;

/** Nach Logo/Farbe-Änderung im Branding-Tool — Shell & Bootstrap laden neu. */
export const BRANDING_UPDATED_EVENT = "axon:branding-updated";

/** Sofort nach dem Speichern (ohne auf den nächsten API-Read zu warten). */
export type BrandingUpdatedDetail = {
  primary_color: string;
  logo_url: string | null;
};

function safeJsonParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readBrandingFromSessionStorage(): ClientBranding | null {
  if (memoryBranding) return memoryBranding;
  if (typeof window === "undefined") return null;
  // sessionStorage ist tab-spezifisch; localStorage synchronisiert zwischen Tabs.
  const raw =
    window.sessionStorage.getItem(STORAGE_KEY) ??
    window.localStorage.getItem(LOCAL_STORAGE_KEY);
  const parsed = safeJsonParse(raw) as | { branding?: ClientBranding; ts?: number } | null;
  const b = parsed?.branding;
  if (!b) return null;
  const resolved = {
    logo_url: typeof b.logo_url === "string" ? b.logo_url : null,
    primary_color: typeof b.primary_color === "string" ? b.primary_color : null,
    show_cta: typeof b.show_cta === "boolean" ? b.show_cta : undefined,
  };
  memoryBranding = resolved;
  return resolved;
}

export function writeBrandingToSessionStorage(branding: ClientBranding) {
  memoryBranding = branding;
  if (typeof window === "undefined") return;
  const payload = JSON.stringify({ ts: Date.now(), branding });
  window.sessionStorage.setItem(STORAGE_KEY, payload);
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, payload);
  } catch {
    // ignore (z. B. Safari Private Mode)
  }
}

export function applyBrandPrimaryToDom(primary_color: string | null) {
  if (typeof document === "undefined") return;
  const hex = typeof primary_color === "string" ? primary_color.trim() : "";
  // Axon-Dark bleibt immer aktiv, auch wenn Branding-Farben wechseln.
  document.documentElement.style.setProperty("--background", "#030304");
  document.documentElement.style.setProperty("--foreground", "#fafafa");
  if (hex) {
    document.documentElement.style.setProperty("--brand-primary", hex);
  }
}

/**
 * Minimaler Hook, der Branding aus `sessionStorage` (instant) + Event-Updates liest.
 * Der Fetch passiert im globalen Bootstrap (`BrandingBootstrap`).
 */
export function useBranding(): ClientBranding {
  const [branding, setBranding] = useState<ClientBranding>(() => {
    return readBrandingFromSessionStorage() ?? {
      logo_url: null,
      primary_color: null,
      show_cta: undefined,
    };
  });

  useEffect(() => {
    const onUpdate = (e: Event) => {
      const ce = e as CustomEvent<ClientBranding>;
      if (!ce.detail) return;
      setBranding(ce.detail);
    };
    window.addEventListener("axon:branding", onUpdate as EventListener);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LOCAL_STORAGE_KEY) return;
      const parsed = safeJsonParse(e.newValue) as
        | { branding?: ClientBranding; ts?: number }
        | null;
      const b = parsed?.branding;
      if (!b) return;
      setBranding({
        logo_url: typeof b.logo_url === "string" ? b.logo_url : null,
        primary_color: typeof b.primary_color === "string" ? b.primary_color : null,
        show_cta: typeof b.show_cta === "boolean" ? b.show_cta : undefined,
      });
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("axon:branding", onUpdate as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return branding;
}

