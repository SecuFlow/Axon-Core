"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

type OpsLevel = "ok" | "warning" | "critical";

type CheckRow = {
  id: string;
  level: OpsLevel;
  detail: string;
};

type Payload = {
  severity: OpsLevel;
  checks: CheckRow[];
  fingerprint: string;
  generated_at?: string;
  hint?: string;
  error?: string;
};

function levelStyles(level: OpsLevel): string {
  if (level === "critical") return "text-[#f0a0a0] border-[#a64545]/50 bg-[#2a1010]/60";
  if (level === "warning") return "text-[#e8dcb8] border-[#c9a962]/45 bg-[#c9a962]/[0.06]";
  return "text-[#8a9a8a] border-[#1f2a1f] bg-[#0a120a]/50";
}

function severityBadge(severity: OpsLevel): string {
  if (severity === "critical") return "border-[#a64545]/60 bg-[#3a1010]/50 text-[#f0b0b0]";
  if (severity === "warning") return "border-[#c9a962]/50 bg-[#c9a962]/10 text-[#e8dcb8]";
  return "border-[#2a3a2a] bg-[#0a0f0a] text-[#9aba9a]";
}

export function PilotOpsMonitorClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/pilot-ops-monitor", { cache: "no-store" });
      const json = (await res.json()) as Payload;
      if (!res.ok) {
        setData(null);
        setErr(typeof json.error === "string" ? json.error : `HTTP ${res.status}`);
        return;
      }
      setData(json);
    } catch (e) {
      setData(null);
      setErr(e instanceof Error ? e.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {loading ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#6a6a6a]">
              Lade…
            </span>
          ) : data ? (
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] ${severityBadge(data.severity)}`}
            >
              Status: {data.severity}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-[#c9a962]/30 bg-[#c9a962]/[0.06] px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[#d4c896] transition hover:border-[#c9a962]/50 disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
            Aktualisieren
          </button>
        </div>
        <Link
          href="/admin/hq/leadmaschine"
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#7a8a7a] underline decoration-[#2a3a2a] underline-offset-2 hover:text-[#c9a962]"
        >
          Zur Leadmaschine
        </Link>
      </div>

      {err ? (
        <div className="rounded-lg border border-[#5a3030] bg-[#1a0a0a] p-4">
          <p className="font-mono text-[11px] text-[#e8a0a0]">{err}</p>
        </div>
      ) : null}

      {data?.hint ? (
        <p className="font-mono text-[10px] leading-relaxed text-[#6a6a6a]">{data.hint}</p>
      ) : null}

      {data?.generated_at ? (
        <p className="font-mono text-[9px] text-[#4a4a4a]">Stand: {data.generated_at}</p>
      ) : null}

      {data?.fingerprint ? (
        <p className="break-all font-mono text-[9px] text-[#3a3a3a]">
          Fingerprint: <span className="text-[#5a5a5a]">{data.fingerprint}</span>
        </p>
      ) : null}

      {data?.checks?.length ? (
        <ul className="space-y-2">
          {data.checks.map((c) => (
            <li
              key={c.id}
              className={`rounded-lg border p-3 font-mono text-[10px] leading-relaxed ${levelStyles(c.level)}`}
            >
              <span className="font-semibold uppercase tracking-[0.1em]">[{c.level}]</span>{" "}
              <span className="text-[#a8a8a8]">{c.id}</span>
              <br />
              <span className="mt-1 inline-block text-[#b8b8b8]">{c.detail}</span>
            </li>
          ))}
        </ul>
      ) : !loading && !err ? (
        <p className="font-mono text-[10px] text-[#5a5a5a]">Keine Check-Daten.</p>
      ) : null}
    </div>
  );
}
