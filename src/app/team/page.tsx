import Link from "next/link";
import { headers } from "next/headers";
import { PublicHeader } from "@/components/PublicHeader";

type PublicTeamMember = {
  id: string;
  name: string;
  role: string;
  email?: string | null;
  phone?: string | null;
  photo_url?: string | null;
  sort_order: number;
};

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

export default async function TeamPage() {
  const team = await loadTeam();
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-br from-black via-[#05111f] to-[#63b7ff] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
        <div className="absolute -left-1/4 top-0 h-[42rem] w-[42rem] rounded-full bg-[#00D1FF]/[0.07] blur-[120px]" />
        <div className="absolute -right-1/4 top-1/3 h-[36rem] w-[36rem] rounded-full bg-[#00D1FF]/[0.05] blur-[100px]" />
      </div>

      <PublicHeader variant="simple" />

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-10 sm:px-8 sm:pb-32">
        <nav className="mb-10 font-mono text-[11px] text-zinc-500">
          <Link href="/" className="text-[#D4AF37]/80 transition hover:text-[#D4AF37]">
            ← Startseite
          </Link>
        </nav>

        <div className="mb-10">
          <h1 className="font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl">
            Team
          </h1>
          <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-zinc-400 sm:text-lg">
            Direkter Draht — nur freigegebene Ansprechpartner.
          </p>
        </div>

        {team.length === 0 ? (
          <p className="font-mono text-sm text-zinc-500">
            Aktuell sind keine Teammitglieder öffentlich freigegeben.
          </p>
        ) : (
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
                    <p className="truncate text-base font-semibold text-white">{m.name}</p>
                    <p className="mt-1 truncate text-sm text-zinc-400">{m.role}</p>
                  </div>
                </div>

                {m.email || m.phone ? (
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
        )}
      </main>

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
