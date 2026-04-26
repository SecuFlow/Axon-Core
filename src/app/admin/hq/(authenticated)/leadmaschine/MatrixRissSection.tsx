"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react";

type Target = {
  id: string;
  industry: string;
  city: string;
  is_active: boolean;
  last_used_at: string | null;
};

type MatrixCard = {
  target_id: string;
  industry: string;
  city: string;
  query: string;
  google_url: string;
};

type ProspectDraft = {
  corporate_group_name: string;
  location_name: string;
  manager_name: string;
  linkedin_url: string;
  department: string;
  domain: string;
  notes: string;
};

const EMPTY_DRAFT: ProspectDraft = {
  corporate_group_name: "",
  location_name: "",
  manager_name: "",
  linkedin_url: "",
  department: "",
  domain: "",
  notes: "",
};

export function MatrixRissSection({ onProspectCreated }: { onProspectCreated?: () => void }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [cards, setCards] = useState<MatrixCard[]>([]);
  const [dailyCap, setDailyCap] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // CRUD Form
  const [newIndustry, setNewIndustry] = useState("");
  const [newCity, setNewCity] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  // Company filter (optional): pro Karte individuell
  const [companyGlobal, setCompanyGlobal] = useState("");

  // "Profil gefunden" Modal
  const [draftOpenFor, setDraftOpenFor] = useState<MatrixCard | null>(null);
  const [draft, setDraft] = useState<ProspectDraft>(EMPTY_DRAFT);
  const [draftBusy, setDraftBusy] = useState(false);

  const loadTargets = useCallback(async () => {
    try {
      const resp = await fetch("/api/admin/leadmaschine/targets", { credentials: "include" });
      const p = (await resp.json()) as { targets?: Target[]; error?: string };
      if (!resp.ok) {
        setError(p.error ?? "Targets konnten nicht geladen werden.");
        return;
      }
      setTargets(p.targets ?? []);
    } catch {
      setError("Netzwerkfehler (Targets).");
    }
  }, []);

  const loadCards = useCallback(
    async (company: string) => {
      try {
        const url = `/api/admin/leadmaschine/matrix/today?company=${encodeURIComponent(company)}`;
        const resp = await fetch(url, { credentials: "include" });
        const p = (await resp.json()) as {
          cards?: MatrixCard[];
          daily_cap?: number;
          error?: string;
          warning?: string;
        };
        if (!resp.ok) {
          setError(p.error ?? "Google-Dork-Karten konnten nicht geladen werden.");
          return;
        }
        setCards(p.cards ?? []);
        if (typeof p.daily_cap === "number") setDailyCap(p.daily_cap);
        if (p.warning) setError(p.warning);
      } catch {
        setError("Netzwerkfehler (Matrix).");
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([loadTargets(), loadCards(companyGlobal)]);
    setLoading(false);
  }, [loadTargets, loadCards, companyGlobal]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addTarget = async () => {
    if (addBusy) return;
    const industry = newIndustry.trim();
    const city = newCity.trim();
    if (!industry || !city) {
      setError("Branche und Stadt sind erforderlich.");
      return;
    }
    setAddBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/leadmaschine/targets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry, city }),
      });
      const p = (await resp.json()) as { ok?: boolean; error?: string };
      if (!resp.ok) {
        setError(p.error ?? "Hinzufügen fehlgeschlagen.");
        return;
      }
      setNewIndustry("");
      setNewCity("");
      setStatus("Target hinzugefügt.");
      await refresh();
    } finally {
      setAddBusy(false);
    }
  };

  const toggleActive = async (t: Target) => {
    const resp = await fetch(`/api/admin/leadmaschine/targets/${encodeURIComponent(t.id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !t.is_active }),
    });
    if (!resp.ok) {
      const p = (await resp.json()) as { error?: string };
      setError(p.error ?? "Update fehlgeschlagen.");
      return;
    }
    await refresh();
  };

  const deleteTarget = async (t: Target) => {
    if (!window.confirm(`Target "${t.industry} / ${t.city}" löschen?`)) return;
    const resp = await fetch(`/api/admin/leadmaschine/targets/${encodeURIComponent(t.id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!resp.ok) {
      const p = (await resp.json()) as { error?: string };
      setError(p.error ?? "Löschen fehlgeschlagen.");
      return;
    }
    await refresh();
  };

  const openDraft = (card: MatrixCard) => {
    setDraft({
      ...EMPTY_DRAFT,
      location_name: card.city,
      corporate_group_name: companyGlobal.trim(),
    });
    setDraftOpenFor(card);
  };

  const submitDraft = async () => {
    if (!draftOpenFor || draftBusy) return;
    const manager_name = draft.manager_name.trim();
    const linkedin_url = draft.linkedin_url.trim();
    if (!manager_name) {
      setError("Manager-Name erforderlich.");
      return;
    }
    if (!linkedin_url) {
      setError("LinkedIn-URL erforderlich.");
      return;
    }
    setDraftBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/leadmaschine/prospects", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_id: draftOpenFor.target_id,
          industry: draftOpenFor.industry,
          city: draftOpenFor.city,
          manager_name,
          linkedin_url,
          corporate_group_name: draft.corporate_group_name,
          location_name: draft.location_name,
          department: draft.department,
          domain: draft.domain,
          notes: draft.notes,
        }),
      });
      const p = (await resp.json()) as { ok?: boolean; id?: string; error?: string };
      if (!resp.ok) {
        setError(p.error ?? "Prospect konnte nicht angelegt werden.");
        return;
      }
      setStatus(`Prospect angelegt (${manager_name}).`);
      setDraftOpenFor(null);
      setDraft(EMPTY_DRAFT);
      onProspectCreated?.();
    } finally {
      setDraftBusy(false);
    }
  };

  const activeTargetsCount = useMemo(
    () => targets.filter((t) => t.is_active).length,
    [targets],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-mono text-[14px] font-semibold uppercase tracking-[0.16em] text-[#e4e4e4]">
            Matrix-Riss Generator
          </h2>
          <p className="mt-1 max-w-3xl font-mono text-[10px] leading-relaxed text-[#6a6a6a]">
            Tägliche Google-Dork-Suchen nach LinkedIn-Profilen von Standort-Managern.
            Pflege Branchen und Städte unten; das System wählt rotierend {dailyCap} Kombinationen pro Tag.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
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

      {/* Heutige Karten */}
      <section className="rounded-md border border-[#1f1f1f] bg-[#080808] p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#d4c896]">
              Heute · {cards.length} / {dailyCap} Suchen
            </p>
            <p className="mt-1 font-mono text-[8px] leading-relaxed text-[#5a5a5a]">
              Klicke auf einen Link, finde das richtige Profil und übernimm es in die Prospect-Liste.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#6a6a6a]">
              Konzern-Filter (optional)
            </label>
            <input
              type="text"
              placeholder='z.B. "Siemens"'
              value={companyGlobal}
              onChange={(e) => setCompanyGlobal(e.target.value)}
              onBlur={() => void loadCards(companyGlobal)}
              className="w-52 rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-1.5 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
            />
          </div>
        </div>

        {cards.length === 0 ? (
          <p className="mt-4 font-mono text-[10px] text-[#6a6a6a]">
            Noch keine aktiven Branchen/Städte hinterlegt. Füge unten welche hinzu.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {cards.map((c) => (
              <article
                key={c.target_id}
                className="flex flex-col rounded-md border border-[#1f1f1f] bg-[#0a0a0a] p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-[#c9a962]/30 bg-[#c9a962]/[0.08] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4c896]">
                    {c.industry}
                  </span>
                  <span className="font-mono text-[10px] text-[#8a8a8a]">{c.city}</span>
                </div>
                <code className="mt-3 block flex-1 overflow-hidden rounded-sm border border-[#1a1a1a] bg-[#050505] p-2 font-mono text-[9px] leading-relaxed text-[#8a8a8a]">
                  {c.query}
                </code>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <a
                    href={c.google_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#c9a962]/35 bg-[#c9a962]/[0.08] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#d4c896] transition hover:bg-[#c9a962]/[0.14]"
                  >
                    <ExternalLink className="size-3" />
                    In Google öffnen
                  </a>
                  <button
                    type="button"
                    onClick={() => openDraft(c)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8a8a8a] transition hover:border-[#3a3a3a] hover:text-[#d4d4d4]"
                  >
                    <Plus className="size-3" />
                    Profil erfassen
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Targets CRUD */}
      <section className="rounded-md border border-[#1f1f1f] bg-[#080808] p-4">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#d4c896]">
          Branchen / Städte · {activeTargetsCount} aktiv · {targets.length} gesamt
        </p>
        <p className="mt-1 font-mono text-[8px] leading-relaxed text-[#5a5a5a]">
          Neue Kombinationen werden im Round-Robin über {dailyCap} Tages-Slots verteilt.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#6a6a6a]">
              Branche
            </label>
            <input
              type="text"
              placeholder="z.B. Maschinenbau"
              value={newIndustry}
              onChange={(e) => setNewIndustry(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#6a6a6a]">
              Stadt
            </label>
            <input
              type="text"
              placeholder="z.B. München"
              value={newCity}
              onChange={(e) => setNewCity(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
            />
          </div>
          <button
            type="button"
            onClick={() => void addTarget()}
            disabled={addBusy || !newIndustry.trim() || !newCity.trim()}
            className="inline-flex items-center gap-2 rounded-md border border-[#c9a962]/45 bg-[#c9a962]/[0.08] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d4c896] transition hover:bg-[#c9a962]/[0.14] disabled:opacity-50"
          >
            <Plus className="size-3.5" />
            Hinzufügen
          </button>
        </div>

        {targets.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-md border border-[#1a1a1a]">
            <table className="w-full">
              <thead className="bg-[#050505]">
                <tr>
                  <th className="px-3 py-2 text-left font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-[#6a6a6a]">
                    Branche
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-[#6a6a6a]">
                    Stadt
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-[#6a6a6a]">
                    Zuletzt verwendet
                  </th>
                  <th className="px-3 py-2 text-right font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-[#6a6a6a]">
                    Aktion
                  </th>
                </tr>
              </thead>
              <tbody>
                {targets.map((t) => (
                  <tr
                    key={t.id}
                    className={`border-t border-[#161616] ${t.is_active ? "" : "opacity-40"}`}
                  >
                    <td className="px-3 py-2 font-mono text-[10px] text-[#d4d4d4]">{t.industry}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#d4d4d4]">{t.city}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#8a8a8a]">
                      {t.last_used_at ? new Date(t.last_used_at).toLocaleDateString("de-DE") : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void toggleActive(t)}
                          className="rounded-md border border-[#262626] bg-[#0a0a0a] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#8a8a8a] transition hover:border-[#3a3a3a] hover:text-[#d4d4d4]"
                        >
                          {t.is_active ? "Deaktivieren" : "Aktivieren"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteTarget(t)}
                          className="rounded-md border border-[#b8401a]/35 bg-[#b8401a]/[0.05] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#e9b999] transition hover:bg-[#b8401a]/[0.12]"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* Profil-erfassen Modal */}
      {draftOpenFor ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-md border border-[#1f1f1f] bg-[#0a0a0a] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#d4c896]">
                  Profil erfassen
                </p>
                <p className="mt-1 font-mono text-[9px] text-[#6a6a6a]">
                  {draftOpenFor.industry} · {draftOpenFor.city}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDraftOpenFor(null)}
                className="rounded-md border border-[#262626] bg-[#0a0a0a] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8a8a8a]"
              >
                Abbrechen
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <LabelledInput
                label="Konzernname *"
                placeholder="z.B. Siemens"
                value={draft.corporate_group_name}
                onChange={(v) => setDraft((d) => ({ ...d, corporate_group_name: v }))}
              />
              <LabelledInput
                label="Standort *"
                placeholder="z.B. Werk München-Perlach"
                value={draft.location_name}
                onChange={(v) => setDraft((d) => ({ ...d, location_name: v }))}
              />
              <LabelledInput
                label="Manager-Name *"
                placeholder="z.B. Dr. Max Mustermann"
                value={draft.manager_name}
                onChange={(v) => setDraft((d) => ({ ...d, manager_name: v }))}
              />
              <LabelledInput
                label="LinkedIn-URL *"
                placeholder="https://www.linkedin.com/in/..."
                value={draft.linkedin_url}
                onChange={(v) => setDraft((d) => ({ ...d, linkedin_url: v }))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <LabelledInput
                  label="Abteilung"
                  placeholder="z.B. Produktion"
                  value={draft.department}
                  onChange={(v) => setDraft((d) => ({ ...d, department: v }))}
                />
                <LabelledInput
                  label="Domain (optional)"
                  placeholder="z.B. siemens.com"
                  value={draft.domain}
                  onChange={(v) => setDraft((d) => ({ ...d, domain: v }))}
                />
              </div>
              <div>
                <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#6a6a6a]">
                  Notizen
                </label>
                <textarea
                  rows={3}
                  placeholder="z.B. Gemeinsame Kontakte, Besonderheiten, ..."
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDraftOpenFor(null)}
                className="rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a8a8a]"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void submitDraft()}
                disabled={draftBusy}
                className="rounded-md border border-[#c9a962]/45 bg-[#c9a962]/[0.10] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d4c896] transition hover:bg-[#c9a962]/[0.16] disabled:opacity-50"
              >
                {draftBusy ? "Speichere…" : "Als Prospect speichern"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LabelledInput(props: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#6a6a6a]">
        {props.label}
      </label>
      <input
        type="text"
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
      />
    </div>
  );
}
