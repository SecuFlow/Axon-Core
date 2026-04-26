"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  sessionId: string;
};

export function SuccessClient({ sessionId }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(10);
  const [setupState, setSetupState] = useState<"running" | "done" | "error">("running");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const resp = await fetch("/api/checkout/setup", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const p = (await resp.json()) as { ok?: boolean; detail?: string };
        if (cancelled) return;
        if (!resp.ok || p.ok !== true) {
          setSetupState("error");
          setError(p.detail ?? "Dashboard-Setup fehlgeschlagen.");
          return;
        }
        setSetupState("done");
      } catch {
        if (!cancelled) {
          setSetupState("error");
          setError("Netzwerkfehler beim Setup.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (secondsLeft > 0) return;
    if (setupState === "error") return;
    window.location.href = "/dashboard/konzern?welcome=1";
  }, [secondsLeft, setupState]);

  const progress = useMemo(() => ((10 - secondsLeft) / 10) * 100, [secondsLeft]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#030304] px-6 text-zinc-100">
      <section className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
        <h1 className="font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-white">
          Zahlung erfolgreich
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          Wir richten Ihr Konzern-Dashboard ein. Sie werden automatisch weitergeleitet.
        </p>

        <div className="mt-6 h-3 w-full overflow-hidden rounded-full border border-white/[0.12] bg-black/30">
          <div
            className="h-full rounded-full bg-[#00D1FF] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="mt-2 text-xs text-zinc-400">
          {secondsLeft}s verbleibend · Status:{" "}
          {setupState === "error"
            ? "Fehler"
            : setupState === "done"
              ? "Setup abgeschlossen"
              : "Setup läuft"}
        </p>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
            {error}
          </p>
        ) : null}

        <a
          href="/dashboard/konzern"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full border border-[#00D1FF]/50 bg-[#00D1FF] px-6 text-sm font-semibold text-[#030304] transition hover:bg-[#33ddff]"
        >
          Zur Kunden-Ansicht (Konzern-Dashboard)
        </a>
      </section>
    </main>
  );
}

