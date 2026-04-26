"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CompanyRow = {
  id: string;
  name: string;
  tenant_id: string | null;
};

export default function AdminCustomerViewPickerPage() {
  const router = useRouter();
  const [items, setItems] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch("/api/dashboard/team/companies", {
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await resp.json()) as {
          companies?: CompanyRow[];
          error?: string;
        };
        if (cancelled) return;
        if (!resp.ok) {
          setError(payload.error ?? "Mandate konnten nicht geladen werden.");
          setItems([]);
          return;
        }
        const list = (payload.companies ?? []).filter(
          (c) => typeof c.id === "string" && c.id.trim().length > 0,
        );
        setItems(list);
        setSelected((prev) => prev || list[0]?.id || "");
      } catch {
        if (!cancelled) {
          setError("Netzwerkfehler beim Laden der Mandate.");
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedName = useMemo(
    () => items.find((i) => i.id === selected)?.name ?? null,
    [items, selected],
  );

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-[#8a8a8a]">
        Kunden-Ansicht
      </h1>
      <p className="mt-3 max-w-xl font-mono text-[11px] leading-relaxed text-[#6b6b6b]">
        Wähle ein Mandat und springe danach in die gefilterte{" "}
        <span className="font-semibold text-[#a8a8a8]">KONZERN DASHBOARD</span>
        -Ansicht.
      </p>

      <div className="mt-8 rounded-2xl border border-[#c9a962]/20 bg-[#0a0a0a]/90 p-6 shadow-[inset_0_1px_0_0_rgba(212,175,55,0.12),0_0_48px_-18px_rgba(212,175,55,0.18)]">
        {loading ? (
          <p className="font-mono text-xs text-[#6b6b6b]">Mandate werden geladen…</p>
        ) : error ? (
          <p className="font-mono text-xs text-red-300">{error}</p>
        ) : items.length === 0 ? (
          <p className="font-mono text-xs text-[#6b6b6b]">Keine Mandate gefunden.</p>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-[#7a7a7a]">
                Mandat auswählen
              </span>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="w-full rounded-xl border border-[#2a2a2a] bg-[#070707] px-3 py-2.5 font-mono text-xs text-[#d4d4d4] outline-none transition focus:border-[#c9a962]/40"
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-xl border border-[#1f1f1f] bg-[#050505]/80 p-3 font-mono text-[11px] text-[#a8a8a8]">
              Ziel:{" "}
              <span className="font-semibold text-[#e8e8e8]">{selectedName ?? "—"}</span>
            </div>

            <button
              type="button"
              onClick={() =>
                router.push(
                  selected
                    ? `/dashboard/konzern?company_id=${encodeURIComponent(selected)}`
                    : "/dashboard/konzern",
                )
              }
              disabled={!selected}
              className="inline-flex h-11 w-full items-center justify-center rounded-full border border-[#c9a962]/40 bg-[#c9a962]/12 px-5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#e8dcb8] shadow-[0_0_28px_-8px_rgba(212,175,55,0.35)] transition hover:border-[#c9a962]/55 hover:bg-[#c9a962]/18 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              KONZERN DASHBOARD öffnen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
