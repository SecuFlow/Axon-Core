"use client";

import { UserPlus } from "lucide-react";
import { TeamManagementClient } from "@/app/dashboard/_components/TeamManagementClient";
import { AddAdminModal } from "./AddAdminModal";
import { useState } from "react";

export default function AdminUsersPage() {
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const [teamKey, setTeamKey] = useState(0);

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Nutzer &amp; Team
          </h1>
          <p className="mt-2 max-w-xl text-sm text-slate-400">
            Einheitliche Rollenstruktur: <strong className="text-slate-200">Admin</strong>,{" "}
            <strong className="text-slate-200">Manager</strong>,{" "}
            <strong className="text-slate-200">Mitarbeiter</strong>. Jeder Nutzer hat genau
            eine Rolle.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddAdminOpen(true)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-primary/45 bg-primary/15 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/25"
        >
          <UserPlus className="size-4" strokeWidth={1.5} aria-hidden />
          Neuen Admin hinzufügen
        </button>
      </div>

      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">
          Team-Verwaltung
        </h2>
        <TeamManagementClient key={teamKey} variant="dashboard" />
      </section>

      <AddAdminModal
        open={addAdminOpen}
        onClose={() => setAddAdminOpen(false)}
        onCreated={() => setTeamKey((k) => k + 1)}
      />
    </div>
  );
}
