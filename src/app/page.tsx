import Link from "next/link";
import { BarChart3, Coins, Mic2, Sparkles } from "lucide-react";
import { headers } from "next/headers";
import { PublicHeader } from "@/components/PublicHeader";

type Campaign = {
  enabled: boolean;
  banner_image_url: string | null;
};

type PublicTeamMember = {
  id: string;
  name: string;
  role: string;
  email?: string | null;
  phone?: string | null;
  photo_url?: string | null;
  sort_order: number;
};

async function loadCampaign(): Promise<Campaign> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = host ? `${proto}://${host}` : "";
  try {
    const resp = await fetch(`${base}/api/public/campaign`, { cache: "no-store" });
    const p = (await resp.json()) as Partial<Campaign>;
    if (!resp.ok) return { enabled: false, banner_image_url: null };
    return {
      enabled: p.enabled === true,
      banner_image_url: typeof p.banner_image_url === "string" ? p.banner_image_url : null,
    };
  } catch {
    return { enabled: false, banner_image_url: null };
  }
}

async function loadTeam(): Promise<PublicTeamMember[]> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = host ? `${proto}://${host}` : "";
  try {
    const resp = await fetch(`${base}/api/public/team`, { cache: "no-store" });
    const p = (await resp.json()) as { items?: PublicTeamMember[] };
    if (!resp.ok) return [];
    return Array.isArray(p.items) ? p.items : [];
  } catch {
    return [];
  }
}

