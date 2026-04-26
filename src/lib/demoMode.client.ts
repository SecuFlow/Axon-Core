export const DEMO_STORAGE_KEY = "axon_demo_slug_v1";

export type DemoState = {
  slug: string | null;
};

export function normalizeDemoSlug(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  return s;
}

/** `?demo=true` — wird erst nach `/api/demo/resolve` durch echten Slug ersetzt. */
export function isDemoTrueParam(raw: string | null | undefined): boolean {
  return (raw ?? "").trim().toLowerCase() === "true";
}

export function readDemoSlug(): string | null {
  if (typeof window === "undefined") return null;
  return normalizeDemoSlug(window.sessionStorage.getItem(DEMO_STORAGE_KEY));
}

export function writeDemoSlug(slug: string | null) {
  if (typeof window === "undefined") return;
  if (!slug) {
    window.sessionStorage.removeItem(DEMO_STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(DEMO_STORAGE_KEY, slug);
}

export function getDemoSlugFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const u = new URL(window.location.href);
  return normalizeDemoSlug(u.searchParams.get("demo"));
}

export function syncDemoSlugFromUrlToSessionStorage(): string | null {
  const fromUrl = getDemoSlugFromUrl();
  if (fromUrl) {
    if (isDemoTrueParam(fromUrl)) {
      return readDemoSlug();
    }
    writeDemoSlug(fromUrl);
    return fromUrl;
  }
  return readDemoSlug();
}

export function withDemoParam(path: string, demoSlug: string | null): string {
  if (!demoSlug) return path;
  // Allow absolute and relative
  const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const u = new URL(path, base);
  u.searchParams.set("demo", demoSlug);
  return `${u.pathname}${u.search}`;
}

/** Demo-Gast oder Demo-URL (inkl. `?demo=true`). */
export function isDemoModeActive(): boolean {
  if (typeof window === "undefined") return false;
  if (readDemoSlug()) return true;
  const u = new URL(window.location.href);
  return u.searchParams.has("demo");
}

