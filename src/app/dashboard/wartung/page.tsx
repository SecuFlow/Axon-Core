"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Cable, Sparkles, X } from "lucide-react";

type WartungCase = {
  id: string;
  created_at: string | null;
  analysis_text: string | null;
  original_priority: string;
  priority_override: unknown;
  machine_id?: string | null;
  machine?: { name?: string | null } | null;
  required_part: string | null;
  photo_urls?: unknown;
  machine_status?: string | null;
  kwh_value?: number | null;
  manager_public_approved?: boolean | null;
  manager_public_approved_at?: string | null;
  worker_public_shared_at?: string | null;
  worker_rewarded_at?: string | null;
};

type IntegrationSummary = {
  id: string;
  category: string;
  provider: string;
  display_name: string | null;
  status: string;
  last_sync_at: string | null;
};

function parsePriorityOverride(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as { override?: unknown };
      if (parsed && typeof parsed.override === "string") return parsed.override;
    } catch {
      return raw;
    }
  }
  if (typeof raw === "object") {
    const obj = raw as { override?: unknown };
    if (typeof obj.override === "string") return obj.override;
  }
  return null;
}

function priorityToLevel(priority: string | null | undefined): 1 | 2 | 3 {
  const raw = (priority ?? "").trim();
  if (raw === "1") return 1;
  if (raw === "2") return 2;
  if (raw === "3") return 3;

  const p = raw.toLowerCase();
  if (p === "hoch") return 1;
  if (p === "mittel") return 2;
  if (p === "niedrig") return 3;
  return 3;
}

function badgeClass(level: 1 | 2 | 3): string {
  if (level === 1) return "bg-red-500/20 text-red-200 border-red-400/30";
  if (level === 2) return "bg-yellow-500/20 text-yellow-200 border-yellow-400/30";
  return "bg-blue-500/20 text-blue-200 border-blue-400/30";
}

function coercePhotoUrls(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x) => typeof x === "string") as string[];
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((x) => typeof x === "string") as string[];
      }
    } catch {
      return [];
    }
  }
  return [];
}

function kwhEstimateFromStatus(statusRaw: string | null | undefined): number {
  const s = (statusRaw ?? "").trim().toLowerCase();
  // AI-Fallback-Heuristik, wenn keine kWh-Daten aus APIs vorhanden sind.
  if (s === "active" || s === "an") return 12.4;
  if (s === "maintenance" || s === "wartung") return 4.1;
  if (s === "offline" || s === "aus") return 0.6;
  return 2.0;
}

function formatKwh(value: number): string {
  return `${value.toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} kWh`;
}

function knowledgeReleaseState(c: WartungCase): {
  label: string;
  className: string;
} {
  if (typeof c.worker_rewarded_at === "string" && c.worker_rewarded_at.trim()) {
    return {
      label: "Reward ausgezahlt",
      className: "border-emerald-400/35 bg-emerald-500/15 text-emerald-100",
    };
  }
  if (c.manager_public_approved === true) {
    return {
      label: "Freigegeben",
      className: "border-cyan-400/35 bg-cyan-500/15 text-cyan-100",
    };
  }
  return {
    label: "Nicht freigegeben",
    className: "border-amber-400/35 bg-amber-500/15 text-amber-100",
  };
}

