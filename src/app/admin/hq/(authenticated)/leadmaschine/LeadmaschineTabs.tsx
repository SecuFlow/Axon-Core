"use client";

import { useState } from "react";
import { LeadmaschineClient } from "./LeadmaschineClient";
import { ApolloDiscoverySection } from "./ApolloDiscoverySection";
import { SocialCenterSection } from "./SocialCenterSection";

type TabKey = "pipeline" | "apollo" | "social";

const TABS: Array<{ key: TabKey; label: string; hint: string }> = [
  { key: "pipeline", label: "Email-Pipeline", hint: "Tag 1 · 3 · 5" },
  { key: "apollo", label: "Apollo Discovery", hint: "Auto-Lead-Suche" },
  { key: "social", label: "KI Social Center", hint: "LinkedIn-Posts" },
];

export function LeadmaschineTabs() {
  const [tab, setTab] = useState<TabKey>("pipeline");

  return (
    <div className="space-y-6">
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
      </div>
    </div>
  );
}
