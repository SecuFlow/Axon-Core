import { AxnCoinView } from "@/components/AxnCoinView";

/**
 * Exklusives Privat-Dashboard: nur AXN-Coin-Logik, keine Konzern-Navigation.
 */
export default function CoinSpacePage() {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] sm:p-8">
      <AxnCoinView variant="dashboard" />
    </section>
  );
}
