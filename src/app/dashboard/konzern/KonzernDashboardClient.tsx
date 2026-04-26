"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import useSWR from "swr";
import { Activity, MapPin } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useDemoLinkParam } from "@/lib/useDemoLinkParam";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MachineLogLine = {
  id: string;
  created_at: string | null;
  error: string;
  solution: string;
};

type FleetMachine = {
  id: string;
  name: string | null;
  serial_number: string;
  status: string;
  last_ai_report: string | null;
  last_ai_report_at: string | null;
  location_name?: string | null;
  logs: MachineLogLine[];
};

type FleetPayload = {
  machines?: FleetMachine[];
  can_edit_serial?: boolean;
  error?: string;
};

type StatsPayload = {
  secured_knowledge_count?: number;
  active_experts_count?: number;
  secured_caption?: string;
  error?: string;
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const resp = await fetch(url, { credentials: "include", cache: "no-store" });
  const payload = (await resp.json()) as T & { error?: string };
  if (!resp.ok) throw new Error(payload.error ?? "Fehler beim Laden.");
  return payload;
};

function withDemoQuery(path: string, demo: string | null): string {
  if (!demo) return path;
  const glue = path.includes("?") ? "&" : "?";
  return `${path}${glue}demo=${encodeURIComponent(demo)}`;
}

function formatDeShort(iso: string | null): string {
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
    return iso;
  }
}

function statusBadgeClass(status: string): { label: string; className: string } {
  const s = status.toLowerCase();
  if (s === "active") return { label: "Aktiv", className: "border-emerald-400/50 bg-emerald-500/20 text-emerald-100" };
  if (s === "maintenance") return { label: "Wartung", className: "border-amber-400/50 bg-amber-500/20 text-amber-100" };
  if (s === "offline") return { label: "Offline", className: "border-red-400/50 bg-red-500/25 text-red-100" };
  return { label: status || "Unbekannt", className: "border-slate-600 bg-slate-800 text-slate-200" };
}

function KpiSkeleton() {
  return (
    <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <div className="h-5 w-40 animate-pulse rounded bg-slate-800" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-9 w-32 animate-pulse rounded bg-slate-800" />
            <div className="h-36 w-full animate-pulse rounded bg-slate-900" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FleetSkeleton() {
  return (
    <section className="mb-8">
      <div className="mb-4 h-8 w-72 animate-pulse rounded bg-slate-800" />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <article key={i} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="h-5 w-2/3 animate-pulse rounded bg-slate-800" />
            <div className="mt-4 h-20 animate-pulse rounded bg-slate-800/80" />
            <div className="mt-3 h-16 animate-pulse rounded bg-slate-800/70" />
          </article>
        ))}
      </div>
    </section>
  );
}

