"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Play, RefreshCw, Save, Sparkles } from "lucide-react";

type Settings = {
  apollo_enabled: boolean;
  apollo_leads_per_day_enterprise: number;
  apollo_leads_per_day_smb: number;
  apollo_person_titles_enterprise: string[];
  apollo_person_titles_smb: string[];
  apollo_person_locations: string[];
  apollo_person_seniorities: string[];
  apollo_org_employee_min: number;
  apollo_org_employee_max: number;
  apollo_org_employee_min_smb: number;
  apollo_org_employee_max_smb: number;
  apollo_industries: string[];
  apollo_industries_smb: string[];
  apollo_reveal_personal_emails: boolean;
  leads_per_day_hard_cap: number;
  // Phase 2: Echtheits-Check + LLM-ICP-Qualifikation
  apollo_qualification_enabled: boolean;
  apollo_qualification_threshold: number;
  apollo_min_revenue_eur_enterprise: number;
  apollo_min_revenue_eur_smb: number;
  apollo_blacklist_industries: string[];
  apollo_require_domain_mx: boolean;
  apollo_require_email_verified: boolean;
};

type QualificationSummaryEntry = {
  apollo_person_id?: string;
  company?: string;
  manager?: string;
  industry?: string;
  score?: number;
  qualified?: boolean;
  reason?: string;
  authenticity_reason?: string;
  llm_error?: string;
};

type DiscoveryRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  trigger: string;
  segment: string;
  target_count: number;
  searched_count: number;
  enriched_count: number;
  inserted_count: number;
  skipped_duplicate_count: number;
  skipped_no_email_count: number;
  skipped_generic_mailbox_count: number;
  skipped_authenticity_count?: number;
  skipped_unqualified_count?: number;
  apollo_credits_used: number;
  qualification_summary?: QualificationSummaryEntry[];
  error_message: string | null;
};

const SENIORITY_OPTIONS = [
  "owner",
  "founder",
  "c_suite",
  "partner",
  "vp",
  "head",
  "director",
  "manager",
  "senior",
  "entry",
  "intern",
];

