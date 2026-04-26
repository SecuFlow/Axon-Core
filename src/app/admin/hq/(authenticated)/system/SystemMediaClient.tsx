"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PlaceholderPanel } from "../../_components/PlaceholderPanel";

type SiteContentItem = {
  id: string;
  type: string;
  url?: string;
  title: string;
  created_at: string;
};

type ListPayload = { error?: string; items?: SiteContentItem[] };

const ALLOWED_TYPES = [
  { id: "demo", label: "Demo" },
  { id: "pilot", label: "Pilot" },
] as const;

export function SystemMediaClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [items, setItems] = useState<SiteContentItem[]>([]);

  const [type, setType] = useState<(typeof ALLOWED_TYPES)[number]["id"]>("demo");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const resp = await fetch("/api/admin/site-content", {
        credentials: "include",
      });
      const p = (await resp.json()) as ListPayload;
      if (!resp.ok) {
        setError(p.error ?? "Media konnte nicht geladen werden.");
        setItems([]);
        return;
      }
      setItems(p.items ?? []);
    } catch {
      setError("Netzwerkfehler.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canUpload = useMemo(() => {
    if (!title.trim()) return false;
    if (!file) return false;
    return true;
  }, [file, title]);

  const onUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!canUpload || uploading) return;
    if (!file) return;
    setUploading(true);
    setError(null);
    setOk(null);
    try {
      const fd = new FormData();
      fd.set("type", type);
      fd.set("title", title.trim());
      fd.set("file", file);
      const resp = await fetch("/api/admin/site-content/upload", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const p = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        setError(p.error ?? "Upload fehlgeschlagen.");
        return;
      }
      setOk("Upload gespeichert.");
      setTitle("");
      setFile(null);
      await load();
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setUploading(false);
    }
  };

  const input =
    "mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none placeholder:text-[#4a4a4a] focus:border-[#c9a962]/40";
  const label =
    "block font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#5a5a5a]";

  const videos = items.filter((i) => i.url && (i.type === "demo" || i.type === "pilot"));
  const remove = async (id: string) => {
    if (!id) return;
    setError(null);
    setOk(null);
    try {
      const resp = await fetch(`/api/admin/site-content/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const p = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        setError(p.error ?? "Entfernen fehlgeschlagen.");
        return;
      }
      setOk("Entfernt.");
      await load();
    } catch {
      setError("Netzwerkfehler.");
    }
  };

  return (
    <PlaceholderPanel title="Media · Upload (Video)">
      {loading ? (
        <p className="font-mono text-[10px] text-[#6b6b6b]">Lade Media…</p>
      ) : (
        <div className="space-y-4">
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

          <form onSubmit={onUpload} className="space-y-3">
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <label className={label}>Typ</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as typeof type)}
                  className={input}
                >
                  {ALLOWED_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>Titel</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={input}
                  placeholder="z. B. AxonCore Demo (Kurz)"
                />
              </div>
            </div>

            <div className="rounded-md border border-[#1f1f1f] bg-[#080808] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#7a7a7a]">
                    Datei
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-[#6b6b6b]">
                    Empfohlen: WebM (VP9) oder MP4 (H.264). Kein Placeholder‑Material.
                  </p>
                </div>
                <label className="inline-flex cursor-pointer items-center rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#7a7a7a] hover:border-[#3a3a3a] hover:text-[#9a9a9a]">
                  <input
                    type="file"
                    accept="video/mp4,video/webm"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setFile(f);
                      e.currentTarget.value = "";
                    }}
                    disabled={uploading}
                  />
                  Datei auswählen
                </label>
              </div>
              {file ? (
                <p className="mt-3 truncate font-mono text-[10px] text-[#8a8a8a]">
                  {file.name} · {Math.round(file.size / 1024 / 1024)} MB
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={!canUpload || uploading}
              className="inline-flex w-full items-center justify-center rounded-md border border-[#c9a962]/35 bg-[#c9a962]/10 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d4c896] transition hover:bg-[#c9a962]/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? "Upload…" : "Video hochladen"}
            </button>
          </form>

          <div className="rounded-md border border-[#1f1f1f] bg-[#070707]">
            <div className="flex items-center justify-between border-b border-[#1a1a1a] px-4 py-3">
              <p className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#5a5a5a]">
                Library ({videos.length})
              </p>
              <button
                type="button"
                onClick={() => void load()}
                className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#7a7a7a] hover:text-[#9a9a9a]"
              >
                Aktualisieren
              </button>
            </div>
            {videos.length === 0 ? (
              <div className="px-4 py-4">
                <p className="font-mono text-[10px] text-[#6b6b6b]">
                  Noch keine Videos hinterlegt.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[#151515]">
                {videos.slice(0, 6).map((v) => (
                  <li key={v.id} className="px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-[#d4d4d4]">{v.title}</p>
                        <p className="mt-1 font-mono text-[10px] text-[#6b6b6b]">
                          {v.type.toUpperCase()}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void remove(v.id)}
                        className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-red-200 hover:bg-red-500/15"
                      >
                        Entfernen
                      </button>
                    </div>
                    {v.url ? (
                      <video
                        className="mt-3 w-full rounded-md border border-[#1f1f1f]"
                        controls
                        preload="metadata"
                        src={v.url}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </PlaceholderPanel>
  );
}

