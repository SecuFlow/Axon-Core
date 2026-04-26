import { LeadmaschineTabs } from "./LeadmaschineTabs";

export default function LeadmaschinePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-mono text-xs font-medium uppercase tracking-[0.28em] text-[#8a8a8a]">
          Leadmaschine · Lead-Ökosystem
        </h1>
        <p className="mt-2 max-w-3xl font-mono text-[10px] leading-relaxed text-[#5a5a5a]">
          Matrix-Riss (Google-Dork-Generator) → LinkedIn-Prospects (Semi-Automation) →
          Email-Sequenz (Tag 1 / 3 / 5) → KI Social Center. DSGVO- und UWG-konform
          durch harten Tages-Cap von 5 neuen Erstkontakten.
        </p>
      </div>
      <LeadmaschineTabs />
    </div>
  );
}
