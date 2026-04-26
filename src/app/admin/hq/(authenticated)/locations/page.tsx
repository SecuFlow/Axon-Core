import { AdminLocationsClient } from "./AdminLocationsClient";

export default function AdminLocationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-mono text-xs font-medium uppercase tracking-[0.28em] text-[#8a8a8a]">
          Konzern Standorte
        </h1>
        <p className="mt-2 max-w-2xl font-mono text-[10px] leading-relaxed text-[#5a5a5a]">
          Konzerne anlegen und Standorte sauber zuordnen. Fokus: echte Entitäten,
          klare Standort-Struktur und ein konsistentes Enterprise-Setup für Manager
          im Konzern-Dashboard.
        </p>
      </div>
      <AdminLocationsClient />
    </div>
  );
}
