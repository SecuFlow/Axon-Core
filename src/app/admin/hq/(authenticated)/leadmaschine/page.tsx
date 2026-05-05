import { LeadmaschineTabs } from "./LeadmaschineTabs";

export default function LeadmaschinePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-mono text-xs font-medium uppercase tracking-[0.28em] text-[#8a8a8a]">
          Leadmaschine · Apollo-getrieben
        </h1>
        <p className="mt-2 max-w-3xl font-mono text-[10px] leading-relaxed text-[#5a5a5a]">
          Apollo Discovery (täglich Mo-Fr 06:30) → Email-Sequenz (Tag 1 / 3 / 5)
          → KI Social Center. Tages-Cap konfigurierbar bis 30 neue Erstkontakte
          (UWG §7-Risiko bewusst akzeptiert; Schutzschichten aktiv).
        </p>
      </div>
      <LeadmaschineTabs />
    </div>
  );
}
