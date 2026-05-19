import Link from "next/link";
import { Sparkles } from "lucide-react";

type Props = {
  searchParams: Promise<{ product?: string }>;
};

function titleFor(product: string): string {
  const p = product.trim().toLowerCase();
  if (p === "axoncoin" || p === "axon-coin") return "AxonCoin";
  if (p === "axoncoins" || p === "axon-coins" || p === "coins") return "AxonCoins";
  if (p === "kleinunternehmer" || p === "smb" || p === "small_business") {
    return "AxonCore Kleinunternehmer";
  }
  return "Coming Soon";
}

function subtitleFor(product: string): string {
  const p = product.trim().toLowerCase();
  if (p === "axoncoin" || p === "axon-coin") {
    return "Die Admin-Ansicht für Kurs, Wallet & Übersicht ist in Arbeit – bald wieder hier erreichbar.";
  }
  if (p === "axoncoins" || p === "axon-coins" || p === "coins") {
    return "Rewards & Incentives – wir bauen gerade an der nächsten Stufe.";
  }
  if (p === "kleinunternehmer" || p === "smb" || p === "small_business") {
    return "Der SMB‑Bereich ist in Arbeit – bald verfügbar.";
  }
  return "Diese Funktion ist aktuell in Arbeit – bald verfügbar.";
}

export default async function ComingSoonPage({ searchParams }: Props) {
  const q = await searchParams;
  const product = typeof q.product === "string" ? q.product : "";
  const title = titleFor(product);
  const subtitle = subtitleFor(product);
  const showAdminDashboardBack =
    product.trim().toLowerCase() === "axoncoin" ||
    product.trim().toLowerCase() === "axon-coin";

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-black via-[#05111f] to-[#63b7ff] px-6 py-16 text-zinc-100 sm:px-8 sm:py-24">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute -left-1/4 top-0 h-[42rem] w-[42rem] rounded-full bg-[#00D1FF]/[0.07] blur-[120px]" />
        <div className="absolute -right-1/4 top-1/3 h-[36rem] w-[36rem] rounded-full bg-[#00D1FF]/[0.05] blur-[100px]" />
        <div className="absolute bottom-0 left-1/2 h-[28rem] w-[80%] -translate-x-1/2 translate-y-1/2 rounded-full bg-[#00D1FF]/[0.04] blur-[90px]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
      </div>

      <section className="mx-auto max-w-3xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#00D1FF]/20 bg-[#00D1FF]/[0.06] px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-[#00D1FF]">
          <Sparkles className="size-3.5" aria-hidden />
          Coming Soon
        </div>

        <h1 className="mt-7 font-[family-name:var(--font-syne)] text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-zinc-400 sm:text-xl">
          {subtitle}
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {showAdminDashboardBack ? (
            <Link
              href="/admin/hq/leadmaschine"
              className="inline-flex h-12 items-center justify-center rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/[0.08] px-8 text-sm font-semibold text-[#e8dcb8] transition hover:border-[#D4AF37]/55 hover:bg-[#D4AF37]/[0.12]"
            >
              Zurück zum Admin-Dashboard
            </Link>
          ) : null}
          <Link
            href="/demo-anfordern"
            className="inline-flex h-12 items-center justify-center rounded-full border border-[#D4AF37]/55 bg-[#D4AF37] px-8 text-sm font-semibold text-[#030304] shadow-[0_0_44px_-10px_rgba(212,175,55,0.55)] transition-all hover:bg-[#e2c56c] hover:shadow-[0_0_62px_-10px_rgba(212,175,55,0.6)]"
          >
            Demo anfordern
          </Link>
          <Link
            href="/#loesungen"
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.02] px-8 text-sm font-semibold text-white transition hover:bg-white/[0.04]"
          >
            Zu den Lösungen
          </Link>
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.01] px-8 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.03]"
          >
            Zur Startseite
          </Link>
        </div>

        <div className="mt-10 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-transparent p-6 text-sm text-zinc-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
          <p className="font-semibold text-white">Du willst früher Zugriff?</p>
          <p className="mt-2 text-zinc-400">
            Schreib uns kurz über die Demo-Anfrage, dann priorisieren wir dein Use-Case
            im nächsten Release.
          </p>
        </div>
      </section>
    </main>
  );
}

