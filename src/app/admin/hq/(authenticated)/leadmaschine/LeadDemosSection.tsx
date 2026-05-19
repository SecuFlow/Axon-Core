"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";

type DemoRow = {
  id: string;
  token: string;
  created_at: string | null;
  opened_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  last_view_app: string | null;
  lead_id: string;
  company_name: string | null;
  contact_email: string | null;
  manager_name: string | null;
  lead_segment: string | null;
  stage: string | null;
  last_contacted_at: string | null;
  url_konzern: string | null;
  url_worker: string | null;
  url_konzern_preview: string | null;
  url_worker_preview: string | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return "gerade eben";
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `vor ${d} ${d === 1 ? "Tag" : "Tagen"}`;
  return formatDate(iso);
}

function stageLabel(stage: string | null): { label: string; tone: "neutral" | "active" | "replied" | "warn" } {
  const s = (stage ?? "").toLowerCase();
  if (s === "replied") return { label: "Geantwortet", tone: "replied" };
  if (s === "booked") return { label: "Termin gebucht", tone: "replied" };
  if (s === "disqualified") return { label: "Disqualifiziert", tone: "warn" };
  if (s === "demo_sent" || s === "demo") return { label: "Demo verschickt", tone: "active" };
  if (s === "follow_up") return { label: "Follow-up gesendet", tone: "active" };
  if (s === "mail_1") return { label: "Erstkontakt", tone: "active" };
  if (s === "new") return { label: "Neu", tone: "neutral" };
  return { label: stage ?? "—", tone: "neutral" };
}

function segmentLabel(seg: string | null): string {
  const s = (seg ?? "").toLowerCase();
  if (s === "enterprise") return "Enterprise";
  if (s === "smb") return "SMB";
  return seg ?? "—";
}

