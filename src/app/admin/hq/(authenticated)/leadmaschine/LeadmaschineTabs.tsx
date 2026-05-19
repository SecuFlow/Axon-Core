"use client";

import { useEffect, useState } from "react";
import { LeadmaschineClient } from "./LeadmaschineClient";
import { ApolloDiscoverySection } from "./ApolloDiscoverySection";
import { SocialCenterSection } from "./SocialCenterSection";
import { LeadDemosSection } from "./LeadDemosSection";
import { VisualsStudioSection } from "./VisualsStudioSection";

type TabKey = "pipeline" | "apollo" | "social" | "visuals" | "demos";

type GmailHealthStatus =
  | "ok"
  | "missing_env"
  | "invalid_grant"
  | "unknown_oauth_error";

type GmailHealth = {
  status: GmailHealthStatus;
  oauth_ok: boolean;
  oauth_error: string | null;
  recent_invalid_grant_24h: number;
  recent_auto_send_errors_24h: number;
  last_successful_auto_send_at: string | null;
  hint: string;
  docs_url: string;
};

const TABS: Array<{ key: TabKey; label: string; hint: string }> = [
  { key: "pipeline", label: "Email-Pipeline", hint: "Tag 1 · 3 · 5" },
  { key: "apollo", label: "Apollo Discovery", hint: "Auto-Lead-Suche" },
  { key: "social", label: "KI Social Center", hint: "LinkedIn-Posts" },
  { key: "visuals", label: "Visuals Studio", hint: "Screenshot-Posts" },
  { key: "demos", label: "Demo-Links", hint: "Pro Lead · sofort verfügbar" },
];

function GmailHealthBanner() {
  const [health, setHealth] = useState<GmailHealth | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/leadmaschine/gmail/health", {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as GmailHealth;
        if (!cancelled) setHealth(data);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Health-Check fehlgeschlagen.");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <div className="rounded-md border border-[#3a2a2a] bg-[#1a0a0a] p-3">
        <p className="font-mono text-[10px] text-[#d49696]">
          Gmail-Health-Check nicht erreichbar: {loadError}
        </p>
      </div>
    );
  }

  if (!health || health.status === "ok") return null;

  const isCritical = !health.oauth_ok;
  return (
    <div
      className={
        isCritical
          ? "rounded-md border border-[#a64545]/55 bg-[#3a1010]/40 p-3"
          : "rounded-md border border-[#c9a962]/40 bg-[#c9a962]/[0.05] p-3"
      }
    >
      <p
        className={
          isCritical
            ? "font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ff8a8a]"
            : "font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#e4d3a0]"
        }
      >
        {health.status === "invalid_grant"
          ? "Gmail-OAuth abgelaufen · Auto-Send blockiert"
          : health.status === "missing_env"
            ? "Gmail-OAuth · ENV fehlt"
            : health.status === "unknown_oauth_error"
              ? "Gmail-OAuth · unbekannter Fehler"
              : "Gmail-OAuth · Hinweis"}
      </p>
      <p
        className={
          isCritical
            ? "mt-2 font-mono text-[10px] leading-relaxed text-[#d4a8a8]"
            : "mt-2 font-mono text-[10px] leading-relaxed text-[#bcb087]"
        }
      >
        {health.hint}
      </p>
      {health.recent_invalid_grant_24h > 0 ? (
        <p className="mt-1 font-mono text-[10px] leading-relaxed text-[#a86464]">
          Letzte 24h: {health.recent_invalid_grant_24h} Sends mit invalid_grant
          {health.recent_auto_send_errors_24h > health.recent_invalid_grant_24h
            ? ` (${health.recent_auto_send_errors_24h} Auto-Send-Fehler insgesamt)`
            : ""}
          {health.last_successful_auto_send_at
            ? ` · letzter erfolgreicher Auto-Send: ${new Date(
                health.last_successful_auto_send_at,
              ).toLocaleString("de-DE")}`
            : " · seit dem letzten Reset kein erfolgreicher Auto-Send"}
          .
        </p>
      ) : null}
      {health.oauth_error ? (
        <p className="mt-1 font-mono text-[9px] leading-relaxed text-[#7a4a4a]">
          Roh-Fehler: {health.oauth_error}
        </p>
      ) : null}
      <p className="mt-2 font-mono text-[10px] text-[#a89878]">
        Anleitung: <span className="underline">{health.docs_url}</span>
      </p>
    </div>
  );
}

export function LeadmaschineTabs() {
  const [tab, setTab] = useState<TabKey>("pipeline");

  return (
    <div className="space-y-6">
      <GmailHealthBanner />

      {/* UWG-Banner */}
      <div className="rounded-md border border-[#c9a962]/30 bg-[#c9a962]/[0.05] p-3">
        <p className="font-mono text-[10px] leading-relaxed text-[#d4c896]">
          <span className="font-semibold uppercase tracking-[0.14em]">UWG §7 · Eigene Risikoabwägung</span>
          {" · "}
          <span className="text-[#bcb087]">
            Tages-Cap: bis zu 30 neue Erstkontakte/Tag (konfigurierbar). Schutzschichten aktiv:
            Generic-Mailbox-Block, Manager-Pflicht, Pro-Lead-Sperre. Ablauf: Tag 1 Erstkontakt → Tag 3 Follow-Up → Tag 5 Demo.
          </span>
        </p>
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-[#1a1a1a] pb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-md border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
              tab === t.key
                ? "border-[#c9a962]/55 bg-[#c9a962]/[0.10] text-[#e4d3a0]"
                : "border-[#2a2a2a] bg-[#0a0a0a] text-[#8a8a8a] hover:border-[#3a3a3a] hover:text-[#d4d4d4]"
            }`}
          >
            <span className="block">{t.label}</span>
            <span className="mt-0.5 block font-mono text-[8px] normal-case tracking-[0.08em] text-[#6a6a6a]">
              {t.hint}
            </span>
          </button>
        ))}
      </nav>

      <div>
        {tab === "pipeline" ? <LeadmaschineClient /> : null}
        {tab === "apollo" ? <ApolloDiscoverySection /> : null}
        {tab === "social" ? <SocialCenterSection /> : null}
        {tab === "visuals" ? <VisualsStudioSection /> : null}
        {tab === "demos" ? <LeadDemosSection /> : null}
      </div>
    </div>
  );
}
