import { Suspense } from "react";
import { SecurityLogClient } from "./SecurityLogClient";

function SecurityInner() {
  return (
    <main>
      <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.18em] text-[#d4d4d4]">
        Sicherheit
      </h1>
      <p className="mt-2 max-w-2xl font-mono text-[10px] uppercase tracking-[0.16em] text-[#6b6b6b]">
        Zugriffsmismatches (Mandanten-Trennung) aus audit_logs.
      </p>
      <SecurityLogClient />
    </main>
  );
}

export default function SecurityPage() {
  return (
    <Suspense
      fallback={
        <p className="font-mono text-[10px] text-[#6b6b6b]">Lade…</p>
      }
    >
      <SecurityInner />
    </Suspense>
  );
}

