import { AxnCoinView } from "@/components/AxnCoinView";

export default function AdminAxonCoinPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-mono text-xs font-medium uppercase tracking-[0.28em] text-[#8a8a8a]">
          AxonCoin
        </h1>
        <p className="mt-2 max-w-xl font-mono text-[10px] leading-relaxed text-[#5a5a5a]">
          Strategische Übersicht über Kurs, Stabilitäts-Bot, Wallet und Heilwissen.
        </p>
      </div>

      <div className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-5">
        <AxnCoinView variant="dashboard" />
      </div>
    </div>
  );
}
