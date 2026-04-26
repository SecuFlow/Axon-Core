"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PlaceholderPanel } from "../../_components/PlaceholderPanel";

type PricingPayload = {
  error?: string;
  stripe_status?: "linked" | "missing_secret";
  active_price_id_enterprise?: string | null;
  active_price_id_smb?: string | null;
  source?: "db" | "env" | null;
  enterprise_price?: {
    id: string;
    active: boolean;
    currency: string | null;
    unit_amount: number | null;
    recurring:
      | { interval?: string | null; interval_count?: number | null }
      | null;
    product: string | null;
  } | null;
  smb_price?: {
    id: string;
    active: boolean;
    currency: string | null;
    unit_amount: number | null;
    recurring:
      | { interval?: string | null; interval_count?: number | null }
      | null;
    product: string | null;
  } | null;
  available_prices?: Array<{
    id: string;
    label: string;
    unit_amount: number | null;
    currency: string | null;
    interval: string | null;
    product_name: string | null;
  }>;
};

function formatMoney(input: { unit_amount: number | null; currency: string | null }) {
  if (typeof input.unit_amount !== "number" || !Number.isFinite(input.unit_amount)) return "—";
  const c = (input.currency ?? "eur").toUpperCase();
  const eur = input.unit_amount / 100;
  return `${new Intl.NumberFormat("de-DE", { style: "currency", currency: c }).format(eur)}`;
}

export function SystemStripePricingClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [data, setData] = useState<PricingPayload | null>(null);
  const [pkg, setPkg] = useState<"enterprise" | "smb">("enterprise");
  const [priceId, setPriceId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const resp = await fetch("/api/admin/stripe/pricing", {
        credentials: "include",
      });
      const p = (await resp.json()) as PricingPayload;
      if (!resp.ok) {
        setError(p.error ?? "Stripe-Daten konnten nicht geladen werden.");
        setData(null);
        return;
      }
      setData(p);
      setPriceId(
        pkg === "enterprise"
          ? p.active_price_id_enterprise ?? ""
          : p.active_price_id_smb ?? "",
      );
    } catch {
      setError("Netzwerkfehler.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [pkg]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusPill = useMemo(() => {
    const linked = data?.stripe_status === "linked";
    return (
      <span
        className={`inline-flex items-center rounded-full border px-3 py-1 font-mono text-[9px] font-medium uppercase tracking-[0.14em] ${
          linked
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
            : "border-red-500/25 bg-red-500/10 text-red-200"
        }`}
      >
        {linked ? "Stripe linked" : "Stripe missing"}
      </span>
    );
  }, [data?.stripe_status]);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const id = priceId.trim();
    if (!id) {
      setError("Stripe Price ID ist erforderlich.");
      return;
    }
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const resp = await fetch("/api/admin/stripe/pricing", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stripe_price_id: id, package: pkg }),
      });
      const p = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        setError(p.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      setOk(
        pkg === "enterprise"
          ? "Konzern-Paket Preis aktualisiert."
          : "Kleinunternehmer-Paket Preis aktualisiert.",
      );
      await load();
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PlaceholderPanel title="Preise · Stripe (Live)">
      {loading ? (
        <p className="font-mono text-[10px] text-[#6b6b6b]">Lade Stripe…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {statusPill}
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#5a5a5a]">
                Quelle: {data?.source ?? "—"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#7a7a7a] hover:border-[#3a3a3a] hover:text-[#9a9a9a]"
            >
              Aktualisieren
            </button>
          </div>

          {error ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-[10px] text-red-200">
              {error}
            </div>
          ) : null}
          {ok ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 font-mono text-[10px] text-emerald-100">
              {ok}
            </div>
          ) : null}

          <div className="rounded-md border border-[#1f1f1f] bg-[#080808] p-4">
            <p className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#5a5a5a]">
              Aktive Preise
            </p>
            <div className="mt-2 grid gap-2 font-mono text-[10px] text-[#8a8a8a]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#5a5a5a]">Konzern-Paket</span>
                <span className="truncate text-[#d4d4d4]">
                  {data?.active_price_id_enterprise ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#5a5a5a]">Kleinunternehmer-Paket</span>
                <span className="truncate text-[#d4d4d4]">
                  {data?.active_price_id_smb ?? "—"}
                </span>
              </div>
            </div>
          </div>

          <form onSubmit={onSave} className="space-y-3">
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="flex items-center justify-between gap-3">
                <label className="block font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#5a5a5a]">
                  Paket
                </label>
                <select
                  value={pkg}
                  onChange={(e) => {
                    const next = e.target.value === "smb" ? "smb" : "enterprise";
                    setPkg(next);
                    setPriceId(
                      next === "enterprise"
                        ? data?.active_price_id_enterprise ?? ""
                        : data?.active_price_id_smb ?? "",
                    );
                  }}
                  className="w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                >
                  <option value="enterprise">Konzern-Paket</option>
                  <option value="smb">Kleinunternehmer-Paket</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#5a5a5a]">Aktueller Betrag</span>
                <span className="tabular-nums text-[#d4d4d4]">
                  {pkg === "enterprise" && data?.enterprise_price
                    ? formatMoney({
                        unit_amount: data.enterprise_price.unit_amount,
                        currency: data.enterprise_price.currency,
                      })
                    : pkg === "smb" && data?.smb_price
                      ? formatMoney({
                          unit_amount: data.smb_price.unit_amount,
                          currency: data.smb_price.currency,
                        })
                      : "—"}
                </span>
              </div>
            </div>
            <div>
              <label className="block font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#5a5a5a]">
                Stripe-Preis wählen (Dropdown)
              </label>
              <select
                value={priceId}
                onChange={(e) => setPriceId(e.target.value)}
                className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none placeholder:text-[#4a4a4a] focus:border-[#c9a962]/40"
              >
                <option value="">— Preis auswählen —</option>
                {(data?.available_prices ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.product_name ?? "Produkt"} ·{" "}
                    {formatMoney({ unit_amount: p.unit_amount, currency: p.currency })}
                    {" · "}
                    {p.interval ?? "einmalig"}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={saving || !priceId.trim()}
              className="inline-flex w-full items-center justify-center rounded-md border border-[#c9a962]/35 bg-[#c9a962]/10 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d4c896] transition hover:bg-[#c9a962]/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Speichern…" : "Preis aktiv setzen"}
            </button>
          </form>
        </div>
      )}
    </PlaceholderPanel>
  );
}