export function LeadDemosSection() {
  const [rows, setRows] = useState<DemoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/admin/leadmaschine/lead-demos", window.location.origin);
      if (search.trim()) url.searchParams.set("q", search.trim());
      const resp = await fetch(url.toString(), {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await resp.json()) as { demos?: DemoRow[]; error?: string };
      if (!resp.ok) {
        setError(payload.error ?? "Liste konnte nicht geladen werden.");
        setRows([]);
        return;
      }
      setRows(payload.demos ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Netzwerkfehler.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCount = rows.length;

  const handleCopy = useCallback(async (text: string | null) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage("Link in die Zwischenablage kopiert.");
      window.setTimeout(() => setCopyMessage(null), 2000);
    } catch {
      setCopyMessage("Konnte nicht kopieren — bitte manuell markieren.");
      window.setTimeout(() => setCopyMessage(null), 2500);
    }
  }, []);

  const summary = useMemo(() => {
    if (filteredCount === 0) return "Keine Demo-Links";
    return `${filteredCount} Demo-Link${filteredCount === 1 ? "" : "s"}`;
  }, [filteredCount]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-mono text-xs font-medium uppercase tracking-[0.28em] text-[#d4c896]">
            Demo-Links pro Lead
          </h2>
          <p className="mt-1 font-mono text-[10px] leading-relaxed text-[#6a6a6a]">
            Jeder Lead bekommt mit Mail 1 einen persönlichen Demo-Token. Hier
            findest du alle erstellten Demos zentral, kannst sie öffnen oder
            kopieren.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#6a6a6a]"
              strokeWidth={1.5}
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Firma, Mail, Manager, Token …"
              className="w-56 rounded-md border border-[#1f1f1f] bg-[#070707] py-2 pl-8 pr-3 font-mono text-[11px] text-[#d4d4d4] placeholder:text-[#5a5a5a] focus:border-[#c9a962]/55 focus:outline-none focus:ring-0"
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-[#c9a962]/25 bg-[#c9a962]/[0.06] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d4c896] transition hover:border-[#c9a962]/45 hover:bg-[#c9a962]/12 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={1.8} aria-hidden />
            ) : (
              <RefreshCw className="size-3.5" strokeWidth={1.8} aria-hidden />
            )}
            Aktualisieren
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-[#a64545]/55 bg-[#3a1010]/40 p-3 font-mono text-[10px] text-[#ff8a8a]">
          {error}
        </div>
      ) : null}

      {copyMessage ? (
        <div className="rounded-md border border-[#c9a962]/40 bg-[#c9a962]/[0.07] px-3 py-2 font-mono text-[10px] text-[#d4c896]">
          {copyMessage}
        </div>
      ) : null}

      <div className="flex items-center justify-between font-mono text-[10px] text-[#6a6a6a]">
        <span>{summary}</span>
        {loading ? <span>Lade …</span> : null}
      </div>

      <div className="rounded-md border border-[#c9a962]/20 bg-[#c9a962]/[0.04] px-3 py-2 font-mono text-[10px] text-[#bcb087]">
        Hinweis: Klickst du selbst auf „Öffnen" hier im Dashboard, zählt das
        nicht als Demo-Aufruf — solange du als Plattform-Admin eingeloggt bist
        (oder den Vorschau-Pfad verwendest). Nur Klicks des Leads landen in der
        „Angesehen"-Spalte.
      </div>

      <div className="overflow-x-auto rounded-md border border-[#1a1a1a]">
        <table className="w-full min-w-[1000px] border-collapse text-left font-mono text-[11px]">
          <thead className="bg-[#0a0a0a]">
            <tr className="text-[#7a7a7a]">
              <th className="border-b border-[#1a1a1a] px-3 py-2 text-[10px] uppercase tracking-[0.14em]">
                Lead
              </th>
              <th className="border-b border-[#1a1a1a] px-3 py-2 text-[10px] uppercase tracking-[0.14em]">
                Kontakt
              </th>
              <th className="border-b border-[#1a1a1a] px-3 py-2 text-[10px] uppercase tracking-[0.14em]">
                Segment
              </th>
              <th className="border-b border-[#1a1a1a] px-3 py-2 text-[10px] uppercase tracking-[0.14em]">
                Status
              </th>
              <th className="border-b border-[#1a1a1a] px-3 py-2 text-[10px] uppercase tracking-[0.14em]">
                Angesehen
              </th>
              <th className="border-b border-[#1a1a1a] px-3 py-2 text-[10px] uppercase tracking-[0.14em]">
                Erstellt
              </th>
              <th className="border-b border-[#1a1a1a] px-3 py-2 text-[10px] uppercase tracking-[0.14em]">
                Demo-Links
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center font-mono text-[10px] text-[#5a5a5a]"
                >
                  {search.trim()
                    ? "Keine Demos für diese Suche gefunden."
                    : "Sobald die Leadmaschine den ersten Erstkontakt verschickt, erscheinen die Demo-Links hier automatisch."}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const st = stageLabel(row.stage);
                const toneClass =
                  st.tone === "replied"
                    ? "border-[#c9a962]/55 bg-[#c9a962]/[0.12] text-[#e4d3a0]"
                    : st.tone === "active"
                      ? "border-[#3b6a5c]/55 bg-[#0e1d18] text-[#9ed4be]"
                      : st.tone === "warn"
                        ? "border-[#a64545]/55 bg-[#3a1010]/40 text-[#ff8a8a]"
                        : "border-[#2a2a2a] bg-[#0a0a0a] text-[#9a9a9a]";
                return (
                  <tr
                    key={row.id}
                    className="border-b border-[#141414] align-top transition hover:bg-[#0c0c0c]"
                  >
                    <td className="px-3 py-3">
                      <div className="text-[#e4e4e4]">
                        {row.company_name ?? "Unbekannter Lead"}
                      </div>
                      {row.manager_name ? (
                        <div className="mt-0.5 text-[10px] text-[#7a7a7a]">
                          {row.manager_name}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-[#a8a8a8]">
                      {row.contact_email ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-[#a8a8a8]">
                      {segmentLabel(row.lead_segment)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${toneClass}`}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {row.view_count > 0 ? (
                        <div>
                          <span className="inline-flex items-center gap-1 rounded-full border border-[#3b6a5c]/55 bg-[#0e1d18] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#9ed4be]">
                            <span
                              aria-hidden
                              style={{
                                display: "inline-block",
                                width: 8,
                                height: 8,
                                borderRadius: 999,
                                background: "#34d399",
                                boxShadow: "0 0 8px rgba(52,211,153,0.7)",
                              }}
                            />
                            {row.view_count}× angesehen
                          </span>
                          {row.last_viewed_at ? (
                            <div className="mt-1 text-[10px] text-[#9a9a9a]">
                              Zuletzt {formatRelative(row.last_viewed_at)}
                            </div>
                          ) : null}
                          {row.last_view_app ? (
                            <div className="mt-0.5 text-[9px] text-[#6a6a6a]">
                              Variante:{" "}
                              {row.last_view_app === "worker"
                                ? "Mitarbeiter-App"
                                : "Konzern-Dashboard"}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#6a6a6a]">
                          <span
                            aria-hidden
                            style={{
                              display: "inline-block",
                              width: 8,
                              height: 8,
                              borderRadius: 999,
                              background: "#3a3a3a",
                            }}
                          />
                          Noch nicht
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[10px] text-[#9a9a9a]">
                      {formatDate(row.created_at)}
                      {row.last_contacted_at ? (
                        <div className="mt-0.5 text-[9px] text-[#5a5a5a]">
                          Letzter Send: {formatDate(row.last_contacted_at)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        {row.url_konzern_preview ? (
                          <>
                            <a
                              href={row.url_konzern_preview}
                              target="_blank"
                              rel="noreferrer"
                              title={"Konzern-Demo als Admin-Vorschau öffnen (zählt nicht als angesehen)"}
                              className="inline-flex items-center gap-1.5 rounded-md border border-[#c9a962]/30 bg-[#c9a962]/[0.06] px-2 py-1 text-[10px] text-[#d4c896] transition hover:border-[#c9a962]/55 hover:bg-[#c9a962]/[0.12]"
                            >
                              <ExternalLink className="size-3" strokeWidth={1.8} aria-hidden />
                              Konzern
                            </a>
                            <button
                              type="button"
                              onClick={() => void handleCopy(row.url_konzern)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1 text-[10px] text-[#9a9a9a] transition hover:border-[#3a3a3a] hover:text-[#d4d4d4]"
                              title="Kunden-Link für Konzern-Demo kopieren"
                            >
                              <Copy className="size-3" strokeWidth={1.8} aria-hidden />
                              Kopieren
                            </button>
                          </>
                        ) : null}
                        {row.url_worker_preview ? (
                          <>
                            <a
                              href={row.url_worker_preview}
                              target="_blank"
                              rel="noreferrer"
                              title={"Worker-Demo als Admin-Vorschau öffnen (zählt nicht als angesehen)"}
                              className="inline-flex items-center gap-1.5 rounded-md border border-[#3b6a5c]/55 bg-[#0e1d18] px-2 py-1 text-[10px] text-[#9ed4be] transition hover:border-[#3b6a5c]/80 hover:bg-[#142b25]"
                            >
                              <ExternalLink className="size-3" strokeWidth={1.8} aria-hidden />
                              Worker
                            </a>
                            <button
                              type="button"
                              onClick={() => void handleCopy(row.url_worker)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1 text-[10px] text-[#9a9a9a] transition hover:border-[#3a3a3a] hover:text-[#d4d4d4]"
                              title="Kunden-Link für Worker-Demo kopieren"
                            >
                              <Copy className="size-3" strokeWidth={1.8} aria-hidden />
                              Kopieren
                            </button>
                          </>
                        ) : null}
                        {!row.url_konzern && !row.url_worker ? (
                          <span className="text-[10px] text-[#5a5a5a]">
                            Demo-URL kann nicht gebildet werden (NEXT_PUBLIC_SITE_URL fehlt).
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 font-mono text-[9px] text-[#5a5a5a]">
                        Token: <span className="text-[#7a7a7a]">{row.token}</span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
