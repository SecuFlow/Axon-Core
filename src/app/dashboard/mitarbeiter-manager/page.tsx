import { TeamManagementClient } from "../_components/TeamManagementClient";

export default function MitarbeiterManagerPage() {
  return (
    <section className="w-full">
      <header className="mb-6">
        <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.18em] text-[#d4d4d4]">
          Mitarbeiter & Manager
        </h1>
        <p className="mt-2 text-sm text-[#8a8a8a]">
          Zentrale Team-Verwaltung fuer das ausgewaehlte Mandat.
        </p>
      </header>
      <TeamManagementClient variant="dashboard" />
    </section>
  );
}
