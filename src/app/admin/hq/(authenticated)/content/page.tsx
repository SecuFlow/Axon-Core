"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, Upload } from "lucide-react";

type SiteContentRow = {
  id: string;
  type: string;
  url: string;
  title: string;
  created_at: string;
};

export default function AdminContentPage() {
  const [items, setItems] = useState<SiteContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<"demo" | "pilot">("demo");
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setListError(null);
    setLoading(true);
    try {
      const resp = await fetch("/api/admin/site-content");
      const data: { items?: SiteContentRow[]; error?: string } = await resp.json();
      if (!resp.ok) {
        setListError(data.error ?? "Liste konnte nicht geladen werden");
        setItems([]);
        return;
      }
      setItems(data.items ?? []);
    } catch {
      setListError("Netzwerkfehler");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploadError(null);
    if (!file) {
      setUploadError("Bitte eine Videodatei wählen.");
      return;
    }
    if (!title.trim()) {
      setUploadError("Titel ist erforderlich.");
      return;
    }

    const fd = new FormData();
    fd.set("file", file);
    fd.set("type", type);
    fd.set("title", title.trim());

    setUploading(true);
    try {
      const resp = await fetch("/api/admin/site-content/upload", {
        method: "POST",
        body: fd,
      });
      const data: { error?: string } = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setUploadError(data.error ?? "Upload fehlgeschlagen");
        return;
      }
      setTitle("");
      setFile(null);
      void loadItems();
    } catch {
      setUploadError("Netzwerkfehler beim Upload");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Dieses Video wirklich löschen? (Storage + Datenbank)")) {
      return;
    }
    setDeletingId(id);
    try {
      const resp = await fetch(`/api/admin/site-content/${id}`, {
        method: "DELETE",
      });
      const data: { error?: string } = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        alert(data.error ?? "Löschen fehlgeschlagen");
        return;
      }
      void loadItems();
    } catch {
      alert("Netzwerkfehler");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-mono text-xs font-medium uppercase tracking-[0.28em] text-[#8a8a8a]">
          Site-Content · Videos
        </h1>
        <p className="mt-2 max-w-2xl font-mono text-[10px] leading-relaxed text-[#5a5a5a]">
          Upload in den öffentlichen Bucket{" "}
          <code className="text-[#7a7a7a]">Videos</code>, Metadaten in{" "}
          <code className="text-[#7a7a7a]">site_content</code>. Migration:{" "}
          <code className="text-[#7a7a7a]">supabase/migrations/…site_content.sql</code>{" "}
          in Supabase ausführen.
        </p>
      </div>

      <section className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-6">
        <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-[#6b6b6b]">
          Neues Video hochladen
        </h2>
        <form onSubmit={handleUpload} className="mt-5 space-y-4 max-w-xl">
          <div>
            <label
              htmlFor="sc-title"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-[#5a5a5a]"
            >
              Titel
            </label>
            <input
              id="sc-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border border-[#2a2a2a] bg-[#111] px-3 py-2 font-mono text-sm text-[#d4d4d4] outline-none focus:border-[#c9a962]/50"
              placeholder="z. B. Demovideo Q1"
            />
          </div>
          <div>
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-[#5a5a5a]">
              Typ
            </span>
            <div className="flex gap-2">
              {(["demo", "pilot"] as const).map((t) => (
                <label
                  key={t}
                  className="flex flex-1 cursor-pointer items-center justify-center rounded border border-[#2a2a2a] bg-[#111] px-3 py-2 font-mono text-xs capitalize has-[:checked]:border-[#c9a962]/50 has-[:checked]:bg-[#c9a962]/10"
                >
                  <input
                    type="radio"
                    name="ctype"
                    value={t}
                    checked={type === t}
                    onChange={() => setType(t)}
                    className="sr-only"
                  />
                  {t}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label
              htmlFor="sc-file"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-[#5a5a5a]"
            >
              Videodatei
            </label>
            <input
              id="sc-file"
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full font-mono text-xs text-[#8a8a8a] file:mr-3 file:rounded file:border file:border-[#2a2a2a] file:bg-[#161616] file:px-3 file:py-1.5 file:font-mono file:text-[10px] file:uppercase file:tracking-wider file:text-[#a8a8a8]"
            />
          </div>
          {uploadError ? (
            <p className="text-sm text-[#c8c8c8]">{uploadError}</p>
          ) : null}
          <button
            type="submit"
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded border border-[#c9a962]/40 bg-[#c9a962]/15 px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.12em] text-[#d4c896] transition hover:bg-[#c9a962]/25 disabled:opacity-50"
          >
            <Upload className="size-4" strokeWidth={1.5} />
            {uploading ? "…" : "Hochladen"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-[#6b6b6b]">
          Aktive Videos (Vorschau)
        </h2>
        {listError ? (
          <p className="mt-4 font-mono text-sm text-[#c8c8c8]">{listError}</p>
        ) : null}
        {loading ? (
          <p className="mt-6 font-mono text-sm text-[#5a5a5a]">Laden…</p>
        ) : items.length === 0 ? (
          <p className="mt-6 font-mono text-sm text-[#5a5a5a]">
            Noch keine Einträge.
          </p>
        ) : (
          <ul className="mt-6 grid gap-6 lg:grid-cols-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="overflow-hidden rounded-lg border border-[#1f1f1f] bg-[#0a0a0a]"
              >
                <div className="aspect-video bg-black">
                  <video
                    src={item.url}
                    className="size-full object-contain"
                    controls
                    playsInline
                    preload="metadata"
                  />
                </div>
                <div className="flex items-start justify-between gap-3 border-t border-[#1f1f1f] p-4">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm text-[#d4d4d4]">
                      {item.title}
                    </p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#c9a962]/80">
                      {item.type}
                    </p>
                    <p className="mt-2 break-all font-mono text-[9px] text-[#4a4a4a]">
                      {item.url}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDelete(item.id)}
                    disabled={deletingId === item.id}
                    className="shrink-0 rounded border border-red-900/50 bg-red-950/30 p-2 text-red-300/90 transition hover:bg-red-950/50 disabled:opacity-50"
                    aria-label="Löschen"
                  >
                    <Trash2 className="size-4" strokeWidth={1.5} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
