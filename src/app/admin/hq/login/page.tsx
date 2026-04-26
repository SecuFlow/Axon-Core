"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminHqLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const resp = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, flow: "admin" }),
      });

      const payload: { error?: string; redirect?: string } = await resp.json();

      if (!resp.ok) {
        setError(payload.error ?? "Anmeldung fehlgeschlagen");
        return;
      }

      const target =
        typeof payload.redirect === "string" && payload.redirect.length > 0
          ? payload.redirect
          : "/admin/hq";

      if (target.startsWith("http://") || target.startsWith("https://")) {
        window.location.href = target;
        return;
      }

      router.push(target.startsWith("/") ? target : `/${target}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#030304] px-6 text-zinc-100">
      <section className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#D4AF37]">
          AXON HQ
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-white">
          Anmeldung
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          Exklusiver Zugang für autorisierte Administratoren. Konzern-Nutzer
          melden sich über das reguläre Login an.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-4"
          autoComplete="on"
        >
          <div>
            <label
              className="mb-2 block text-sm text-zinc-300"
              htmlFor="hq-email"
            >
              E-Mail
            </label>
            <input
              id="hq-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/[0.12] bg-[#0b0b0d] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-[#D4AF37]/60"
            />
          </div>

          <div>
            <label
              className="mb-2 block text-sm text-zinc-300"
              htmlFor="hq-password"
            >
              Passwort
            </label>
            <input
              id="hq-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/[0.12] bg-[#0b0b0d] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-[#D4AF37]/60"
            />
          </div>

          {error ? (
            <p className="text-sm text-red-300">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex h-11 w-full items-center justify-center rounded-full border border-[#D4AF37]/55 bg-[#D4AF37] px-6 text-sm font-semibold text-[#030304] transition hover:bg-[#e2c56c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Anmeldung läuft..." : "Einloggen"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Konzern-Login?{" "}
          <Link href="/login" className="text-[#D4AF37] hover:underline">
            Zur Standard-Anmeldung
          </Link>
        </p>

        <Link
          href="/"
          className="mt-4 inline-block w-full text-center text-sm text-zinc-400 transition-colors hover:text-white"
        >
          Zurück zur Startseite
        </Link>
      </section>
    </main>
  );
}