function KpiSection({ demo }: { demo: string | null }) {
  const key = withDemoQuery("/api/dashboard/konzern-stats", demo);
  const { data, error } = useSWR<StatsPayload>(key, fetcher, {
    suspense: true,
    refreshInterval: 15_000,
    revalidateOnFocus: true,
  });

  if (error) {
    return <p className="mb-6 text-sm text-slate-400">{error.message}</p>;
  }

  const secured = data?.secured_knowledge_count ?? 0;
  const experts = data?.active_experts_count ?? 0;
  const caption = data?.secured_caption ?? "Wissens-Einträge";
  const chartData = [
    { name: "Wissen", value: secured },
    { name: "Experten", value: experts },
  ];

  return (
    <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2">
      <Card className="relative overflow-hidden border-cyan-500/25 bg-slate-900/55 shadow-[0_0_44px_-14px_rgba(0,209,255,0.42)] ring-1 ring-cyan-400/20 transition-[box-shadow,filter] duration-300 hover:shadow-[0_0_56px_-10px_rgba(0,209,255,0.5)]">
        <CardHeader><CardTitle>Gesichertes Wissen</CardTitle></CardHeader>
        <CardContent>
          <p className="text-3xl font-black text-white">
            {secured.toLocaleString("de-DE")} <span className="text-sm font-normal text-primary">{caption}</span>
          </p>
          <div className="mt-4 h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="value" fill="#00D1FF" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <Card className="relative overflow-hidden border-sky-500/25 bg-slate-900/55 shadow-[0_0_44px_-14px_rgba(56,189,248,0.38)] ring-1 ring-sky-400/18 transition-[box-shadow,filter] duration-300 hover:shadow-[0_0_56px_-10px_rgba(56,189,248,0.48)]">
        <CardHeader><CardTitle>Aktive Experten</CardTitle></CardHeader>
        <CardContent>
          <p className="text-3xl font-black text-white">
            {experts.toLocaleString("de-DE")} <span className="text-sm font-normal text-blue-500">eingeloggte Mitarbeiter-Accounts</span>
          </p>
          <div className="mt-4 h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="value" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FleetSection({ demo }: { demo: string | null }) {
  const key = withDemoQuery("/api/wartung/machines", demo);
  const { data, error, mutate, isValidating } = useSWR<FleetPayload>(key, fetcher, {
    suspense: true,
    refreshInterval: demo ? 4_000 : 20_000,
    revalidateOnFocus: true,
  });
  const [serialDraft, setSerialDraft] = useState<Record<string, string>>({});
  const [serialSaving, setSerialSaving] = useState<string | null>(null);
  const [fleetError, setFleetError] = useState<string | null>(null);

  const fleet = useMemo(() => data?.machines ?? [], [data?.machines]);
  const canEditSerial = data?.can_edit_serial === true;

  const recentActivities = useMemo(() => {
    const out: Array<{ id: string; created_at: string | null; machineLabel: string; error: string; solution: string }> = [];
    for (const m of fleet) {
      const machineLabel = (m.name && m.name.trim()) || m.serial_number || "Maschine";
      for (const log of m.logs ?? []) out.push({ id: log.id, created_at: log.created_at, machineLabel, error: log.error, solution: log.solution });
    }
    out.sort((a, b) => (new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()));
    return out.slice(0, 14);
  }, [fleet]);

  if (error) return <p className="mb-6 text-sm text-slate-400">{error.message}</p>;

  return (
    <>
      {fleet.length > 0 ? (
        <Card className="mb-8 border-white/10 bg-slate-950/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg"><Activity className="h-5 w-5 text-primary" aria-hidden />Letzte Aktivitäten</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivities.length === 0 ? <p className="text-sm text-slate-500">Noch keine Einträge.</p> : (
              <ul className="space-y-2 text-sm">
                {recentActivities.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-white/5 pb-2 last:border-0 last:pb-0">
                    <span className="shrink-0 text-xs text-slate-500">{formatDeShort(a.created_at)}</span>
                    <span className="font-medium text-slate-200">{a.machineLabel}</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-rose-200/90">{a.error}</span>
                    <span className="text-slate-600">→</span>
                    <span className="text-emerald-200/85">{a.solution}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <section className="mb-8">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Maschinen-Inventar</h2>
            <p className="mt-1 text-sm text-slate-400">Live aktualisiert im Hintergrund (SWR).</p>
          </div>
          {isValidating ? <span className="text-sm text-slate-500">Aktualisiere…</span> : null}
        </div>

        {fleetError ? <div className="mb-4 rounded-xl border border-slate-600/50 bg-slate-900/50 p-3 text-sm text-slate-300">{fleetError}</div> : null}

        {fleet.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-6 text-sm text-slate-500">Noch keine Maschinen.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {fleet.map((m) => {
              const badge = statusBadgeClass(m.status);
              const displayName = (m.name && m.name.trim()) || m.serial_number || "Maschine";
              const draft = serialDraft[m.id] ?? m.serial_number;
              const repairs = (m.logs ?? []).slice(0, 3);
              return (
                <article key={m.id} className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-bold text-white">{displayName}</h3>
                      {m.location_name ? <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400"><MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden /><span className="truncate">{m.location_name}</span></p> : null}
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.className}`}>{badge.label}</span>
                  </div>

                  <div className="mt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Seriennummer</p>
                    {canEditSerial ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <input type="text" value={draft} onChange={(e) => setSerialDraft((p) => ({ ...p, [m.id]: e.target.value }))} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-primary/50" />
                        <button
                          type="button"
                          disabled={serialSaving === m.id || draft === m.serial_number}
                          onClick={async () => {
                            setSerialSaving(m.id);
                            try {
                              const resp = await fetch(`/api/wartung/machines/${m.id}`, {
                                method: "PATCH",
                                credentials: "include",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ serial_number: draft }),
                              });
                              const p = (await resp.json()) as { error?: string };
                              if (!resp.ok) {
                                setFleetError(p.error ?? "Speichern fehlgeschlagen.");
                                return;
                              }
                              setFleetError(null);
                              await mutate();
                            } finally {
                              setSerialSaving(null);
                            }
                          }}
                          className="rounded-lg border border-primary/50 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/25 disabled:opacity-50"
                        >
                          {serialSaving === m.id ? "…" : "OK"}
                        </button>
                      </div>
                    ) : (
                      <p className="mt-1 font-mono text-xs text-slate-200">{m.serial_number}</p>
                    )}
                  </div>

                  <div className="mt-3 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">KI-Zusammenfassung</p>
                    <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-slate-300">{m.last_ai_report?.trim() ? m.last_ai_report : "Generiere aktuellen Statusbericht..."}</p>
                  </div>

                  <div className="mt-3 border-t border-slate-800 pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Letzte Reparaturen</p>
                    {repairs.length === 0 ? <p className="mt-1 text-xs text-slate-500">—</p> : (
                      <ul className="mt-2 space-y-1.5 text-[11px] leading-snug text-slate-400">
                        {repairs.map((log) => (
                          <li key={log.id} className="border-l-2 border-slate-700 pl-2">
                            <span className="text-slate-500">{formatDeShort(log.created_at)}</span>
                            <span className="mx-1 text-slate-600">·</span>
                            <span className="text-rose-200/90">{log.error}</span>
                            <span className="mx-1 text-slate-600">→</span>
                            <span className="text-emerald-200/85">{log.solution}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <p className="mt-3 text-[10px] text-slate-600"><Link href="/dashboard/wartung" className="text-primary/90 hover:underline">Alle Meldungen</Link></p>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

export default function KonzernDashboardClient() {
  const demo = useDemoLinkParam();
  return (
    <div>
      <Suspense fallback={<KpiSkeleton />}>
        <KpiSection demo={demo} />
      </Suspense>
      <Suspense fallback={<FleetSkeleton />}>
        <FleetSection demo={demo} />
      </Suspense>
    </div>
  );
}

