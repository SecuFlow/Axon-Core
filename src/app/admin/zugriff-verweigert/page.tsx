import Link from "next/link";

export default function AdminZugriffVerweigertPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-[#a8a8a8]">
      <section className="w-full max-w-md rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-8">
        <h1 className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-[#c9a962]">
          Admin HQ
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[#c4c4c4]">
          Zugriff verweigert. Autorisierung erforderlich.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/admin/hq/login"
            className="inline-flex h-11 items-center justify-center rounded-full border border-[#c9a962]/35 bg-[#c9a962]/10 px-6 text-sm font-medium text-[#d4c896] transition hover:bg-[#c9a962]/15"
          >
            Zum Login
          </Link>
          <Link
            href="/"
            className="text-center text-sm text-[#6b6b6b] transition hover:text-[#9a9a9a]"
          >
            Zur Startseite
          </Link>
        </div>
      </section>
    </main>
  );
}
