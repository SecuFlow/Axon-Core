import { SystemStripePricingClient } from "./SystemStripePricingClient";
import { SystemCampaignClient } from "./SystemCampaignClient";
import { SystemTeamClient } from "./SystemTeamClient";
import { SystemMediaClient } from "./SystemMediaClient";

export default function AdminSystemPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-mono text-xs font-medium uppercase tracking-[0.28em] text-[#8a8a8a]">
          System-Einspeisung
        </h1>
        <p className="mt-2 max-w-xl font-mono text-[10px] leading-relaxed text-[#5a5a5a]">
          Content- und Preis-Management mit Live-Schreibzugriff für Website und Pakete.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SystemStripePricingClient />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SystemCampaignClient />
        <SystemMediaClient />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SystemTeamClient />
      </div>
    </div>
  );
}
