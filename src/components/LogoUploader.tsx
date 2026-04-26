"use client";

import { useId, useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Palette, Upload } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createDashboardSupabaseClient } from "@/lib/supabaseDashboardClient";
import {
  DEFAULT_BRAND_PRIMARY,
  normalizePrimaryColor,
  sanitizeBrandName,
} from "@/lib/brandTheme";
import {
  applyBrandPrimaryToDom,
  BRANDING_UPDATED_EVENT,
  type BrandingUpdatedDetail,
  type ClientBranding,
  writeBrandingToSessionStorage,
} from "@/components/branding/useBranding";

const BUCKET = "branding";
const MAX_BYTES = 5 * 1024 * 1024;
const WEBP_QUALITY = 0.9;

type BrandingContext = {
  accessToken: string;
  companyId: string | null;
  tenantId: string;
  companyDisplayName: string | null;
  primaryColor: string | null;
  logoUrl: string | null;
};

function toastCompanyLabel(raw: string | null | undefined): string {
  const cleaned = sanitizeBrandName(raw);
  if (cleaned) return cleaned;
  return "Ihre Firma";
}

function hexForColorInput(raw: string | null | undefined): string {
  const n = normalizePrimaryColor(raw ?? null);
  if (!n) return DEFAULT_BRAND_PRIMARY;
  const lower = n.toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(lower)) {
    const r = lower[1];
    const g = lower[2];
    const b = lower[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^#[0-9a-f]{6}$/.test(lower)) return lower;
  return DEFAULT_BRAND_PRIMARY;
}

export function LogoUploader() {
  const router = useRouter();
  const fileInputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [ctx, setCtx] = useState<BrandingContext | null>(null);
  const [ctxError, setCtxError] = useState<string | null>(null);
  const [loadingCtx, setLoadingCtx] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const convertToWebpIfPossible = async (input: File): Promise<File> => {
    if (input.type === "image/webp") return input;
    // SVG: nicht rasterisieren (Qualitäts-/Branding-Risiko). Direkt übernehmen.
    if (input.type === "image/svg+xml") return input;
    if (typeof window === "undefined") return input;
    if (!("createImageBitmap" in window)) return input;

    try {
      const bmp = await createImageBitmap(input);
      const canvas = document.createElement("canvas");
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return input;
      ctx2d.drawImage(bmp, 0, 0);

      const blob: Blob | null = await new Promise((resolve) => {
        canvas.toBlob(
          (b) => resolve(b),
          "image/webp",
          WEBP_QUALITY,
        );
      });
      if (!blob) return input;

      const base = (input.name ?? "logo").replace(/\.[^.]+$/, "");
      return new File([blob], `${base}.webp`, { type: "image/webp" });
    } catch {
      return input;
    }
  };

  const [primaryHex, setPrimaryHex] = useState(DEFAULT_BRAND_PRIMARY);
  const [saving, setSaving] = useState(false);
  const previewPrimary = normalizePrimaryColor(primaryHex) ?? DEFAULT_BRAND_PRIMARY;

  const loadContext = useCallback(async () => {
    setLoadingCtx(true);
    setCtxError(null);
    try {
      const resp = await fetch("/api/dashboard/branding/context", {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await resp.json()) as BrandingContext & { error?: string };
      if (!resp.ok) {
        setCtx(null);
        const msg = payload.error ?? "Kontext konnte nicht geladen werden.";
        if (msg.toLowerCase().includes("kein mandanten-scope")) {
          setCtxError("Es wurde noch kein Mandat festgelegt");
        } else {
          setCtxError(msg);
        }
        return;
      }
      setCtx({
        accessToken: payload.accessToken,
        companyId: payload.companyId ?? null,
        tenantId: payload.tenantId,
        companyDisplayName: payload.companyDisplayName ?? null,
        primaryColor: payload.primaryColor ?? null,
        logoUrl: payload.logoUrl ?? null,
      });
      setPrimaryHex(hexForColorInput(payload.primaryColor));
    } catch {
      setCtx(null);
      setCtxError("Netzwerkfehler beim Laden.");
    } finally {
      setLoadingCtx(false);
    }
  }, []);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const saveBranding = async () => {
    if (!ctx) {
      toast.error("Keine Firmendaten geladen.");
      return;
    }

    const normalizedColor = normalizePrimaryColor(primaryHex);
    if (!normalizedColor) {
      toast.error("Ungültige Primärfarbe (Hex, z. B. #009999).");
      return;
    }

    if (converting) {
      toast.message("Logo wird noch optimiert…");
      return;
    }

    if (file && file.size > MAX_BYTES) {
      toast.error("Datei zu groß (max. 5 MB).");
      return;
    }

    setSaving(true);
    try {
      let logoUrlToSave: string | null = null;

      if (file) {
        const supabase = createDashboardSupabaseClient(ctx.accessToken);
        const ext = file.type === "image/webp" ? "webp" : file.type === "image/svg+xml" ? "svg" : "png";
        const objectPath = `logo_${ctx.tenantId}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(objectPath, file, {
            upsert: true,
            contentType: file.type || "image/png",
            cacheControl: "3600",
          });

        if (upErr) {
          toast.error(upErr.message ?? "Logo-Upload fehlgeschlagen.");
          return;
        }

        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
        logoUrlToSave = pub.publicUrl;
      }

      const patch: { logo_url?: string; primary_color: string } = {
        primary_color: normalizedColor,
      };
      if (logoUrlToSave) {
        patch.logo_url = logoUrlToSave;
      }

      const saveResp = await fetch("/api/dashboard/branding", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const savePayload = (await saveResp.json()) as {
        error?: string;
        primary_color?: string | null;
        logo_url?: string | null;
      };
      if (!saveResp.ok) {
        toast.error(savePayload.error ?? "Speichern in der Datenbank fehlgeschlagen.");
        return;
      }

      const firmLabel = toastCompanyLabel(ctx.companyDisplayName);
      toast.success(`Branding für ${firmLabel} wurde aktualisiert!`);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";

      const nextLogo =
        typeof savePayload.logo_url === "string" && savePayload.logo_url.trim()
          ? savePayload.logo_url.trim()
          : logoUrlToSave ?? ctx.logoUrl ?? null;
      const nextPrimary =
        typeof savePayload.primary_color === "string" &&
        savePayload.primary_color.trim()
          ? savePayload.primary_color.trim()
          : normalizedColor;

      const immediate: BrandingUpdatedDetail = {
        primary_color: nextPrimary,
        logo_url: nextLogo,
      };
      const branding: ClientBranding = {
        logo_url: nextLogo,
        primary_color: nextPrimary,
      };
      applyBrandPrimaryToDom(nextPrimary);
      writeBrandingToSessionStorage(branding);
      window.dispatchEvent(
        new CustomEvent<ClientBranding>("axon:branding", { detail: branding }),
      );
      window.dispatchEvent(
        new CustomEvent<BrandingUpdatedDetail>(BRANDING_UPDATED_EVENT, {
          detail: immediate,
        }),
      );

      try {
        const brResp = await fetch(`/api/branding?t=${Date.now()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const bp = (await brResp.json()) as {
          logo_url?: string | null;
          primary_color?: string | null;
        };
        const synced: ClientBranding = {
          logo_url:
            typeof bp.logo_url === "string" && bp.logo_url.trim()
              ? bp.logo_url.trim()
              : branding.logo_url,
          primary_color:
            typeof bp.primary_color === "string" && bp.primary_color.trim()
              ? bp.primary_color.trim()
              : branding.primary_color,
        };
        applyBrandPrimaryToDom(synced.primary_color);
        writeBrandingToSessionStorage(synced);
        window.dispatchEvent(
          new CustomEvent<ClientBranding>("axon:branding", { detail: synced }),
        );
      } catch {
        // ignorieren — Sofort-Update oben ist maßgeblich
      }
      await loadContext();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unbekannter Fehler.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding</CardTitle>
        <CardDescription>
          Passen Sie Logo und Primärfarbe Ihrer Organisation an. Die Änderungen wirken sich
          auf Navigation, Buttons und die gesamte Mandanten-Optik aus.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {loadingCtx ? (
          <p className="text-sm text-slate-500">Lade Mandanten-Daten…</p>
        ) : ctxError ? (
          <p
            className={
              ctxError === "Es wurde noch kein Mandat festgelegt"
                ? "text-sm text-slate-400"
                : "text-sm text-red-300"
            }
          >
            {ctxError}
          </p>
        ) : ctx ? (
          <>
            {ctx.logoUrl ? (
              <div className="flex items-center gap-4">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Aktuelles Logo
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={ctx.logoUrl}
                  src={ctx.logoUrl}
                  alt=""
                  className="h-10 w-auto max-w-[200px] object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <label
                htmlFor={fileInputId}
                className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                Neues Logo (optional)
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id={fileInputId}
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml"
                  className="sr-only"
                  onChange={(e) => {
                    const next = e.target.files?.[0] ?? null;
                    if (!next) {
                      setFile(null);
                      return;
                    }
                    void (async () => {
                      setConverting(true);
                      try {
                        const converted = await convertToWebpIfPossible(next);
                        setFile(converted);
                      } finally {
                        setConverting(false);
                      }
                    })();
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-medium text-slate-200 shadow-sm transition hover:border-primary/40 hover:bg-slate-900"
                >
                  Datei wählen
                </button>
                <span className="max-w-[min(100%,280px)] truncate text-sm text-slate-400">
                  {converting ? "Optimiere…" : file?.name ?? "Keine neue Datei gewählt"}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Primärfarbe
              </span>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
                  <input
                    type="color"
                    value={primaryHex}
                    onChange={(e) => setPrimaryHex(e.target.value)}
                    className="h-10 w-12 cursor-pointer rounded border border-slate-700 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0"
                    aria-label="Primärfarbe wählen"
                  />
                  <Palette className="h-5 w-5 text-slate-500" aria-hidden />
                </div>
                <input
                  type="text"
                  value={primaryHex}
                  onChange={(e) => setPrimaryHex(e.target.value)}
                  placeholder="#009999"
                  spellCheck={false}
                  className="w-40 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-primary/50"
                />
              </div>
            </div>

            <div className="space-y-3">
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Live Handy‑Vorschau (Mitarbeiter‑App)
              </span>
              <div className="w-full max-w-[260px] rounded-[2rem] border border-slate-700 bg-slate-950 p-3 shadow-2xl">
                <div className="rounded-[1.5rem] border border-slate-800 bg-[#030304] p-3">
                  <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-slate-700/80" />
                  <div className="space-y-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                      <p className="text-[11px] font-semibold text-slate-100">Maschine 07</p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        Status: Aufnahme bereit
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled
                      className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition"
                      style={{ backgroundColor: previewPrimary }}
                    >
                      Aufnahme starten
                    </button>
                    <p className="text-[10px] text-slate-500">
                      Der Aufnahme‑Button übernimmt live die gewählte Primärfarbe.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveBranding()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Upload className="h-4 w-4" aria-hidden />
                {saving ? "Speichern…" : "Branding speichern"}
              </button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
