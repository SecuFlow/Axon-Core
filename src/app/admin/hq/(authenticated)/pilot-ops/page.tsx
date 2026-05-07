import { PilotOpsMonitorClient } from "./PilotOpsMonitorClient";

export default function PilotOpsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-mono text-xs font-medium uppercase tracking-[0.28em] text-[#8a8a8a]">
          Pilot-Ops Monitor
        </h1>
        <p className="mt-2 max-w-2xl font-mono text-[10px] leading-relaxed text-[#5a5a5a]">
          Live-Ansicht derselben Prüfungen wie der Vercel-Cron{" "}
          <code className="text-[#7a907a]">/api/cron/ops-monitor</code> (Gmail-OAuth,
          Leadmaschine-Settings, Auto-Send-Fehler 24h). Diese Seite löst keine Alarm-Mails
          und keine Webhooks aus.
        </p>
      </div>

      <div className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-5">
        <PilotOpsMonitorClient />
      </div>
    </div>
  );
}
