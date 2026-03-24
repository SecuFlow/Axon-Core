import { Activity, Database, Shield, Users, Zap } from "lucide-react";

export default function Dashboard() {
  return (
    <div className="flex min-h-screen bg-[#020617] text-slate-200">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-slate-800 p-6 md:flex">
        <div className="mb-10 text-xl font-black tracking-tighter text-cyan-400">
          AXON CORE
        </div>
        <nav className="flex flex-1 flex-col space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3 text-cyan-400">
            <Activity size={20} /> Übersicht
          </div>
          <div className="flex cursor-pointer items-center gap-3 p-3 text-slate-400 transition hover:text-white">
            <Database size={20} /> Wissens-Tresor
          </div>
          <div className="flex cursor-pointer items-center gap-3 p-3 text-slate-400 transition hover:text-white">
            <Users size={20} /> Experten
          </div>
          <div className="flex cursor-pointer items-center gap-3 p-3 text-slate-400 transition hover:text-white">
            <Zap size={20} /> Axon Coins
          </div>
        </nav>
        <div className="font-mono text-xs italic text-slate-500">
          System-Status: Aktiv
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 md:p-12">
        <div className="mb-12 flex items-center justify-between">
          <h1 className="text-3xl font-bold">Manager Zentrale</h1>
          <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-4 py-2">
            <Shield size={16} className="text-cyan-400" />
            <span className="text-sm font-medium">Konzern-Admin</span>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
            <p className="mb-2 text-xs font-bold uppercase text-slate-500">
              Gesichertes Wissen
            </p>
            <p className="text-3xl font-black text-white">
              1.284{" "}
              <span className="text-sm font-normal text-cyan-500">Einheiten</span>
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
            <p className="mb-2 text-xs font-bold uppercase text-slate-500">
              Aktive Experten
            </p>
            <p className="text-3xl font-black text-white">
              156{" "}
              <span className="text-sm font-normal text-blue-500">Online</span>
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
            <p className="mb-2 text-xs font-bold uppercase text-slate-500">
              Coin-Umlauf
            </p>
            <p className="text-3xl font-black text-white">
              45.000{" "}
              <span className="text-sm font-normal text-yellow-500">AXON</span>
            </p>
          </div>
        </div>

        {/* Info Box */}
        <div className="rounded-3xl border border-dashed border-slate-800 bg-slate-900/50 p-8 text-center">
          <p className="italic text-slate-400">
            Warte auf Live-Daten von der Mitarbeiter-App...
          </p>
        </div>
      </main>
    </div>
  );
}