export default function WartungDashboardPage() {
  const searchParams = useSearchParams();
  const tenantScope =
    searchParams.get("tenantId")?.trim() ||
    searchParams.get("company_id")?.trim() ||
    "";

  const [days, setDays] = useState<10 | 20 | 30>(10);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cases, setCases] = useState<WartungCase[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [shareBusyId, setShareBusyId] = useState<string | null>(null);
  const [shareInfo, setShareInfo] = useState<Record<string, string>>({});
  const [releaseFilter, setReleaseFilter] = useState<
    "all" | "not_released" | "released" | "rewarded"
  >("all");
  const [machineIntegrations, setMachineIntegrations] = useState<
    Record<string, IntegrationSummary>
  >({});

  const load = async (d: number, tenant: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("days", String(d));
      if (tenant) qs.set("tenantId", tenant);
      const resp = await fetch(`/api/wartung/cases?${qs.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      const payload: { error?: string; cases?: WartungCase[] } = await resp.json();
      if (!resp.ok) {
        setError(payload.error ?? "Konnte Daten nicht laden.");
        return;
      }
      setCases(payload.cases ?? []);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load(days, tenantScope);
  }, [days, tenantScope]);

  useEffect(() => {
    let cancelled = false;
    const loadMap = async () => {
      try {
        const resp = await fetch("/api/dashboard/machines/integration-map", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (!resp.ok) return;
        const payload = (await resp.json()) as {
          machines?: Record<string, IntegrationSummary>;
        };
        if (cancelled) return;
        setMachineIntegrations(payload.machines ?? {});
      } catch {
        /* leise: Fallback = KI-Schätzung */
      }
    };
    void loadMap();
    return () => {
      cancelled = true;
    };
  }, [tenantScope]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void load(days, tenantScope);
    }, 15000);
    return () => window.clearInterval(id);
  }, [days, tenantScope]);

  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      if (releaseFilter === "all") return true;
      const isRewarded =
        typeof c.worker_rewarded_at === "string" && c.worker_rewarded_at.trim().length > 0;
      const isReleased = c.manager_public_approved === true;
      if (releaseFilter === "rewarded") return isRewarded;
      if (releaseFilter === "released") return isReleased && !isRewarded;
      return !isReleased;
    });
  }, [cases, releaseFilter]);
  const filteredCount = filteredCases.length;

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Wartung</h1>
          <p className="mt-2 text-sm text-slate-400">
            F&auml;lle aus der Mitarbeiter-App.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Anzeigen
          </span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value) as 10 | 20 | 30)}
            className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-200 outline-none"
          >
            <option value={10}>Letzte 10 Tage</option>
            <option value={20}>20 Tage</option>
            <option value={30}>30 Tage</option>
          </select>
        </div>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-slate-400">{filteredCount} Eintr&auml;ge</p>
        {isLoading ? (
          <p className="text-sm text-slate-500">L&auml;dt...</p>
        ) : null}
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            { id: "all", label: "Alle" },
            { id: "not_released", label: "Nicht freigegeben" },
            { id: "released", label: "Freigegeben" },
            { id: "rewarded", label: "Reward ausgezahlt" },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setReleaseFilter(f.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              releaseFilter === f.id
                ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
                : "border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <h2 className="mb-4 text-xl font-semibold text-white">Letzte Meldungen</h2>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filteredCases.map((c) => {
          const override = parsePriorityOverride(c.priority_override) ?? c.original_priority;
          const level = priorityToLevel(override);
          const photos = coercePhotoUrls(c.photo_urls);
          const machine = c.machine?.name ?? "Unbekannte Maschine";
          const part = c.required_part ?? "—";
          const integration =
            (typeof c.machine_id === "string" && c.machine_id
              ? machineIntegrations[c.machine_id]
              : null) ?? null;
          const isCoupled = Boolean(integration);
          const kwh =
            typeof c.kwh_value === "number" && Number.isFinite(c.kwh_value)
              ? c.kwh_value
              : kwhEstimateFromStatus(c.machine_status);
          const shareMsg = shareInfo[c.id] ?? null;
          const release = knowledgeReleaseState(c);

          return (
            <article
              key={c.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase text-slate-500">
                    KI-Analyse
                  </p>
                  <p className="mt-2 line-clamp-5 text-sm leading-relaxed text-slate-200">
                    {c.analysis_text ?? "—"}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(level)}`}
                  title={`Priorit&auml;t: ${level}`}
                >
                  Prio {level}
                </span>
              </div>

              <div className="mt-5 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400">Maschine</span>
                  <span className="truncate font-medium text-slate-200">
                    {machine}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400">Kopplung</span>
                  {isCoupled ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-100">
                      <Cable className="h-3 w-3" strokeWidth={2} />
                      Gekoppelt
                      {integration?.display_name ? ` · ${integration.display_name}` : ""}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs font-semibold text-slate-300">
                      <Sparkles className="h-3 w-3" strokeWidth={2} />
                      KI-Analyse
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400">Ersatzteil</span>
                  <span className="truncate font-medium text-slate-200">
                    Ben&ouml;tigtes Teil: {part}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400">kWh-Anzeige</span>
                  <span className="truncate font-medium text-cyan-200">
                    {formatKwh(kwh)}
                    {isCoupled
                      ? " (API)"
                      : typeof c.kwh_value !== "number"
                        ? " (KI-Schätzung)"
                        : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400">Öffentliche Axon AI</span>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${release.className}`}
                  >
                    {release.label}
                  </span>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => (photos[0] ? setLightboxUrl(photos[0]) : null)}
                  disabled={photos.length === 0}
                  className="rounded-full border border-slate-800 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Foto &ouml;ffnen
                </button>
                <button
                  type="button"
                  disabled={shareBusyId === c.id}
                  onClick={async () => {
                    setShareBusyId(c.id);
                    setShareInfo((p) => ({ ...p, [c.id]: "" }));
                    try {
                      const content = [
                        `Maschine: ${machine}`,
                        `Status: ${c.machine_status ?? "unbekannt"}`,
                        `kWh: ${formatKwh(kwh)}`,
                        `Ersatzteil: ${part}`,
                        `Analyse: ${c.analysis_text ?? "—"}`,
                      ].join("\n");
                      const resp = await fetch("/api/coin/healing-knowledge", {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          case_id: c.id,
                          approve_public: true,
                          content,
                        }),
                      });
                      const payload = (await resp.json()) as {
                        error?: string;
                        rewarded?: boolean;
                        pending_manager_approval?: boolean;
                      };
                      if (!resp.ok) {
                        setShareInfo((p) => ({
                          ...p,
                          [c.id]: payload.error ?? "Teilen fehlgeschlagen.",
                        }));
                        return;
                      }
                      setShareInfo((p) => ({
                        ...p,
                        [c.id]: payload.rewarded
                          ? "Freigegeben und Reward ausgezahlt."
                          : payload.pending_manager_approval
                            ? "Freigabe ausstehend."
                            : "In den öffentlichen Axon-Pool geteilt.",
                      }));
                      await load(days, tenantScope);
                    } catch {
                      setShareInfo((p) => ({
                        ...p,
                        [c.id]: "Netzwerkfehler beim Teilen.",
                      }));
                    } finally {
                      setShareBusyId(null);
                    }
                  }}
                  className="rounded-full border border-cyan-500/35 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {shareBusyId === c.id ? "Teilen…" : "Teilen"}
                </button>
              </div>
              {shareMsg ? (
                <p className="mt-3 text-xs text-slate-400">{shareMsg}</p>
              ) : null}
            </article>
          );
        })}
      </div>

      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white hover:bg-black/60"
              aria-label="Schlie&szlig;en"
            >
              <X className="h-5 w-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt="Foto"
              className="max-h-[85vh] w-full rounded-2xl object-contain"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
