"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, RefreshCw, Send, SkipForward, Trash2 } from "lucide-react";

type Prospect = {
  id: string;
  created_at: string;
  industry: string | null;
  city: string | null;
  corporate_group_name: string | null;
  location_name: string | null;
  manager_name: string;
  linkedin_url: string;
  department: string | null;
  status: "prospect" | "connected" | "promoted" | "skipped" | string;
  domain: string | null;
  generated_email: string | null;
  promoted_lead_id: string | null;
  connected_at: string | null;
  promoted_at: string | null;
  notes: string | null;
};

type StatusFilter = "prospect" | "connected" | "promoted" | "skipped";

const STATUS_LABEL: Record<StatusFilter, string> = {
  prospect: "Prospect",
  connected: "Vernetzt",
  promoted: "In Leadmaschine",
  skipped: "Übersprungen",
};

export function LinkedInProspectsSection({ version }: { version?: number }) {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("prospect");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [promoteBusy, setPromoteBusy] = useState<string | null>(null);

  // Edit-Modal (fuer Domain/Email/Notes vor dem Promote)
  const [editTarget, setEditTarget] = useState<Prospect | null>(null);
  const [editDraft, setEditDraft] = useState({
    corporate_group_name: "",
    location_name: "",
    domain: "",
    contact_email: "",
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/admin/leadmaschine/prospects?status=${encodeURIComponent(statusFilter)}`;
      const resp = await fetch(url, { credentials: "include" });
      const p = (await resp.json()) as { prospects?: Prospect[]; error?: string };
      if (!resp.ok) {
        setError(p.error ?? "Prospects konnten nicht geladen werden.");
        return;
      }
      setProspects(p.prospects ?? []);
    } catch {
      setError("Netzwerkfehler (Prospects).");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const markConnected = async (p: Prospect) => {
    const resp = await fetch(`/api/admin/leadmaschine/prospects/${encodeURIComponent(p.id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_connected" }),
    });
    if (!resp.ok) {
      const d = (await resp.json()) as { error?: string };
      setError(d.error ?? "Status-Update fehlgeschlagen.");
      return;
    }
    setStatus(`"${p.manager_name}" als vernetzt markiert.`);
    await load();
  };

  const skip = async (p: Prospect) => {
    if (!window.confirm(`Prospect "${p.manager_name}" überspringen?`)) return;
    const resp = await fetch(`/api/admin/leadmaschine/prospects/${encodeURIComponent(p.id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "skip" }),
    });
    if (!resp.ok) {
      const d = (await resp.json()) as { error?: string };
      setError(d.error ?? "Skip fehlgeschlagen.");
      return;
    }
    await load();
  };

  const deleteProspect = async (p: Prospect) => {
    if (!window.confirm(`Prospect "${p.manager_name}" endgültig löschen?`)) return;
    const resp = await fetch(`/api/admin/leadmaschine/prospects/${encodeURIComponent(p.id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!resp.ok) {
      const d = (await resp.json()) as { error?: string };
      setError(d.error ?? "Löschen fehlgeschlagen.");
      return;
    }
    await load();
  };

  const openEdit = (p: Prospect) => {
    setEditTarget(p);
    setEditDraft({
      corporate_group_name: p.corporate_group_name ?? "",
      location_name: p.location_name ?? "",
      domain: p.domain ?? "",
      contact_email: p.generated_email ?? "",
      notes: p.notes ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    const resp = await fetch(
      `/api/admin/leadmaschine/prospects/${encodeURIComponent(editTarget.id)}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          corporate_group_name: editDraft.corporate_group_name,
          location_name: editDraft.location_name,
          domain: editDraft.domain,
          notes: editDraft.notes,
        }),
      },
    );
    if (!resp.ok) {
      const d = (await resp.json()) as { error?: string };
      setError(d.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    setStatus("Prospect aktualisiert.");
    setEditTarget(null);
    await load();
  };

  const promote = async (p: Prospect, overrideEmail?: string, overrideDomain?: string) => {
    setPromoteBusy(p.id);
    setError(null);
    setStatus(null);
    try {
      const resp = await fetch(
        `/api/admin/leadmaschine/prospects/${encodeURIComponent(p.id)}/promote`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contact_email: overrideEmail ?? undefined,
            domain: overrideDomain ?? undefined,
          }),
        },
      );
      const d = (await resp.json()) as {
        ok?: boolean;
        lead_id?: string;
        contact_email?: string;
        domain?: string;
        error?: string;
        warning?: string;
      };
      if (!resp.ok) {
        setError(d.error ?? "Promote fehlgeschlagen.");
        return;
      }
      setStatus(
        `In Email-Leadmaschine übernommen: ${p.manager_name} (${d.contact_email ?? ""}). Tag 1 startet automatisch.`,
      );
      if (d.warning) setError(d.warning);
      await load();
    } finally {
      setPromoteBusy(null);
    }
  };

  const counts = useMemo(() => {
    const byStatus: Record<StatusFilter, number> = {
      prospect: 0,
      connected: 0,
      promoted: 0,
      skipped: 0,
    };
    for (const p of prospects) {
      if (p.status in byStatus) byStatus[p.status as StatusFilter] += 1;
    }
    return byStatus;
  }, [prospects]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-mono text-[14px] font-semibold uppercase tracking-[0.16em] text-[#e4e4e4]">
            LinkedIn Prospects
          </h2>
          <p className="mt-1 max-w-3xl font-mono text-[10px] leading-relaxed text-[#6a6a6a]">
            Konzern-Standort-Manager aus dem Matrix-Riss. Ablauf:
            Profil öffnen → auf LinkedIn „Vernetzen“ klicken → hier als vernetzt markieren →
            in Email-Leadmaschine übernehmen (Tag 1 / 3 / 5).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a8a8a] transition hover:border-[#3a3a3a] hover:text-[#d4d4d4] disabled:opacity-50"
        >
          <RefreshCw className="size-3.5" />
          Neu laden
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-[#b8401a]/40 bg-[#b8401a]/[0.08] p-3 font-mono text-[10px] text-[#e9b999]">
          {error}
        </div>
      ) : null}
      {status ? (
        <div className="rounded-md border border-[#c9a962]/35 bg-[#c9a962]/[0.06] p-3 font-mono text-[10px] text-[#d4c896]">
          {status}
        </div>
      ) : null}

      {/* Status Tabs */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setStatusFilter(k)}
            className={`rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
              statusFilter === k
                ? "border-[#c9a962]/45 bg-[#c9a962]/[0.10] text-[#d4c896]"
                : "border-[#2a2a2a] bg-[#0a0a0a] text-[#8a8a8a] hover:border-[#3a3a3a] hover:text-[#d4d4d4]"
            }`}
          >
            {STATUS_LABEL[k]} ({counts[k]})
          </button>
        ))}
      </div>

      {/* Prospect-Liste */}
      <div className="overflow-hidden rounded-md border border-[#1a1a1a] bg-[#080808]">
        {prospects.length === 0 ? (
          <p className="p-6 text-center font-mono text-[10px] text-[#6a6a6a]">
            Keine Prospects in diesem Status.
          </p>
        ) : (
          <table className="w-full">
            <thead className="bg-[#050505]">
              <tr>
                <th className="px-3 py-2 text-left font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-[#6a6a6a]">
                  Manager
                </th>
                <th className="px-3 py-2 text-left font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-[#6a6a6a]">
                  Konzern / Standort
                </th>
                <th className="px-3 py-2 text-left font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-[#6a6a6a]">
                  Branche / Stadt
                </th>
                <th className="px-3 py-2 text-right font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-[#6a6a6a]">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody>
              {prospects.map((p) => (
                <tr key={p.id} className="border-t border-[#161616] align-top">
                  <td className="px-3 py-3">
                    <p className="font-mono text-[11px] text-[#e4e4e4]">{p.manager_name}</p>
                    <p className="font-mono text-[9px] text-[#8a8a8a]">
                      {p.department ?? "—"}
                    </p>
                    {p.generated_email ? (
                      <p className="mt-1 font-mono text-[9px] text-[#c9a962]">{p.generated_email}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-mono text-[10px] text-[#d4d4d4]">
                      {p.corporate_group_name ?? "—"}
                    </p>
                    <p className="font-mono text-[9px] text-[#8a8a8a]">
                      {p.location_name ?? "—"}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-mono text-[10px] text-[#d4d4d4]">{p.industry ?? "—"}</p>
                    <p className="font-mono text-[9px] text-[#8a8a8a]">{p.city ?? "—"}</p>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex flex-wrap justify-end gap-2">
                      <a
                        href={p.linkedin_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#8a8a8a] transition hover:border-[#3a3a3a] hover:text-[#d4d4d4]"
                      >
                        <ExternalLink className="size-3" />
                        LinkedIn
                      </a>
                      {p.status === "prospect" ? (
                        <button
                          type="button"
                          onClick={() => void markConnected(p)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#c9a962]/40 bg-[#c9a962]/[0.08] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#d4c896] transition hover:bg-[#c9a962]/[0.14]"
                        >
                          <CheckCircle2 className="size-3" />
                          Vernetzt markiert
                        </button>
                      ) : null}
                      {p.status === "connected" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#8a8a8a] transition hover:border-[#3a3a3a] hover:text-[#d4d4d4]"
                          >
                            Bearbeiten
                          </button>
                          <button
                            type="button"
                            onClick={() => void promote(p)}
                            disabled={promoteBusy === p.id}
                            className="inline-flex items-center gap-1.5 rounded-md border border-[#c9a962]/50 bg-[#c9a962]/[0.10] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#d4c896] transition hover:bg-[#c9a962]/[0.18] disabled:opacity-50"
                          >
                            <Send className="size-3" />
                            {promoteBusy === p.id ? "…" : "In Leadmaschine"}
                          </button>
                        </>
                      ) : null}
                      {p.status === "promoted" ? (
                        <span className="rounded-full border border-[#c9a962]/35 bg-[#c9a962]/[0.06] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#d4c896]">
                          promoted
                        </span>
                      ) : null}
                      {p.status !== "skipped" && p.status !== "promoted" ? (
                        <button
                          type="button"
                          onClick={() => void skip(p)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#8a8a8a] transition hover:border-[#3a3a3a]"
                        >
                          <SkipForward className="size-3" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void deleteProspect(p)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[#b8401a]/35 bg-[#b8401a]/[0.05] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#e9b999] transition hover:bg-[#b8401a]/[0.12]"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Modal */}
      {editTarget ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-md border border-[#1f1f1f] bg-[#0a0a0a] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#d4c896]">
                  Prospect bearbeiten
                </p>
                <p className="mt-1 font-mono text-[9px] text-[#6a6a6a]">{editTarget.manager_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="rounded-md border border-[#262626] bg-[#0a0a0a] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8a8a8a]"
              >
                Schließen
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#6a6a6a]">
                  Konzernname
                </label>
                <input
                  type="text"
                  value={editDraft.corporate_group_name}
                  onChange={(e) =>
                    setEditDraft((d) => ({ ...d, corporate_group_name: e.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                />
              </div>
              <div>
                <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#6a6a6a]">
                  Standort
                </label>
                <input
                  type="text"
                  value={editDraft.location_name}
                  onChange={(e) => setEditDraft((d) => ({ ...d, location_name: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                />
              </div>
              <div>
                <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#6a6a6a]">
                  Firmen-Domain
                </label>
                <input
                  type="text"
                  placeholder="z.B. siemens.com"
                  value={editDraft.domain}
                  onChange={(e) => setEditDraft((d) => ({ ...d, domain: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                />
                <p className="mt-1 font-mono text-[8px] text-[#6a6a6a]">
                  Basis für Email-Pattern (vorname.nachname@domain). Wird beim Promote verwendet.
                </p>
              </div>
              <div>
                <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#6a6a6a]">
                  Konkrete Email (optional, überschreibt Pattern)
                </label>
                <input
                  type="email"
                  placeholder="max.mustermann@siemens.com"
                  value={editDraft.contact_email}
                  onChange={(e) => setEditDraft((d) => ({ ...d, contact_email: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                />
              </div>
              <div>
                <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#6a6a6a]">
                  Notizen
                </label>
                <textarea
                  rows={3}
                  value={editDraft.notes}
                  onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a8a8a]"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void saveEdit()}
                className="rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d4d4d4] transition hover:border-[#3a3a3a]"
              >
                Speichern
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = editTarget;
                  setEditTarget(null);
                  void promote(
                    target,
                    editDraft.contact_email.trim() || undefined,
                    editDraft.domain.trim() || undefined,
                  );
                }}
                className="rounded-md border border-[#c9a962]/50 bg-[#c9a962]/[0.10] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d4c896] transition hover:bg-[#c9a962]/[0.18]"
              >
                Speichern + In Leadmaschine übernehmen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
