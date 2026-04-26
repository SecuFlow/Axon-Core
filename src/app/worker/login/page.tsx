"use client";

import Link from "next/link";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBranding } from "@/components/branding/useBranding";
import { DEFAULT_BRAND_PRIMARY } from "@/lib/brandTheme";

function WorkerLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const demoFromUrl = (searchParams.get("demo") ?? "").trim();

  const branding = useBranding();
  const primaryColor = useMemo(() => {
    const p = branding.primary_color?.trim();
    return p || DEFAULT_BRAND_PRIMARY;
  }, [branding.primary_color]);

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
        body: JSON.stringify({ email, password, flow: "konzern" }),
      });

      const payload: { error?: string; redirect?: string } = await resp.json();

      if (!resp.ok) {
        setError(payload.error ?? "Login fehlgeschlagen");
        return;
      }

      let next =
        typeof payload.redirect === "string" && payload.redirect.trim()
          ? payload.redirect.trim()
          : "/worker/dashboard";
      if (demoFromUrl.length > 0 && next.startsWith("/worker")) {
        const u = new URL(next, window.location.origin);
        u.searchParams.set("demo", demoFromUrl);
        next = `${u.pathname}${u.search}`;
      }
      router.push(next);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#030304] px-6 text-zinc-100">
      <section className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
        <p
          className="text-xs font-medium uppercase tracking-[0.2em]"
          style={{ color: primaryColor }}
        >
          AxonCore Worker
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-white">
          Mitarbeiter-Anmeldung
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          Login f&uuml;r den Worker-Bereich. Nach erfolgreicher Anmeldung wirst du
          direkt zum Worker-Dashboard weitergeleitet.
        </p>
        {demoFromUrl ? (
          <p className="mt-3 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-zinc-400">
            Demo-Link aktiv — Branding wird aus der Gast-Demo geladen, ohne
            eingeloggtes Profil.
          </p>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-4"
          autoComplete="on"
        >
          <div>
            <label className="mb-2 block text-sm text-zinc-300" htmlFor="email">
              E-Mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-white/[0.12] bg-[#0b0b0d] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-[color:var(--brand-primary,#00d1ff)]/60"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-300" htmlFor="password">
              Passwort
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-white/[0.12] bg-[#0b0b0d] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-[color:var(--brand-primary,#00d1ff)]/60"
            />
          </div>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex h-11 w-full items-center justify-center rounded-full border px-6 text-sm font-semibold transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              backgroundColor: primaryColor,
              borderColor: primaryColor,
              color: "#030304",
            }}
          >
            {isLoading ? "Anmeldung l&auml;uft..." : "Einloggen"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Mitarbeiter-Konten werden durch den Manager im Konzern-Dashboard erstellt.
        </p>

        <Link
          href="/"
          className="mt-4 inline-block w-full text-center text-sm text-zinc-400 transition-colors hover:text-white"
        >
          Zur&uuml;ck zur Startseite
        </Link>
      </section>
    </main>
  );
}

export default function WorkerLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#030304] text-sm text-zinc-500">
          Laden …
        </main>
      }
    >
      <WorkerLoginInner />
    </Suspense>
  );
}
