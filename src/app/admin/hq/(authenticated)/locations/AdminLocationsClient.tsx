"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Building2, Factory, MapPin, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";

type CompanyOption = {
  id: string;
  tenant_id: string | null;
  name: string;
  logo_url: string | null;
  branche: string | null;
  manager_verknuepft: boolean;
};

type Loc = {
  id: string;
  created_at: string;
  company_id: string;
  name: string;
  address: string | null;
};

type Group = {
  company_id: string;
  company_name: string;
  logo_url: string | null;
  branche: string | null;
  locations: Loc[];
};

export function AdminLocationsClient() {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKonzern, setBusyKonzern] = useState(false);
  const [busyStandort, setBusyStandort] = useState(false);
  const [konzernOk, setKonzernOk] = useState<string | null>(null);
  const [konzernErr, setKonzernErr] = useState<string | null>(null);
  const [standortOk, setStandortOk] = useState<string | null>(null);
  const [standortErr, setStandortErr] = useState<string | null>(null);
  const [provisioningHint, setProvisioningHint] = useState<string | null>(null);

  const [kName, setKName] = useState("");
  const [kBranche, setKBranche] = useState("");
  const [kSegment, setKSegment] = useState("");
  const [kEmployees, setKEmployees] = useState("");
  const [kRevenue, setKRevenue] = useState("");
  const [kHqName, setKHqName] = useState("Headquarter");
  const [kHqAddress, setKHqAddress] = useState("");

  const [sCompanyId, setSCompanyId] = useState("");
  const [sName, setSName] = useState("");
  const [sAddress, setSAddress] = useState("");
  const [sManagerEmail, setSManagerEmail] = useState("");
  const [sManagerName, setSManagerName] = useState("");
  const [deletingLocationId, setDeletingLocationId] = useState<string | null>(
    null,
  );
  const [deletingCompanyId, setDeletingCompanyId] = useState<string | null>(
    null,
  );

  const reload = useCallback(async () => {
    setError(null);
    const [rc, rl] = await Promise.all([
      fetch("/api/companies", { credentials: "include" }),
      fetch("/api/admin/locations", { credentials: "include" }),
    ]);
    const pc = (await rc.json()) as {
      error?: string;
      companies?: CompanyOption[];
    };
    const pl = (await rl.json()) as { error?: string; groups?: Group[] };
    if (!rc.ok) {
      setError(pc.error ?? "Konzerne konnten nicht geladen werden.");
      return;
    }
    if (!rl.ok) {
      setError(pl.error ?? "Standorte konnten nicht geladen werden.");
      return;
    }
    const list = pc.companies ?? [];
    setCompanies(list);
    setGroups(pl.groups ?? []);
    setSCompanyId((prev) => {
      const ids = new Set(list.map((c) => c.id));
      if (prev && ids.has(prev)) return prev;
      return list[0]?.id ?? "";
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [rc, rl] = await Promise.all([
          fetch("/api/companies", {
            credentials: "include",
          }),
          fetch("/api/admin/locations", {
            credentials: "include",
          }),
        ]);
        const pc = (await rc.json()) as {
          error?: string;
          companies?: CompanyOption[];
        };
        const pl = (await rl.json()) as { error?: string; groups?: Group[] };
        if (cancelled) return;
        if (!rc.ok) {
          setError(pc.error ?? "Konzerne konnten nicht geladen werden.");
          return;
        }
        if (!rl.ok) {
          setError(pl.error ?? "Standorte konnten nicht geladen werden.");
          return;
        }
        const list = pc.companies ?? [];
        setCompanies(list);
        setGroups(pl.groups ?? []);
        setSCompanyId((prev) => {
          const ids = new Set(list.map((c) => c.id));
          if (prev && ids.has(prev)) return prev;
          return list[0]?.id ?? "";
        });
      } catch {
        if (!cancelled) setError("Netzwerkfehler.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutState = (params.get("checkout") ?? "").trim();
    const mandateId = (params.get("mandate_id") ?? "").trim();
    if (!checkoutState) return;

    if (checkoutState === "mandate_manager_canceled") {
      setStandortErr(
        "Stripe-Zahlung abgebrochen. Mandat ist angelegt, Manager-Provisionierung wurde nicht abgeschlossen.",
      );
      setProvisioningHint(null);
      params.delete("checkout");
      params.delete("mandate_id");
      const q = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
      return;
    }

    if (checkoutState !== "mandate_manager_success" || !mandateId) return;
    let cancelled = false;
    let attempts = 0;
    setProvisioningHint("Zahlung bestätigt. Manager-Account wird jetzt für das neue Mandat eingerichtet…");

    const clearQuery = () => {
      params.delete("checkout");
      params.delete("mandate_id");
      const q = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
    };

    const tick = async () => {
      attempts += 1;
      try {
        const resp = await fetch(
          `/api/admin/locations?mandate_id=${encodeURIComponent(mandateId)}`,
          { credentials: "include" },
        );
        const payload = (await resp.json()) as {
          error?: string;
          provisioning?: { status?: string };
        };
        if (!resp.ok) {
          if (!cancelled) {
            setProvisioningHint(null);
            setStandortErr(payload.error ?? "Provisionierungsstatus konnte nicht geprüft werden.");
            clearQuery();
          }
          return;
        }
        const ready = payload.provisioning?.status === "ready";
        if (ready) {
          if (!cancelled) {
            setProvisioningHint(null);
            setStandortOk("Manager-Account für das neue Mandat wurde erfolgreich angelegt und verknüpft.");
            void reload();
            clearQuery();
          }
          return;
        }
        if (attempts >= 20 && !cancelled) {
          setProvisioningHint(null);
          setStandortErr(
            "Provisionierung läuft noch. Bitte in 30 Sekunden aktualisieren; der Manager wird serverseitig weiter eingerichtet.",
          );
          clearQuery();
          return;
        }
        if (!cancelled) {
          window.setTimeout(() => {
            void tick();
          }, 2500);
        }
      } catch {
        if (!cancelled) {
          setProvisioningHint(null);
          setStandortErr("Netzwerkfehler beim Provisionierungs-Check.");
          clearQuery();
        }
      }
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const onKonzern = async (e: FormEvent) => {
    e.preventDefault();
    const n = kName.trim();
    const branche = kBranche.trim();
    const segment = kSegment.trim();
    const employees = Number(kEmployees.trim());
    const revenue = Number(kRevenue.trim());
    const hqName = kHqName.trim() || "Headquarter";
    const hqAddress = kHqAddress.trim();

    const invalidName =
      !n ||
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n) ||
      /(^|\b)(demo|test|testing|placeholder|sample|beispiel)(\b|$)/i.test(n);
    const enterpriseOk =
      !invalidName &&
      branche.length > 0 &&
      segment.length > 0 &&
      Number.isFinite(employees) &&
      employees >= 250 &&
      Number.isFinite(revenue) &&
      revenue >= 50_000_000 &&
      hqAddress.length > 0;

    if (busyKonzern) return;
    if (invalidName) {
      setKonzernErr("Bitte einen echten Konzernnamen angeben (keine E-Mail/Demo/Test).");
      return;
    }
    if (!branche) {
      setKonzernErr("Branche ist Pflicht.");
      return;
    }
    if (!segment) {
      setKonzernErr("Marktsegment ist Pflicht.");
      return;
    }
    if (!Number.isFinite(employees) || employees <= 0) {
      setKonzernErr("Mitarbeiterzahl ist Pflicht.");
      return;
    }
    if (!Number.isFinite(revenue) || revenue <= 0) {
      setKonzernErr("Umsatz (EUR) ist Pflicht.");
      return;
    }
    if (!hqAddress) {
      setKonzernErr("HQ-Location (Adresse) ist Pflicht.");
      return;
    }

    setBusyKonzern(true);
    setKonzernOk(null);
    setKonzernErr(null);
    setError(null);
    try {
      const resp = await fetch("/api/companies", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: n,
          branche,
          market_segment: segment,
          employee_count: employees,
          revenue_eur: revenue,
          hq_name: hqName,
          hq_address: hqAddress,
        }),
      });
      const p = (await resp.json()) as { error?: string; detail?: string };
      if (!resp.ok) {
        setKonzernErr(
          p.error ?? (p.detail ? `Speichern fehlgeschlagen: ${p.detail}` : "Speichern fehlgeschlagen."),
        );
        return;
      }
      setKName("");
      setKBranche("");
      setKSegment("");
      setKEmployees("");
      setKRevenue("");
      setKHqName("Headquarter");
      setKHqAddress("");
      setKonzernOk("Konzern wurde angelegt.");
      await reload();
      if (!enterpriseOk) {
        // UI-only Hinweis: Server lässt nur Pflichtdaten zu, aber Enterprise-Schwellen sind streng.
        setKonzernOk("Konzern wurde angelegt. Hinweis: Datensatz ist (noch) nicht „Verified Entity“.");
      }
    } finally {
      setBusyKonzern(false);
    }
  };

  const onStandort = async (e: FormEvent) => {
    e.preventDefault();
    const cid = sCompanyId.trim();
    const n = sName.trim();
    if (!cid || !n || busyStandort) return;
    setBusyStandort(true);
    setStandortOk(null);
    setStandortErr(null);
    setError(null);
    try {
      const resp = await fetch("/api/admin/locations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: cid,
          name: n,
          address: sAddress.trim() || undefined,
          manager_email: sManagerEmail.trim() || undefined,
          manager_name: sManagerName.trim() || undefined,
        }),
      });
      const p = (await resp.json()) as { error?: string; manager_checkout_url?: string | null };
      if (!resp.ok) {
        setStandortErr(p.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      setSName("");
      setSAddress("");
      setSManagerEmail("");
      setSManagerName("");
      setStandortOk("Standort wurde angelegt.");
      await reload();
      if (typeof p.manager_checkout_url === "string" && p.manager_checkout_url.trim()) {
        window.location.href = p.manager_checkout_url;
        return;
      }
    } finally {
      setBusyStandort(false);
    }
  };

  const deleteLocation = async (loc: Loc) => {
    if (
      !window.confirm(
        `Standort „${loc.name}“ wirklich unwiderruflich löschen?`,
      )
    ) {
      return;
    }
    setDeletingLocationId(loc.id);
    setStandortErr(null);
    setError(null);
    try {
      const resp = await fetch(
        `/api/admin/locations/${encodeURIComponent(loc.id)}`,
        { method: "DELETE", credentials: "include" },
      );
      const p = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        setStandortErr(p.error ?? "Löschen fehlgeschlagen.");
        return;
      }
      await reload();
    } finally {
      setDeletingLocationId(null);
    }
  };

  const deleteCompany = async (c: CompanyOption) => {
    if (
      !window.confirm(
        "Achtung: Dies löscht auch alle zugehörigen Standorte dieses Konzerns. Fortfahren?",
      )
    ) {
      return;
    }
    setDeletingCompanyId(c.id);
    setKonzernErr(null);
    setError(null);
    try {
      const resp = await fetch(
        `/api/companies/${encodeURIComponent(c.id)}`,
        { method: "DELETE", credentials: "include" },
      );
      const p = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        setKonzernErr(p.error ?? "Konzern konnte nicht gelöscht werden.");
        return;
      }
      await reload();
    } finally {
      setDeletingCompanyId(null);
    }
  };

  const trashBtnClass =
    "inline-flex shrink-0 items-center justify-center rounded-md border border-[#2a2a2a] p-1.5 text-[#6b6b6b] transition hover:border-red-500/40 hover:bg-red-950/30 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40";

  if (loading) {
    return (
      <p className="font-mono text-[10px] text-[#6b6b6b]">Lade Daten…</p>
    );
  }

  if (error && companies.length === 0 && groups.length === 0) {
    return (
      <p className="font-mono text-[10px] text-red-400/90">{error}</p>
    );
  }

  const inputClass =
    "mt-1 w-full rounded-md border border-[#262626] bg-[#080808] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none placeholder:text-[#4a4a4a] focus:border-[#c9a962]/40";
  const labelClass =
    "block font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#5a5a5a]";

  return (
    <div className="space-y-10">
      {error ? (
        <p className="rounded-md border border-[#2a2a2a] bg-[#111] px-3 py-2 font-mono text-[10px] text-[#b0b0b0]">
          {error}
        </p>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-2 xl:items-start">
        <section className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-5">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-[#1f1f1f] pb-3">
            <div className="flex items-center gap-2">
              <Building2
                className="size-4 text-[#c9a962]/80"
                strokeWidth={1.5}
                aria-hidden
              />
              <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#c4c4c4]">
                Alle Konzerne
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void reload()}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#2a2a2a] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#7a7a7a] hover:border-[#3a3a3a] hover:text-[#9a9a9a]"
            >
              <RefreshCw className="size-3" strokeWidth={1.5} />
              Aktualisieren
            </button>
          </div>
          {companies.length === 0 ? (
            <p className="font-mono text-[10px] text-[#6b6b6b]">
              Keine Enterprise-Konzerne vorhanden.
            </p>
          ) : (
            <ul className="max-h-[min(28rem,55vh)] space-y-3 overflow-y-auto pr-1">
              {companies.map((c) => (
                <li
                  key={c.id}
                  className="rounded-md border border-[#1a1a1a] bg-[#080808] p-3"
                >
                  <div className="flex items-start gap-3">
                    {c.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.logo_url}
                        alt=""
                        className="size-10 shrink-0 rounded border border-[#262626] bg-[#111] object-contain"
                      />
                    ) : (
                      <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border border-[#2a2a2a] bg-[#0b0b0b]">
                        <div className="absolute inset-0 opacity-70 [background:radial-gradient(60%_60%_at_50%_40%,rgba(201,169,98,0.28),transparent_70%)]" />
                        <span className="relative font-mono text-[10px] font-semibold tracking-[0.18em] text-[#d4c896]">
                          AX
                        </span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1 pr-1">
                      <p className="truncate font-mono text-[12px] font-medium text-[#e4e4e4]">
                        {c.name}
                      </p>
                      {c.branche ? (
                        <p className="mt-0.5 font-mono text-[10px] text-[#7a7a7a]">
                          {c.branche}
                        </p>
                      ) : null}
                      {c.manager_verknuepft ? (
                        <span className="mt-2 inline-block rounded border border-[#2a2a2a] bg-[#0f0f0f] px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[#9a9a9a]">
                          Verifiziert
                        </span>
                      ) : (
                        <span className="mt-2 inline-block rounded border border-[#333] bg-[#141414] px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[#8a8a8a]">
                          Nicht verifiziert
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className={trashBtnClass}
                      disabled={deletingCompanyId === c.id}
                      title="Konzern löschen"
                      aria-label={`Konzern ${c.name} löschen`}
                      onClick={() => void deleteCompany(c)}
                    >
                      <Trash2 className="size-4" strokeWidth={1.5} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-5">
          <div className="mb-4 flex items-center gap-2 border-b border-[#1f1f1f] pb-3">
            <Factory
              className="size-4 text-[#c9a962]/80"
              strokeWidth={1.5}
              aria-hidden
            />
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#c4c4c4]">
              Neuen Konzern anlegen
            </h2>
          </div>
          <form onSubmit={onKonzern} className="space-y-4">
            <div>
              <label className={labelClass} htmlFor="hq-konzern-name">
                Name
              </label>
              <input
                id="hq-konzern-name"
                value={kName}
                onChange={(e) => setKName(e.target.value)}
                className={inputClass}
                placeholder="z. B. ACME Industrie AG"
                required
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="hq-konzern-branche">
                  Branche (Pflicht)
                </label>
                <input
                  id="hq-konzern-branche"
                  value={kBranche}
                  onChange={(e) => setKBranche(e.target.value)}
                  className={inputClass}
                  placeholder="z. B. Automotive, Holz, Energie, Chemie"
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="hq-konzern-segment">
                  Marktsegment (Pflicht)
                </label>
                <select
                  id="hq-konzern-segment"
                  value={kSegment}
                  onChange={(e) => setKSegment(e.target.value)}
                  className={inputClass}
                  required
                >
                  <option value="">— auswählen —</option>
                  <option value="Enterprise">Enterprise</option>
                  <option value="Industry / Manufacturing">Industry / Manufacturing</option>
                  <option value="Energy">Energy</option>
                  <option value="Logistics">Logistics</option>
                  <option value="Other (Enterprise)">Other (Enterprise)</option>
                </select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="hq-konzern-employees">
                  Mitarbeiterzahl (Pflicht)
                </label>
                <input
                  id="hq-konzern-employees"
                  value={kEmployees}
                  onChange={(e) => setKEmployees(e.target.value)}
                  className={inputClass}
                  inputMode="numeric"
                  placeholder="z. B. 1200"
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="hq-konzern-revenue">
                  Umsatz (EUR/Jahr) (Pflicht)
                </label>
                <input
                  id="hq-konzern-revenue"
                  value={kRevenue}
                  onChange={(e) => setKRevenue(e.target.value)}
                  className={inputClass}
                  inputMode="numeric"
                  placeholder="z. B. 250000000"
                  required
                />
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="hq-konzern-hqaddr">
                HQ-Location (Adresse) (Pflicht)
              </label>
              <textarea
                id="hq-konzern-hqaddr"
                value={kHqAddress}
                onChange={(e) => setKHqAddress(e.target.value)}
                rows={3}
                className={inputClass}
                placeholder="Straße, PLZ Ort, Land"
                required
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#5a5a5a]">
                    Verified Entity Vorschau
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-[#6b6b6b]">
                    Enterprise-Standard: ≥ 250 Mitarbeiter, ≥ 50 Mio. EUR Umsatz, Segment gesetzt, echte Daten.
                  </p>
                </div>
                {(() => {
                  const n = kName.trim();
                  const invalidName =
                    !n ||
                    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n) ||
                    /(^|\b)(demo|test|testing|placeholder|sample|beispiel)(\b|$)/i.test(n);
                  const employees = Number(kEmployees.trim());
                  const revenue = Number(kRevenue.trim());
                  const ok =
                    !invalidName &&
                    kBranche.trim().length > 0 &&
                    kSegment.trim().length > 0 &&
                    Number.isFinite(employees) &&
                    employees >= 250 &&
                    Number.isFinite(revenue) &&
                    revenue >= 50_000_000 &&
                    kHqAddress.trim().length > 0;
                  return (
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[9px] uppercase tracking-[0.14em] ${
                        ok
                          ? "border-[#c9a962]/50 bg-[#c9a962]/10 text-[#d4c896]"
                          : "border-[#2a2a2a] bg-[#0f0f0f] text-[#8a8a8a]"
                      }`}
                    >
                      <ShieldCheck className="size-3.5" strokeWidth={1.5} aria-hidden />
                      {ok ? "Verified Entity" : "Nicht verifiziert"}
                    </span>
                  );
                })()}
              </div>
            </div>
            {konzernErr ? (
              <p className="font-mono text-[10px] text-red-400/90">
                {konzernErr}
              </p>
            ) : null}
            {konzernOk ? (
              <p className="font-mono text-[10px] text-emerald-400/90">
                {konzernOk}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={
                busyKonzern ||
                !kName.trim() ||
                !kBranche.trim() ||
                !kSegment.trim() ||
                !kEmployees.trim() ||
                !kRevenue.trim() ||
                !kHqAddress.trim()
              }
              className="w-full rounded-md border border-[#c9a962]/35 bg-[#c9a962]/10 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d4c896] transition hover:bg-[#c9a962]/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busyKonzern ? "Wird gespeichert…" : "Konzern speichern"}
            </button>
            <p className="font-mono text-[9px] leading-relaxed text-[#4a4a4a]">
              Fokus auf Geschäftsdaten: Segment, Umsatz und HQ-Location werden als Grundlage für Enterprise-Qualität genutzt.
            </p>
          </form>
        </section>
      </div>

      <div className="grid gap-8 xl:grid-cols-2 xl:items-start">
        <section className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-5">
          <div className="mb-4 flex items-center gap-2 border-b border-[#1f1f1f] pb-3">
            <MapPin
              className="size-4 text-[#c9a962]/80"
              strokeWidth={1.5}
              aria-hidden
            />
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#c4c4c4]">
              Standorte nach Konzern
            </h2>
          </div>
          {groups.length === 0 ? (
            <p className="font-mono text-[10px] text-[#6b6b6b]">
              Keine Standorte erfasst.
            </p>
          ) : (
            <div className="max-h-[min(32rem,60vh)] space-y-6 overflow-y-auto pr-1">
              {groups.map((g) => (
                <div
                  key={g.company_id}
                  className="rounded-md border border-[#1a1a1a] bg-[#080808] p-4"
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[#1a1a1a] pb-2">
                    {g.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={g.logo_url}
                        alt=""
                        className="size-8 rounded border border-[#262626] object-contain"
                      />
                    ) : (
                      <div className="relative flex size-8 items-center justify-center overflow-hidden rounded border border-[#2a2a2a] bg-[#0b0b0b]">
                        <div className="absolute inset-0 opacity-70 [background:radial-gradient(60%_60%_at_50%_40%,rgba(201,169,98,0.28),transparent_70%)]" />
                        <span className="relative font-mono text-[9px] font-semibold tracking-[0.18em] text-[#d4c896]">
                          AX
                        </span>
                      </div>
                    )}
                    <div>
                      <h3 className="font-mono text-[11px] font-medium text-[#d4d4d4]">
                        {g.company_name}
                      </h3>
                      {g.branche ? (
                        <p className="font-mono text-[9px] text-[#6b6b6b]">
                          {g.branche}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {g.locations.map((loc) => (
                      <li
                        key={loc.id}
                        className="flex items-start gap-2 rounded border border-[#141414] bg-[#050505] px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[11px] text-[#c8c8c8]">
                            {loc.name}
                          </p>
                          {loc.address ? (
                            <p className="mt-1 whitespace-pre-wrap font-mono text-[10px] text-[#6b6b6b]">
                              {loc.address}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className={trashBtnClass}
                          disabled={deletingLocationId === loc.id}
                          title="Standort löschen"
                          aria-label={`Standort ${loc.name} löschen`}
                          onClick={() => void deleteLocation(loc)}
                        >
                          <Trash2 className="size-4" strokeWidth={1.5} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-5">
          <div className="mb-4 flex items-center gap-2 border-b border-[#1f1f1f] pb-3">
            <MapPin
              className="size-4 text-[#c9a962]/80"
              strokeWidth={1.5}
              aria-hidden
            />
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#c4c4c4]">
              Neuen Standort anlegen
            </h2>
          </div>
          <form onSubmit={onStandort} className="space-y-4">
            <div>
              <label className={labelClass} htmlFor="hq-standort-konzern">
                Konzern
              </label>
              <select
                id="hq-standort-konzern"
                value={sCompanyId}
                onChange={(e) => setSCompanyId(e.target.value)}
                className={inputClass}
                required
              >
                {companies.length === 0 ? (
                  <option value="">— zuerst Konzern anlegen —</option>
                ) : (
                  companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="hq-standort-name">
                Standort-Name
              </label>
              <input
                id="hq-standort-name"
                value={sName}
                onChange={(e) => setSName(e.target.value)}
                className={inputClass}
                placeholder="z. B. Werk Nord"
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="hq-standort-addr">
                Adresse
              </label>
              <textarea
                id="hq-standort-addr"
                value={sAddress}
                onChange={(e) => setSAddress(e.target.value)}
                rows={3}
                className={inputClass}
                placeholder="Straße, PLZ Ort"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="hq-standort-manager-name">
                  Manager Name (neu)
                </label>
                <input
                  id="hq-standort-manager-name"
                  value={sManagerName}
                  onChange={(e) => setSManagerName(e.target.value)}
                  className={inputClass}
                  placeholder="z. B. Anna Leitner"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="hq-standort-manager-email">
                  Manager E-Mail (für Auto-Account)
                </label>
                <input
                  id="hq-standort-manager-email"
                  value={sManagerEmail}
                  onChange={(e) => setSManagerEmail(e.target.value)}
                  className={inputClass}
                  placeholder="manager@firma.de"
                  type="email"
                />
              </div>
            </div>
            {standortErr ? (
              <p className="font-mono text-[10px] text-red-400/90">
                {standortErr}
              </p>
            ) : null}
            {provisioningHint ? (
              <p className="font-mono text-[10px] text-amber-300/90">
                {provisioningHint}
              </p>
            ) : null}
            {standortOk ? (
              <p className="font-mono text-[10px] text-emerald-400/90">
                {standortOk}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={
                busyStandort ||
                !sCompanyId ||
                !sName.trim() ||
                companies.length === 0
              }
              className="w-full rounded-md border border-[#c9a962]/35 bg-[#c9a962]/10 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d4c896] transition hover:bg-[#c9a962]/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busyStandort ? "Wird gespeichert…" : "Standort speichern"}
            </button>
            <p className="font-mono text-[9px] leading-relaxed text-[#4a4a4a]">
              Auswahl per <code className="text-[#6a6a6a]">companies.id</code>;
              die API setzt{" "}
              <code className="text-[#6a6a6a]">locations.company_id</code> auf
              die zugehörige Mandanten-
              <code className="text-[#6a6a6a]">tenant_id</code>.
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}
