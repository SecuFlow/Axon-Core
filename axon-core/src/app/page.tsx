import {
  ArrowRight,
  BarChart3,
  Coins,
  Mic2,
  Sparkles,
} from "lucide-react";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#030304] text-zinc-100">
      {/* Ambient layers */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        aria-hidden
      >
        <div className="absolute -left-1/4 top-0 h-[42rem] w-[42rem] rounded-full bg-[#00D1FF]/[0.07] blur-[120px]" />
        <div className="absolute -right-1/4 top-1/3 h-[36rem] w-[36rem] rounded-full bg-[#00D1FF]/[0.05] blur-[100px]" />
        <div className="absolute bottom-0 left-1/2 h-[28rem] w-[80%] -translate-x-1/2 translate-y-1/2 rounded-full bg-[#00D1FF]/[0.04] blur-[90px]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
            backgroundSize: "64px 64px",
          }}
        />
      </div>

      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#030304]/75 backdrop-blur-xl backdrop-saturate-150">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 sm:h-[4.25rem] sm:px-8">
          <a
            href="#"
            className="font-[family-name:var(--font-syne)] text-lg font-semibold tracking-tight text-white sm:text-xl"
          >
            AXON{" "}
            <span className="bg-gradient-to-r from-[#00D1FF] to-[#4DE8FF] bg-clip-text text-transparent">
              CORE
            </span>
          </a>
          <div className="flex items-center gap-8 text-sm font-medium">
            <a
              href="#loesungen"
              className="text-zinc-400 transition-colors hover:text-white"
            >
              Lösungen
            </a>
            <a
              href="#login"
              className="rounded-full border border-white/[0.12] bg-white/[0.03] px-4 py-2 text-white shadow-[0_0_0_1px_rgba(0,209,255,0.08)] transition-all hover:border-[#00D1FF]/40 hover:bg-[#00D1FF]/[0.08] hover:text-[#00D1FF] hover:shadow-[0_0_24px_-4px_rgba(0,209,255,0.35)]"
            >
              Login
            </a>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative mx-auto max-w-6xl px-6 pb-24 pt-20 sm:px-8 sm:pb-32 sm:pt-28 lg:pt-36">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#00D1FF]/20 bg-[#00D1FF]/[0.06] px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-[#00D1FF]">
            <Sparkles className="size-3.5" aria-hidden />
            Enterprise Intelligence
          </div>
          <h1 className="font-[family-name:var(--font-syne)] max-w-4xl text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl sm:leading-[1.06] md:text-6xl md:leading-[1.05] lg:text-7xl">
            Das digitale Gedächtnis der{" "}
            <span className="relative inline-block">
              <span className="relative z-10 bg-gradient-to-r from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent">
                Industrie
              </span>
              <span
                className="absolute -inset-x-2 -bottom-1 -z-0 h-3 bg-gradient-to-r from-[#00D1FF]/30 via-[#00D1FF]/10 to-transparent blur-md sm:h-4"
                aria-hidden
              />
            </span>
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-zinc-400 sm:text-xl sm:leading-relaxed">
            Wir retten Fachwissen vor der Rente. KI-gestützte Dokumentation für
            globale Konzerne.
          </p>
          <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-center">
            <a
              href="#zugang"
              className="group inline-flex h-14 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#00D1FF] to-[#00b8e0] px-8 text-base font-semibold text-[#030304] shadow-[0_0_40px_-8px_rgba(0,209,255,0.55)] transition-transform hover:scale-[1.02] hover:shadow-[0_0_48px_-6px_rgba(0,209,255,0.65)] active:scale-[0.98]"
            >
              Systemzugang anfordern
              <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" />
            </a>
            <p className="text-sm text-zinc-500">
              SOC2-ready · On-Premise · 24/7 Support
            </p>
          </div>
        </section>

        {/* Das Weltsystem */}
        <section
          id="loesungen"
          className="relative mx-auto max-w-6xl px-6 py-20 sm:px-8 sm:py-28"
        >
          <div className="mb-14 max-w-2xl sm:mb-16">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#00D1FF]">
              Ökosystem
            </p>
            <h2 className="font-[family-name:var(--font-syne)] mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl">
              Das Weltsystem
            </h2>
            <p className="mt-4 text-base text-zinc-400 sm:text-lg">
              Drei Säulen. Eine Architektur. Vollständige operative Klarheit.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3 md:gap-8">
            <article className="group relative flex flex-col rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-transparent p-8 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition-all duration-300 hover:border-[#00D1FF]/25 hover:shadow-[0_0_48px_-12px_rgba(0,209,255,0.2)]">
              <div className="mb-6 flex size-12 items-center justify-center rounded-xl border border-[#00D1FF]/20 bg-[#00D1FF]/10 text-[#00D1FF] transition-colors group-hover:border-[#00D1FF]/40 group-hover:bg-[#00D1FF]/15">
                <Mic2 className="size-6" strokeWidth={1.5} aria-hidden />
              </div>
              <h3 className="font-[family-name:var(--font-syne)] text-xl font-semibold text-white">
                Mitarbeiter App
              </h3>
              <p className="mt-3 flex-1 text-[15px] leading-relaxed text-zinc-400">
                Recording &amp; KI-Rückfragen direkt an der Maschine.
              </p>
              <div className="mt-6 h-px w-full bg-gradient-to-r from-[#00D1FF]/40 via-white/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            </article>

            <article className="group relative flex flex-col rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-transparent p-8 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition-all duration-300 hover:border-[#00D1FF]/25 hover:shadow-[0_0_48px_-12px_rgba(0,209,255,0.2)]">
              <div className="mb-6 flex size-12 items-center justify-center rounded-xl border border-[#00D1FF]/20 bg-[#00D1FF]/10 text-[#00D1FF] transition-colors group-hover:border-[#00D1FF]/40 group-hover:bg-[#00D1FF]/15">
                <BarChart3 className="size-6" strokeWidth={1.5} aria-hidden />
              </div>
              <h3 className="font-[family-name:var(--font-syne)] text-xl font-semibold text-white">
                Manager Zentrale
              </h3>
              <p className="mt-3 flex-1 text-[15px] leading-relaxed text-zinc-400">
                Echtzeit-Analytik &amp; Wissens-Priorisierung.
              </p>
              <div className="mt-6 h-px w-full bg-gradient-to-r from-[#00D1FF]/40 via-white/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            </article>

            <article className="group relative flex flex-col rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-transparent p-8 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition-all duration-300 hover:border-[#00D1FF]/25 hover:shadow-[0_0_48px_-12px_rgba(0,209,255,0.2)]">
              <div className="mb-6 flex size-12 items-center justify-center rounded-xl border border-[#00D1FF]/20 bg-[#00D1FF]/10 text-[#00D1FF] transition-colors group-hover:border-[#00D1FF]/40 group-hover:bg-[#00D1FF]/15">
                <Coins className="size-6" strokeWidth={1.5} aria-hidden />
              </div>
              <h3 className="font-[family-name:var(--font-syne)] text-xl font-semibold text-white">
                Axon Coins
              </h3>
              <p className="mt-3 flex-1 text-[15px] leading-relaxed text-zinc-400">
                Incentivierung &amp; Blockchain-basierte Rewards.
              </p>
              <div className="mt-6 h-px w-full bg-gradient-to-r from-[#00D1FF]/40 via-white/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            </article>
          </div>
        </section>

        {/* CTA */}
        <section
          id="zugang"
          className="relative mx-auto max-w-6xl px-6 py-16 sm:px-8 sm:py-24"
        >
          <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.07] via-transparent to-[#00D1FF]/[0.06] px-8 py-14 text-center sm:px-16 sm:py-20">
            <div
              className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-[#00D1FF]/20 blur-3xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-24 -left-16 size-56 rounded-full bg-[#00D1FF]/10 blur-3xl"
              aria-hidden
            />
            <h2 className="font-[family-name:var(--font-syne)] relative text-2xl font-semibold tracking-tight text-white sm:text-3xl md:text-4xl">
              Bereit für das nächste Betriebssystem?
            </h2>
            <p className="relative mx-auto mt-4 max-w-lg text-zinc-400">
              White-Glove Onboarding für Führungsteams und digitale
              Transformation auf Konzernniveau.
            </p>
            <div className="relative mt-10">
              <a
                href="#"
                className="inline-flex h-14 items-center justify-center gap-2 rounded-full border border-[#00D1FF]/50 bg-[#00D1FF] px-10 text-base font-semibold text-[#030304] shadow-[0_0_40px_-6px_rgba(0,209,255,0.5)] transition-all hover:bg-[#33ddff] hover:shadow-[0_0_56px_-4px_rgba(0,209,255,0.55)]"
              >
                Systemzugang anfordern
                <ArrowRight className="size-5" />
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer
        id="login"
        className="border-t border-white/[0.06] bg-[#020203]/80 py-10 backdrop-blur-sm"
      >
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-center sm:flex-row sm:px-8 sm:text-left">
          <span className="font-[family-name:var(--font-syne)] text-sm font-medium text-zinc-500">
            Road to Panama 2026
          </span>
          <span className="text-xs text-zinc-600">
            © {new Date().getFullYear()} AXON CORE. Alle Rechte vorbehalten.
          </span>
        </div>
      </footer>
    </div>
  );
}