function parseList(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function joinList(values: string[]): string {
  return values.join(", ");
}

export function ApolloDiscoverySection() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [runs, setRuns] = useState<DiscoveryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingFlags, setSavingFlags] = useState(false);
  const [savingFilters, setSavingFilters] = useState(false);
  const [running, setRunning] = useState<"" | "enterprise" | "smb" | "both">("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [titlesEnt, setTitlesEnt] = useState("");
  const [titlesSmb, setTitlesSmb] = useState("");
  const [locations, setLocations] = useState("");
  const [industriesEnt, setIndustriesEnt] = useState("");
  const [industriesSmb, setIndustriesSmb] = useState("");
  const [blacklistRaw, setBlacklistRaw] = useState("");
  const [savingIcp, setSavingIcp] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, r] = await Promise.all([
        fetch("/api/admin/leadmaschine/settings", { credentials: "include" }),
        fetch("/api/admin/leadmaschine/apollo/runs?limit=15", { credentials: "include" }),
      ]);
      const sJson = (await s.json()) as Settings | { error?: string };
      if (!s.ok || "error" in sJson) {
        setError("Settings konnten nicht geladen werden.");
        return;
      }
      setSettings(sJson as Settings);
      setTitlesEnt(joinList((sJson as Settings).apollo_person_titles_enterprise));
      setTitlesSmb(joinList((sJson as Settings).apollo_person_titles_smb));
      setLocations(joinList((sJson as Settings).apollo_person_locations));
      setIndustriesEnt(joinList((sJson as Settings).apollo_industries));
      setIndustriesSmb(joinList((sJson as Settings).apollo_industries_smb));
      setBlacklistRaw(joinList((sJson as Settings).apollo_blacklist_industries ?? []));

      if (r.ok) {
        const rJson = (await r.json()) as { runs?: DiscoveryRun[] };
        setRuns(Array.isArray(rJson.runs) ? rJson.runs : []);
      }
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const totalDailyTarget = useMemo(() => {
    if (!settings) return 0;
    return settings.apollo_leads_per_day_enterprise + settings.apollo_leads_per_day_smb;
  }, [settings]);

  const overCap = useMemo(() => {
    if (!settings) return false;
    return totalDailyTarget > settings.leads_per_day_hard_cap;
  }, [settings, totalDailyTarget]);

  const patch = async (
    body: Partial<Settings> & {
      apollo_industries?: string[];
      apollo_industries_smb?: string[];
      apollo_person_titles_enterprise?: string[];
      apollo_person_titles_smb?: string[];
      apollo_person_locations?: string[];
      apollo_person_seniorities?: string[];
      apollo_blacklist_industries?: string[];
      // Outreach-Caps gleichzeitig mitschreiben (Cap-Sync mit Apollo-Targets)
      leads_per_day_enterprise?: number;
      leads_per_day_smb?: number;
    },
  ) => {
    setError(null);
    setStatus(null);
    const resp = await fetch("/api/admin/leadmaschine/settings", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const p = (await resp.json()) as { ok?: boolean; error?: string; warning?: string };
    if (!resp.ok) {
      setError(p.error ?? "Speichern fehlgeschlagen.");
      return false;
    }
    if (p.warning) {
      setStatus(`Gespeichert (Warnung): ${p.warning}`);
    } else {
      setStatus("Apollo-Settings gespeichert.");
    }
    return true;
  };

  const toggleEnabled = async () => {
    if (!settings) return;
    setSavingFlags(true);
    const ok = await patch({ apollo_enabled: !settings.apollo_enabled });
    if (ok) {
      setSettings({ ...settings, apollo_enabled: !settings.apollo_enabled });
    }
    setSavingFlags(false);
  };

  const toggleRevealPersonal = async () => {
    if (!settings) return;
    setSavingFlags(true);
    const ok = await patch({
      apollo_reveal_personal_emails: !settings.apollo_reveal_personal_emails,
    });
    if (ok) {
      setSettings({
        ...settings,
        apollo_reveal_personal_emails: !settings.apollo_reveal_personal_emails,
      });
    }
    setSavingFlags(false);
  };

  const saveDailyTargets = async () => {
    if (!settings) return;
    setSavingFlags(true);
    await patch({
      apollo_leads_per_day_enterprise: settings.apollo_leads_per_day_enterprise,
      apollo_leads_per_day_smb: settings.apollo_leads_per_day_smb,
      // gleichzeitig auch das Outreach-Tages-Cap angleichen, sonst "produzieren wir
      // mehr Leads als der Outreach-Cron versendet"
      leads_per_day_enterprise: settings.apollo_leads_per_day_enterprise,
      leads_per_day_smb: settings.apollo_leads_per_day_smb,
    });
    setSavingFlags(false);
  };

  const saveFilters = async () => {
    if (!settings) return;
    setSavingFilters(true);
    const titlesEntArr = parseList(titlesEnt);
    const titlesSmbArr = parseList(titlesSmb);
    const locArr = parseList(locations);
    const indEntArr = parseList(industriesEnt);
    const indSmbArr = parseList(industriesSmb);
    const ok = await patch({
      apollo_person_titles_enterprise: titlesEntArr,
      apollo_person_titles_smb: titlesSmbArr,
      apollo_person_locations: locArr,
      apollo_person_seniorities: settings.apollo_person_seniorities,
      apollo_org_employee_min: settings.apollo_org_employee_min,
      apollo_org_employee_max: settings.apollo_org_employee_max,
      apollo_org_employee_min_smb: settings.apollo_org_employee_min_smb,
      apollo_org_employee_max_smb: settings.apollo_org_employee_max_smb,
      apollo_industries: indEntArr,
      apollo_industries_smb: indSmbArr,
    });
    if (ok) {
      setSettings({
        ...settings,
        apollo_person_titles_enterprise: titlesEntArr,
        apollo_person_titles_smb: titlesSmbArr,
        apollo_person_locations: locArr,
        apollo_industries: indEntArr,
        apollo_industries_smb: indSmbArr,
      });
    }
    setSavingFilters(false);
  };

  const saveIcp = async () => {
    if (!settings) return;
    setSavingIcp(true);
    const blacklistArr = parseList(blacklistRaw);
    const ok = await patch({
      apollo_qualification_enabled: settings.apollo_qualification_enabled,
      apollo_qualification_threshold: settings.apollo_qualification_threshold,
      apollo_min_revenue_eur_enterprise: settings.apollo_min_revenue_eur_enterprise,
      apollo_min_revenue_eur_smb: settings.apollo_min_revenue_eur_smb,
      apollo_blacklist_industries: blacklistArr,
      apollo_require_domain_mx: settings.apollo_require_domain_mx,
      apollo_require_email_verified: settings.apollo_require_email_verified,
    });
    if (ok) {
      setSettings({ ...settings, apollo_blacklist_industries: blacklistArr });
    }
    setSavingIcp(false);
  };

  const runNow = async (segment: "enterprise" | "smb" | "both") => {
    setError(null);
    setStatus(null);
    setRunning(segment);
    try {
      const resp = await fetch("/api/admin/leadmaschine/apollo/run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment }),
      });
      const p = (await resp.json()) as {
        ok?: boolean;
        error?: string;
        summary?: { leads_inserted?: number; credits_used?: number };
      };
      if (!resp.ok) {
        setError(p.error ?? "Apollo-Run fehlgeschlagen.");
        return;
      }
      setStatus(
        `Run abgeschlossen: ${p.summary?.leads_inserted ?? 0} neue Leads, ${p.summary?.credits_used ?? 0} Credits verbraucht.`,
      );
      await loadAll();
    } finally {
      setRunning("");
    }
  };

  const toggleSeniority = (s: string) => {
    if (!settings) return;
    const has = settings.apollo_person_seniorities.includes(s);
    const next = has
      ? settings.apollo_person_seniorities.filter((x) => x !== s)
      : [...settings.apollo_person_seniorities, s];
    setSettings({ ...settings, apollo_person_seniorities: next });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-mono text-[14px] font-semibold uppercase tracking-[0.16em] text-[#e4e4e4]">
            Apollo Discovery
          </h2>
          <p className="mt-1 max-w-3xl font-mono text-[10px] leading-relaxed text-[#6a6a6a]">
            Tägliche automatische Lead-Discovery via Apollo.io API. Findet Werkleiter
            (Enterprise) und GF/Inhaber (SMB) im DACH-Raum, enricht Email per
            Bulk-Match und legt sie als <code>stage=new</code> in der Pipeline an.
            Ablauf: Cron läuft Mo-Fr 06:30 → Outreach-Cron 07:00 verschickt mail_1.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadAll()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a8a8a] transition hover:border-[#3a3a3a] hover:text-[#d4d4d4] disabled:opacity-50"
        >
          <RefreshCw className="size-3.5" />
          Neu laden
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-[#b8401a]/40 bg-[#b8401a]/[0.08] p-3 font-mono text-[10px] text-[#e9b999]">
          {error}
        </div>
      ) : null}
      {status ? (
        <div className="rounded-md border border-[#c9a962]/35 bg-[#c9a962]/[0.06] p-3 font-mono text-[10px] text-[#d4c896]">
          {status}
        </div>
      ) : null}

      {settings ? (
        <>
          {/* UWG-Hinweis */}
          <div className="rounded-md border border-[#c9a962]/30 bg-[#c9a962]/[0.05] p-3">
            <p className="font-mono text-[10px] leading-relaxed text-[#d4c896]">
              <AlertTriangle className="mb-0.5 mr-1 inline size-3.5 text-[#e4d3a0]" />
              <span className="font-semibold uppercase tracking-[0.14em]">UWG §7 — eigene Risikoabwägung</span>
              <span className="ml-1 text-[#bcb087]">
                Tages-Cap auf {settings.leads_per_day_hard_cap} freigegeben (zuvor 5/Tag-Lock). Schutzschichten
                (Generic-Mailbox-Block, Manager-Pflicht, auto_send_blocked) bleiben aktiv.
              </span>
            </p>
          </div>

          {/* Master-Switch + Reveal-Toggles */}
          <section className="grid gap-3 md:grid-cols-2">
            <div
              className={`rounded-md border p-4 ${
                settings.apollo_enabled
                  ? "border-[#c9a962]/45 bg-[#c9a962]/[0.06]"
                  : "border-[#1f1f1f] bg-[#080808]"
              }`}
            >
              <p className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#d4c896]">
                Apollo Master-Switch
              </p>
              <p className="mt-1 font-mono text-[8px] leading-relaxed text-[#6a6a6a]">
                {settings.apollo_enabled
                  ? "AKTIV: Cron 06:30 läuft täglich, sucht & enricht Leads."
                  : "AUS: Discovery-Cron ist No-Op. Settings können trotzdem konfiguriert werden."}
              </p>
              <button
                type="button"
                onClick={() => void toggleEnabled()}
                disabled={savingFlags}
                className={`mt-3 inline-flex items-center rounded-full border px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] transition disabled:opacity-50 ${
                  settings.apollo_enabled
                    ? "border-[#c9a962]/45 bg-[#c9a962]/10 text-[#d4c896] hover:bg-[#c9a962]/15"
                    : "border-[#2a2a2a] bg-[#0a0a0a] text-[#8a8a8a] hover:border-[#3a3a3a]"
                }`}
              >
                {settings.apollo_enabled ? "Apollo AN" : "Apollo AUS"}
              </button>
            </div>

            <div className="rounded-md border border-[#1f1f1f] bg-[#080808] p-4">
              <p className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#5a5a5a]">
                Personal Emails (Privat-Email)
              </p>
              <p className="mt-1 font-mono text-[8px] leading-relaxed text-[#6a6a6a]">
                {settings.apollo_reveal_personal_emails
                  ? "AN: Apollo enthüllt zusätzlich Privat-Adressen (gmail/web.de). Mehr Credit-Verbrauch, GDPR sensibler."
                  : "AUS: Nur Business-Emails. Empfohlen für UWG/DSGVO."}
              </p>
              <button
                type="button"
                onClick={() => void toggleRevealPersonal()}
                disabled={savingFlags}
                className={`mt-3 inline-flex items-center rounded-full border px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] transition disabled:opacity-50 ${
                  settings.apollo_reveal_personal_emails
                    ? "border-red-500/45 bg-red-500/10 text-red-200 hover:bg-red-500/15"
                    : "border-[#2a2a2a] bg-[#0a0a0a] text-[#8a8a8a] hover:border-[#3a3a3a]"
                }`}
              >
                {settings.apollo_reveal_personal_emails ? "Privat-Emails AN" : "Privat-Emails AUS"}
              </button>
            </div>
          </section>

          {/* Tages-Splits */}
          <section className="rounded-md border border-[#1f1f1f] bg-[#080808] p-4">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#d4c896]">
              Tages-Splits (max {settings.leads_per_day_hard_cap}/Tag total)
            </p>
            <p className="mt-1 font-mono text-[8px] leading-relaxed text-[#6a6a6a]">
              Wieviele neue Leads pro Tag und Segment Apollo erzeugen darf. Die Outreach-Caps
              (<code>leads_per_day_*</code>) werden beim Speichern automatisch angeglichen.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div>
                <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8a8a8a]">
                  Enterprise / Tag
                </label>
                <input
                  type="number"
                  min={0}
                  max={settings.leads_per_day_hard_cap}
                  value={settings.apollo_leads_per_day_enterprise}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      apollo_leads_per_day_enterprise: Math.max(
                        0,
                        Math.min(settings.leads_per_day_hard_cap, Number(e.target.value || 0)),
                      ),
                    })
                  }
                  className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[12px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                />
              </div>
              <div>
                <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8a8a8a]">
                  SMB / Tag
                </label>
                <input
                  type="number"
                  min={0}
                  max={settings.leads_per_day_hard_cap}
                  value={settings.apollo_leads_per_day_smb}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      apollo_leads_per_day_smb: Math.max(
                        0,
                        Math.min(settings.leads_per_day_hard_cap, Number(e.target.value || 0)),
                      ),
                    })
                  }
                  className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[12px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => void saveDailyTargets()}
                  disabled={savingFlags}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#c9a962]/45 bg-[#c9a962]/[0.08] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d4c896] transition hover:bg-[#c9a962]/[0.14] disabled:opacity-50"
                >
                  <Save className="size-3.5" />
                  Speichern
                </button>
              </div>
            </div>
            {overCap ? (
              <p className="mt-2 font-mono text-[9px] text-red-300">
                Achtung: Summe {totalDailyTarget} überschreitet Hard-Cap{" "}
                {settings.leads_per_day_hard_cap}. Die Werte werden serverseitig auf den Cap
                geclampt.
              </p>
            ) : (
              <p className="mt-2 font-mono text-[9px] text-[#8a8a8a]">
                Aktuell {totalDailyTarget}/{settings.leads_per_day_hard_cap} Tagessumme.
              </p>
            )}
          </section>

          {/* Sofort-Run */}
          <section className="rounded-md border border-[#1f1f1f] bg-[#080808] p-4">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#d4c896]">
              Sofort-Run (manuell)
            </p>
            <p className="mt-1 font-mono text-[8px] leading-relaxed text-[#6a6a6a]">
              Für Tests / Aufholen verpasster Tage. Tages-Idempotenz wird umgangen, das
              Tages-Cap (target_count) bleibt aktiv.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void runNow("both")}
                disabled={running !== "" || !settings.apollo_enabled}
                className="inline-flex items-center gap-2 rounded-md border border-[#c9a962]/45 bg-[#c9a962]/[0.08] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d4c896] transition hover:bg-[#c9a962]/[0.14] disabled:opacity-50"
              >
                <Play className="size-3.5" />
                {running === "both" ? "Läuft…" : "Beide Segmente"}
              </button>
              <button
                type="button"
                onClick={() => void runNow("enterprise")}
                disabled={running !== "" || !settings.apollo_enabled}
                className="inline-flex items-center gap-2 rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a8a8a] transition hover:border-[#3a3a3a] hover:text-[#d4d4d4] disabled:opacity-50"
              >
                <Play className="size-3.5" />
                {running === "enterprise" ? "Läuft…" : "Nur Enterprise"}
              </button>
              <button
                type="button"
                onClick={() => void runNow("smb")}
                disabled={running !== "" || !settings.apollo_enabled}
                className="inline-flex items-center gap-2 rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a8a8a] transition hover:border-[#3a3a3a] hover:text-[#d4d4d4] disabled:opacity-50"
              >
                <Play className="size-3.5" />
                {running === "smb" ? "Läuft…" : "Nur SMB"}
              </button>
            </div>
          </section>

          {/* ICP-Qualifikation: Echtheit + LLM */}
          <section className="rounded-md border border-[#1f1f1f] bg-[#080808] p-4">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#d4c896]">
              ICP-Qualifikation (vor Insert)
            </p>
            <p className="mt-1 max-w-3xl font-mono text-[8px] leading-relaxed text-[#6a6a6a]">
              Zwei zusätzliche Filter NACH Apollo-Search aber VOR Lead-Insert:
              <br />
              1) Echtheits-Check: Email-Status verifiziert, Firmen-Domain hat MX-Record,
              Datenvollständigkeit (Branche/Manager/Firma).
              <br />
              2) LLM-ICP-Filter (GPT-4.1-mini): bewertet Branche/Größe/„Mindset" auf Score 1-10. Nur
              wenn ≥ Threshold wird der Lead angelegt. Ziel: lieber 10 perfekte als 500 wertlose.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-[#1a1a1a] bg-[#050505] p-3">
                <p className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-[#8a8a8a]">
                  Echtheits-Check
                </p>
                <label className="mt-2 flex cursor-pointer items-center gap-2 font-mono text-[10px] text-[#c4c4c4]">
                  <input
                    type="checkbox"
                    checked={settings.apollo_require_email_verified}
                    onChange={(e) =>
                      setSettings({ ...settings, apollo_require_email_verified: e.target.checked })
                    }
                    className="size-3.5 accent-[#c9a962]"
                  />
                  Email-Status muss „verified" sein
                </label>
                <label className="mt-2 flex cursor-pointer items-center gap-2 font-mono text-[10px] text-[#c4c4c4]">
                  <input
                    type="checkbox"
                    checked={settings.apollo_require_domain_mx}
                    onChange={(e) =>
                      setSettings({ ...settings, apollo_require_domain_mx: e.target.checked })
                    }
                    className="size-3.5 accent-[#c9a962]"
                  />
                  Firmen-Domain muss MX-Record haben (DNS-Check)
                </label>
              </div>

              <div className="rounded-md border border-[#1a1a1a] bg-[#050505] p-3">
                <p className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-[#8a8a8a]">
                  KI-Vorauswahl (GPT-4.1-mini)
                </p>
                <label className="mt-2 flex cursor-pointer items-center gap-2 font-mono text-[10px] text-[#c4c4c4]">
                  <input
                    type="checkbox"
                    checked={settings.apollo_qualification_enabled}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        apollo_qualification_enabled: e.target.checked,
                      })
                    }
                    className="size-3.5 accent-[#c9a962]"
                  />
                  LLM-ICP-Bewertung aktiv
                </label>
                <div className="mt-3">
                  <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8a8a8a]">
                    Mindest-Score (1-10) · Default 7
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={settings.apollo_qualification_threshold}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        apollo_qualification_threshold: Math.max(
                          1,
                          Math.min(10, Number(e.target.value || 7)),
                        ),
                      })
                    }
                    className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[12px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                  />
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8a8a8a]">
                  Mindest-Umsatz Enterprise (EUR)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1_000_000}
                  value={settings.apollo_min_revenue_eur_enterprise}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      apollo_min_revenue_eur_enterprise: Math.max(0, Number(e.target.value || 0)),
                    })
                  }
                  className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[12px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                />
                <p className="mt-1 font-mono text-[8px] text-[#6a6a6a]">
                  ≈ {(settings.apollo_min_revenue_eur_enterprise / 1_000_000).toFixed(0)} Mio EUR
                </p>
              </div>
              <div>
                <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8a8a8a]">
                  Mindest-Umsatz SMB (EUR)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1_000_000}
                  value={settings.apollo_min_revenue_eur_smb}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      apollo_min_revenue_eur_smb: Math.max(0, Number(e.target.value || 0)),
                    })
                  }
                  className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[12px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                />
                <p className="mt-1 font-mono text-[8px] text-[#6a6a6a]">
                  ≈ {(settings.apollo_min_revenue_eur_smb / 1_000_000).toFixed(0)} Mio EUR
                </p>
              </div>
            </div>

            <div className="mt-3">
              <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8a8a8a]">
                Branchen-Blacklist (Hard-Block, Komma-separiert)
              </label>
              <textarea
                rows={3}
                value={blacklistRaw}
                onChange={(e) => setBlacklistRaw(e.target.value)}
                className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
              />
              <p className="mt-1 font-mono text-[8px] text-[#6a6a6a]">
                Diese Branchen werden NIE qualifiziert (z.B. Marketing, Recruiting, Software,
                Consulting). Wirkt zusätzlich als Hint für das LLM.
              </p>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => void saveIcp()}
                disabled={savingIcp}
                className="inline-flex items-center gap-2 rounded-md border border-[#c9a962]/45 bg-[#c9a962]/[0.08] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d4c896] transition hover:bg-[#c9a962]/[0.14] disabled:opacity-50"
              >
                <Save className="size-3.5" />
                ICP-Settings speichern
              </button>
            </div>
          </section>

          {/* Filter */}
          <section className="rounded-md border border-[#1f1f1f] bg-[#080808] p-4">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#d4c896]">
              Such-Filter (Apollo People Search)
            </p>
            <p className="mt-1 font-mono text-[8px] leading-relaxed text-[#6a6a6a]">
              Komma-separiert. Apollo matcht „ähnliche Titel". Schreibweise wie auf LinkedIn
              (z.B. „Plant Manager", „Werkleiter").
            </p>

            <div className="mt-3 grid gap-4">
              <div>
                <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8a8a8a]">
                  Titel ENT (Enterprise)
                </label>
                <textarea
                  rows={2}
                  value={titlesEnt}
                  onChange={(e) => setTitlesEnt(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                />
              </div>
              <div>
                <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8a8a8a]">
                  Titel SMB
                </label>
                <textarea
                  rows={2}
                  value={titlesSmb}
                  onChange={(e) => setTitlesSmb(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                />
              </div>
              <div>
                <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8a8a8a]">
                  Personal Locations (Land/Stadt)
                </label>
                <input
                  value={locations}
                  onChange={(e) => setLocations(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                />
              </div>
              <div>
                <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8a8a8a]">
                  Seniority-Level
                </label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SENIORITY_OPTIONS.map((s) => {
                    const active = settings.apollo_person_seniorities.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSeniority(s)}
                        className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] transition ${
                          active
                            ? "border-[#c9a962]/55 bg-[#c9a962]/[0.10] text-[#d4c896]"
                            : "border-[#2a2a2a] bg-[#0a0a0a] text-[#6a6a6a] hover:border-[#3a3a3a] hover:text-[#9a9a9a]"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8a8a8a]">
                    ENT: Mitarbeiter min/max
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="number"
                      min={1}
                      value={settings.apollo_org_employee_min}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          apollo_org_employee_min: Math.max(1, Number(e.target.value || 1)),
                        })
                      }
                      className="w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                    />
                    <input
                      type="number"
                      min={1}
                      value={settings.apollo_org_employee_max}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          apollo_org_employee_max: Math.max(1, Number(e.target.value || 1)),
                        })
                      }
                      className="w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                    />
                  </div>
                </div>
                <div>
                  <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8a8a8a]">
                    SMB: Mitarbeiter min/max
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="number"
                      min={1}
                      value={settings.apollo_org_employee_min_smb}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          apollo_org_employee_min_smb: Math.max(1, Number(e.target.value || 1)),
                        })
                      }
                      className="w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                    />
                    <input
                      type="number"
                      min={1}
                      value={settings.apollo_org_employee_max_smb}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          apollo_org_employee_max_smb: Math.max(1, Number(e.target.value || 1)),
                        })
                      }
                      className="w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                    />
                  </div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8a8a8a]">
                    Industries ENT (optional)
                  </label>
                  <input
                    placeholder="Manufacturing, Industrial Automation, …"
                    value={industriesEnt}
                    onChange={(e) => setIndustriesEnt(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                  />
                </div>
                <div>
                  <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8a8a8a]">
                    Industries SMB (optional)
                  </label>
                  <input
                    placeholder="Construction, Retail, …"
                    value={industriesSmb}
                    onChange={(e) => setIndustriesSmb(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void saveFilters()}
                  disabled={savingFilters}
                  className="inline-flex items-center gap-2 rounded-md border border-[#c9a962]/45 bg-[#c9a962]/[0.08] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d4c896] transition hover:bg-[#c9a962]/[0.14] disabled:opacity-50"
                >
                  <Sparkles className="size-3.5" />
                  Filter speichern
                </button>
              </div>
            </div>
          </section>

          {/* Run-Historie */}
          <section className="rounded-md border border-[#1f1f1f] bg-[#080808] p-4">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#d4c896]">
              <Activity className="mb-0.5 mr-1 inline size-3.5 text-[#c9a962]" />
              Discovery-Historie ({runs.length})
            </p>
            {runs.length === 0 ? (
              <p className="mt-3 font-mono text-[9px] text-[#6a6a6a]">Noch keine Läufe.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full font-mono text-[9px]">
                  <thead className="text-[#6a6a6a]">
                    <tr className="text-left">
                      <th className="pb-2 pr-3">Zeit</th>
                      <th className="pb-2 pr-3">Trig</th>
                      <th className="pb-2 pr-3">Seg</th>
                      <th className="pb-2 pr-3">Ziel</th>
                      <th className="pb-2 pr-3">Search</th>
                      <th className="pb-2 pr-3">Enrich</th>
                      <th className="pb-2 pr-3 text-[#d4c896]">Insert</th>
                      <th className="pb-2 pr-3" title="Echtheits-Check rausgefiltert">¬Auth</th>
                      <th className="pb-2 pr-3" title="LLM unter Threshold">¬ICP</th>
                      <th className="pb-2 pr-3">Dup</th>
                      <th className="pb-2 pr-3">Cred</th>
                      <th className="pb-2 pr-3">Fehler</th>
                    </tr>
                  </thead>
                  <tbody className="text-[#9a9a9a]">
                    {runs.map((r) => (
                      <tr key={r.id} className="border-t border-[#1a1a1a]">
                        <td className="py-1 pr-3 text-[#7a7a7a]">
                          {new Date(r.started_at).toLocaleString("de-DE", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-1 pr-3">{r.trigger}</td>
                        <td className="py-1 pr-3">{r.segment}</td>
                        <td className="py-1 pr-3">{r.target_count}</td>
                        <td className="py-1 pr-3">{r.searched_count}</td>
                        <td className="py-1 pr-3">{r.enriched_count}</td>
                        <td className="py-1 pr-3 text-[#d4c896]">{r.inserted_count}</td>
                        <td className="py-1 pr-3 text-[#a0816a]">
                          {r.skipped_authenticity_count ?? 0}
                        </td>
                        <td className="py-1 pr-3 text-[#a0816a]">
                          {r.skipped_unqualified_count ?? 0}
                        </td>
                        <td className="py-1 pr-3">{r.skipped_duplicate_count}</td>
                        <td className="py-1 pr-3">{r.apollo_credits_used}</td>
                        <td className="py-1 pr-3 text-red-300">
                          {r.error_message ? r.error_message.slice(0, 40) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <p className="font-mono text-[10px] text-[#6a6a6a]">Lade Apollo-Settings…</p>
      )}
    </div>
  );
}
