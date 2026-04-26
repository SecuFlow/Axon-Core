"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { PlaceholderPanel } from "../../_components/PlaceholderPanel";

type TeamMember = {
  id: string;
  name: string;
  role: string;
  public_title?: string | null;
  is_public?: boolean;
  email?: string | null;
  phone?: string | null;
  photo_url?: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type ListPayload = { error?: string; items?: TeamMember[] };
type ItemPayload = { error?: string; item?: TeamMember };

function isEmail(v: string): boolean {
  const t = v.trim();
  if (!t) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function isPhoneLike(v: string): boolean {
  const t = v.trim();
  if (!t) return true;
  return /^[0-9+\s().-]{6,}$/.test(t);
}

export function SystemTeamClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [items, setItems] = useState<TeamMember[]>([]);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sortOrder, setSortOrder] = useState("100");
  const [isPublic, setIsPublic] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const resp = await fetch("/api/admin/team", {
        credentials: "include",
      });
      const p = (await resp.json()) as ListPayload;
      if (!resp.ok) {
        setError(p.error ?? "Team konnte nicht geladen werden.");
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

  const canCreate = useMemo(() => {
    if (!name.trim() || !role.trim()) return false;
    if (!isEmail(email)) return false;
    if (!isPhoneLike(phone)) return false;
    const n = Number(sortOrder);
    if (!Number.isFinite(n)) return false;
    return true;
  }, [email, name, phone, role, sortOrder]);

  const uploadPhoto = async (file: File) => {
    if (uploading) return;
    setUploading(true);
    setError(null);
    setOk(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const resp = await fetch("/api/admin/team/upload", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const p = (await resp.json()) as { error?: string; url?: string };
      if (!resp.ok) {
        setError(p.error ?? "Upload fehlgeschlagen.");
        return;
      }
      setPhotoUrl(p.url ?? "");
      setOk("Foto hochgeladen.");
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setUploading(false);
    }
  };

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!canCreate || creating) return;
    setCreating(true);
    setError(null);
    setOk(null);
    try {
      const resp = await fetch("/api/admin/team", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          public_title: role.trim(),
          is_public: isPublic,
          email: email.trim() || null,
          phone: phone.trim() || null,
          photo_url: photoUrl.trim() || null,
          sort_order: Number(sortOrder),
        }),
      });
      const p = (await resp.json()) as ItemPayload;
      if (!resp.ok) {
        setError(p.error ?? "Anlegen fehlgeschlagen.");
        return;
      }
      setOk("Teammitglied angelegt.");
      setName("");
      setRole("");
      setEmail("");
      setPhone("");
      setSortOrder("100");
      setIsPublic(false);
      setPhotoUrl("");
      await load();
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    if (!id) return;
    setError(null);
    setOk(null);
    try {
      const resp = await fetch(`/api/admin/team/${encodeURIComponent(id)}`, {
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

  const togglePublic = async (item: TeamMember) => {
    setError(null);
    setOk(null);
    try {
      const resp = await fetch(`/api/admin/team/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: !item.is_public }),
      });
      const p = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        setError(p.error ?? "Freigabe-Update fehlgeschlagen.");
        return;
      }
      setOk("Freigabe aktualisiert.");
      await load();
    } catch {
      setError("Netzwerkfehler.");
    }
  };

  const input =
    "mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none placeholder:text-[#4a4a4a] focus:border-[#c9a962]/40";
  const label =
    "block font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#5a5a5a]";

  return (
    <PlaceholderPanel title="Team · Public Presence (Website)">
      {loading ? (
        <p className="font-mono text-[10px] text-[#6b6b6b]">Lade Team…</p>
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

          <form onSubmit={onCreate} className="space-y-3">
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <label className={label}>Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={input}
                  placeholder="Vorname Nachname"
                />
              </div>
              <div>
                <label className={label}>Position (Website)</label>
                <input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className={input}
                  placeholder="z. B. Enterprise Partnerships"
                />
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <div>
                <label className={label}>E‑Mail (optional)</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={input}
                  placeholder="name@unternehmen.tld"
                />
                {!isEmail(email) ? (
                  <p className="mt-1 font-mono text-[10px] text-red-200/80">
                    E‑Mail Format prüfen.
                  </p>
                ) : null}
              </div>
              <div>
                <label className={label}>Telefon (optional)</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={input}
                  placeholder="+49 ..."
                />
                {!isPhoneLike(phone) ? (
                  <p className="mt-1 font-mono text-[10px] text-red-200/80">
                    Telefonnummer Format prüfen.
                  </p>
                ) : null}
              </div>
              <div>
                <label className={label}>Sortierung</label>
                <input
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className={input}
                  inputMode="numeric"
                  placeholder="100"
                />
              </div>
            </div>

            <div className="rounded-md border border-[#1f1f1f] bg-[#080808] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#7a7a7a]">
                    Website-Freigabe
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-[#6b6b6b]">
                    Nur freigegebene Teammitglieder erscheinen auf der Webseite.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPublic((v) => !v)}
                  className={`inline-flex items-center rounded-full border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] ${
                    isPublic
                      ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
                      : "border-[#2a2a2a] bg-[#0a0a0a] text-[#8a8a8a]"
                  }`}
                >
                  {isPublic ? "Freigegeben" : "Nicht freigegeben"}
                </button>
              </div>
            </div>

            <div className="rounded-md border border-[#1f1f1f] bg-[#080808] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#7a7a7a]">
                    Foto (WebP)
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-[#6b6b6b]">
                    Öffentlich sichtbar auf der Website. Empfohlen: 512×512, sauberer
                    Hintergrund.
                  </p>
                </div>
                <label className="inline-flex cursor-pointer items-center rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#7a7a7a] hover:border-[#3a3a3a] hover:text-[#9a9a9a]">
                  <input
                    type="file"
                    accept="image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadPhoto(f);
                      e.currentTarget.value = "";
                    }}
                    disabled={uploading}
                  />
                  {uploading ? "Upload…" : "Foto auswählen"}
                </label>
              </div>
              {photoUrl ? (
                <div className="mt-3 flex items-center gap-3">
                  <Image
                    src={photoUrl}
                    alt=""
                    width={48}
                    height={48}
                    unoptimized
                    className="h-12 w-12 rounded-full border border-[#2a2a2a] object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[10px] text-[#8a8a8a]">
                      {photoUrl}
                    </p>
                    <button
                      type="button"
                      onClick={() => setPhotoUrl("")}
                      className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#c9a962]/70 hover:text-[#c9a962]"
                    >
                      Entfernen
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={!canCreate || creating}
              className="inline-flex w-full items-center justify-center rounded-md border border-[#c9a962]/35 bg-[#c9a962]/10 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d4c896] transition hover:bg-[#c9a962]/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Anlegen…" : "Teammitglied anlegen"}
            </button>
          </form>

          <div className="rounded-md border border-[#1f1f1f] bg-[#070707]">
            <div className="flex items-center justify-between border-b border-[#1a1a1a] px-4 py-3">
              <p className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#5a5a5a]">
                Live Team ({items.length})
              </p>
              <button
                type="button"
                onClick={() => void load()}
                className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#7a7a7a] hover:text-[#9a9a9a]"
              >
                Aktualisieren
              </button>
            </div>
            {items.length === 0 ? (
              <div className="px-4 py-4">
                <p className="font-mono text-[10px] text-[#6b6b6b]">
                  Noch keine Einträge. Sobald du Teammitglieder anlegst, erscheint
                  die Sektion automatisch auf der Website.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[#151515]">
                {items.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                    {m.photo_url ? (
                      <Image
                        src={m.photo_url}
                        alt=""
                        width={40}
                        height={40}
                        unoptimized
                        className="h-10 w-10 rounded-full border border-[#2a2a2a] object-cover"
                      />
                    ) : (
                      <div className="grid h-10 w-10 place-items-center rounded-full border border-[#2a2a2a] bg-[#0a0a0a]">
                        <span className="font-mono text-[10px] font-semibold text-[#c9a962]/70">
                          AX
                        </span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[11px] text-[#d4d4d4]">
                        {m.name}
                      </p>
                      <p className="truncate font-mono text-[10px] text-[#6b6b6b]">
                        {m.public_title?.trim() || m.role} ·{" "}
                        {m.is_public ? "Öffentlich" : "Entwurf"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void togglePublic(m)}
                      className={`rounded-md border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] ${
                        m.is_public
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          : "border-[#2a2a2a] bg-[#0a0a0a] text-[#8a8a8a]"
                      }`}
                    >
                      {m.is_public ? "Verbergen" : "Freigeben"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(m.id)}
                      className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-red-200 hover:bg-red-500/15"
                    >
                      Entfernen
                    </button>
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