export default async function Home() {
  const campaign = await loadCampaign();
  const team = await loadTeam();
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-br from-black via-[#05111f] to-[#63b7ff] text-zinc-100">
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

      {campaign.enabled && campaign.banner_image_url ? (
        <div className="relative z-[60] w-full border-b border-[#D4AF37]/20 bg-[#030304]/90">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={campaign.banner_image_url}
            alt=""
            className="mx-auto block max-h-36 w-full object-cover object-center sm:max-h-44"
          />
        </div>
      ) : null}

      <PublicHeader variant="home" />

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
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/demo-anfordern"
              className="inline-flex h-14 items-center justify-center rounded-full border border-[#D4AF37]/55 bg-[#D4AF37] px-10 text-base font-semibold text-[#030304] shadow-[0_0_44px_-8px_rgba(212,175,55,0.55)] transition-all hover:bg-[#e2c56c] hover:shadow-[0_0_62px_-6px_rgba(212,175,55,0.6)]"
            >
              Demo anfordern
            </Link>
            <Link
              href="#loesungen"
              className="inline-flex h-14 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.02] px-10 text-base font-semibold text-white transition hover:bg-white/[0.04]"
            >
              Lösungen ansehen
            </Link>
          </div>
          <p className="mt-8 max-w-2xl text-left text-lg leading-relaxed text-zinc-400 sm:text-xl sm:leading-relaxed">
            Wir retten Fachwissen vor der Rente. KI-gestützte Dokumentation für
            globale Konzerne.
          </p>
          <p className="mt-8 w-full text-left text-sm text-zinc-500">
            SOC2-ready · On-Premise · 24/7 Support
          </p>

        </section>

        {/* AxonCore Konzern */}
        <section
          id="loesungen"
          className="relative mx-auto max-w-6xl px-6 py-20 sm:px-8 sm:py-28"
        >
          <div className="mb-14 sm:mb-16">
            <h2 className="font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl">
              AxonCore Konzern
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3 md:gap-8">
            <article className="group relative rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-transparent shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition-all duration-300 hover:border-[#00D1FF]/25 hover:shadow-[0_0_48px_-12px_rgba(0,209,255,0.2)]">
              <Link
                href="https://www.axon-core.de/worker/login"
                className="flex h-full flex-col p-8"
                aria-label="Zur Worker-Anmeldung"
              >
                <div className="mb-6 inline-flex size-12 items-center justify-center rounded-xl border border-[#00D1FF]/20 bg-[#00D1FF]/10 text-[#00D1FF] transition-colors group-hover:border-[#00D1FF]/40 group-hover:bg-[#00D1FF]/15">
                  <Mic2 className="size-6" strokeWidth={1.5} aria-hidden />
                </div>
                <h3 className="font-[family-name:var(--font-syne)] text-xl font-semibold text-white">
                  Konzern App
                </h3>
                <p className="mt-3 flex-1 text-[15px] leading-relaxed text-zinc-400">
                  Recording &amp; KI-Rückfragen direkt an der Maschine.
                </p>
                <div className="mt-6 h-px w-full bg-gradient-to-r from-[#00D1FF]/40 via-white/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </article>

            <article className="group relative rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-transparent shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition-all duration-300 hover:border-[#00D1FF]/25 hover:shadow-[0_0_48px_-12px_rgba(0,209,255,0.2)]">
              <Link
                href="/login"
                className="flex h-full flex-col p-8"
                aria-label="Zum Konzern-Dashboard Login"
              >
                <div className="mb-6 flex size-12 items-center justify-center rounded-xl border border-[#00D1FF]/20 bg-[#00D1FF]/10 text-[#00D1FF] transition-colors group-hover:border-[#00D1FF]/40 group-hover:bg-[#00D1FF]/15">
                  <BarChart3 className="size-6" strokeWidth={1.5} aria-hidden />
                </div>
                <h3 className="font-[family-name:var(--font-syne)] text-xl font-semibold text-white">
                  Konzern Dashboard
                </h3>
                <p className="mt-3 flex-1 text-[15px] leading-relaxed text-zinc-400">
                  Echtzeit-Analytik &amp; Wissens-Priorisierung.
                </p>
                <div className="mt-6 h-px w-full bg-gradient-to-r from-[#00D1FF]/40 via-white/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </article>

            <article className="group relative rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-transparent shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition-all duration-300 hover:border-[#00D1FF]/25 hover:shadow-[0_0_48px_-12px_rgba(0,209,255,0.2)]">
              <Link
                href="/register?role=private"
                className="flex h-full flex-col p-8"
                aria-label="Registrierung als Privatperson für Axon Coins"
              >
                <div className="mb-6 flex size-12 items-center justify-center rounded-xl border border-[#00D1FF]/20 bg-[#00D1FF]/10 text-[#00D1FF] transition-colors group-hover:border-[#00D1FF]/40 group-hover:bg-[#00D1FF]/15">
                  <Coins className="size-6" strokeWidth={1.5} aria-hidden />
                </div>
                <h3 className="font-[family-name:var(--font-syne)] text-xl font-semibold text-white">
                  Axon Coins
                </h3>
                <p className="mt-3 flex-1 text-[15px] leading-relaxed text-zinc-400">
                  Incentivierung &amp; Blockchain-basierte Rewards — für Privatnutzer.
                </p>
                <div className="mt-6 h-px w-full bg-gradient-to-r from-[#00D1FF]/40 via-white/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </article>
          </div>
        </section>

        {/* AxonCore Kleinunternehmer */}
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
              AxonCore Kleinunternehmer
            </h2>
            <div className="relative mt-10">
              <Link
                href="/login"
                className="inline-flex h-14 items-center justify-center rounded-full border border-[#00D1FF]/50 bg-[#00D1FF] px-10 text-base font-semibold text-[#030304] shadow-[0_0_40px_-6px_rgba(0,209,255,0.5)] transition-all hover:bg-[#33ddff] hover:shadow-[0_0_56px_-4px_rgba(0,209,255,0.55)]"
              >
                Kleinunternehmer Dashboard
              </Link>
            </div>
          </div>
        </section>

        {team.length > 0 ? (
          <section
            id="team"
            className="relative mx-auto max-w-6xl px-6 pb-24 sm:px-8 sm:pb-32"
            aria-labelledby="team-heading"
          >
            <div className="mb-10">
              <h2
                id="team-heading"
                className="font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-white sm:text-4xl"
              >
                Team
              </h2>
              <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-zinc-400 sm:text-lg">
                Direkter Draht — ohne Umwege. Persönlich, schnell, enterprise-ready.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3 md:gap-8">
              {team.map((m) => (
                <article
                  key={m.id}
                  className="relative rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-transparent p-8 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
                >
                  <div className="flex items-center gap-4">
                    {m.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.photo_url}
                        alt=""
                        className="h-14 w-14 rounded-full border border-[#D4AF37]/20 object-cover"
                      />
                    ) : (
                      <div className="grid h-14 w-14 place-items-center rounded-full border border-[#D4AF37]/20 bg-[#0b0b0c]">
                        <span className="font-[family-name:var(--font-syne)] text-sm font-semibold text-[#D4AF37]/80">
                          AX
                        </span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-white">
                        {m.name}
                      </p>
                      <p className="mt-1 truncate text-sm text-zinc-400">{m.role}</p>
                    </div>
                  </div>

                  {(m.email || m.phone) ? (
                    <div className="mt-6 flex flex-wrap gap-3">
                      {m.email ? (
                        <a
                          href={`mailto:${m.email}`}
                          className="inline-flex items-center justify-center rounded-full border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-4 py-2 text-xs font-semibold text-[#e9d9a2] transition hover:bg-[#D4AF37]/15"
                        >
                          Mail
                        </a>
                      ) : null}
                      {m.phone ? (
                        <a
                          href={`tel:${m.phone}`}
                          className="inline-flex items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.02] px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/[0.04]"
                        >
                          Call
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] bg-[#020203]/80 py-10 backdrop-blur-sm">
        <div className="flex w-full justify-center px-6 sm:px-8">
          <p className="text-center text-xs text-zinc-600">
            © {new Date().getFullYear()} AXON CORE. Alle Rechte vorbehalten.
          </p>
        </div>
      </footer>
    </div>
  );
}
