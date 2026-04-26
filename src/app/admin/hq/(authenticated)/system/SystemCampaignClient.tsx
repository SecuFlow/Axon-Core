"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { PlaceholderPanel } from "../../_components/PlaceholderPanel";

type Payload = {
  error?: string;
  enabled?: boolean;
  banner_image_url?: string | null;
};

export function SystemCampaignClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [bannerImageUrl, setBannerImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const resp = await fetch("/api/admin/system/campaign", {
        credentials: "include",
      });
      const p = (await resp.json()) as Payload;
      if (!resp.ok) {
        setError(p.error ?? "Kampagne konnte nicht geladen werden.");
        return;
      }
      setEnabled(p.enabled === true);
      setBannerImageUrl(p.banner_image_url ?? "");
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const resp = await fetch("/api/admin/system/campaign", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          banner_image_url: bannerImageUrl.trim() || null,
          title: null,
          subtitle: null,
          cta_label: null,
          cta_href: null,
        }),
      });
      const p = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        setError(p.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      setOk("Kampagne gespeichert.");
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <PlaceholderPanel title="Kampagne · Saison (Website)">
      {loading ? (
        <p className="font-mono text-[10px] text-[#6b6b6b]">Lade Kampagne…</p>
      ) : (
        <form onSubmit={onSave} className="space-y-4">
          {error ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-[10px] text-red-200">
              {error}
            </div>
          ) : null}
          {ok ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 font-mono text-[10px] text-emerald-100">
              {ok}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 rounded-md border border-[#1f1f1f] bg-[#080808] p-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#7a7a7a]">
                Aktiv
              </p>
              <p className="mt-1 font-mono text-[10px] text-[#6b6b6b]">
                Banner wird auf der öffentlichen Website angezeigt.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEnabled((v) => !v)}
              disabled={saving}
              className={`inline-flex items-center rounded-full border px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] transition disabled:opacity-50 ${
                enabled
                  ? "border-[#c9a962]/45 bg-[#c9a962]/10 text-[#d4c896] hover:bg-[#c9a962]/15"
                  : "border-[#2a2a2a] bg-[#0a0a0a] text-[#8a8a8a] hover:border-[#3a3a3a]"
              }`}
            >
              {enabled ? "Enabled" : "Disabled"}
            </button>
          </div>

          <div className="rounded-md border border-[#1f1f1f] bg-[#080808] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#7a7a7a]">
                  Kampagnen-Banner (Bild)
                </p>
                <p className="mt-1 font-mono text-[10px] text-[#6b6b6b]">
                  Das Bild erscheint automatisch ganz oben auf der öffentlichen Website.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#7a7a7a] hover:border-[#3a3a3a] hover:text-[#9a9a9a]">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.currentTarget.value = "";
                    if (!f) return;
                    void (async () => {
                      setUploading(true);
                      setError(null);
                      try {
                        const fd = new FormData();
                        fd.set("file", f);
                        const resp = await fetch("/api/admin/system/campaign/upload", {
                          method: "POST",
                          credentials: "include",
                          body: fd,
                        });
                        const p = (await resp.json()) as { error?: string; url?: string };
                        if (!resp.ok) {
                          setError(p.error ?? "Banner-Upload fehlgeschlagen.");
                          return;
                        }
                        const url = p.url ?? "";
                        setBannerImageUrl(url);
                        const saveResp = await fetch("/api/admin/system/campaign", {
                          method: "PATCH",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            enabled: true,
                            banner_image_url: url,
                            title: null,
                            subtitle: null,
                            cta_label: null,
                            cta_href: null,
                          }),
                        });
                        if (!saveResp.ok) {
                          const pe = (await saveResp.json()) as { error?: string };
                          setError(pe.error ?? "Banner gespeichert, Kampagne konnte nicht aktualisiert werden.");
                          setOk("Banner hochgeladen — bitte „Kampagne speichern“ ausführen.");
                          return;
                        }
                        setOk("Banner live — erscheint oben auf der Website.");
                        await load();
                      } catch {
                        setError("Netzwerkfehler.");
                      } finally {
                        setUploading(false);
                      }
                    })();
                  }}
                  disabled={uploading}
                />
                {uploading ? "Upload…" : "Bild auswählen"}
              </label>
            </div>
            {bannerImageUrl ? (
              <div className="mt-3 space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={bannerImageUrl}
                  alt=""
                  className="h-24 w-full rounded-md border border-[#1f1f1f] object-cover"
                />
                <p className="truncate font-mono text-[10px] text-[#8a8a8a]">
                  {bannerImageUrl}
                </p>
              </div>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-full items-center justify-center rounded-md border border-[#c9a962]/35 bg-[#c9a962]/10 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d4c896] transition hover:bg-[#c9a962]/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Speichern…" : "Kampagne speichern"}
          </button>
        </form>
      )}
    </PlaceholderPanel>
  );
}

