"use client";

import { useCallback, useEffect, useState } from "react";

type CheckResult = {
  key: "database" | "mail" | "stripe" | "storage";
  label: string;
  ok: boolean;
  detail: string;
};

type Payload = {
  ok?: boolean;
  error?: string;
  checks?: CheckResult[];
  generated_at?: string;
};

export function DiagnosticCheckClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/diagnostic-check", {
        credentials: "include",
        cache: "no-store",
      });
      const p = (await resp.json()) as Payload;
      if (!resp.ok) {
        setError(p.error ?? "Diagnose konnte nicht geladen werden.");
        setChecks([]);
        setGeneratedAt(null);
        return;
      }
      setChecks(Array.isArray(p.checks) ? p.checks : []);
      setGeneratedAt(typeof p.generated_at === "string" ? p.generated_at : null);
    } catch {
      setError("Netzwerkfehler.");
      setChecks([]);
      setGeneratedAt(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mx-auto w-full max-w-4xl rounded-xl border border-[#1f1f1f] bg-[#0a0a0a] p-6">
      <div className="mb-5 flex items-center justify-between gap-3 border-b border-[#1f1f1f] pb-3">
        <div>
          <h1 className="font-mono text-[12px] font-semibold uppercase tracking-[0.16em] text-[#d4d4d4]">
            Diagnostic Check
          </h1>
          <p className="mt-1 font-mono text-[10px] text-[#6b6b6b]">
            Automatischer Systemstatus für Admin.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md border border-[#2a2a2a] bg-[#080808] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8a8a8a] transition hover:border-[#3a3a3a] hover:text-[#d4d4d4] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Prüfe…" : "Neu prüfen"}
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-[10px] text-red-200">
          {error}
        </div>
      ) : null}

      {generatedAt ? (
        <p className="mb-4 font-mono text-[10px] text-[#5a5a5a]">
          Letzter Lauf:{" "}
          {new Date(generatedAt).toLocaleString("de-DE", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </p>
      ) : null}

      <ul className="space-y-2">
        {checks.map((item) => (
          <li
            key={item.key}
            className={`rounded-md border px-3 py-2 ${
              item.ok ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={`mt-0.5 text-sm ${item.ok ? "text-emerald-300" : "text-red-300"}`}
              >
                {item.ok ? "✓" : "✗"}
              </span>
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#e5e5e5]">
                  {item.label}
                </p>
                <p className="mt-1 font-mono text-[10px] text-[#bcbcbc]">{item.detail}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {!loading && checks.length === 0 && !error ? (
        <p className="mt-4 font-mono text-[10px] text-[#6b6b6b]">Keine Prüfergebnisse verfügbar.</p>
      ) : null}
    </section>
  );
}

