import { AxnCoinView } from "@/components/AxnCoinView";

export default function AxnCoinPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-white">AXN-Coin</h1>
      <p className="mt-2 text-sm text-slate-400">
        Kurs, Stabilitäts-Bot und Heilwissen (Konzern: Upload immer aktiv).
      </p>
      <div className="mt-8">
        <AxnCoinView variant="dashboard" />
      </div>
    </div>
  );
}
