"use client";

import { useEffect, useState } from "react";
import { PlaceholderPanel } from "../../_components/PlaceholderPanel";

type Payload = {
  error?: string;
  kpis?: {
    demo_requests_clicks: number;
    knowledge_rate_total_entries: number;
    axon_coin_volume: number;
  };
};

function formatCompact(n: number): string {
  return new Intl.NumberFormat("de-DE", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export default function AdminKPIPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch("/api/admin/kpi", {
          credentials: "include",
        });
        const p = (await resp.json()) as Payload;
        if (cancelled) return;
        if (!resp.ok) {
          setError(p.error ?? "KPI-Daten konnten nicht geladen werden.");
          setData(null);
          return;
        }
        setData(p);
      } catch {
        if (!cancelled) {
          setError("Netzwerkfehler beim Laden der KPI-Daten.");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const kpis = data?.kpis ?? null;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-mono text-xs font-medium uppercase tracking-[0.28em] text-[#8a8a8a]">
          KPI Zentrale
        </h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <PlaceholderPanel title="Demo Anfragen">
          <div className="rounded-md border border-cyan-500/20 bg-[#070707] p-5 shadow-[0_0_36px_-12px_rgba(0,209,255,0.35)] ring-1 ring-cyan-400/15 transition-[box-shadow] duration-300 hover:shadow-[0_0_44px_-10px_rgba(0,209,255,0.45)]">
            <p className="mt-1 font-mono text-4xl font-light tabular-nums text-[#e8e8e8]">
              {loading ? "…" : kpis ? formatCompact(kpis.demo_requests_clicks) : "—"}
            </p>
          </div>
        </PlaceholderPanel>
        <PlaceholderPanel title="Knowledge Rate">
          <div className="rounded-md border border-cyan-500/20 bg-[#070707] p-5 shadow-[0_0_36px_-12px_rgba(0,209,255,0.32)] ring-1 ring-cyan-400/15 transition-[box-shadow] duration-300 hover:shadow-[0_0_44px_-10px_rgba(0,209,255,0.42)]">
            <p className="mt-1 font-mono text-4xl font-light tabular-nums text-[#e8e8e8]">
              {loading ? "…" : kpis ? formatCompact(kpis.knowledge_rate_total_entries) : "—"}
            </p>
          </div>
        </PlaceholderPanel>
        <PlaceholderPanel title="Axon Coin Volumen">
          <div className="rounded-md border border-cyan-500/20 bg-[#070707] p-5 shadow-[0_0_36px_-12px_rgba(0,209,255,0.3)] ring-1 ring-cyan-400/15 transition-[box-shadow] duration-300 hover:shadow-[0_0_44px_-10px_rgba(0,209,255,0.4)]">
            <p className="mt-1 font-mono text-4xl font-light tabular-nums text-[#e8e8e8]">
              {loading || !kpis ? "…" : `${formatCompact(kpis.axon_coin_volume)} AXN`}
            </p>
          </div>
        </PlaceholderPanel>
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 font-mono text-[10px] text-red-200">
          {error}
        </div>
      ) : null}
    </div>
  );
}
