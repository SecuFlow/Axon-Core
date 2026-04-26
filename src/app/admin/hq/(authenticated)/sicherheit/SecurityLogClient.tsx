"use client";

import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string;
  created_at: string;
  action: string;
  description: string;
  user_id: string | null;
  tenant_id: string | null;
  metadata: unknown;
};

export function SecurityLogClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Row[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/security", {
        credentials: "include",
        cache: "no-store",
      });
      const p = (await resp.json()) as { error?: string; items?: Row[] };
      if (!resp.ok) {
        setError(p.error ?? "Logs konnten nicht geladen werden.");
        setItems([]);
        return;
      }
      setItems(Array.isArray(p.items) ? p.items : []);
    } catch {
      setError("Netzwerkfehler.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <section className="mt-6 rounded-lg border border-[#1f1f1f] bg-[#0a0a0a]">
      <div className="flex items-center justify-between border-b border-[#1f1f1f] px-5 py-3">
        <p className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#5a5a5a]">
          Security Logs ({items.length})
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#7a7a7a] hover:text-[#9a9a9a]"
        >
          Aktualisieren
        </button>
      </div>
      <div className="px-5 py-4">
        {loading ? (
          <p className="font-mono text-[10px] text-[#6b6b6b]">Lade…</p>
        ) : error ? (
          <p className="font-mono text-[10px] text-red-300">{error}</p>
        ) : items.length === 0 ? (
          <p className="font-mono text-[10px] text-[#6b6b6b]">Keine Einträge.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => (
              <li
                key={it.id}
                className="rounded border border-[#141414] bg-[#050505] px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#c9a962]/80">
                    {it.action}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#6b6b6b]">
                    {new Date(it.created_at).toLocaleString("de-DE", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[11px] text-[#d4d4d4]">
                  {it.description}
                </p>
                <p className="mt-1 font-mono text-[10px] text-[#6b6b6b]">
                  User: {it.user_id ? it.user_id.slice(0, 8) : "—"} · Mandant:{" "}
                  {it.tenant_id ? it.tenant_id.slice(0, 8) : "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

