"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type RegRole = "privat" | "konzern" | "kleinunternehmer" | "mitarbeiter";

function parseInitialRole(raw: string | null): RegRole {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "privat" || v === "private") return "privat";
  if (v === "kleinunternehmer" || v === "smb" || v === "small_business") {
    return "kleinunternehmer";
  }
  if (v === "mitarbeiter" || v === "worker" || v === "employee") {
    return "mitarbeiter";
  }
  if (v === "konzern" || v === "enterprise") return "konzern";
  return "konzern";
}

export function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = useMemo(
    () => parseInitialRole(searchParams.get("role")),
    [searchParams],
  );

  const [username, setUsername] = useState("");
  const [role, setRole] = useState<RegRole>(initialRole);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRole(parseInitialRole(searchParams.get("role")));
  }, [searchParams]);

  const isMitarbeiter = role === "mitarbeiter";
  const submitLabel =
    role === "privat"
      ? "Konto anlegen & zum Coin Space"
      : "Konto anlegen & zum Checkout";

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isMitarbeiter) return;
    setError(null);
    setIsLoading(true);
    try {
      const resp = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          role,
          email,
          password,
        }),
      });
      const payload: { error?: string; redirect?: string } = await resp.json();
      if (!resp.ok) {
        setError(payload.error ?? "Registrierung fehlgeschlagen");
        return;
      }
      const target =
        typeof payload.redirect === "string" && payload.redirect.length > 0
          ? payload.redirect
          : "/checkout";
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
    <main className="flex min-h-screen items-center justify-center bg-black px-6 py-12 text-zinc-100">
      <section className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#121212] p-7 shadow-[0_18px_60px_-28px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.04)]">
        <h1 className="font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight text-white">
          Registrieren
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
          Wähle deinen Kontotyp. Enterprise geht nach der Registrierung in den
          Checkout, Privatpersonen direkt in den Coin-Space.
        </p>

        <form onSubmit={handleRegister} className="mt-6 space-y-4" autoComplete="on">
          <div>
            <label
              className="mb-1.5 block text-[12px] font-medium text-zinc-300"
              htmlFor="reg-username"
            >
              Nutzername
            </label>
            <input
              id="reg-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="z. B. Max A. (optional)"
              autoComplete="username"
              className="w-full rounded-lg border border-white/[0.12] bg-[#0a0a0a] px-3 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#00D1FF]/55 focus:ring-1 focus:ring-[#00D1FF]/25"
            />
            <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
              Wird als globaler Anzeigename genutzt. Leer lassen: wir verwenden
              deine E-Mail als Anzeigename.
            </p>
          </div>

          <div>
            <label
              className="mb-1.5 block text-[12px] font-medium text-zinc-300"
              htmlFor="reg-role"
            >
              Ich bin ein
            </label>
            <select
              id="reg-role"
              value={role}
              onChange={(e) => {
                const v = e.target.value;
                setRole(
                  v === "privat"
                    ? "privat"
                    : v === "kleinunternehmer"
                      ? "kleinunternehmer"
                      : v === "mitarbeiter"
                        ? "mitarbeiter"
                        : "konzern",
                );
              }}
              className="w-full rounded-lg border border-white/[0.12] bg-[#0a0a0a] px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-[#00D1FF]/55 focus:ring-1 focus:ring-[#00D1FF]/25"
            >
              <option value="konzern">Konzern</option>
              <option value="kleinunternehmer">Kleinunternehmer</option>
              <option value="mitarbeiter">Mitarbeiter</option>
              <option value="privat">Privat</option>
            </select>
          </div>

          {isMitarbeiter ? (
            <div className="rounded-xl border border-[#00D1FF]/25 bg-[#00D1FF]/[0.04] px-4 py-4 text-[13px] leading-relaxed text-zinc-300">
              <p className="font-medium text-zinc-100">Einladungslink erforderlich</p>
              <p className="mt-1 text-[12px] text-zinc-400">
                Mitarbeiter-Accounts werden vom Manager im Konzern-Dashboard
                erstellt. Nutze deine Zugangsdaten direkt beim Mitarbeiter-Login.
              </p>
              <Link
                href="/worker/login"
                className="mt-3 inline-flex h-10 items-center justify-center rounded-lg border border-[#00D1FF]/40 bg-[#00D1FF]/10 px-4 text-[12px] font-semibold text-[#00D1FF] transition hover:bg-[#00D1FF]/15"
              >
                Zum Mitarbeiter-Login
              </Link>
            </div>
          ) : (
            <>
              <div>
                <label
                  className="mb-1.5 block text-[12px] font-medium text-zinc-300"
                  htmlFor="reg-email"
                >
                  E-Mail
                </label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full rounded-lg border border-white/[0.12] bg-[#0a0a0a] px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-[#00D1FF]/55 focus:ring-1 focus:ring-[#00D1FF]/25"
                />
              </div>

              <div>
                <label
                  className="mb-1.5 block text-[12px] font-medium text-zinc-300"
                  htmlFor="reg-password"
                >
                  Passwort
                </label>
                <input
                  id="reg-password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-white/[0.12] bg-[#0a0a0a] px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-[#00D1FF]/55 focus:ring-1 focus:ring-[#00D1FF]/25"
                />
                <p className="mt-1.5 text-[11px] text-zinc-500">Mindestens 8 Zeichen</p>
              </div>

              {error ? <p className="text-sm text-red-300">{error}</p> : null}

              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#00D1FF] px-6 text-sm font-semibold text-[#031018] transition hover:bg-[#33ddff] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Konto wird angelegt…" : submitLabel}
              </button>
            </>
          )}
        </form>

        <p className="mt-6 text-center text-[13px] text-zinc-500">
          Bereits ein Konto?{" "}
          <Link
            href="/login"
            className="font-medium text-[#00D1FF] transition hover:underline"
          >
            Zum Login
          </Link>
        </p>

        <Link
          href="/"
          className="mt-3 inline-block w-full text-center text-[13px] font-medium text-[#00D1FF] transition hover:underline"
        >
          Zurück zur Startseite
        </Link>
      </section>
    </main>
  );
}
